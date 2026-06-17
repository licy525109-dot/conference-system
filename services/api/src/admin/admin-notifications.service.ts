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

    return ok({ items: items.map(formatTask), total, page, pageSize });
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
    return ok(formatTask(item));
  }

  async sendNow(id: string, admin: CurrentAdmin) {
    if (!isEnabled("NOTIFICATION_CENTER_ENABLED")) {
      throw new BadRequestException("通知中心未启用，请先配置 NOTIFICATION_CENTER_ENABLED=true");
    }

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
    const results = recipients.length
      ? await Promise.all(recipients.map((recipient) => this.sendOne(task, recipient)))
      : [await this.sendOne(task, { userId: null, recipient: null })];

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
    const status =
      successCount === results.length
        ? NotificationTaskStatus.SENT
        : successCount > 0
          ? NotificationTaskStatus.PARTIAL_FAILED
          : NotificationTaskStatus.FAILED;

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
    return ok({ task: formatTask(updated), result: { total: results.length, successCount, failedCount, skippedCount } });
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

  private async ensureTemplate(id: string) {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException("Notification template not found");
    }
    return template;
  }

  private async resolveRecipients(payloadJson: Prisma.JsonValue | null, channel: NotificationChannelType): Promise<Array<{ userId: string; recipient: string | null }>> {
    const payload = isRecord(payloadJson) ? payloadJson : {};
    const userIds = Array.isArray(payload.userIds) ? payload.userIds.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
    if (userIds.length === 0) {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: Array.from(new Set(userIds)) } },
      select: { id: true, openid: true, phone: true }
    });
    return users.map((user) => ({
      userId: user.id,
      recipient: channel === NotificationChannelType.SMS ? user.phone : user.openid
    }));
  }

  private async sendOne(
    task: { id: string; channel: NotificationChannelType },
    recipient: { userId: string | null; recipient: string | null }
  ): Promise<NotificationSendResult> {
    if (task.channel === NotificationChannelType.MOCK) {
      return {
        ...recipient,
        status: NotificationLogStatus.SUCCESS,
        providerMessageId: `mock_${task.id}_${Date.now()}`
      };
    }
    if (task.channel === NotificationChannelType.WECHAT_SUBSCRIBE) {
      return isEnabled("WECHAT_SUBSCRIBE_MESSAGE_ENABLED")
        ? { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "ADAPTER_RESERVED", errorMessage: "微信订阅消息真实发送适配器待接入" }
        : { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_SUBSCRIBE_DISABLED", errorMessage: "WECHAT_SUBSCRIBE_MESSAGE_ENABLED=false" };
    }
    return isEnabled("SMS_ENABLED")
      ? { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "ADAPTER_RESERVED", errorMessage: "短信真实发送适配器待接入" }
      : { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "SMS_DISABLED", errorMessage: "SMS_ENABLED=false" };
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

function ok<TData>(data: TData) {
  return { code: "OK", message: "ok", data };
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
  return value as Prisma.InputJsonObject;
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
