import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, CustomerGroupMessageStatus, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../../admin/current-admin";
import { PrismaService } from "../../prisma.service";
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
    const targetScope = normalizeTargetScope(body.targetScope, body.conferenceId);
    const targetGroupIds = readStringArray(body.targetGroupIds);
    if (targetScope === "SELECTED_GROUPS" && targetGroupIds.length === 0) throw new BadRequestException("请选择至少一个客户群");
    if (targetScope === "CONFERENCE_GROUPS" && !nullableString(body.conferenceId)) throw new BadRequestException("按会议关联群发送时必须选择会议");
    const item = await this.prisma.customerGroupMessageTask.create({
      data: {
        name: requiredString(body.name, "任务名称"),
        conferenceId: nullableString(body.conferenceId),
        contentJson: jsonObject(body.contentJson),
        targetScope,
        targetGroupIds: targetGroupIds.length ? (targetGroupIds as Prisma.InputJsonArray) : Prisma.JsonNull,
        status: CustomerGroupMessageStatus.DRAFT,
        needConfirm: true,
        createdById: admin.id
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CustomerGroupMessageTask", item.id, "Create WeCom group message task");
    return ok(formatDateFields(item));
  }

  async createWecomTask(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("群发任务不存在");
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
        targetScope: "SELECTED_GROUPS",
        targetGroupIds,
        contentJson: jsonObject(body.contentJson)
      },
      admin
    );
    return this.createWecomTask(String(created.data.id), admin);
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

  private resolveTargetGroups(task: { targetScope: string; targetGroupIds: Prisma.JsonValue | null; conferenceId: string | null }) {
    if (task.targetScope === "ALL_GROUPS") {
      return this.prisma.wecomCustomerGroup.findMany({ where: { enabled: true, status: { not: "DISMISSED" }, chatId: { not: null } }, take: 100 });
    }
    if (task.targetScope === "CONFERENCE_GROUPS") {
      if (!task.conferenceId) return Promise.resolve([]);
      return this.prisma.wecomCustomerGroup.findMany({ where: { enabled: true, conferenceId: task.conferenceId, chatId: { not: null } }, take: 100 });
    }
    const targetGroupIds = Array.isArray(task.targetGroupIds) ? task.targetGroupIds.map(String) : [];
    if (targetGroupIds.length === 0) return Promise.resolve([]);
    return this.prisma.wecomCustomerGroup.findMany({ where: { id: { in: targetGroupIds }, enabled: true, chatId: { not: null } }, take: 100 });
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

function formatTask(item: Record<string, any>) {
  return {
    ...formatDateFields(item),
    conferenceTitle: item.conference?.title ?? null,
    logCount: Array.isArray(item.logs) ? item.logs.length : 0,
    troubleshooting:
      item.status === CustomerGroupMessageStatus.WAITING_CONFIRM
        ? "等待群主或成员在企业微信中确认。若没有收到确认，请检查自建应用客户联系权限、应用可见范围、群是否有效、频控和内容合规。"
        : item.errorMessage || null
  };
}
