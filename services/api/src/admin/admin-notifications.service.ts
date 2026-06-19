import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  NotificationChannelType,
  NotificationLogStatus,
  NotificationTaskStatus,
  NotificationTemplateStatus,
  Prisma
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret, maskSecret } from "../wecom/wecom.crypto";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const templateCode = readRequiredString(body, "templateCode");
    const channel = readChannel(body.channel ?? NotificationChannelType.WECHAT_SUBSCRIBE);
    const enabled = readOptionalBoolean(body.enabled) ?? true;
    const phone = readOptionalString(body.phone);

    const item = await this.prisma.notificationSubscription.upsert({
      where: {
        userId_channel_templateCode: {
          userId: currentUser.id,
          channel,
          templateCode
        }
      },
      update: {
        enabled,
        phone,
        openid: currentUser.openid
      },
      create: {
        userId: currentUser.id,
        channel,
        templateCode,
        phone,
        openid: currentUser.openid,
        enabled
      }
    });

    return ok(formatSubscription(item));
  }

  async listTemplates(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const channel = query.channel ? readChannel(query.channel) : undefined;
    const status = query.status ? readTemplateStatus(query.status) : undefined;
    const where: Prisma.NotificationTemplateWhereInput = {
      ...(channel ? { channel } : {}),
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: "insensitive" } },
              { name: { contains: keyword, mode: "insensitive" } },
              { title: { contains: keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationTemplate.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize
      }),
      this.prisma.notificationTemplate.count({ where })
    ]);

    return ok({ items: items.map(formatTemplate), total, page, pageSize });
  }

  async createTemplate(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.notificationTemplate.create({
      data: {
        code: readRequiredString(body, "code"),
        name: readRequiredString(body, "name"),
        channel: readChannel(body.channel),
        status: body.status ? readTemplateStatus(body.status) : NotificationTemplateStatus.DRAFT,
        title: readOptionalString(body.title),
        templateKey: readOptionalString(body.templateKey),
        contentJson: readJsonObject(body.contentJson, "contentJson"),
        remark: readOptionalString(body.remark),
        createdById: admin.id
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "NotificationTemplate", item.id, "Create notification template");
    return ok(formatTemplate(item));
  }

  async updateTemplate(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    await this.ensureTemplate(id);
    const item = await this.prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.channel !== "undefined" ? { channel: readChannel(body.channel) } : {}),
        ...(typeof body.status !== "undefined" ? { status: readTemplateStatus(body.status) } : {}),
        ...(typeof body.title !== "undefined" ? { title: readNullableString(body.title) } : {}),
        ...(typeof body.templateKey !== "undefined" ? { templateKey: readNullableString(body.templateKey) } : {}),
        ...(typeof body.contentJson !== "undefined" ? { contentJson: readJsonObject(body.contentJson, "contentJson") } : {}),
        ...(typeof body.remark !== "undefined" ? { remark: readNullableString(body.remark) } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "NotificationTemplate", item.id, "Update notification template");
    return ok(formatTemplate(item));
  }

  async listTasks(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const status = query.status ? readTaskStatus(query.status) : undefined;
    const where: Prisma.NotificationTaskWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { template: { code: { contains: keyword, mode: "insensitive" } } },
              { template: { name: { contains: keyword, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationTask.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        include: { template: true, _count: { select: { logs: true } } }
      }),
      this.prisma.notificationTask.count({ where })
    ]);

    return ok({ items: await Promise.all(items.map((item) => this.formatTaskWithRuntime(item))), total, page, pageSize });
  }

  async createTask(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const template = await this.ensureTemplate(readRequiredString(body, "templateId"));
    if (template.status !== NotificationTemplateStatus.ACTIVE) {
      throw new BadRequestException("通知模板未启用，不能创建发送任务");
    }

    const item = await this.prisma.notificationTask.create({
      data: {
        name: readRequiredString(body, "name"),
        templateId: template.id,
        channel: template.channel,
        targetType: readOptionalString(body.targetType) ?? "MANUAL",
        payloadJson: typeof body.payloadJson === "undefined" ? undefined : readJsonObject(body.payloadJson, "payloadJson"),
        status: body.status ? readTaskStatus(body.status) : NotificationTaskStatus.DRAFT,
        scheduledAt: readOptionalDate(body.scheduledAt),
        createdById: admin.id
      },
      include: { template: true, _count: { select: { logs: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "NotificationTask", item.id, "Create notification task");
    return ok(await this.formatTaskWithRuntime(item));
  }

  async previewTemplate(id: string, input: unknown) {
    const template = await this.ensureTemplate(id);
    const body = isRecord(input) ? input : {};
    const variables = isRecord(body.variables) ? body.variables : {};
    return ok({
      templateId: template.id,
      code: template.code,
      channel: template.channel,
      title: renderText(template.title ?? template.name, variables),
      content: renderJson(template.contentJson, variables),
      variables
    });
  }

  async testSendTemplate(id: string, input: unknown, admin: CurrentAdmin) {
    const template = await this.ensureTemplate(id);
    if (template.status !== NotificationTemplateStatus.ACTIVE) {
      throw new BadRequestException("通知模板未启用，不能测试发送");
    }
    const body = isRecord(input) ? input : {};
    const task = await this.prisma.notificationTask.create({
      data: {
        name: `测试发送 - ${template.name}`,
        templateId: template.id,
        channel: template.channel,
        targetType: "TEST",
        payloadJson: readJsonObject(
          {
            userIds: Array.isArray(body.userIds) ? body.userIds : undefined,
            recipients: Array.isArray(body.recipients) ? body.recipients : undefined,
            variables: isRecord(body.variables) ? body.variables : undefined,
            mockFailUserIds: Array.isArray(body.mockFailUserIds) ? body.mockFailUserIds : undefined,
            mockSkipUserIds: Array.isArray(body.mockSkipUserIds) ? body.mockSkipUserIds : undefined
          },
          "payloadJson"
        ),
        status: NotificationTaskStatus.PENDING,
        createdById: admin.id
      },
      include: { template: true, _count: { select: { logs: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "NotificationTask", task.id, "Create notification test task");
    return this.sendNow(task.id, admin);
  }

  async retryTask(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.notificationTask.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Notification task not found");
    }
    if (
      task.status !== NotificationTaskStatus.FAILED &&
      task.status !== NotificationTaskStatus.PARTIAL_FAILED &&
      task.status !== NotificationTaskStatus.SKIPPED
    ) {
      throw new BadRequestException("只有失败、部分失败或已跳过任务可以重试");
    }
    return this.sendNow(id, admin);
  }

  async sendNow(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.notificationTask.findUnique({
      where: { id },
      include: { template: true }
    });
    if (!task) {
      throw new NotFoundException("Notification task not found");
    }
    if (
      task.status === NotificationTaskStatus.SENDING ||
      task.status === NotificationTaskStatus.SENT ||
      task.status === NotificationTaskStatus.CANCELLED
    ) {
      throw new BadRequestException("当前任务状态不允许再次发送");
    }

    await this.prisma.notificationTask.update({ where: { id }, data: { status: NotificationTaskStatus.SENDING } });
    const recipients = await this.resolveRecipients(task.payloadJson, task.channel);
    const runtime = await this.resolveChannelRuntime(task.channel);
    const results = recipients.length
      ? await Promise.all(recipients.map((recipient) => this.sendOne(task, recipient, runtime)))
      : [await this.sendOne(task, { userId: null, recipient: null }, runtime)];

    const sentAt = new Date();
    await Promise.all(
      results.map((result) =>
        this.prisma.notificationLog.create({
          data: {
            taskId: task.id,
            templateId: task.templateId,
            userId: result.userId,
            channel: task.channel,
            recipient: result.recipient,
            status: result.status,
            providerMessageId: result.providerMessageId,
            errorCode: result.errorCode,
            errorMessage: result.errorMessage,
            payloadJson: task.payloadJson === null ? undefined : task.payloadJson,
            sentAt: result.status === NotificationLogStatus.SUCCESS ? sentAt : undefined
          }
        })
      )
    );

    const successCount = results.filter((item) => item.status === NotificationLogStatus.SUCCESS).length;
    const failedCount = results.filter((item) => item.status === NotificationLogStatus.FAILED).length;
    const skippedCount = results.filter((item) => item.status === NotificationLogStatus.SKIPPED).length;
    const status = taskStatusFromResultCounts(results.length, successCount, failedCount, skippedCount);

    const updated = await this.prisma.notificationTask.update({
      where: { id },
      data: {
        status,
        sentAt
      },
      include: { template: true, _count: { select: { logs: true } } }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "NotificationTask", task.id, "Send notification task now", {
      successCount,
      failedCount,
      skippedCount
    });
    return ok({ task: await this.formatTaskWithRuntime(updated), result: { total: results.length, successCount, failedCount, skippedCount } });
  }

  async listLogs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const taskId = readOptionalString(query.taskId);
    const status = query.status ? readLogStatus(query.status) : undefined;
    const where: Prisma.NotificationLogWhereInput = {
      ...(taskId ? { taskId } : {}),
      ...(status ? { status } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.notificationLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        include: {
          task: { select: { id: true, name: true } },
          template: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, openid: true, wechatNickname: true, nickname: true } }
        }
      }),
      this.prisma.notificationLog.count({ where })
    ]);

    return ok({ items: items.map(formatLog), total, page, pageSize });
  }

  async getChannelConfig(channel: "WECHAT_SUBSCRIBE" | "SMS") {
    const config = await this.getStoredChannelConfig(channel);
    const center = await this.getCenterRuntime();
    const runtime = await this.resolveChannelRuntime(channel);
    const templates = await this.prisma.notificationTemplate.findMany({
      where: { channel },
      orderBy: { updatedAt: "desc" },
      select: { id: true, code: true, name: true, status: true, templateKey: true, updatedAt: true }
    });
    const envKey = channel === "SMS" ? "SMS_ENABLED" : "WECHAT_SUBSCRIBE_MESSAGE_ENABLED";
    return ok({
      channel,
      enabled: runtime.enabled,
      centerEnabled: center.enabled,
      envKey,
      provider: config?.provider ?? (channel === "SMS" ? process.env.SMS_PROVIDER ?? "" : "WECHAT_SUBSCRIBE"),
      providerSource: runtime.providerSource,
      signature: config?.signature ?? "",
      templateKey: config?.templateKey ? maskValue(config.templateKey) : null,
      smsTemplate: config?.smsTemplate ?? null,
      rateLimitPerMinute: config?.rateLimitPerMinute ?? 60,
      retryMaxAttempts: config?.retryMaxAttempts ?? 0,
      retryIntervalSeconds: config?.retryIntervalSeconds ?? 60,
      canSend: runtime.canSend,
      unavailableReason: runtime.unavailableReason,
      statusText: runtime.statusText,
      templates: templates.map((item) => ({ ...item, hasTemplateKey: Boolean(item.templateKey), templateKey: item.templateKey ? maskValue(item.templateKey) : null, updatedAt: item.updatedAt.toISOString() })),
      secretVisible: false,
      secret: {
        apiKey: { configured: Boolean(decryptSecret(config?.apiKeyEnc)), masked: maskSecret(decryptSecret(config?.apiKeyEnc)) },
        apiSecret: { configured: Boolean(decryptSecret(config?.apiSecretEnc)), masked: maskSecret(decryptSecret(config?.apiSecretEnc)) }
      },
      envGuide: notificationEnvGuide(channel, envKey)
    });
  }

  async updateChannelConfig(channel: "WECHAT_SUBSCRIBE" | "SMS", input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    if (typeof body.centerEnabled !== "undefined") {
      await this.upsertCenterConfig(readBoolean(body.centerEnabled, "centerEnabled"));
    }
    await this.prisma.notificationChannelConfig.upsert({
      where: { channel },
      create: {
        channel,
        enabled: readOptionalBoolean(body.enabled) ?? false,
        provider: readOptionalString(body.provider),
        providerSource: "DB",
        signature: readOptionalString(body.signature),
        templateKey: readOptionalString(body.templateKey),
        smsTemplate: readOptionalString(body.smsTemplate),
        apiKeyEnc: readSensitive(body.apiKey) ? encryptSecret(readSensitive(body.apiKey)) : null,
        apiSecretEnc: readSensitive(body.apiSecret) ? encryptSecret(readSensitive(body.apiSecret)) : null,
        rateLimitPerMinute: readOptionalNonNegativeInt(body.rateLimitPerMinute) ?? 60,
        retryMaxAttempts: readOptionalNonNegativeInt(body.retryMaxAttempts) ?? 0,
        retryIntervalSeconds: readOptionalNonNegativeInt(body.retryIntervalSeconds) ?? 60,
        settingsJson: readOptionalSettings(body)
      },
      update: {
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.provider !== "undefined" ? { provider: readNullableString(body.provider) } : {}),
        ...(typeof body.signature !== "undefined" ? { signature: readNullableString(body.signature) } : {}),
        ...(typeof body.templateKey !== "undefined" ? { templateKey: readNullableString(body.templateKey) } : {}),
        ...(typeof body.smsTemplate !== "undefined" ? { smsTemplate: readNullableString(body.smsTemplate) } : {}),
        ...(readSensitive(body.apiKey) ? { apiKeyEnc: encryptSecret(readSensitive(body.apiKey)) } : {}),
        ...(readSensitive(body.apiSecret) ? { apiSecretEnc: encryptSecret(readSensitive(body.apiSecret)) } : {}),
        ...(typeof body.rateLimitPerMinute !== "undefined" ? { rateLimitPerMinute: readNonNegativeInt(body.rateLimitPerMinute, "rateLimitPerMinute") } : {}),
        ...(typeof body.retryMaxAttempts !== "undefined" ? { retryMaxAttempts: readNonNegativeInt(body.retryMaxAttempts, "retryMaxAttempts") } : {}),
        ...(typeof body.retryIntervalSeconds !== "undefined" ? { retryIntervalSeconds: readNonNegativeInt(body.retryIntervalSeconds, "retryIntervalSeconds") } : {}),
        ...(hasAny(body, ["settingsJson", "note"]) ? { settingsJson: readOptionalSettings(body) } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "NotificationChannelConfig", channel, "Update notification channel config", {
      channel,
      enabled: readOptionalBoolean(body.enabled),
      provider: readOptionalString(body.provider),
      centerEnabled: readOptionalBoolean(body.centerEnabled),
      keyConfigured: Boolean(readSensitive(body.apiKey)),
      secretConfigured: Boolean(readSensitive(body.apiSecret))
    });
    return this.getChannelConfig(channel);
  }

  private async ensureTemplate(id: string) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException("Notification template not found");
    }
    return template;
  }

  private async getStoredChannelConfig(channel: NotificationChannelType) {
    return this.prisma.notificationChannelConfig.findUnique({ where: { channel } });
  }

  private async getCenterRuntime() {
    const config = await this.getStoredChannelConfig(NotificationChannelType.MOCK);
    if (config) return { enabled: config.enabled, source: "DB" };
    return { enabled: isEnabled("NOTIFICATION_CENTER_ENABLED"), source: isEnabled("NOTIFICATION_CENTER_ENABLED") ? "ENV" : "disabled" };
  }

  private upsertCenterConfig(enabled: boolean) {
    return this.prisma.notificationChannelConfig.upsert({
      where: { channel: NotificationChannelType.MOCK },
      create: { channel: NotificationChannelType.MOCK, enabled, provider: "mock", providerSource: "DB", settingsJson: { role: "notification-center-switch" } },
      update: { enabled, providerSource: "DB" }
    });
  }

  private async resolveChannelRuntime(channel: NotificationChannelType): Promise<NotificationRuntime> {
    const center = await this.getCenterRuntime();
    if (!center.enabled) {
      return {
        centerEnabled: false,
        enabled: false,
        providerSource: center.source,
        canSend: false,
        unavailableReason: "通知中心总开关未启用",
        statusText: "通知中心未启用，任务会记录 SKIPPED"
      };
    }
    if (channel === NotificationChannelType.MOCK) {
      return { centerEnabled: true, enabled: true, providerSource: center.source, canSend: true, statusText: "Mock 通道可用于测试" };
    }
    const config = await this.getStoredChannelConfig(channel);
    const envEnabled = channel === NotificationChannelType.SMS ? isEnabled("SMS_ENABLED") : isEnabled("WECHAT_SUBSCRIBE_MESSAGE_ENABLED");
    const envProvider = channel === NotificationChannelType.SMS ? process.env.SMS_PROVIDER || "" : "WECHAT_SUBSCRIBE";
    const enabled = config ? config.enabled : envEnabled;
    const providerSource = config ? "DB" : envEnabled ? "ENV" : "disabled";
    const provider = config?.provider || envProvider;
    const templateKey = config?.templateKey || (channel === NotificationChannelType.WECHAT_SUBSCRIBE ? process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID || "" : "");
    const apiKeyConfigured = Boolean(decryptSecret(config?.apiKeyEnc) || process.env.SMS_API_KEY || process.env.WECHAT_SUBSCRIBE_API_KEY);
    if (!enabled) {
      return { centerEnabled: true, enabled: false, providerSource, provider, canSend: false, unavailableReason: "通道未启用", statusText: "通道未启用，任务会记录 SKIPPED", templateKey };
    }
    if (channel === NotificationChannelType.SMS && !provider) {
      return { centerEnabled: true, enabled, providerSource, provider, canSend: false, unavailableReason: "短信供应商未配置", statusText: "短信供应商未配置，任务会记录 SKIPPED" };
    }
    if (channel === NotificationChannelType.WECHAT_SUBSCRIBE && !templateKey) {
      return { centerEnabled: true, enabled, providerSource, provider, canSend: false, unavailableReason: "微信订阅模板 ID 未配置", statusText: "微信订阅模板 ID 未配置，任务会记录 SKIPPED" };
    }
    return {
      centerEnabled: true,
      enabled,
      providerSource,
      provider,
      templateKey,
      apiKeyConfigured,
      canSend: false,
      unavailableReason: "真实发送适配器仍未接入，任务会记录 SKIPPED",
      statusText: "配置已保存；真实发送适配器未接入时不会伪造成功"
    };
  }

  private async formatTaskWithRuntime(item: Parameters<typeof formatTask>[0]) {
    return { ...formatTask(item), providerStatus: await this.resolveChannelRuntime(item.channel) };
  }

  private async resolveRecipients(payloadJson: Prisma.JsonValue | null, channel: NotificationChannelType): Promise<Array<{ userId: string | null; recipient: string | null }>> {
    const payload = isRecord(payloadJson) ? payloadJson : {};
    const userIds = Array.isArray(payload.userIds) ? payload.userIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    const recipients = Array.isArray(payload.recipients)
      ? payload.recipients
          .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
          .map((recipient) => ({ userId: null, recipient }))
      : [];
    if (userIds.length === 0) {
      return recipients;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(new Set(userIds)) } },
      select: { id: true, openid: true, phone: true }
    });
    return [
      ...users.map((user) => ({
      userId: user.id,
      recipient: channel === NotificationChannelType.SMS ? user.phone : user.openid
      })),
      ...recipients
    ];
  }

  private async sendOne(
    task: { id: string; channel: NotificationChannelType; template: { code: string; templateKey: string | null }; payloadJson: Prisma.JsonValue | null },
    recipient: { userId: string | null; recipient: string | null },
    runtime: NotificationRuntime
  ): Promise<NotificationSendResult> {
    const payload = isRecord(task.payloadJson) ? task.payloadJson : {};
    if (!runtime.centerEnabled) {
      return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "NOTIFICATION_CENTER_DISABLED", errorMessage: runtime.unavailableReason || "通知中心总开关未启用" };
    }
    if (task.channel === NotificationChannelType.MOCK) {
      if (recipient.userId && stringArray(payload.mockSkipUserIds).includes(recipient.userId)) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "MOCK_SKIPPED", errorMessage: "mock skip configured" };
      }
      if (recipient.userId && stringArray(payload.mockFailUserIds).includes(recipient.userId)) {
        return { ...recipient, status: NotificationLogStatus.FAILED, errorCode: "MOCK_FAILED", errorMessage: "mock failure configured" };
      }
      if (!recipient.recipient && !recipient.userId) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "NO_RECIPIENT", errorMessage: "任务未配置目标人群" };
      }
      return {
        ...recipient,
        status: NotificationLogStatus.SUCCESS,
        providerMessageId: `mock_${task.id}_${Date.now()}`
      };
    }
    if (task.channel === NotificationChannelType.WECHAT_SUBSCRIBE) {
      if (!runtime.enabled) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_SUBSCRIBE_DISABLED", errorMessage: runtime.unavailableReason || "微信订阅消息未启用" };
      }
      const templateKey = task.template.templateKey || runtime.templateKey;
      if (!templateKey) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_TEMPLATE_KEY_MISSING", errorMessage: "微信订阅消息模板 ID 未配置" };
      }
      if (!recipient.userId || !recipient.recipient) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_SUBSCRIBER_MISSING", errorMessage: "用户 openid 或订阅关系不存在" };
      }
      const subscription = await this.prisma.notificationSubscription.findUnique({
        where: { userId_channel_templateCode: { userId: recipient.userId, channel: task.channel, templateCode: task.template.code } }
      });
      if (!subscription?.enabled) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_SUBSCRIPTION_NOT_ENABLED", errorMessage: "用户未订阅该模板消息" };
      }
      return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "ADAPTER_RESERVED", errorMessage: "微信订阅消息真实发送适配器待接入" };
    }
    if (!runtime.enabled) {
      return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "SMS_DISABLED", errorMessage: runtime.unavailableReason || "短信通道未启用" };
    }
    if (!runtime.provider) {
      return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "SMS_PROVIDER_MISSING", errorMessage: "短信供应商未配置" };
    }
    if (!recipient.recipient) {
      return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "SMS_RECIPIENT_MISSING", errorMessage: "用户手机号不存在" };
    }
    return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "ADAPTER_RESERVED", errorMessage: "短信真实发送适配器待接入" };
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadataJson
      }
    });
  }
}

