import "reflect-metadata";
import { after, describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AuditAction,
  NotificationChannelType,
  NotificationLogStatus,
  NotificationTaskStatus,
  NotificationTemplateStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminNotificationsService } from "./admin-notifications.service";
import { CurrentAdmin } from "./current-admin";

const admin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "管理员",
  permissions: ["notification:view", "notification:write", "notification:send"]
};

describe("AdminNotificationsService", () => {
  const originalEnabled = process.env.NOTIFICATION_CENTER_ENABLED;
  const originalWechatEnabled = process.env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED;
  const originalSmsEnabled = process.env.SMS_ENABLED;

  after(() => {
    process.env.NOTIFICATION_CENTER_ENABLED = originalEnabled;
    process.env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED = originalWechatEnabled;
    process.env.SMS_ENABLED = originalSmsEnabled;
  });

  it("creates templates, tasks and mock send logs", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);

    const template = await service.createTemplate(
      {
        code: "registration_success",
        name: "报名成功",
        channel: "MOCK",
        status: "ACTIVE",
        contentJson: { body: "报名成功" }
      },
      admin
    );
    const task = await service.createTask(
      {
        name: "发送报名成功",
        templateId: template.data.id,
        payloadJson: { userIds: ["user-1"] },
        status: "PENDING"
      },
      admin
    );
    const result = await service.sendNow(task.data.id, admin);
    const logs = await service.listLogs({ page: 1, pageSize: 20 });

    assert.equal(result.data.result.successCount, 1);
    assert.equal(result.data.task.status, NotificationTaskStatus.SENT);
    assert.equal(logs.data.items[0]?.status, NotificationLogStatus.SUCCESS);
    assert.equal(prisma.auditLogs.some((log) => log.entityType === "NotificationTask" && log.action === AuditAction.SYSTEM), true);
  });

  it("stores user notification subscriptions idempotently", async () => {
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);

    const first = await service.subscribe(
      {
        templateCode: "registration_success",
        channel: "WECHAT_SUBSCRIBE"
      },
      { id: "user-1", openid: "openid-1", nickname: "用户" }
    );
    const second = await service.subscribe(
      {
        templateCode: "registration_success",
        channel: "WECHAT_SUBSCRIBE",
        enabled: false
      },
      { id: "user-1", openid: "openid-1", nickname: "用户" }
    );

    assert.equal(first.data.id, second.data.id);
    assert.equal(second.data.enabled, false);
    assert.equal(prisma.subscriptions.length, 1);
  });

  it("marks wechat subscribe tasks skipped when template key is missing", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    process.env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "pay_success", name: "支付成功", channel: "WECHAT_SUBSCRIBE", status: "ACTIVE", contentJson: { body: "支付成功" } },
      admin
    );
    const task = await service.createTask({ name: "微信通知", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" }, admin);

    const result = await service.sendNow(task.data.id, admin);

    assert.equal(result.data.task.status, NotificationTaskStatus.SKIPPED);
    assert.equal(prisma.logs[0]?.status, NotificationLogStatus.SKIPPED);
    assert.equal(prisma.logs[0]?.errorCode, "WECHAT_TEMPLATE_KEY_MISSING");
  });

  it("marks sms tasks skipped when provider is disabled", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    process.env.SMS_ENABLED = "false";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate({ code: "refund_update", name: "退款处理", channel: "SMS", status: "ACTIVE", contentJson: { body: "退款处理" } }, admin);
    const task = await service.createTask({ name: "短信通知", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" }, admin);

    const result = await service.sendNow(task.data.id, admin);

    assert.equal(result.data.task.status, NotificationTaskStatus.SKIPPED);
    assert.equal(result.data.result.skippedCount, 1);
    assert.equal(prisma.logs[0]?.errorCode, "SMS_DISABLED");
  });

  it("retries partial failed mock tasks and records failure reasons", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate({ code: "before_event", name: "会前提醒", channel: "MOCK", status: "ACTIVE", contentJson: { body: "会前提醒" } }, admin);
    const task = await service.createTask(
      { name: "会前提醒", templateId: template.data.id, payloadJson: { userIds: ["user-1", "user-2"], mockFailUserIds: ["user-2"] }, status: "PENDING" },
      admin
    );

    const first = await service.sendNow(task.data.id, admin);
    const second = await service.retryTask(task.data.id, admin);
    const logs = await service.listLogs({ page: 1, pageSize: 20, status: "FAILED" });

    assert.equal(first.data.task.status, NotificationTaskStatus.PARTIAL_FAILED);
    assert.equal(second.data.task.status, NotificationTaskStatus.PARTIAL_FAILED);
    assert.equal(logs.data.items.some((item) => item.errorCode === "MOCK_FAILED"), true);
  });

  it("stores channel config without returning plaintext secrets and DB switch controls sending", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "false";
    process.env.SMS_ENABLED = "false";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);

    const config = await service.updateChannelConfig(
      "SMS",
      { centerEnabled: true, enabled: true, provider: "aliyun", signature: "会务", smsTemplate: "SMS_001", apiKey: "sms-api-key-secret", apiSecret: "sms-api-secret-value" },
      admin
    );
    const payload = JSON.stringify(config.data);

    assert.equal(config.data.enabled, true);
    assert.equal(config.data.centerEnabled, true);
    assert.equal(config.data.providerSource, "DB");
    assert.equal(config.data.secret.apiKey.configured, true);
    assert.equal(payload.includes("sms-api-key-secret"), false);
    assert.equal(payload.includes("sms-api-secret-value"), false);

    const template = await service.createTemplate({ code: "sms_notice", name: "短信", channel: "SMS", status: "ACTIVE", contentJson: { body: "短信" } }, admin);
    const task = await service.createTask({ name: "短信任务", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" }, admin);
    const result = await service.sendNow(task.data.id, admin);

    assert.equal(result.data.task.status, NotificationTaskStatus.SKIPPED);
    assert.equal(result.data.task.providerStatus.providerSource, "DB");
    assert.equal(prisma.logs[0]?.errorCode, "ADAPTER_RESERVED");
  });
});

