import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, CustomerGroupMessageStatus, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../../admin/current-admin";
import { PrismaService } from "../../prisma.service";
import { decryptSecret } from "../wecom.crypto";
import { WecomClientAdapter } from "../adapters/wecom-client.adapter";
import { formatDateFields, readPage } from "./wecom-customer-group.service";
import { WecomConfigService } from "./wecom-config.service";
import { WecomTokenService } from "./wecom-token.service";
import { jsonObject, requiredString } from "./wecom-welcome-template.service";
import { ok, readObject } from "./wecom-config.service";

@Injectable()
export class WecomGroupMessageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WecomConfigService,
    private readonly tokenService: WecomTokenService,
    private readonly client: WecomClientAdapter
  ) {}

  async listTasks(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroupMessageTask.findMany({ orderBy: { updatedAt: "desc" }, skip, take: pageSize, include: { logs: true, conference: { select: { title: true } } } }),
      this.prisma.customerGroupMessageTask.count()
    ]);
    return ok({ items: items.map((item) => formatTask(item)), total, page, pageSize });
  }

  async createTask(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const sendMode = nullableString(body.sendMode) ?? "CUSTOMER_GROUP";
    if (!["CUSTOMER_GROUP", "GROUP_WEBHOOK"].includes(sendMode)) throw new BadRequestException("发送方式必须是 CUSTOMER_GROUP 或 GROUP_WEBHOOK");
    const targetScope = normalizeTargetScope(body.targetScope, body.conferenceId);
    const targetGroupIds = readStringArray(body.targetGroupIds);
    if (targetScope === "SELECTED_GROUPS" && targetGroupIds.length === 0) throw new BadRequestException("请选择至少一个客户群");
    if (targetScope === "CONFERENCE_GROUPS" && !nullableString(body.conferenceId)) throw new BadRequestException("按会议关联群发送时必须选择会议");
    const item = await this.prisma.customerGroupMessageTask.create({
      data: {
        name: requiredString(body.name, "任务名称"),
        conferenceId: nullableString(body.conferenceId),
        contentJson: withSendMode(buildWecomContentJson(body), sendMode),
        targetScope,
        targetGroupIds: targetGroupIds.length ? (targetGroupIds as Prisma.InputJsonArray) : Prisma.JsonNull,
        status: CustomerGroupMessageStatus.DRAFT,
        needConfirm: sendMode === "CUSTOMER_GROUP",
        providerSource: sendMode,
        createdById: admin.id
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CustomerGroupMessageTask", item.id, "Create WeCom group message task");
    return ok(formatDateFields(item));
  }

  async createWecomTask(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("群发任务不存在");
    const sendMode = readTaskSendMode(task);
    if (sendMode === "GROUP_WEBHOOK") return this.createGroupRobotTask(task, admin);
    const groups = await this.resolveTargetGroups(task);
    if (groups.length === 0) {
      const updated = await this.markTaskSkipped(id, "NO_TARGET_GROUPS", "未找到可发送的客户群", []);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Skip WeCom group message task", { reason: "NO_TARGET_GROUPS" });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "SKIPPED", reason: "未找到可发送的客户群" } });
    }
    const integration = await this.config.ensureDefaultIntegration();
    if (!integration.enabled) {
      const updated = await this.markTaskSkipped(id, "WECOM_DISABLED", "企微客户群能力未启用", groups);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Skip WeCom group message task", { reason: "WECOM_DISABLED", groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "SKIPPED", reason: "企微客户群能力未启用", groupCount: groups.length } });
    }
    let result: { ok: boolean; errcode?: number; errmsg?: string; msgId?: string; raw: Record<string, unknown> };
    try {
      const token = await this.tokenService.getConfiguredAccessToken(integration, true);
      result = await this.client.createCustomerGroupMessageTask(token.accessToken, {
        groups: groups.map((group) => ({ chatId: group.chatId!, ownerUserId: group.ownerUserId })),
        contentJson: task.contentJson as Record<string, unknown>
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "企业微信任务创建失败";
      const updated = await this.markTaskFailed(id, "WECOM_API_ERROR", message, groups);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Create WeCom group message task failed", { message, groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "FAILED", reason: message, groupCount: groups.length } });
    }
    if (!result.ok) {
      const updated = await this.markTaskFailed(id, String(result.errcode ?? "WECOM_API_ERROR"), result.errmsg || "企业微信返回失败", groups, result.raw);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Create WeCom group message task failed", { result: result.raw, groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "FAILED", reason: result.errmsg, raw: result.raw, groupCount: groups.length } });
    }
    const updated = await this.prisma.customerGroupMessageTask.update({
      where: { id },
      data: {
        status: CustomerGroupMessageStatus.WAITING_CONFIRM,
        wecomTaskId: result.msgId || `wecom_${id}`,
        wecomMsgId: result.msgId ?? null,
        externalResultJson: result.raw as Prisma.InputJsonValue,
        errorCode: null,
        errorMessage: null,
        providerSource: "WECOM_API",
        logs: {
          create: groups.map((group) => ({
            wecomGroupId: group.id,
            ownerUserId: group.ownerUserId,
            status: "WAITING_CONFIRM",
            providerMessageId: result.msgId,
            resultJson: {
              chatId: group.chatId,
              groupName: group.name,
              ownerName: group.ownerName,
              msgId: result.msgId,
              rule: "企业微信群发任务需群主或成员在企业微信中确认后发送",
              troubleshooting: "若群主未收到确认，请检查自建应用客户联系权限、群主可见范围、群是否仍有效、企业微信频控和消息内容合规。"
            }
          }))
        }
      }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Create official WeCom group message task", { groupCount: groups.length, msgId: result.msgId });
    return ok({
      task: formatDateFields(updated),
      result: { created: true, status: "WAITING_CONFIRM", message: "企业微信任务已创建，请群主或成员在企业微信中确认后发送。", groupCount: groups.length, msgId: result.msgId, raw: result.raw }
    });
  }

  async sendTestToGroups(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const targetGroupIds = readStringArray(body.targetGroupIds);
    if (targetGroupIds.length === 0) throw new BadRequestException("请选择测试客户群");
    const created = await this.createTask(
      {
        name: requiredString(body.name, "任务名称"),
        sendMode: nullableString(body.sendMode) ?? "GROUP_WEBHOOK",
        targetScope: "SELECTED_GROUPS",
        targetGroupIds,
        contentJson: buildWecomContentJson(body)
      },
      admin
    );
    return this.createWecomTask(String(created.data.id), admin);
  }

  private async createGroupRobotTask(
    task: {
      id: string;
      name: string;
      contentJson: Prisma.JsonValue;
      targetScope: string;
      targetGroupIds: Prisma.JsonValue | null;
      conferenceId: string | null;
    },
    admin: CurrentAdmin
  ) {
    const groups = await this.resolveTargetGroups(task, false);
    if (groups.length === 0) {
      const updated = await this.markTaskSkipped(task.id, "NO_TARGET_GROUPS", "未找到可发送的客户群", []);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", task.id, "Skip WeCom group robot task", { reason: "NO_TARGET_GROUPS" });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "SKIPPED", reason: "未找到可发送的客户群" } });
    }
    const integration = await this.config.ensureDefaultIntegration();
    const webhookUrl = decryptSecret(integration.groupRobotWebhookUrlEnc);
    if (!integration.groupRobotEnabled || !webhookUrl) {
      const updated = await this.markTaskSkipped(task.id, "GROUP_ROBOT_DISABLED", "企微群机器人未启用或未配置 Webhook", groups);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", task.id, "Skip WeCom group robot task", { reason: "GROUP_ROBOT_DISABLED", groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "SKIPPED", reason: "企微群机器人未启用或未配置 Webhook", groupCount: groups.length } });
    }

    try {
      const payload = await buildRobotPayload(task.contentJson as Record<string, unknown>, webhookUrl);
      const result = await postGroupRobotWebhook(webhookUrl, payload);
      if (!result.ok) {
        const updated = await this.markTaskFailed(task.id, String(result.errcode ?? "GROUP_ROBOT_ERROR"), result.errmsg || "企微群机器人发送失败", groups, result.raw);
        await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", task.id, "Send WeCom group robot task failed", { result: result.raw, groupCount: groups.length });
        return ok({ task: formatDateFields(updated), result: { created: false, status: "FAILED", reason: result.errmsg, raw: result.raw, groupCount: groups.length } });
      }
      const now = new Date();
      const updated = await this.prisma.customerGroupMessageTask.update({
        where: { id: task.id },
        data: {
          status: CustomerGroupMessageStatus.SENT,
          sentAt: now,
          needConfirm: false,
          wecomTaskId: `robot_${task.id}`,
          wecomMsgId: null,
          externalResultJson: result.raw as Prisma.InputJsonValue,
          errorCode: null,
          errorMessage: null,
          providerSource: "GROUP_WEBHOOK",
          logs: {
            create: groups.map((group) => ({
              wecomGroupId: group.id,
              ownerUserId: group.ownerUserId,
              status: "SENT",
              sentAt: now,
              resultJson: {
                groupName: group.name,
                chatId: group.chatId,
                robotName: integration.groupRobotName,
                sendMode: "GROUP_WEBHOOK",
                raw: result.raw as Prisma.InputJsonObject
              } satisfies Prisma.InputJsonObject
            }))
          }
        }
      });
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", task.id, "Send WeCom group robot task", { groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: true, status: "SENT", message: "企微群机器人已发送。", groupCount: groups.length, raw: result.raw } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "企微群机器人发送失败";
      const updated = await this.markTaskFailed(task.id, "GROUP_ROBOT_ERROR", message, groups);
      await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", task.id, "Send WeCom group robot task failed", { message, groupCount: groups.length });
      return ok({ task: formatDateFields(updated), result: { created: false, status: "FAILED", reason: message, groupCount: groups.length } });
    }
  }

  async refreshResult(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id }, include: { logs: true } });
    if (!task) throw new NotFoundException("群发任务不存在");
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Refresh WeCom group message result");
    return ok({
      task: formatDateFields(task),
      logs: task.logs.map(formatDateFields),
      message: task.wecomMsgId ? "已记录企业微信 msgid。确认和发送结果需等待企业微信回调或后续结果查询接口。" : "任务尚未获得企业微信 msgid，请先创建企微任务。"
    });
  }

  async logs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroupMessageLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { task: { select: { name: true, status: true } }, wecomGroup: { select: { name: true, chatId: true } } } }),
      this.prisma.customerGroupMessageLog.count()
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), taskName: item.task.name, taskStatus: item.task.status, groupName: item.wecomGroup?.name ?? null, chatId: item.wecomGroup?.chatId ?? null })), total, page, pageSize });
  }

  private resolveTargetGroups(task: { targetScope: string; targetGroupIds: Prisma.JsonValue | null; conferenceId: string | null }, requireChatId = true) {
    const chatFilter = requireChatId ? { chatId: { not: null } } : {};
    if (task.targetScope === "ALL_GROUPS") {
      return this.prisma.wecomCustomerGroup.findMany({ where: { enabled: true, status: { not: "DISMISSED" }, ...chatFilter }, take: 100 });
    }
    if (task.targetScope === "CONFERENCE_GROUPS") {
      if (!task.conferenceId) return Promise.resolve([]);
      return this.prisma.wecomCustomerGroup.findMany({ where: { enabled: true, conferenceId: task.conferenceId, ...chatFilter }, take: 100 });
    }
    const targetGroupIds = Array.isArray(task.targetGroupIds) ? task.targetGroupIds.map(String) : [];
    if (targetGroupIds.length === 0) return Promise.resolve([]);
    return this.prisma.wecomCustomerGroup.findMany({ where: { id: { in: targetGroupIds }, enabled: true, ...chatFilter }, take: 100 });
  }

  private markTaskSkipped(id: string, errorCode: string, errorMessage: string, groups: Array<{ id: string; ownerUserId: string | null; chatId: string | null; name: string }>) {
    return this.prisma.customerGroupMessageTask.update({
      where: { id },
      data: {
        status: CustomerGroupMessageStatus.SKIPPED,
        errorCode,
        errorMessage,
        providerSource: "disabled",
        logs: groups.length
          ? {
              create: groups.map((group) => ({
                wecomGroupId: group.id,
                ownerUserId: group.ownerUserId,
                status: "SKIPPED",
                errorReason: errorMessage,
                resultJson: { chatId: group.chatId, groupName: group.name, errorCode }
              }))
            }
          : undefined
      }
    });
  }

  private markTaskFailed(id: string, errorCode: string, errorMessage: string, groups: Array<{ id: string; ownerUserId: string | null; chatId: string | null; name: string }>, raw?: Record<string, unknown>) {
    return this.prisma.customerGroupMessageTask.update({
      where: { id },
      data: {
        status: CustomerGroupMessageStatus.FAILED,
        errorCode,
        errorMessage,
        externalResultJson: raw as Prisma.InputJsonValue,
        providerSource: "WECOM_API",
        logs: {
          create: groups.map((group) => ({
            wecomGroupId: group.id,
            ownerUserId: group.ownerUserId,
            status: "FAILED",
            errorReason: errorMessage,
            resultJson: { chatId: group.chatId, groupName: group.name, errorCode, raw: (raw ?? null) as Prisma.InputJsonValue }
          }))
        }
      }
    });
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadata?: unknown) {
    await this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson: (metadata ?? {}) as Prisma.InputJsonValue }
    });
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
}

