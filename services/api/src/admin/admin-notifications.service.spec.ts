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
  const originalPaymentTemplate = process.env.WECHAT_SUBSCRIBE_TEMPLATE_PAYMENT_SUCCESS;
  const originalSmsEnabled = process.env.SMS_ENABLED;

  after(() => {
    restoreEnv("NOTIFICATION_CENTER_ENABLED", originalEnabled);
    restoreEnv("WECHAT_SUBSCRIBE_MESSAGE_ENABLED", originalWechatEnabled);
    restoreEnv("WECHAT_SUBSCRIBE_TEMPLATE_PAYMENT_SUCCESS", originalPaymentTemplate);
    restoreEnv("SMS_ENABLED", originalSmsEnabled);
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
    await service.createTemplate(
      {
        code: "registration_success",
        name: "报名成功",
        channel: "WECHAT_SUBSCRIBE",
        status: "ACTIVE",
        templateKey: "wechat-template-1",
        contentJson: { body: "报名成功", wechatData: { thing1: "{{会议名称}}" } }
      },
      admin
    );

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

  it("creates an in-app business notification once for the same source key", async () => {
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);

    const first = await service.dispatchBusinessNotification({
      userId: "user-1",
      sourceKey: "registration:order-1",
      type: "REGISTRATION_CONFIRMED",
      title: "报名成功",
      summary: "观潮会集报名已确认",
      route: "/pages/registration-success/index?registrationId=registration-1",
      payloadJson: { registrationId: "registration-1" }
    });
    const second = await service.dispatchBusinessNotification({
      userId: "user-1",
      sourceKey: "registration:order-1",
      type: "REGISTRATION_CONFIRMED",
      title: "报名成功"
    });

    assert.equal(first.delivery, "IN_APP_ONLY");
    assert.equal(second.delivery, "DUPLICATE");
    assert.equal(prisma.userNotifications.length, 1);
  });

  it("claims a notification task before sending so a second send is rejected", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "atomic_send", name: "原子发送", channel: "MOCK", status: "ACTIVE", contentJson: { body: "发送" } },
      admin
    );
    const task = await service.createTask(
      { name: "原子发送", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" },
      admin
    );

    await service.sendNow(task.data.id, admin);
    await assert.rejects(() => service.sendNow(task.data.id, admin), /当前任务状态不允许再次发送/);
    assert.equal(prisma.logs.length, 1);
  });

  it("automatically processes notification tasks whose scheduled time has arrived", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "scheduled_notice", name: "定时提醒", channel: "MOCK", status: "ACTIVE", contentJson: { body: "提醒" } },
      admin
    );
    const task = await service.createTask(
      { name: "定时提醒", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, scheduledAt: "2026-06-17T07:59:00.000Z" },
      admin
    );

    const result = await service.processDueTasks(new Date("2026-06-17T08:00:00.000Z"));

    assert.deepEqual(result, { found: 1, processed: 1, failed: 0 });
    assert.equal(prisma.tasks.find((item) => item.id === task.data.id)?.status, NotificationTaskStatus.SENT);
  });

  it("automatically retries immediate pending tasks without a scheduled time", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "immediate_notice", name: "即时通知", channel: "MOCK", status: "ACTIVE", contentJson: { body: "提醒" } },
      admin
    );
    const task = await service.createTask(
      { name: "即时通知", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" },
      admin
    );

    const result = await service.processDueTasks(new Date("2026-06-17T08:00:00.000Z"));

    assert.deepEqual(result, { found: 1, processed: 1, failed: 0 });
    assert.equal(prisma.tasks.find((item) => item.id === task.data.id)?.status, NotificationTaskStatus.SENT);
  });

  it("recovers stale sending tasks and resumes them without operator action", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "recovered_notice", name: "恢复通知", channel: "MOCK", status: "ACTIVE", contentJson: { body: "提醒" } },
      admin
    );
    const task = await service.createTask(
      { name: "恢复通知", templateId: template.data.id, payloadJson: { userIds: ["user-1"] }, status: "PENDING" },
      admin
    );
    const storedTask = prisma.tasks.find((item) => item.id === task.data.id)!;
    storedTask.status = NotificationTaskStatus.SENDING;
    storedTask.updatedAt = new Date("2026-06-17T07:40:00.000Z");

    const result = await service.processDueTasks(new Date("2026-06-17T08:00:00.000Z"));

    assert.deepEqual(result, { found: 1, processed: 1, failed: 0 });
    assert.equal(storedTask.status, NotificationTaskStatus.SENT);
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

  it("does not advertise a WeChat template without field mappings as sendable", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    process.env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED = "true";
    const service = new AdminNotificationsService(createNotificationPrismaMock());

    const runtime = await service.getChannelRuntime(
      NotificationChannelType.WECHAT_SUBSCRIBE,
      "wechat-template-1",
      { body: "{{会议名称}}的安排已更新" }
    );

    assert.equal(runtime.canSend, false);
    assert.equal(runtime.unavailableReason, "微信订阅模板字段映射未配置");
  });

  it("resolves the environment template ID for each business notification code", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    process.env.WECHAT_SUBSCRIBE_MESSAGE_ENABLED = "true";
    process.env.WECHAT_SUBSCRIBE_TEMPLATE_PAYMENT_SUCCESS = "payment-template-id";
    const service = new AdminNotificationsService(createNotificationPrismaMock(), {
      isConfigured: () => true
    } as any);

    const runtime = await service.getChannelRuntime(
      NotificationChannelType.WECHAT_SUBSCRIBE,
      null,
      { wechatData: { thing1: "{{会议名称}}" } },
      "PAYMENT_SUCCESS"
    );

    assert.equal(runtime.templateKey, "payment-template-id");
    assert.equal(runtime.canSend, true);
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
    assert.equal(prisma.logs.filter((item) => item.userId === "user-1" && item.status === NotificationLogStatus.SUCCESS).length, 1);
    assert.equal(prisma.logs.filter((item) => item.userId === "user-2" && item.status === NotificationLogStatus.FAILED).length, 2);
  });

  it("automatically retries failed recipients according to the stored channel policy", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    prisma.configs.push(toChannelConfig({
      channel: NotificationChannelType.MOCK,
      enabled: true,
      retryMaxAttempts: 1,
      retryIntervalSeconds: 0
    }));
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      { code: "automatic_retry", name: "自动重试", channel: "MOCK", status: "ACTIVE", contentJson: { body: "提醒" } },
      admin
    );
    const task = await service.createTask(
      { name: "自动重试", templateId: template.data.id, payloadJson: { userIds: ["user-1"], mockFailUserIds: ["user-1"] }, status: "PENDING" },
      admin
    );

    const first = await service.sendNow(task.data.id, admin);
    const retry = await service.processDueTasks(new Date(Date.now() + 1000));

    assert.equal(first.data.task.status, NotificationTaskStatus.PENDING);
    assert.equal(first.data.task.sentAt, null);
    assert.deepEqual(retry, { found: 1, processed: 1, failed: 0 });
    assert.equal(prisma.tasks.find((item) => item.id === task.data.id)?.status, NotificationTaskStatus.FAILED);
    assert.equal(prisma.logs.filter((item) => item.userId === "user-1" && item.status === NotificationLogStatus.FAILED).length, 2);
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

  it("creates templates and tasks from operator forms without JSON editing", async () => {
    process.env.NOTIFICATION_CENTER_ENABLED = "true";
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);

    const template = await service.createTemplate(
      {
        code: "registration_success_form",
        name: "报名成功通知",
        channel: "MOCK",
        status: "ACTIVE",
        purpose: "REGISTRATION_SUCCESS",
        title: "报名成功",
        bodyText: "您好 {{参会人姓名}}，您已报名 {{会议名称}}。",
        variables: ["{{参会人姓名}}", "{{会议名称}}"]
      },
      admin
    );
    const task = await service.createTask(
      {
        name: "已支付用户提醒",
        templateId: template.data.id,
        recipientType: "PAID_USERS",
        conferenceId: "conference-1",
        recipientText: "13800000000\n13900000000",
        status: "PENDING"
      },
      admin
    );

    assert.equal((prisma.templates[0]?.contentJson as Record<string, unknown>).purpose, "REGISTRATION_SUCCESS");
    assert.match(String((prisma.templates[0]?.contentJson as Record<string, unknown>).body), /会议名称/);
    assert.equal(prisma.tasks[0]?.targetType, "PAID_USERS");
    assert.deepEqual((prisma.tasks[0]?.payloadJson as Record<string, unknown>).recipients, ["13800000000", "13900000000"]);
    assert.equal((task.data.payloadJson as Record<string, unknown>).conferenceId, "conference-1");
  });

  it("renders Chinese template variable names", async () => {
    const prisma = createNotificationPrismaMock();
    const service = new AdminNotificationsService(prisma);
    const template = await service.createTemplate(
      {
        code: "guest_schedule_updated",
        name: "会务安排更新",
        channel: "MOCK",
        status: "ACTIVE",
        title: "{{会议名称}}安排更新",
        contentJson: { body: "{{参会人姓名}}，请查看{{安排名称}}。" }
      },
      admin
    );

    const preview = await service.previewTemplate(template.data.id, {
      variables: { 会议名称: "观潮会集", 参会人姓名: "李嘉宾", 安排名称: "工作坊" }
    });

    assert.equal(preview.data.title, "观潮会集安排更新");
    assert.equal((preview.data.content as Record<string, unknown>).body, "李嘉宾，请查看工作坊。");
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}

function createNotificationPrismaMock() {
  const now = new Date("2026-06-17T08:00:00.000Z");
  const templates: NotificationTemplateRecord[] = [];
  const tasks: NotificationTaskRecord[] = [];
  const logs: NotificationLogRecord[] = [];
  const subscriptions: NotificationSubscriptionRecord[] = [];
  const userNotifications: UserNotificationRecord[] = [];
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
    userNotifications,
    configs,
    auditLogs,
    user: {
      findMany: async (args?: { where?: { id?: { in?: string[] } } }) => {
        const ids = args?.where?.id?.in;
        return Array.isArray(ids) ? users.filter((user) => ids.includes(user.id)) : users;
      }
    },
    userNotification: {
      findUnique: async (args: { where: { sourceKey: string } }) =>
        userNotifications.find((item) => item.sourceKey === args.where.sourceKey) ?? null,
      create: async (args: { data: Partial<UserNotificationRecord> }) => {
        if (args.data.sourceKey && userNotifications.some((item) => item.sourceKey === args.data.sourceKey)) {
          throw Object.assign(new Error("duplicate source key"), { code: "P2002" });
        }
        const item: UserNotificationRecord = {
          id: `user-notification-${userNotifications.length + 1}`,
          userId: String(args.data.userId),
          type: String(args.data.type),
          title: String(args.data.title),
          summary: args.data.summary ?? null,
          route: args.data.route ?? null,
          sourceKey: args.data.sourceKey ?? null,
          payloadJson: args.data.payloadJson ?? null,
          readAt: null,
          createdAt: now,
          updatedAt: now
        };
        userNotifications.push(item);
        return item;
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
      findUnique: async (args: { where: { id?: string; code?: string } }) =>
        templates.find((item) => args.where.id ? item.id === args.where.id : item.code === args.where.code) ?? null,
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
      updateMany: async (args: {
        where: {
          id?: string;
          status?: NotificationTaskStatus | { in: NotificationTaskStatus[] };
          updatedAt?: { lte: Date };
        };
        data: Partial<NotificationTaskRecord>;
      }) => {
        const matched = tasks.filter((task) =>
          (!args.where.id || task.id === args.where.id)
          && matchesTaskStatus(task.status, args.where.status)
          && (!args.where.updatedAt || task.updatedAt <= args.where.updatedAt.lte)
        );
        matched.forEach((task) => Object.assign(task, args.data, { updatedAt: now }));
        return { count: matched.length };
      },
      findMany: async (args?: {
        where?: {
          status?: NotificationTaskStatus;
          OR?: Array<{ scheduledAt: null | { lte: Date } }>;
        };
      }) => tasks
        .filter((task) => !args?.where?.status || task.status === args.where.status)
        .filter((task) => !args?.where?.OR || args.where.OR.some((condition) => {
          if (condition.scheduledAt === null) return task.scheduledAt === null;
          return task.scheduledAt !== null && task.scheduledAt <= condition.scheduledAt.lte;
        }))
        .map((task) => ({ ...task, template: templates.find((item) => item.id === task.templateId), _count: { logs: logs.filter((log) => log.taskId === task.id).length } })),
      count: async () => tasks.length
    },
    notificationLog: {
      create: async (args: { data: Partial<NotificationLogRecord> }) => {
        const item = toLog({ ...args.data, id: `log-${logs.length + 1}` });
        logs.push(item);
        return item;
      },
      findMany: async (args?: { where?: { taskId?: string; status?: NotificationLogStatus } }) => logs
        .filter((log) => !args?.where?.taskId || log.taskId === args.where.taskId)
        .filter((log) => !args?.where?.status || log.status === args.where.status)
        .map((log) => ({ ...log, task: tasks.find((task) => task.id === log.taskId) ?? null, template: templates.find((template) => template.id === log.templateId) ?? null, user: null })),
      count: async (args?: { where?: { taskId?: string; status?: NotificationLogStatus } }) => logs
        .filter((log) => !args?.where?.taskId || log.taskId === args.where.taskId)
        .filter((log) => !args?.where?.status || log.status === args.where.status)
        .length
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
    $transaction: async (ops: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) =>
      typeof ops === "function" ? ops(mock) : Promise.all(ops)
  };
  return mock as typeof mock & PrismaService;
}

function matchesTaskStatus(
  current: NotificationTaskStatus,
  expected: NotificationTaskStatus | { in: NotificationTaskStatus[] } | undefined
): boolean {
  if (!expected) return true;
  return typeof expected === "string" ? current === expected : expected.in.includes(current);
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

interface UserNotificationRecord {
  id: string;
  userId: string;
  type: string;
  title: string;
  summary: string | null;
  route: string | null;
  sourceKey: string | null;
  payloadJson: unknown;
  readAt: Date | null;
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