function createNotificationPrismaMock() {
  const now = new Date("2026-06-17T08:00:00.000Z");
  const templates: NotificationTemplateRecord[] = [];
  const tasks: NotificationTaskRecord[] = [];
  const logs: NotificationLogRecord[] = [];
  const subscriptions: NotificationSubscriptionRecord[] = [];
  const configs: NotificationChannelConfigRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];
  const users = [
    { id: "user-1", openid: "openid-1", phone: "13800000000" },
    { id: "user-2", openid: "openid-2", phone: "13900000000" }
  ];
  const mock = {
    templates,
    tasks,
    logs,
    subscriptions,
    auditLogs,
    user: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return Array.isArray(ids) ? users.filter((user) => ids.includes(user.id)) : users;
      }
    },
    notificationSubscription: {
      findUnique: async (args: { where: { userId_channel_templateCode: { userId: string; channel: NotificationChannelType; templateCode: string } } }) => {
        const key = args.where.userId_channel_templateCode;
        return subscriptions.find((item) => item.userId === key.userId && item.channel === key.channel && item.templateCode === key.templateCode) ?? null;
      },
      upsert: async (args: {
        where: { userId_channel_templateCode: { userId: string; channel: NotificationChannelType; templateCode: string } };
        update: Partial<NotificationSubscriptionRecord>;
        create: Partial<NotificationSubscriptionRecord>;
      }) => {
        const key = args.where.userId_channel_templateCode;
        const existing = subscriptions.find((item) => item.userId === key.userId && item.channel === key.channel && item.templateCode === key.templateCode);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: now });
          return existing;
        }
        const item = {
          id: `sub-${subscriptions.length + 1}`,
          userId: key.userId,
          channel: key.channel,
          templateCode: key.templateCode,
          openid: args.create.openid ?? null,
          phone: args.create.phone ?? null,
          enabled: args.create.enabled ?? true,
          createdAt: now,
          updatedAt: now
        };
        subscriptions.push(item);
        return item;
      }
    },
    notificationTemplate: {
      create: async (args: { data: Partial<NotificationTemplateRecord> }) => {
        const item = toTemplate({ ...args.data, id: `template-${templates.length + 1}` });
        templates.push(item);
        return item;
      },
      findUnique: async (args: { where: { id: string } }) => templates.find((item) => item.id === args.where.id) ?? null,
      findMany: async () => templates,
      count: async () => templates.length
    },
    notificationTask: {
      create: async (args: { data: Partial<NotificationTaskRecord>; include?: unknown }) => {
        const template = templates.find((item) => item.id === args.data.templateId);
        const item = toTask({ ...args.data, id: `task-${tasks.length + 1}`, template });
        tasks.push(item);
        return { ...item, template, _count: { logs: 0 } };
      },
      findUnique: async (args: { where: { id: string } }) => {
        const task = tasks.find((item) => item.id === args.where.id);
        return task ? { ...task, template: templates.find((item) => item.id === task.templateId)! } : null;
      },
      update: async (args: { where: { id: string }; data: Partial<NotificationTaskRecord>; include?: unknown }) => {
        const task = tasks.find((item) => item.id === args.where.id);
        if (!task) throw new Error("missing task");
        Object.assign(task, args.data, { updatedAt: now });
        const template = templates.find((item) => item.id === task.templateId);
        return { ...task, template, _count: { logs: logs.filter((log) => log.taskId === task.id).length } };
      },
      findMany: async () => tasks.map((task) => ({ ...task, template: templates.find((item) => item.id === task.templateId), _count: { logs: logs.filter((log) => log.taskId === task.id).length } })),
      count: async () => tasks.length
    },
    notificationLog: {
      create: async (args: { data: Partial<NotificationLogRecord> }) => {
        const item = toLog({ ...args.data, id: `log-${logs.length + 1}` });
        logs.push(item);
        return item;
      },
      findMany: async () => logs.map((log) => ({ ...log, task: tasks.find((task) => task.id === log.taskId) ?? null, template: templates.find((template) => template.id === log.templateId) ?? null, user: null })),
      count: async () => logs.length
    },
    notificationChannelConfig: {
      findUnique: async (args: { where: { channel: NotificationChannelType } }) => configs.find((item) => item.channel === args.where.channel) ?? null,
      upsert: async (args: { where: { channel: NotificationChannelType }; create: Partial<NotificationChannelConfigRecord>; update: Partial<NotificationChannelConfigRecord> }) => {
        const existing = configs.find((item) => item.channel === args.where.channel);
        if (existing) {
          Object.assign(existing, args.update, { updatedAt: now });
          return existing;
        }
        const item = toChannelConfig({ ...args.create, id: `config-${configs.length + 1}`, channel: args.where.channel });
        configs.push(item);
        return item;
      }
    },
    auditLog: {
      create: async (args: { data: AuditLogRecord }) => {
        auditLogs.push(args.data);
        return args.data;
      }
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops)
  };
  return mock as typeof mock & PrismaService;
}