function normalizeTargetScope(value: unknown, conferenceId: unknown): string {
  const scope = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : conferenceId ? "CONFERENCE_GROUPS" : "SELECTED_GROUPS";
  if (["ALL_GROUPS", "SELECTED_GROUPS", "CONFERENCE_GROUPS"].includes(scope)) return scope;
  throw new BadRequestException("发送范围必须是 ALL_GROUPS / SELECTED_GROUPS / CONFERENCE_GROUPS");
}

function buildWecomContentJson(body: Record<string, unknown>): Prisma.InputJsonObject {
  if (isRecord(body.contentJson) && !hasStructuredMessageFields(body)) return jsonObject(body.contentJson);
  const messageType = (nullableString(body.messageType) ?? "TEXT").toUpperCase();
  const content = nullableString(body.textContent) ?? nullableString(body.content) ?? "";
  const attachments: Array<Record<string, unknown>> = [];
  if (messageType === "IMAGE") {
    const url = requiredString(body.imageUrl ?? body.materialUrl, "图片素材");
    attachments.push({ msgtype: "image", image: { pic_url: url } });
  } else if (messageType === "FILE") {
    const url = requiredString(body.fileUrl ?? body.materialUrl, "文件素材");
    attachments.push({ msgtype: "file", file: { file_url: url, title: nullableString(body.fileName) ?? "会务资料" } });
  } else if (messageType === "LINK") {
    attachments.push({
      msgtype: "link",
      link: {
        title: requiredString(body.linkTitle, "链接标题"),
        desc: nullableString(body.linkDescription) ?? "",
        url: requiredString(body.linkUrl, "链接 URL"),
        picurl: nullableString(body.coverUrl) ?? nullableString(body.materialUrl) ?? undefined
      }
    });
  } else if (messageType === "MINIPROGRAM") {
    attachments.push({
      msgtype: "miniprogram",
      miniprogram: {
        title: requiredString(body.linkTitle, "小程序标题"),
        appid: requiredString(body.appid, "小程序 appid"),
        page: requiredString(body.pagePath, "小程序页面路径"),
        pic_media_id: nullableString(body.mediaId) ?? undefined
      }
    });
  } else if (messageType !== "TEXT") {
    throw new BadRequestException("消息类型只支持文字 / 图片 / 文件 / 链接 / 小程序");
  }
  const text = content || (messageType === "TEXT" ? requiredString(body.textContent ?? body.content, "正文内容") : `${messageType} 消息，请在企业微信中确认后发送。`);
  return {
    msgtype: messageType.toLowerCase(),
    text: { content: text },
    content: text,
    attachments: attachments as Prisma.InputJsonArray,
    allowMemberModifyRange: readOptionalBoolean(body.allowMemberModifyRange) ?? false,
    remark: nullableString(body.remark)
  };
}