interface NotificationSendResult {
  userId: string | null;
  recipient: string | null;
  status: NotificationLogStatus;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface NotificationRuntime {
  centerEnabled: boolean;
  enabled: boolean;
  providerSource: string;
  provider?: string;
  templateKey?: string;
  apiKeyConfigured?: boolean;
  canSend: boolean;
  unavailableReason?: string;
  statusText: string;
}

function ok<TData>(data: TData) {
  return { code: "OK", message: "ok", data };
}

function maskValue(value: string): string {
  return value.length <= 6 ? "***" : `${value.slice(0, 3)}***${value.slice(-3)}`;
}

function notificationEnvGuide(channel: "WECHAT_SUBSCRIBE" | "SMS", enabledEnvKey: string) {
  const items =
    channel === "SMS"
      ? [
          { name: "SMS_PROVIDER", location: "services/api/.env.production", restartRequired: true },
          { name: "SMS_API_KEY / SMS_API_SECRET", location: "services/api/.env.production 或后台加密配置", restartRequired: true },
          { name: enabledEnvKey, location: "services/api/.env.production 或后台开关", restartRequired: true }
        ]
      : [
          { name: "WECHAT_SUBSCRIBE_TEMPLATE_ID", location: "后台模板配置或 services/api/.env.production", restartRequired: false },
          { name: enabledEnvKey, location: "services/api/.env.production 或后台开关", restartRequired: true }
        ];
  return items;
}

function formatSubscription(item: {
  id: string;
  userId: string;
  channel: NotificationChannelType;
  templateCode: string;
  openid: string | null;
  phone: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatTemplate(item: {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannelType;
  status: NotificationTemplateStatus;
  title: string | null;
  templateKey: string | null;
  contentJson: Prisma.JsonValue;
  remark: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatTask(item: {
  id: string;
  name: string;
  templateId: string;
  channel: NotificationChannelType;
  targetType: string;
  payloadJson: Prisma.JsonValue | null;
  status: NotificationTaskStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template?: { id: string; code: string; name: string; title: string | null };
  _count?: { logs: number };
}) {
  return {
    ...item,
    scheduledAt: item.scheduledAt?.toISOString() ?? null,
    sentAt: item.sentAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    logCount: item._count?.logs ?? 0
  };
}

function formatLog(item: {
  id: string;
  taskId: string | null;
  templateId: string | null;
  userId: string | null;
  channel: NotificationChannelType;
  recipient: string | null;
  status: NotificationLogStatus;
  providerMessageId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  payloadJson: Prisma.JsonValue | null;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  task?: { id: string; name: string } | null;
  template?: { id: string; code: string; name: string } | null;
  user?: { id: string; openid: string | null; wechatNickname: string | null; nickname: string | null } | null;
}) {
  return {
    ...item,
    sentAt: item.sentAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function readPage(query: Record<string, unknown>) {
  const page = clampInt(query.page, 1, 1, 100000);
  const pageSize = clampInt(query.pageSize, 20, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new BadRequestException("Request body must be a JSON object");
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "string") throw new BadRequestException("Expected string or null");
  return value.trim() || null;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "boolean") throw new BadRequestException("Expected boolean");
  return value;
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${field} must be boolean`);
  return value;
}

function readNonNegativeInt(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`${field} must be a non-negative integer`);
  return parsed;
}

function readOptionalNonNegativeInt(value: unknown): number | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  return readNonNegativeInt(value, "value");
}

function readSensitive(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^\*+$/.test(trimmed)) return null;
  return trimmed;
}

function hasAny(body: Record<string, unknown>, keys: string[]): boolean {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

function readOptionalSettings(body: Record<string, unknown>): Prisma.InputJsonObject | undefined {
  if (isRecord(body.settingsJson)) return compactJsonObject(body.settingsJson) as Prisma.InputJsonObject;
  const note = readOptionalString(body.note);
  return note ? { note } : undefined;
}

function readOptionalDate(value: unknown): Date | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BadRequestException("Expected ISO datetime string");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("Invalid datetime");
  return date;
}

function readJsonObject(value: unknown, field: string): Prisma.InputJsonObject {
  if (!isRecord(value)) {
    throw new BadRequestException(`${field} must be a JSON object`);
  }
  return compactJsonObject(value) as Prisma.InputJsonObject;
}

function readChannel(value: unknown): NotificationChannelType {
  if (typeof value === "string" && Object.values(NotificationChannelType).includes(value as NotificationChannelType)) {
    return value as NotificationChannelType;
  }
  throw new BadRequestException("Invalid notification channel");
}

function readTemplateStatus(value: unknown): NotificationTemplateStatus {
  if (typeof value === "string" && Object.values(NotificationTemplateStatus).includes(value as NotificationTemplateStatus)) {
    return value as NotificationTemplateStatus;
  }
  throw new BadRequestException("Invalid notification template status");
}

function readTaskStatus(value: unknown): NotificationTaskStatus {
  if (typeof value === "string" && Object.values(NotificationTaskStatus).includes(value as NotificationTaskStatus)) {
    return value as NotificationTaskStatus;
  }
  throw new BadRequestException("Invalid notification task status");
}

function readLogStatus(value: unknown): NotificationLogStatus {
  if (typeof value === "string" && Object.values(NotificationLogStatus).includes(value as NotificationLogStatus)) {
    return value as NotificationLogStatus;
  }
  throw new BadRequestException("Invalid notification log status");
}

function isEnabled(envName: string): boolean {
  return process.env[envName] === "true";
}

function taskStatusFromResultCounts(total: number, successCount: number, failedCount: number, skippedCount: number): NotificationTaskStatus {
  if (total > 0 && successCount === total) return NotificationTaskStatus.SENT;
  if (total > 0 && skippedCount === total) return NotificationTaskStatus.SKIPPED;
  if (successCount > 0) return NotificationTaskStatus.PARTIAL_FAILED;
  return failedCount > 0 ? NotificationTaskStatus.FAILED : NotificationTaskStatus.SKIPPED;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function compactJsonObject(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => typeof item !== "undefined"));
}

function renderJson(value: Prisma.JsonValue, variables: Record<string, unknown>): Prisma.JsonValue {
  if (typeof value === "string") return renderText(value, variables);
  if (Array.isArray(value)) return value.map((item) => renderJson(item, variables));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, renderJson(item as Prisma.JsonValue, variables)]));
  }
  return value;
}

function renderText(value: string, variables: Record<string, unknown>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key: string) => String(variables[key] ?? ""));
}