function toTemplate(input: Partial<NotificationTemplateRecord>): NotificationTemplateRecord {
  const now = new Date("2026-06-17T08:00:00.000Z");
  return {
    id: input.id ?? "template-1",
    code: input.code ?? "registration_success",
    name: input.name ?? "报名成功",
    channel: input.channel ?? NotificationChannelType.MOCK,
    status: input.status ?? NotificationTemplateStatus.ACTIVE,
    title: input.title ?? null,
    templateKey: input.templateKey ?? null,
    contentJson: input.contentJson ?? {},
    remark: input.remark ?? null,
    createdById: input.createdById ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

function toTask(input: Partial<NotificationTaskRecord>): NotificationTaskRecord {
  const now = new Date("2026-06-17T08:00:00.000Z");
  return {
    id: input.id ?? "task-1",
    name: input.name ?? "任务",
    templateId: input.templateId ?? "template-1",
    channel: input.channel ?? NotificationChannelType.MOCK,
    targetType: input.targetType ?? "MANUAL",
    payloadJson: input.payloadJson ?? null,
    status: input.status ?? NotificationTaskStatus.PENDING,
    scheduledAt: input.scheduledAt ?? null,
    sentAt: input.sentAt ?? null,
    createdById: input.createdById ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    template: input.template
  };
}

function toLog(input: Partial<NotificationLogRecord>): NotificationLogRecord {
  const now = new Date("2026-06-17T08:00:00.000Z");
  return {
    id: input.id ?? "log-1",
    taskId: input.taskId ?? null,
    templateId: input.templateId ?? null,
    userId: input.userId ?? null,
    channel: input.channel ?? NotificationChannelType.MOCK,
    recipient: input.recipient ?? null,
    status: input.status ?? NotificationLogStatus.PENDING,
    providerMessageId: input.providerMessageId ?? null,
    errorCode: input.errorCode ?? null,
    errorMessage: input.errorMessage ?? null,
    payloadJson: input.payloadJson ?? null,
    sentAt: input.sentAt ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

interface NotificationTemplateRecord {
  id: string;
  code: string;
  name: string;
  channel: NotificationChannelType;
  status: NotificationTemplateStatus;
  title: string | null;
  templateKey: string | null;
  contentJson: unknown;
  remark: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationTaskRecord {
  id: string;
  name: string;
  templateId: string;
  channel: NotificationChannelType;
  targetType: string;
  payloadJson: unknown;
  status: NotificationTaskStatus;
  scheduledAt: Date | null;
  sentAt: Date | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  template?: NotificationTemplateRecord;
}

interface NotificationLogRecord {
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
  payloadJson: unknown;
  sentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationSubscriptionRecord {
  id: string;
  userId: string;
  channel: NotificationChannelType;
  templateCode: string;
  openid: string | null;
  phone: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

interface NotificationChannelConfigRecord {
  id: string;
  channel: NotificationChannelType;
  enabled: boolean;
  provider: string | null;
  providerSource: string;
  signature: string | null;
  templateKey: string | null;
  smsTemplate: string | null;
  apiKeyEnc: string | null;
  apiSecretEnc: string | null;
  rateLimitPerMinute: number;
  retryMaxAttempts: number;
  retryIntervalSeconds: number;
  settingsJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function toChannelConfig(input: Partial<NotificationChannelConfigRecord>): NotificationChannelConfigRecord {
  const now = new Date("2026-06-17T08:00:00.000Z");
  return {
    id: input.id ?? "config-1",
    channel: input.channel ?? NotificationChannelType.SMS,
    enabled: input.enabled ?? false,
    provider: input.provider ?? null,
    providerSource: input.providerSource ?? "DB",
    signature: input.signature ?? null,
    templateKey: input.templateKey ?? null,
    smsTemplate: input.smsTemplate ?? null,
    apiKeyEnc: input.apiKeyEnc ?? null,
    apiSecretEnc: input.apiSecretEnc ?? null,
    rateLimitPerMinute: input.rateLimitPerMinute ?? 60,
    retryMaxAttempts: input.retryMaxAttempts ?? 0,
    retryIntervalSeconds: input.retryIntervalSeconds ?? 60,
    settingsJson: input.settingsJson ?? null,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now
  };
}

interface AuditLogRecord {
  adminUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadataJson?: unknown;
}