function withSendMode(contentJson: Prisma.InputJsonObject, sendMode: string): Prisma.InputJsonObject {
  return { ...contentJson, sendMode };
}

function readTaskSendMode(task: { providerSource?: string | null; contentJson: Prisma.JsonValue }): "CUSTOMER_GROUP" | "GROUP_WEBHOOK" {
  if (task.providerSource === "GROUP_WEBHOOK") return "GROUP_WEBHOOK";
  if (isRecord(task.contentJson) && task.contentJson.sendMode === "GROUP_WEBHOOK") return "GROUP_WEBHOOK";
  return "CUSTOMER_GROUP";
}

async function buildRobotPayload(contentJson: Record<string, unknown>, webhookUrl: string): Promise<Record<string, unknown>> {
  const attachment = Array.isArray(contentJson.attachments) ? contentJson.attachments.find(isRecord) : null;
  const msgtype = String(attachment?.msgtype ?? contentJson.msgtype ?? "text").toLowerCase();
  if (msgtype === "image" && isRecord(attachment?.image)) {
    const url = requiredString(attachment.image.pic_url ?? attachment.image.url, "图片素材 URL");
    const file = await downloadBinary(url);
    return {
      msgtype: "image",
      image: {
        base64: file.buffer.toString("base64"),
        md5: createHash("md5").update(file.buffer).digest("hex")
      }
    };
  }
  if (msgtype === "file" && isRecord(attachment?.file)) {
    const url = requiredString(attachment.file.file_url ?? attachment.file.url, "文件素材 URL");
    const title = nullableString(attachment.file.title) ?? fileNameFromUrl(url) ?? "会务资料";
    const mediaId = await uploadRobotFile(webhookUrl, url, title);
    return { msgtype: "file", file: { media_id: mediaId } };
  }
  if (msgtype === "link" && isRecord(attachment?.link)) {
    return {
      msgtype: "news",
      news: {
        articles: [
          {
            title: requiredString(attachment.link.title, "链接标题"),
            description: nullableString(attachment.link.desc) ?? "",
            url: requiredString(attachment.link.url, "链接 URL"),
            picurl: nullableString(attachment.link.picurl) ?? undefined
          }
        ]
      }
    };
  }
  if (msgtype === "miniprogram") {
    throw new BadRequestException("企微群机器人不支持小程序消息，请改用文字、图片、文件或链接。");
  }
  return {
    msgtype: "text",
    text: { content: readRobotText(contentJson) }
  };
}

