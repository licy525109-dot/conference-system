import { BadRequestException, Injectable, NotFoundException, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
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
import { WechatSubscribeClient } from "./wechat-subscribe-client";

@Injectable()
export class AdminNotificationsService implements OnModuleInit, OnModuleDestroy {
  private static readonly staleSendingTaskMs = 10 * 60 * 1000;
  private taskTimer?: ReturnType<typeof setInterval>;
  private processingDueTasks = false;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly wechatSubscribeClient?: WechatSubscribeClient
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.NOTIFICATION_TASK_WORKER_ENABLED === "false") return;
    this.taskTimer = setInterval(() => void this.processDueTasks(), 15_000);
    this.taskTimer.unref?.();
    void this.processDueTasks();
  }

  onModuleDestroy(): void {
    if (this.taskTimer) clearInterval(this.taskTimer);
  }

  async subscribe(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const templateCode = readRequiredString(body, "templateCode");
    const channel = readChannel(body.channel ?? NotificationChannelType.WECHAT_SUBSCRIBE);
    const enabled = readOptionalBoolean(body.enabled) ?? true;
    const phone = readOptionalString(body.phone);

    const template = await this.prisma.notificationTemplate.findUnique({ where: { code: templateCode } });
    if (!template || template.channel !== channel || template.status !== NotificationTemplateStatus.ACTIVE) {
      throw new BadRequestException("通知模板不存在、未启用或通道不匹配");
    }

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

  async getSubscriptionConfig(query: Record<string, unknown>) {
    const codes = splitLines(readOptionalString(query.codes)).slice(0, 10);
    const templates = await this.prisma.notificationTemplate.findMany({
      where: {
        channel: NotificationChannelType.WECHAT_SUBSCRIBE,
        ...(codes.length ? { code: { in: codes } } : {})
      },
      orderBy: [{ updatedAt: "desc" }]
    });
    const items = await Promise.all(templates.map(async (template) => {
      const runtime = await this.resolveChannelRuntime(template.channel, template.templateKey, template.contentJson, template.code);
      const content = isRecord(template.contentJson) ? template.contentJson : {};
      const templateId = template.templateKey || runtime.templateKey || null;
      const enabled = template.status === NotificationTemplateStatus.ACTIVE && Boolean(templateId) && runtime.canSend;
      return {
        templateCode: template.code,
        templateId,
        name: template.name,
        purpose: readOptionalString(content.purpose) ?? template.code,
        page: readPagePath({}, template.contentJson),
        enabled,
        message: enabled
          ? "可申请接收下一次微信服务通知"
          : template.status !== NotificationTemplateStatus.ACTIVE
            ? "管理员尚未启用该订阅消息模板"
            : runtime.unavailableReason || "微信订阅消息通道尚未就绪"
      };
    }));
    return ok({ items });
  }

  async dispatchBusinessNotification(input: BusinessNotificationInput) {
    const userId = input.userId;
    if (!userId) return { created: false, taskId: null, delivery: "NO_USER" as const };
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const existing = await tx.userNotification.findUnique({ where: { sourceKey: input.sourceKey }, select: { id: true } });
        if (existing) return { created: false, taskId: null };

        await tx.userNotification.create({
          data: {
            userId,
            type: input.type,
            title: input.title,
            summary: input.summary ?? null,
            route: input.route ?? null,
            sourceKey: input.sourceKey,
            payloadJson: input.payloadJson
          }
        });

        if (!input.templateCode) return { created: true, taskId: null };
        const template = await tx.notificationTemplate.findUnique({ where: { code: input.templateCode } });
        if (!template || template.status !== NotificationTemplateStatus.ACTIVE || template.channel !== NotificationChannelType.WECHAT_SUBSCRIBE) {
          return { created: true, taskId: null };
        }
        const task = await tx.notificationTask.create({
          data: {
            name: input.taskName ?? input.title,
            templateId: template.id,
            channel: template.channel,
            targetType: "BUSINESS_EVENT",
            status: NotificationTaskStatus.PENDING,
            payloadJson: {
              userIds: [userId],
              variables: input.variables ?? {},
              ...(input.route ? { page: normalizeMiniProgramPage(input.route) } : {})
            } satisfies Prisma.InputJsonObject
          }
        });
        return { created: true, taskId: task.id };
      });

      if (!created.taskId) {
        return { ...created, delivery: created.created ? "IN_APP_ONLY" as const : "DUPLICATE" as const };
      }
      try {
        const sent = await this.sendNow(created.taskId);
        return { ...created, delivery: "WECHAT_ATTEMPTED" as const, result: sent.data.result };
      } catch (error) {
        logBusinessNotificationError(error, input, created.taskId);
        return { ...created, delivery: "WECHAT_FAILED" as const };
      }
    } catch (error) {
      if (isUniqueConstraintError(error)) return { created: false, taskId: null, delivery: "DUPLICATE" as const };
      logBusinessNotificationError(error, input, null);
      return { created: false, taskId: null, delivery: "FAILED" as const };
    }
  }

  dispatchRefundStatus(input: RefundStatusNotificationInput) {
    const statusLabel = refundStatusLabel(input.status);
    const sourceLabel = input.sourceType === "MALL" ? "商城" : "报名";
    const reason = input.reason?.trim() || null;
    const refundTime = formatWechatTemplateDateTime(new Date());
    return this.dispatchBusinessNotification({
      userId: input.userId,
      sourceKey: `refund-status:${input.sourceType}:${input.refundId}:${input.status}`,
      type: "REFUND_STATUS_UPDATED",
      title: refundNotificationTitle(input.status),
      summary: `${sourceLabel}订单 ${input.orderNo}，退款 ¥${formatCent(input.amountCent)}，${statusLabel}`,
      route: "/pages/refund/index",
      payloadJson: {
        refundId: input.refundId,
        refundNo: input.refundNo,
        orderNo: input.orderNo,
        sourceType: input.sourceType,
        amountCent: input.amountCent,
        status: input.status,
        statusLabel,
        ...(reason ? { reason } : {})
      },
      // The selected WeChat template is a completed-refund notice. Other states
      // remain visible in the in-app notification center without a misleading push.
      templateCode: input.status === "SUCCESS" ? "REFUND_STATUS_UPDATED" : undefined,
      variables: {
        退款单号: input.refundNo,
        订单号: input.orderNo,
        退款金额: `¥${formatCent(input.amountCent)}`,
        退款状态: statusLabel,
        处理说明: reason || statusLabel,
        退款方式: "原路退回",
        退款时间: refundTime
      }
    });
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
        contentJson: buildTemplateContent(body),
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
        ...(hasAny(body, ["contentJson", "bodyText", "body", "content", "purpose", "variables"]) ? { contentJson: buildTemplateContent(body) } : {}),
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

    const scheduledAt = readOptionalDate(body.scheduledAt);
    const item = await this.prisma.notificationTask.create({
      data: {
        name: readRequiredString(body, "name"),
        templateId: template.id,
        channel: template.channel,
        targetType: readOptionalString(body.recipientType) ?? readOptionalString(body.targetType) ?? "MANUAL",
        payloadJson: buildTaskPayload(body),
        status: body.status
          ? readTaskStatus(body.status)
          : scheduledAt
            ? NotificationTaskStatus.PENDING
            : NotificationTaskStatus.DRAFT,
        scheduledAt,
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

  async processDueTasks(now = new Date()): Promise<{ found: number; processed: number; failed: number }> {
    if (this.processingDueTasks) return { found: 0, processed: 0, failed: 0 };
    this.processingDueTasks = true;
    try {
      await this.prisma.notificationTask.updateMany({
        where: {
          status: NotificationTaskStatus.SENDING,
          updatedAt: { lte: new Date(now.getTime() - AdminNotificationsService.staleSendingTaskMs) }
        },
        data: { status: NotificationTaskStatus.PENDING }
      });
      const tasks = await this.prisma.notificationTask.findMany({
        where: {
          status: NotificationTaskStatus.PENDING,
          OR: [
            { scheduledAt: null },
            { scheduledAt: { lte: now } }
          ]
        },
        orderBy: { scheduledAt: "asc" },
        take: 20,
        select: { id: true }
      });
      let processed = 0;
      let failed = 0;
      for (const task of tasks) {
        try {
          await this.sendNow(task.id);
          processed += 1;
        } catch (error) {
          failed += 1;
          console.error(JSON.stringify({
            event: "NOTIFICATION_TASK_SEND_FAILED",
            taskId: task.id,
            message: error instanceof Error ? error.message : "unknown error"
          }));
        }
      }
      return { found: tasks.length, processed, failed };
    } finally {
      this.processingDueTasks = false;
    }
  }

  async sendNow(id: string, admin?: CurrentAdmin) {
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

    const claimed = await this.prisma.notificationTask.updateMany({
      where: {
        id,
        status: {
          in: [
            NotificationTaskStatus.DRAFT,
            NotificationTaskStatus.PENDING,
            NotificationTaskStatus.PARTIAL_FAILED,
            NotificationTaskStatus.FAILED,
            NotificationTaskStatus.SKIPPED
          ]
        }
      },
      data: { status: NotificationTaskStatus.SENDING }
    });
    if (claimed.count !== 1) throw new BadRequestException("当前任务已被其他请求处理，请刷新状态");

    let results: NotificationSendResult[];
    try {
      const resolvedRecipients = await this.resolveRecipients(task.payloadJson, task.channel);
      const recipients = dedupeRecipients(
        resolvedRecipients.length ? resolvedRecipients : [{ userId: null, recipient: null }]
      );
      const successfulLogs = await this.prisma.notificationLog.findMany({
        where: {
          taskId: task.id,
          status: NotificationLogStatus.SUCCESS
        },
        select: { userId: true, recipient: true }
      });
      const successfulRecipientKeys = new Set(successfulLogs.map(recipientKey));
      const runtime = await this.resolveChannelRuntime(task.channel, task.template.templateKey, task.template.contentJson, task.template.code);
      results = recipients
        .filter((recipient) => successfulRecipientKeys.has(recipientKey(recipient)))
        .map((recipient) => ({ ...recipient, status: NotificationLogStatus.SUCCESS }));

      for (const recipient of recipients) {
        if (successfulRecipientKeys.has(recipientKey(recipient))) continue;
        const result = await this.sendOne(task, recipient, runtime);
        await this.prisma.notificationLog.create({
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
            sentAt: result.status === NotificationLogStatus.SUCCESS ? new Date() : undefined
          }
        });
        results.push(result);
      }
    } catch (error) {
      await this.prisma.notificationTask.updateMany({
        where: { id, status: NotificationTaskStatus.SENDING },
        data: { status: NotificationTaskStatus.FAILED }
      });
      throw error;
    }

    const sentAt = new Date();
    const successCount = results.filter((item) => item.status === NotificationLogStatus.SUCCESS).length;
    const failedCount = results.filter((item) => item.status === NotificationLogStatus.FAILED).length;
    const skippedCount = results.filter((item) => item.status === NotificationLogStatus.SKIPPED).length;
    const status = taskStatusFromResultCounts(results.length, successCount, failedCount, skippedCount);
    const retryPolicy = await this.getRetryPolicy(task.channel);
    const retryScheduledAt = failedCount > 0
      ? await this.getRetrySchedule(task.id, results, retryPolicy, sentAt)
      : null;
    const persistedStatus = retryScheduledAt ? NotificationTaskStatus.PENDING : status;

    const updated = await this.prisma.notificationTask.update({
      where: { id },
      data: {
        status: persistedStatus,
        scheduledAt: retryScheduledAt ?? (persistedStatus === NotificationTaskStatus.PENDING ? task.scheduledAt : null),
        sentAt: retryScheduledAt ? null : sentAt
      },
      include: { template: true, _count: { select: { logs: true } } }
    });
    await this.writeAudit(admin ?? null, AuditAction.SYSTEM, "NotificationTask", task.id, "Send notification task now", {
      successCount,
      failedCount,
      skippedCount,
      retryScheduledAt: retryScheduledAt?.toISOString() ?? null
    });
    return ok({ task: await this.formatTaskWithRuntime(updated), result: { total: results.length, successCount, failedCount, skippedCount } });
  }

  private async getRetryPolicy(channel: NotificationChannelType): Promise<{ maxAttempts: number; intervalSeconds: number }> {
    const config = await this.getStoredChannelConfig(channel);
    return {
      maxAttempts: Math.max(0, config?.retryMaxAttempts ?? 0),
      intervalSeconds: Math.max(0, config?.retryIntervalSeconds ?? 60)
    };
  }

  private async getRetrySchedule(
    taskId: string,
    results: NotificationSendResult[],
    policy: { maxAttempts: number; intervalSeconds: number },
    now: Date
  ): Promise<Date | null> {
    if (policy.maxAttempts === 0) return null;
    const currentFailures = results.filter((item) => item.status === NotificationLogStatus.FAILED);
    if (currentFailures.length === 0) return null;
    const failedLogs = await this.prisma.notificationLog.findMany({
      where: { taskId, status: NotificationLogStatus.FAILED },
      select: { userId: true, recipient: true }
    });
    const attemptsByRecipient = new Map<string, number>();
    for (const log of failedLogs) {
      const key = recipientKey(log);
      attemptsByRecipient.set(key, (attemptsByRecipient.get(key) ?? 0) + 1);
    }
    const canRetryAll = currentFailures.every((item) => (attemptsByRecipient.get(recipientKey(item)) ?? 0) <= policy.maxAttempts);
    return canRetryAll ? new Date(now.getTime() + policy.intervalSeconds * 1000) : null;
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

  getChannelRuntime(
    channel: NotificationChannelType,
    templateKey?: string | null,
    templateContent?: Prisma.JsonValue,
    templateCode?: string | null
  ) {
    return this.resolveChannelRuntime(channel, templateKey, templateContent, templateCode);
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

  private async resolveChannelRuntime(
    channel: NotificationChannelType,
    templateKeyOverride?: string | null,
    templateContent?: Prisma.JsonValue,
    templateCode?: string | null
  ): Promise<NotificationRuntime> {
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
    const templateKey = templateKeyOverride
      || readWechatTemplateId(templateCode)
      || config?.templateKey
      || (channel === NotificationChannelType.WECHAT_SUBSCRIBE ? process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID || "" : "");
    const apiKeyConfigured = Boolean(
      decryptSecret(config?.apiKeyEnc)
      || process.env.SMS_API_KEY
      || (process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)
    );
    if (!enabled) {
      return { centerEnabled: true, enabled: false, providerSource, provider, canSend: false, unavailableReason: "通道未启用", statusText: "通道未启用，任务会记录 SKIPPED", templateKey };
    }
    if (channel === NotificationChannelType.SMS && !provider) {
      return { centerEnabled: true, enabled, providerSource, provider, canSend: false, unavailableReason: "短信供应商未配置", statusText: "短信供应商未配置，任务会记录 SKIPPED" };
    }
    if (channel === NotificationChannelType.WECHAT_SUBSCRIBE && !templateKey) {
      return { centerEnabled: true, enabled, providerSource, provider, canSend: false, unavailableReason: "微信订阅模板 ID 未配置", statusText: "微信订阅模板 ID 未配置，任务会记录 SKIPPED" };
    }
    if (
      channel === NotificationChannelType.WECHAT_SUBSCRIBE
      && typeof templateContent !== "undefined"
      && Object.keys(buildWechatTemplateData({}, templateContent, {})).length === 0
    ) {
      return {
        centerEnabled: true,
        enabled,
        providerSource,
        provider,
        templateKey,
        canSend: false,
        unavailableReason: "微信订阅模板字段映射未配置",
        statusText: "请在通知模板中配置 thing/time 等微信字段映射"
      };
    }
    if (channel === NotificationChannelType.WECHAT_SUBSCRIBE && !this.wechatSubscribeClient?.isConfigured()) {
      return {
        centerEnabled: true,
        enabled,
        providerSource,
        provider,
        templateKey,
        apiKeyConfigured: false,
        canSend: false,
        unavailableReason: "微信小程序 AppID 或 AppSecret 未配置",
        statusText: "缺少微信小程序凭证，任务会记录 SKIPPED"
      };
    }
    if (channel === NotificationChannelType.WECHAT_SUBSCRIBE) {
      return {
        centerEnabled: true,
        enabled,
        providerSource,
        provider,
        templateKey,
        apiKeyConfigured: true,
        canSend: true,
        statusText: "微信订阅消息发送适配器已就绪"
      };
    }
    return {
      centerEnabled: true,
      enabled,
      providerSource,
      provider,
      templateKey,
      apiKeyConfigured,
      canSend: false,
      unavailableReason: "短信真实发送适配器仍未接入，任务会记录 SKIPPED",
      statusText: "配置已保存；短信真实发送适配器未接入时不会伪造成功"
    };
  }

  private async formatTaskWithRuntime(item: Parameters<typeof formatTask>[0]) {
    return {
      ...formatTask(item),
      providerStatus: await this.resolveChannelRuntime(
        item.channel,
        item.template?.templateKey,
        item.template?.contentJson,
        item.template?.code
      )
    };
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
    task: {
      id: string;
      channel: NotificationChannelType;
      template: { code: string; templateKey: string | null; contentJson: Prisma.JsonValue };
      payloadJson: Prisma.JsonValue | null;
    },
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
      if (!this.wechatSubscribeClient) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_ADAPTER_UNAVAILABLE", errorMessage: "微信订阅消息发送适配器未加载" };
      }
      const variables = isRecord(payload.variables) ? payload.variables : {};
      const data = buildWechatTemplateData(payload, task.template.contentJson, variables);
      if (Object.keys(data).length === 0) {
        return { ...recipient, status: NotificationLogStatus.SKIPPED, errorCode: "WECHAT_TEMPLATE_DATA_MISSING", errorMessage: "通知模板未配置微信 data 字段映射" };
      }
      const page = readPagePath(payload, task.template.contentJson);
      try {
        const result = await this.wechatSubscribeClient.send({
          openid: recipient.recipient,
          templateId: templateKey,
          page,
          data
        });
        if (!result.ok) {
          return {
            ...recipient,
            status: NotificationLogStatus.FAILED,
            errorCode: `WECHAT_${result.errcode}`,
            errorMessage: result.errmsg
          };
        }
        if (process.env.WECHAT_SUBSCRIBE_KEEP_ENABLED !== "true") {
          await this.prisma.notificationSubscription.update({ where: { id: subscription.id }, data: { enabled: false } });
        }
        return {
          ...recipient,
          status: NotificationLogStatus.SUCCESS,
          providerMessageId: result.messageId
        };
      } catch (error) {
        return {
          ...recipient,
          status: NotificationLogStatus.FAILED,
          errorCode: "WECHAT_REQUEST_FAILED",
          errorMessage: error instanceof Error ? error.message : "微信订阅消息请求失败"
        };
      }
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

  private writeAudit(admin: CurrentAdmin | null, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: {
        adminUserId: admin?.id,
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

function recipientKey(recipient: { userId: string | null; recipient: string | null }): string {
  if (recipient.userId) return `user:${recipient.userId}`;
  if (recipient.recipient) return `recipient:${recipient.recipient}`;
  return "none";
}

function dedupeRecipients(
  recipients: Array<{ userId: string | null; recipient: string | null }>
): Array<{ userId: string | null; recipient: string | null }> {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipientKey(recipient);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

export interface BusinessNotificationInput {
  userId: string | null | undefined;
  sourceKey: string;
  type: string;
  title: string;
  summary?: string | null;
  route?: string | null;
  payloadJson?: Prisma.InputJsonObject;
  templateCode?: string;
  taskName?: string;
  variables?: Prisma.InputJsonObject;
}

export interface RefundStatusNotificationInput {
  userId: string | null | undefined;
  refundId: string;
  refundNo: string;
  orderNo: string;
  sourceType: "REGISTRATION" | "MALL";
  amountCent: number;
  status: string;
  reason?: string | null;
}

function buildWechatTemplateData(
  payload: Record<string, unknown>,
  templateContent: Prisma.JsonValue,
  variables: Record<string, unknown>
): Record<string, { value: string }> {
  const template = isRecord(templateContent) ? templateContent : {};
  const source = isRecord(payload.wechatData)
    ? payload.wechatData
    : isRecord(template.wechatData)
      ? template.wechatData
      : isRecord(template.data)
        ? template.data
        : {};
  const result: Record<string, { value: string }> = {};
  for (const [key, raw] of Object.entries(source)) {
    const value = isRecord(raw) ? raw.value : raw;
    if (typeof value === "string") result[key] = { value: normalizeWechatTemplateValue(key, renderText(value, variables)) };
    else if (typeof value === "number" || typeof value === "boolean") result[key] = { value: String(value) };
  }
  return result;
}

export function normalizeWechatTemplateValue(key: string, value: string): string {
  const clean = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const limit = key.startsWith("phrase")
    ? 5
    : key.startsWith("name")
      ? 10
      : key.startsWith("thing")
        ? 20
        : key.startsWith("character_string")
          ? 32
          : null;
  return limit ? Array.from(clean).slice(0, limit).join("") : clean;
}

function readPagePath(payload: Record<string, unknown>, templateContent: Prisma.JsonValue): string | null {
  if (typeof payload.page === "string" && payload.page.trim()) return payload.page.trim();
  if (isRecord(templateContent) && typeof templateContent.page === "string" && templateContent.page.trim()) {
    return templateContent.page.trim();
  }
  return null;
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
          { name: "SMS_PROVIDER", location: ".env.production", restartRequired: true },
          { name: "SMS_API_KEY / SMS_API_SECRET", location: ".env.production 或后台加密配置", restartRequired: true },
          { name: enabledEnvKey, location: ".env.production 或后台开关", restartRequired: true }
        ]
      : [
          { name: "WECHAT_APP_ID / WECHAT_APP_SECRET", location: ".env.production", restartRequired: true },
          { name: "每个通知模板的模板 ID", location: "后台通知模板（推荐）或对应 WECHAT_SUBSCRIBE_TEMPLATE_* 环境变量", restartRequired: false },
          { name: "WECHAT_MINIPROGRAM_STATE", location: ".env.production（正式环境填 formal）", restartRequired: true },
          { name: enabledEnvKey, location: ".env.production 或后台开关", restartRequired: true }
        ];
  return items;
}

function readWechatTemplateId(templateCode: string | null | undefined): string {
  const envName = ({
    REGISTRATION_SUCCESS: "WECHAT_SUBSCRIBE_TEMPLATE_REGISTRATION_SUCCESS",
    PAYMENT_SUCCESS: "WECHAT_SUBSCRIBE_TEMPLATE_PAYMENT_SUCCESS",
    GUEST_SCHEDULE_UPDATED: "WECHAT_SUBSCRIBE_TEMPLATE_GUEST_SCHEDULE_UPDATED",
    REFUND_STATUS_UPDATED: "WECHAT_SUBSCRIBE_TEMPLATE_REFUND_STATUS_UPDATED"
  } as Record<string, string>)[templateCode?.trim().toUpperCase() ?? ""];
  return envName ? process.env[envName]?.trim() ?? "" : "";
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
  template?: {
    id: string;
    code: string;
    name: string;
    title: string | null;
    templateKey?: string | null;
    contentJson?: Prisma.JsonValue;
  };
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

function buildTemplateContent(body: Record<string, unknown>): Prisma.InputJsonObject {
  const base = isRecord(body.contentJson) ? compactJsonObject(body.contentJson) : {};
  const bodyText = readOptionalString(body.bodyText) ?? readOptionalString(body.body) ?? readOptionalString(body.content);
  const purpose = readOptionalString(body.purpose);
  const variables = stringArray(body.variables);
  const content = compactJsonObject({
    ...base,
    ...(purpose ? { purpose } : {}),
    ...(bodyText ? { body: bodyText, content: bodyText } : {}),
    ...(variables.length ? { variables } : {})
  });
  if (!Object.keys(content).length) throw new BadRequestException("通知模板正文不能为空");
  return content as Prisma.InputJsonObject;
}

function buildTaskPayload(body: Record<string, unknown>): Prisma.InputJsonObject {
  const base = isRecord(body.payloadJson) ? compactJsonObject(body.payloadJson) : {};
  const recipientType = readOptionalString(body.recipientType) ?? readOptionalString(body.targetType) ?? "MANUAL";
  const recipients = [
    ...stringArray(body.recipients),
    ...splitLines(readOptionalString(body.recipientText) ?? readOptionalString(body.phoneText) ?? readOptionalString(body.manualList))
  ];
  const userIds = stringArray(body.userIds);
  const variables = isRecord(body.variables) ? compactJsonObject(body.variables) : {};
  const payload = compactJsonObject({
    ...base,
    recipientType,
    targetType: recipientType,
    conferenceId: readOptionalString(body.conferenceId),
    range: readOptionalString(body.range)
  });
  if (recipients.length) payload.recipients = recipients;
  if (userIds.length) payload.userIds = userIds;
  if (Object.keys(variables).length) payload.variables = variables;
  return payload as Prisma.InputJsonObject;
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

function normalizeMiniProgramPage(route: string): string {
  return route.replace(/^\//, "");
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === "P2002";
}

function logBusinessNotificationError(error: unknown, input: BusinessNotificationInput, taskId: string | null) {
  console.error(JSON.stringify({
    event: "BUSINESS_NOTIFICATION_ERROR",
    type: input.type,
    sourceKey: input.sourceKey,
    taskId,
    error: error instanceof Error ? error.message : "unknown error"
  }));
}

function refundStatusLabel(status: string): string {
  return ({
    REQUESTED: "等待审核",
    APPROVED: "审核通过",
    PROCESSING: "退款处理中",
    SUCCESS: "退款成功",
    FAILED: "退款失败",
    REJECTED: "审核未通过"
  } as Record<string, string>)[status] || status;
}

function refundNotificationTitle(status: string): string {
  return ({
    REQUESTED: "退款申请已提交",
    APPROVED: "退款申请已审核",
    PROCESSING: "退款正在处理",
    SUCCESS: "退款已完成",
    FAILED: "退款处理失败",
    REJECTED: "退款申请未通过"
  } as Record<string, string>)[status] || "退款状态已更新";
}

function formatCent(value: number): string {
  return (value / 100).toFixed(2);
}

export function formatWechatTemplateDateTime(value: Date): string {
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
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

function splitLines(value: string | undefined): string[] {
  return value ? value.split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean) : [];
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
  return value.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, (_, rawKey: string) => String(variables[rawKey.trim()] ?? ""));
}