async function postGroupRobotWebhook(webhookUrl: string, payload: Record<string, unknown>) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const raw = (await safeJson(response)) as Record<string, unknown>;
  return {
    ok: response.ok && Number(raw.errcode ?? 0) === 0,
    errcode: Number(raw.errcode ?? response.status),
    errmsg: typeof raw.errmsg === "string" ? raw.errmsg : response.statusText,
    raw
  };
}

async function uploadRobotFile(webhookUrl: string, fileUrl: string, filename: string): Promise<string> {
  const key = new URL(webhookUrl).searchParams.get("key");
  if (!key) throw new BadRequestException("企微群机器人 Webhook 缺少 key，无法上传文件素材。");
  const file = await downloadBinary(fileUrl);
  const form = new FormData();
  const arrayBuffer = new Uint8Array(file.buffer).buffer;
  form.append("media", new Blob([arrayBuffer], { type: file.contentType || "application/octet-stream" }), filename);
  const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/webhook/upload_media?key=${encodeURIComponent(key)}&type=file`, {
    method: "POST",
    body: form
  });
  const raw = (await safeJson(response)) as Record<string, unknown>;
  if (!response.ok || Number(raw.errcode ?? 0) !== 0 || typeof raw.media_id !== "string") {
    throw new BadRequestException(`企微群机器人文件素材上传失败：${String(raw.errmsg ?? response.statusText)}`);
  }
  return raw.media_id;
}

async function downloadBinary(url: string): Promise<{ buffer: Buffer; contentType: string | null }> {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new BadRequestException("素材 URL 必须是 http/https 地址");
  const response = await fetch(url);
  if (!response.ok) throw new BadRequestException(`素材下载失败：${response.status}`);
  return { buffer: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get("content-type") };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { errcode: response.status, errmsg: response.statusText };
  }
}

function readRobotText(contentJson: Record<string, unknown>): string {
  if (isRecord(contentJson.text) && typeof contentJson.text.content === "string" && contentJson.text.content.trim()) return contentJson.text.content.trim();
  if (typeof contentJson.content === "string" && contentJson.content.trim()) return contentJson.content.trim();
  throw new BadRequestException("群机器人文字内容不能为空");
}

function fileNameFromUrl(value: string): string | null {
  try {
    const path = new URL(value).pathname.split("/").filter(Boolean).pop();
    return path ? decodeURIComponent(path) : null;
  } catch {
    return null;
  }
}

function hasStructuredMessageFields(body: Record<string, unknown>): boolean {
  return ["messageType", "textContent", "content", "imageUrl", "fileUrl", "linkTitle", "linkUrl", "appid", "pagePath", "materialUrl"].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  throw new BadRequestException("Expected boolean");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatTask(item: Record<string, any>) {
  const logs = Array.isArray(item.logs) ? item.logs : [];
  const targetGroupIds = Array.isArray(item.targetGroupIds) ? item.targetGroupIds : [];
  return {
    ...formatDateFields(item),
    sendMode: readTaskSendMode({ providerSource: item.providerSource, contentJson: item.contentJson ?? {} }),
    conferenceTitle: item.conference?.title ?? null,
    logCount: logs.length,
    targetGroupCount: logs.length || targetGroupIds.length,
    sender: logs.find((log: Record<string, unknown>) => typeof log.ownerUserId === "string" && log.ownerUserId)?.ownerUserId ?? null,
    lastRefreshedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : item.updatedAt ?? null,
    troubleshooting:
      item.status === CustomerGroupMessageStatus.WAITING_CONFIRM
        ? "等待群主或成员在企业微信中确认。若没有收到确认，请检查自建应用客户联系权限、应用可见范围、群是否有效、频控和内容合规。"
        : item.errorMessage || null
  };
}
