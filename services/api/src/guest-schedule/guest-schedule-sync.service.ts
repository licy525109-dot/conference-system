import { createHash, randomBytes } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit
} from "@nestjs/common";
import {
  AuditAction,
  GuestScheduleSource,
  GuestScheduleSyncStatus,
  GuestScheduleType,
  Prisma,
  RegistrationStatus
} from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import {
  WecomClientAdapter,
  WecomSmartSheetRecord
} from "../wecom/adapters/wecom-client.adapter";
import {
  WecomSmartBotAdapter,
  WecomSmartBotCredentials
} from "../wecom/adapters/wecom-smart-bot.adapter";
import { WecomTokenService } from "../wecom/services/wecom-token.service";
import { decryptSecret, encryptSecret, maskSecret } from "../wecom/wecom.crypto";
import {
  AssignmentFieldMapping,
  DEFAULT_ASSIGNMENT_FIELD_MAPPING,
  DEFAULT_GUEST_FIELD_MAPPING,
  GuestFieldMapping,
  GUEST_SCHEDULE_TYPE_LABELS,
  mergeFieldMapping
} from "./guest-schedule.constants";
import { GuestScheduleDraft, hashDraft } from "./guest-schedule.service";
import {
  configuredWideFields,
  createDefaultWideSheetConfig,
  ExistingWideSheetConfig,
  normalizeWideSheetConfig,
  parseSmartSheetLink,
  readSmartSheetMode,
  SMART_SHEET_MODE,
  SmartSheetMode,
  WideSheetScheduleRule
} from "./smart-sheet-wide-config";
import {
  buildSmartSheetWebhookValues,
  formatSmartSheetWebhookSample,
  normalizeSmartSheetWebhookSchema,
  parseSmartSheetAutomationPayload,
  parseSmartSheetWebhookSample,
  readSmartSheetTransport,
  SMART_SHEET_TRANSPORT,
  SmartSheetTransport,
  smartSheetWebhookFields,
  SmartSheetWebhookSchema,
  validateSmartSheetWebhookUrl
} from "./smart-sheet-webhook";

@Injectable()
export class GuestScheduleSyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WecomClientAdapter,
    private readonly smartBot: WecomSmartBotAdapter,
    private readonly tokens: WecomTokenService
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.GUEST_SCHEDULE_SYNC_ENABLED === "false") return;
    this.timer = setInterval(() => void this.runDueConnections(), 15_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async getConfig(conferenceId: string) {
    await this.ensureConference(conferenceId);
    const [connection, integrations] = await Promise.all([
      this.prisma.wecomSmartSheetConnection.findUnique({
        where: { conferenceId },
        include: { integration: { select: { id: true, name: true, enabled: true, verified: true, corpId: true, agentId: true, appSecretEnc: true } } }
      }),
      this.prisma.wecomIntegration.findMany({
        orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
        select: { id: true, name: true, enabled: true, verified: true, corpId: true, agentId: true, appSecretEnc: true }
      })
    ]);
    return ok({
      connection: connection ? formatConnection(connection) : null,
      integrations: integrations.map(formatIntegrationOption),
      defaults: {
        transport: SMART_SHEET_TRANSPORT.SMART_BOT_API,
        guestFieldMapping: DEFAULT_GUEST_FIELD_MAPPING,
        assignmentFieldMapping: DEFAULT_ASSIGNMENT_FIELD_MAPPING,
        wideSheetConfig: createDefaultWideSheetConfig(),
        syncIntervalSeconds: 60
      },
      requiredAssignmentFields: [
        DEFAULT_ASSIGNMENT_FIELD_MAPPING.attendeeId,
        DEFAULT_ASSIGNMENT_FIELD_MAPPING.type,
        DEFAULT_ASSIGNMENT_FIELD_MAPPING.activityName,
        DEFAULT_ASSIGNMENT_FIELD_MAPPING.startsAt
      ]
    });
  }

  async discover(conferenceId: string, input: unknown) {
    await this.ensureConference(conferenceId);
    const body = readObject(input);
    const existing = await this.prisma.wecomSmartSheetConnection.findUnique({ where: { conferenceId } });
    const transport = readRequestedTransport(
      body.transport,
      existing?.transport ?? (readOptionalString(body.integrationId) ? SMART_SHEET_TRANSPORT.API : SMART_SHEET_TRANSPORT.SMART_BOT_API)
    );
    if (transport === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION) {
      throw new BadRequestException("Webhook 模式请通过示例 JSON 识别字段");
    }
    const rawUrl = readOptionalString(body.docUrl);
    if (!rawUrl) throw new BadRequestException("请粘贴企微智能表链接");
    let link: ReturnType<typeof parseSmartSheetLink>;
    try {
      link = parseSmartSheetLink(rawUrl);
    } catch (error) {
      throw new BadRequestException(errorMessage(error, "无法识别企微智能表链接"));
    }
    let sheets: Awaited<ReturnType<WecomClientAdapter["getSmartSheetSheets"]>>;
    let readFields: (sheetId: string) => Promise<Array<Record<string, unknown>>>;
    if (transport === SMART_SHEET_TRANSPORT.SMART_BOT_API) {
      const credentials = resolveSubmittedSmartBotCredentials(body, existing);
      sheets = await this.smartBot.getSmartSheetSheets(credentials, link.canonicalUrl);
      readFields = (sheetId) => this.smartBot.getSmartSheetFields(credentials, link.canonicalUrl, sheetId);
    } else {
      const integrationId = readOptionalString(body.integrationId) ?? existing?.integrationId ?? await this.getDefaultIntegrationId();
      const integration = await this.prisma.wecomIntegration.findUnique({ where: { id: integrationId } });
      if (!integration) throw new BadRequestException("请选择有效的企业微信自建应用配置");
      const { accessToken } = await this.tokens.getAccessToken(integration, "self_built_app", true);
      sheets = await this.client.getSmartSheetSheets(accessToken, link.docId);
      readFields = (sheetId) => this.client.getSmartSheetFields(accessToken, link.docId, sheetId);
    }
    const dataSheets = sheets.filter((item) => String(item.type || "").toLowerCase() !== "dashboard");
    if (!dataSheets.length) throw new BadRequestException("该文档中没有可读取的数据子表");
    const requestedSheetId = readOptionalString(body.sheetId) ?? link.sheetId;
    const selectedSheet = requestedSheetId
      ? dataSheets.find((item) => item.sheet_id === requestedSheetId)
      : dataSheets[0];
    if (!selectedSheet) throw new BadRequestException("链接中的子表不存在，请从识别结果中重新选择");
    const fields = await readFields(selectedSheet.sheet_id);
    const fieldOptions = formatFieldOptions(fields);
    return ok({
      docId: link.docId,
      docUrl: canonicalSmartSheetUrl(link.canonicalUrl, selectedSheet.sheet_id),
      viewId: link.viewId,
      selectedSheetId: selectedSheet.sheet_id,
      transport,
      sheets: dataSheets.map((item) => ({
        id: item.sheet_id,
        title: item.title,
        type: item.type || "smartsheet",
        fieldCount: Number(item.field_count || 0),
        recordCount: Number(item.record_count || 0)
      })),
      fields: fieldOptions,
      suggestedWideSheetConfig: createDefaultWideSheetConfig(fieldOptions.map((item) => item.title))
    });
  }

  async inspectWebhookSample(conferenceId: string, input: unknown) {
    await this.ensureConference(conferenceId);
    const body = readObject(input);
    const schema = parseSmartSheetWebhookSample(body.webhookSample);
    const fields = smartSheetWebhookFields(schema);
    return ok({
      fields,
      webhookSample: formatSmartSheetWebhookSample(schema),
      suggestedWideSheetConfig: createDefaultWideSheetConfig(fields.map((item) => item.title))
    });
  }

  async saveConfig(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    await this.ensureConference(conferenceId);
    const body = readObject(input);
    const existing = await this.prisma.wecomSmartSheetConnection.findUnique({ where: { conferenceId } });
    const transport = readRequestedTransport(body.transport, existing?.transport);
    const requestedMode = readRequestedMode(body.mode, existing?.assignmentFieldMappingJson);
    const mode = transport === SMART_SHEET_TRANSPORT.API
      ? requestedMode
      : SMART_SHEET_MODE.EXISTING_WIDE_SHEET;
    let integrationId: string | null = null;
    let integration: Awaited<ReturnType<typeof this.prisma.wecomIntegration.findUnique>> = null;
    if (transport === SMART_SHEET_TRANSPORT.API) {
      integrationId = readOptionalString(body.integrationId) ?? existing?.integrationId ?? (await this.getDefaultIntegrationId());
      integration = await this.prisma.wecomIntegration.findUnique({ where: { id: integrationId } });
      if (!integration) throw new BadRequestException("请选择有效的企业微信自建应用配置");
    }
    let smartBotId = existing?.smartBotId ?? null;
    let smartBotSecretEnc = existing?.smartBotSecretEnc ?? null;
    if (transport === SMART_SHEET_TRANSPORT.SMART_BOT_API) {
      const submittedBotId = readOptionalString(body.smartBotId);
      const submittedSecret = readOptionalString(body.smartBotSecret);
      if (submittedBotId && submittedBotId !== existing?.smartBotId && !submittedSecret) {
        throw new BadRequestException("更换 Bot ID 时请同时填写新的 Secret");
      }
      smartBotId = submittedBotId ?? existing?.smartBotId ?? null;
      if (submittedSecret) smartBotSecretEnc = encryptSecret(submittedSecret);
      if (!smartBotId || !decryptSecret(smartBotSecretEnc)) {
        throw new BadRequestException("请填写智能机器人 Bot ID 和 Secret");
      }
    }

    const rawDocUrl = readOptionalString(body.docUrl);
    let parsedLink: ReturnType<typeof parseSmartSheetLink> | null = null;
    if (rawDocUrl && mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET) {
      try {
        parsedLink = parseSmartSheetLink(rawDocUrl);
      } catch (error) {
        throw new BadRequestException(errorMessage(error, "无法识别企微智能表链接"));
      }
    }
    const docId = readOptionalString(body.docId) ?? parsedLink?.docId ?? existing?.docId;
    const existingWideConfig = mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? normalizeWideSheetConfig(existing?.assignmentFieldMappingJson)
      : null;
    const wideSheetConfig = mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? normalizeWideSheetConfig(body.wideSheetConfig ?? existingWideConfig)
      : null;
    const wideSheetId = readOptionalString(body.sheetId)
      ?? readOptionalString(body.guestSheetId)
      ?? parsedLink?.sheetId
      ?? existing?.guestSheetId;
    const guestSheetId = mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? wideSheetId
      : readOptionalString(body.guestSheetId) ?? existing?.guestSheetId;
    const assignmentSheetId = mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? wideSheetId
      : readOptionalString(body.assignmentSheetId) ?? existing?.assignmentSheetId;
    if (transport === SMART_SHEET_TRANSPORT.API && (!docId || !guestSheetId || !assignmentSheetId)) {
      throw new BadRequestException(mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
        ? "请先识别链接并选择现有数据子表"
        : "文档 ID、报名嘉宾子表 ID 和嘉宾事项子表 ID 均不能为空");
    }
    if (
      transport === SMART_SHEET_TRANSPORT.SMART_BOT_API
      && (!(parsedLink?.canonicalUrl ?? existing?.docUrl) || !guestSheetId || !assignmentSheetId)
    ) {
      throw new BadRequestException("请先使用智能机器人识别完整链接并选择现有数据子表");
    }
    const enabled = readOptionalBoolean(body.enabled) ?? existing?.enabled ?? false;
    if (enabled && transport === SMART_SHEET_TRANSPORT.API && (!integration?.enabled || !integration.corpId || !integration.appSecretEnc)) {
      throw new BadRequestException("启用同步前，请先完成并启用企业微信自建应用配置");
    }
    if (enabled && transport === SMART_SHEET_TRANSPORT.SMART_BOT_API && (!smartBotId || !decryptSecret(smartBotSecretEnc))) {
      throw new BadRequestException("启用同步前，请先完成智能机器人 Bot ID 和 Secret 配置");
    }
    if (enabled && wideSheetConfig) {
      const issues = validateWideConfigStructure(wideSheetConfig);
      if (issues.length) throw new BadRequestException(`启用同步前请完成字段映射：${issues.join("；")}`);
    }
    const syncIntervalSeconds = clampInt(
      body.syncIntervalSeconds,
      existing?.syncIntervalSeconds ?? 60,
      30,
      3600
    );
    const guestFieldMapping = mergeFieldMapping(
      DEFAULT_GUEST_FIELD_MAPPING,
      body.guestFieldMapping ?? existing?.guestFieldMappingJson
    );
    const assignmentFieldMapping = wideSheetConfig ?? mergeFieldMapping(
      DEFAULT_ASSIGNMENT_FIELD_MAPPING,
      body.assignmentFieldMapping ?? existing?.assignmentFieldMappingJson
    );
    const storedDocUrl = mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? parsedLink?.canonicalUrl ?? existing?.docUrl ?? null
      : typeof body.docUrl !== "undefined"
        ? readNullableString(body.docUrl, "docUrl")
        : existing?.docUrl ?? null;

    let webhookSchema: SmartSheetWebhookSchema | null = null;
    let webhookUrlEnc = existing?.webhookUrlEnc ?? null;
    let automationTokenEnc = existing?.automationTokenEnc ?? null;
    let automationTokenHash = existing?.automationTokenHash ?? null;
    if (transport === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION) {
      const submittedWebhookUrl = readOptionalString(body.webhookUrl);
      if (submittedWebhookUrl) webhookUrlEnc = encryptSecret(validateSmartSheetWebhookUrl(submittedWebhookUrl));
      if (!decryptSecret(webhookUrlEnc)) throw new BadRequestException("请填写智能表“接收外部数据”生成的 Webhook URL");
      webhookSchema = typeof body.webhookSample !== "undefined" && body.webhookSample !== null && body.webhookSample !== ""
        ? parseSmartSheetWebhookSample(body.webhookSample)
        : existing?.webhookSchemaJson
          ? normalizeSmartSheetWebhookSchema(existing.webhookSchemaJson)
          : null;
      if (!webhookSchema) throw new BadRequestException("请粘贴智能表 Webhook 页面提供的示例 JSON");
      const automationToken = decryptSecret(automationTokenEnc) || randomBytes(32).toString("base64url");
      automationTokenEnc = encryptSecret(automationToken);
      automationTokenHash = hashToken(automationToken);
    }

    const connection = await this.prisma.wecomSmartSheetConnection.upsert({
      where: { conferenceId },
      create: {
        conferenceId,
        integrationId,
        transport,
        docId: docId ?? null,
        docUrl: storedDocUrl,
        guestSheetId: guestSheetId ?? null,
        assignmentSheetId: assignmentSheetId ?? null,
        webhookUrlEnc,
        automationTokenEnc,
        automationTokenHash,
        smartBotId,
        smartBotSecretEnc,
        ...(webhookSchema ? { webhookSchemaJson: webhookSchema as unknown as Prisma.InputJsonValue } : {}),
        guestFieldMappingJson: guestFieldMapping,
        assignmentFieldMappingJson: assignmentFieldMapping as unknown as Prisma.InputJsonValue,
        enabled,
        syncIntervalSeconds
      },
      update: {
        integrationId,
        transport,
        docId: docId ?? null,
        docUrl: storedDocUrl,
        guestSheetId: guestSheetId ?? null,
        assignmentSheetId: assignmentSheetId ?? null,
        ...(transport === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION ? {
          webhookUrlEnc,
          webhookSchemaJson: webhookSchema as unknown as Prisma.InputJsonValue,
          automationTokenEnc,
          automationTokenHash
        } : {}),
        ...(transport === SMART_SHEET_TRANSPORT.SMART_BOT_API ? {
          smartBotId,
          smartBotSecretEnc
        } : {}),
        guestFieldMappingJson: guestFieldMapping,
        assignmentFieldMappingJson: assignmentFieldMapping as unknown as Prisma.InputJsonValue,
        enabled,
        syncIntervalSeconds,
        ...(enabled ? {} : { syncLockedAt: null })
      },
      include: { integration: { select: { id: true, name: true, enabled: true, verified: true, corpId: true, agentId: true, appSecretEnc: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, connection.id, "Update WeCom SmartSheet guest schedule connection", {
      conferenceId,
      enabled,
      syncIntervalSeconds,
      docId,
      guestSheetId,
      assignmentSheetId,
      mode,
      transport,
      webhookConfigured: Boolean(decryptSecret(webhookUrlEnc)),
      smartBotConfigured: Boolean(smartBotId && decryptSecret(smartBotSecretEnc))
    });
    return ok(formatConnection(connection));
  }

  async check(conferenceId: string) {
    const connection = await this.getConnection(conferenceId);
    if (readSmartSheetTransport(connection.transport) === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION) {
      const issues: string[] = [];
      const webhookUrl = decryptSecret(connection.webhookUrlEnc);
      if (!webhookUrl) issues.push("尚未配置接收外部数据 Webhook URL");
      else {
        try {
          validateSmartSheetWebhookUrl(webhookUrl);
        } catch (error) {
          issues.push(errorMessage(error, "Webhook URL 无效"));
        }
      }
      let schema: SmartSheetWebhookSchema | null = null;
      try {
        schema = connection.webhookSchemaJson
          ? normalizeSmartSheetWebhookSchema(connection.webhookSchemaJson)
          : null;
      } catch (error) {
        issues.push(errorMessage(error, "Webhook 示例 JSON 无效"));
      }
      if (!schema) issues.push("尚未识别 Webhook 示例字段");
      const wideConfig = normalizeWideSheetConfig(connection.assignmentFieldMappingJson);
      issues.push(...validateWideConfigStructure(wideConfig));
      const titles = new Set(schema ? smartSheetWebhookFields(schema).map((field) => field.title) : []);
      const missingFields = configuredWideFields(wideConfig).filter((title) => !titles.has(title));
      if (missingFields.length) issues.push(`示例 JSON 中找不到已映射字段：${missingFields.join("、")}`);
      const ready = issues.length === 0;
      return ok({
        ready,
        transport: SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION,
        mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
        message: ready ? "Webhook 写回与自动化回调配置检查通过" : "Webhook 配置尚未完成，请按提示调整",
        issues,
        warnings: [
          "检查连接只做本地格式与字段校验，不会向原表写入测试行",
          "Webhook 只能更新由同一个 Webhook 创建的行；原表人工历史行保持不变",
          "原表变更需另行配置自动化 HTTP 回调，回调只生成草稿，不会自动发布给嘉宾"
        ],
        sheet: { fieldCount: titles.size, missingFields },
        guestSheet: { fieldCount: titles.size, missingFields },
        assignmentSheet: { fieldCount: titles.size, missingRequiredFields: issues, missingRecommendedFields: missingFields }
      });
    }
    assertSheetConnection(connection);
    const session = await this.createSmartSheetSession(connection, true);
    if (readSmartSheetMode(connection.assignmentFieldMappingJson) === SMART_SHEET_MODE.EXISTING_WIDE_SHEET) {
      const fields = await session.getFields(connection.guestSheetId);
      const titles = fieldTitles(fields);
      const wideConfig = normalizeWideSheetConfig(connection.assignmentFieldMappingJson);
      const issues = validateWideConfigStructure(wideConfig);
      const missingFields = configuredWideFields(wideConfig).filter((title) => !titles.has(title));
      if (missingFields.length) issues.push(`找不到已映射字段：${missingFields.join("、")}`);
      const warnings = wideConfig.writeRegistrationFields
        ? ["新报名仅会写入已映射列，不会修改表内其他邀约、分组或房间字段"]
        : ["当前为只读保护模式：读取现有嘉宾安排，但不会新增或修改智能表记录"];
      const ready = issues.length === 0;
      return ok({
        ready,
        mode: SMART_SHEET_MODE.EXISTING_WIDE_SHEET,
        message: ready ? "现有智能表连接和字段映射检查通过" : "字段映射尚未完成，请按提示调整",
        issues,
        warnings,
        sheet: { fieldCount: titles.size, missingFields },
        guestSheet: { fieldCount: titles.size, missingFields: [] },
        assignmentSheet: { fieldCount: titles.size, missingRequiredFields: issues, missingRecommendedFields: missingFields }
      });
    }
    const [guestFields, assignmentFields] = await Promise.all([
      session.getFields(connection.guestSheetId),
      session.getFields(connection.assignmentSheetId)
    ]);
    const guestTitles = fieldTitles(guestFields);
    const assignmentTitles = fieldTitles(assignmentFields);
    const guestMapping = mergeFieldMapping(DEFAULT_GUEST_FIELD_MAPPING, connection.guestFieldMappingJson);
    const assignmentMapping = mergeFieldMapping(DEFAULT_ASSIGNMENT_FIELD_MAPPING, connection.assignmentFieldMappingJson);
    const requiredAssignmentKeys: Array<keyof AssignmentFieldMapping> = ["attendeeId", "type", "activityName", "startsAt"];
    const missingGuestFields = Object.values(guestMapping).filter((title) => !guestTitles.has(title));
    const missingRequiredAssignmentFields = requiredAssignmentKeys
      .map((key) => assignmentMapping[key])
      .filter((title) => !assignmentTitles.has(title));
    const missingRecommendedAssignmentFields = Object.values(assignmentMapping).filter((title) => !assignmentTitles.has(title));
    const ready = missingGuestFields.length === 0 && missingRequiredAssignmentFields.length === 0;
    return ok({
      ready,
      message: ready ? "智能表连接和必填字段检查通过" : "智能表字段不完整，请按缺失清单补充列",
      guestSheet: { fieldCount: guestTitles.size, missingFields: missingGuestFields },
      assignmentSheet: {
        fieldCount: assignmentTitles.size,
        missingRequiredFields: missingRequiredAssignmentFields,
        missingRecommendedFields: missingRecommendedAssignmentFields
      }
    });
  }

  async listRuns(conferenceId: string, query: Record<string, unknown>) {
    const connection = await this.getConnection(conferenceId);
    const limit = clampInt(query.limit, 10, 1, 50);
    const items = await this.prisma.guestScheduleSyncRun.findMany({
      where: { connectionId: connection.id },
      orderBy: { startedAt: "desc" },
      take: limit
    });
    return ok({ items: items.map(formatRun) });
  }

  async syncNow(conferenceId: string) {
    const connection = await this.getConnection(conferenceId);
    if (!connection.enabled) throw new BadRequestException("请先启用智能表同步");
    const result = await this.syncConnection(connection.id, "MANUAL", true);
    return ok(result);
  }

  async receiveAutomation(token: string, input: unknown) {
    const normalizedToken = token.trim();
    if (normalizedToken.length < 32 || normalizedToken.length > 128) throw new NotFoundException("自动化回调地址无效");
    const connection = await this.prisma.wecomSmartSheetConnection.findUnique({
      where: { automationTokenHash: hashToken(normalizedToken) },
      include: { integration: true, conference: { select: { id: true, title: true } } }
    });
    if (
      !connection
      || readSmartSheetTransport(connection.transport) !== SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION
      || !connection.enabled
    ) {
      throw new NotFoundException("自动化回调地址无效或连接未启用");
    }
    if (!connection.webhookSchemaJson) throw new BadRequestException("连接尚未配置 Webhook 示例字段");
    const schema = normalizeSmartSheetWebhookSchema(connection.webhookSchemaJson);
    const records = parseSmartSheetAutomationPayload(input, schema);
    const lockCutoff = new Date(Date.now() - 10 * 60_000);
    const lock = await this.prisma.wecomSmartSheetConnection.updateMany({
      where: {
        id: connection.id,
        enabled: true,
        OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: lockCutoff } }]
      },
      data: { syncLockedAt: new Date() }
    });
    if (lock.count === 0) throw new ConflictException("同步任务正在运行，请稍后重试");

    const run = await this.prisma.guestScheduleSyncRun.create({
      data: { connectionId: connection.id, trigger: "AUTOMATION", status: GuestScheduleSyncStatus.RUNNING }
    });
    try {
      const assignment = await this.applyExistingWideSheetAssignments(connection, records);
      const finishedAt = new Date();
      const status = assignment.errorCount === 0
        ? GuestScheduleSyncStatus.SUCCESS
        : assignment.createdCount > 0 || assignment.updatedCount > 0 || assignment.skippedCount > 0
          ? GuestScheduleSyncStatus.PARTIAL_FAILED
          : GuestScheduleSyncStatus.FAILED;
      const errorText = assignment.errors.length ? assignment.errors.join("；").slice(0, 1000) : null;
      await this.prisma.$transaction([
        this.prisma.guestScheduleSyncRun.update({
          where: { id: run.id },
          data: {
            status,
            assignmentReadCount: assignment.readCount,
            assignmentCreatedCount: assignment.createdCount,
            assignmentUpdatedCount: assignment.updatedCount,
            skippedCount: assignment.skippedCount,
            errorCount: assignment.errorCount,
            errorMessage: errorText,
            detailsJson: { assignment },
            finishedAt
          }
        }),
        this.prisma.wecomSmartSheetConnection.update({
          where: { id: connection.id },
          data: {
            lastAssignmentPulledAt: finishedAt,
            lastAutomationReceivedAt: finishedAt,
            lastSyncAt: finishedAt,
            lastSyncStatus: status,
            lastError: errorText
          }
        })
      ]);
      return {
        errcode: 0,
        errmsg: assignment.errorCount ? "accepted_with_errors" : "ok",
        received_count: assignment.readCount,
        created_count: assignment.createdCount,
        updated_count: assignment.updatedCount,
        skipped_count: assignment.skippedCount,
        error_count: assignment.errorCount
      };
    } catch (error) {
      const message = errorMessage(error, "自动化回调处理失败");
      await Promise.all([
        this.prisma.guestScheduleSyncRun.update({
          where: { id: run.id },
          data: { status: GuestScheduleSyncStatus.FAILED, errorCount: 1, errorMessage: message, finishedAt: new Date() }
        }),
        this.prisma.wecomSmartSheetConnection.update({
          where: { id: connection.id },
          data: { lastSyncAt: new Date(), lastSyncStatus: GuestScheduleSyncStatus.FAILED, lastError: message }
        })
      ]);
      throw error;
    } finally {
      await this.prisma.wecomSmartSheetConnection.updateMany({
        where: { id: connection.id },
        data: { syncLockedAt: null }
      });
    }
  }

  private async runDueConnections(): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    try {
      const now = Date.now();
      const connections = await this.prisma.wecomSmartSheetConnection.findMany({
        where: { enabled: true },
        select: { id: true, lastSyncAt: true, syncIntervalSeconds: true }
      });
      for (const connection of connections) {
        const dueAt = (connection.lastSyncAt?.getTime() ?? 0) + connection.syncIntervalSeconds * 1000;
        if (dueAt > now) continue;
        void this.syncConnection(connection.id, "SCHEDULED", false).catch(() => undefined);
      }
    } finally {
      this.scanning = false;
    }
  }

  private async syncConnection(connectionId: string, trigger: string, throwWhenBusy: boolean) {
    const lockCutoff = new Date(Date.now() - 10 * 60_000);
    const lock = await this.prisma.wecomSmartSheetConnection.updateMany({
      where: {
        id: connectionId,
        enabled: true,
        OR: [{ syncLockedAt: null }, { syncLockedAt: { lt: lockCutoff } }]
      },
      data: { syncLockedAt: new Date() }
    });
    if (lock.count === 0) {
      if (throwWhenBusy) throw new ConflictException("同步任务正在运行，请稍后重试");
      return { status: "SKIPPED_BUSY" };
    }

    const run = await this.prisma.guestScheduleSyncRun.create({
      data: { connectionId, trigger, status: GuestScheduleSyncStatus.RUNNING }
    });
    const errors: string[] = [];
    let guestResult: GuestSyncResult = emptyGuestResult();
    let assignmentResult: AssignmentSyncResult = emptyAssignmentResult();
    try {
      const connection = await this.prisma.wecomSmartSheetConnection.findUnique({
        where: { id: connectionId },
        include: { integration: true, conference: { select: { id: true, title: true } } }
      });
      if (!connection) throw new NotFoundException("智能表连接不存在");
      if (readSmartSheetTransport(connection.transport) === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION) {
        try {
          guestResult = await this.pushWebhookGuestRows(connection);
        } catch (error) {
          errors.push(errorMessage(error, "报名嘉宾 Webhook 写入失败"));
        }
        assignmentResult = { ...emptyAssignmentResult(), completed: true };
      } else {
        assertSheetConnection(connection);
        const session = await this.createSmartSheetSession(connection);
        try {
          guestResult = await this.pushGuestRows(connection, session);
        } catch (error) {
          errors.push(errorMessage(error, "报名嘉宾写入失败"));
        }
        try {
          assignmentResult = await this.pullAssignmentRows(connection, session);
        } catch (error) {
          errors.push(errorMessage(error, "嘉宾事项读取失败"));
        }
      }

      const issueCount = errors.length + assignmentResult.errorCount;
      const status = issueCount === 0
        ? GuestScheduleSyncStatus.SUCCESS
        : guestResult.readCount > 0 || assignmentResult.readCount > 0
          ? GuestScheduleSyncStatus.PARTIAL_FAILED
          : GuestScheduleSyncStatus.FAILED;
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.guestScheduleSyncRun.update({
          where: { id: run.id },
          data: {
            status,
            guestReadCount: guestResult.readCount,
            guestCreatedCount: guestResult.createdCount,
            guestUpdatedCount: guestResult.updatedCount,
            assignmentReadCount: assignmentResult.readCount,
            assignmentCreatedCount: assignmentResult.createdCount,
            assignmentUpdatedCount: assignmentResult.updatedCount,
            skippedCount: guestResult.skippedCount + assignmentResult.skippedCount,
            errorCount: issueCount,
            errorMessage: errors.length ? errors.join("；") : null,
            detailsJson: {
              guest: guestResult,
              assignment: assignmentResult,
              errors
            },
            finishedAt
          }
        }),
        this.prisma.wecomSmartSheetConnection.update({
          where: { id: connection.id },
          data: {
            lastGuestPushedAt: guestResult.completed ? finishedAt : connection.lastGuestPushedAt,
            lastAssignmentPulledAt: assignmentResult.completed ? finishedAt : connection.lastAssignmentPulledAt,
            lastSyncAt: finishedAt,
            lastSyncStatus: status,
            lastError: errors.length ? errors.join("；") : assignmentResult.errors[0] ?? null
          }
        })
      ]);
      return {
        runId: run.id,
        status,
        guest: guestResult,
        assignment: assignmentResult,
        errors,
        finishedAt: finishedAt.toISOString()
      };
    } catch (error) {
      const message = errorMessage(error, "智能表同步失败");
      await Promise.all([
        this.prisma.guestScheduleSyncRun.update({
          where: { id: run.id },
          data: { status: GuestScheduleSyncStatus.FAILED, errorCount: 1, errorMessage: message, finishedAt: new Date() }
        }),
        this.prisma.wecomSmartSheetConnection.update({
          where: { id: connectionId },
          data: { lastSyncAt: new Date(), lastSyncStatus: GuestScheduleSyncStatus.FAILED, lastError: message }
        })
      ]);
      throw error;
    } finally {
      await this.prisma.wecomSmartSheetConnection.updateMany({
        where: { id: connectionId },
        data: { syncLockedAt: null }
      });
    }
  }

  private async pushGuestRows(connection: SheetConnectionRecord, session: SmartSheetSession): Promise<GuestSyncResult> {
    if (readSmartSheetMode(connection.assignmentFieldMappingJson) === SMART_SHEET_MODE.EXISTING_WIDE_SHEET) {
      return this.syncExistingWideSheetGuests(connection, session);
    }
    const attendees = await this.prisma.registrationAttendee.findMany({
      where: { registration: { conferenceId: connection.conferenceId, status: RegistrationStatus.CONFIRMED } },
      orderBy: { createdAt: "asc" },
      include: {
        sku: { select: { name: true } },
        registration: {
          select: {
            id: true,
            registrationNo: true,
            status: true,
            conferenceId: true,
            conference: { select: { title: true } }
          }
        }
      }
    });
    const mappings = await this.prisma.wecomSmartSheetGuestRecord.findMany({
      where: { connectionId: connection.id }
    });
    const mappingByAttendee = new Map(mappings.map((item) => [item.attendeeId, item]));
    const fieldMapping = mergeFieldMapping(DEFAULT_GUEST_FIELD_MAPPING, connection.guestFieldMappingJson);
    const prepared = attendees.map((attendee) => {
      const values = guestValues(fieldMapping, attendee);
      return {
        attendee,
        values,
        payloadHash: hashJson(values),
        mapping: mappingByAttendee.get(attendee.id)
      };
    });
    const additions = prepared.filter((item) => !item.mapping?.remoteRecordId);
    const updates = prepared.filter((item) => item.mapping?.remoteRecordId && item.mapping.payloadHash !== item.payloadHash);
    const result: GuestSyncResult = {
      readCount: attendees.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: prepared.length - additions.length - updates.length,
      completed: false
    };

    for (const batch of chunks(additions, 200)) {
      const recordIds = await session.addRecords(
        connection.guestSheetId,
        batch.map((item) => ({ values: item.values }))
      );
      if (recordIds.length !== batch.length) {
        throw new BadRequestException(`智能表新增返回 ${recordIds.length} 个记录 ID，预期 ${batch.length} 个`);
      }
      await this.prisma.$transaction(
        batch.map((item, index) => this.prisma.wecomSmartSheetGuestRecord.upsert({
          where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
          create: {
            connectionId: connection.id,
            attendeeId: item.attendee.id,
            remoteRecordId: recordIds[index],
            payloadHash: item.payloadHash,
            lastPushedAt: new Date(),
            lastError: null
          },
          update: {
            remoteRecordId: recordIds[index],
            payloadHash: item.payloadHash,
            lastPushedAt: new Date(),
            lastError: null
          }
        }))
      );
      result.createdCount += batch.length;
    }

    for (const batch of chunks(updates, 200)) {
      await session.updateRecords(
        connection.guestSheetId,
        batch.map((item) => ({ record_id: item.mapping!.remoteRecordId!, values: item.values }))
      );
      await this.prisma.$transaction(
        batch.map((item) => this.prisma.wecomSmartSheetGuestRecord.update({
          where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
          data: { payloadHash: item.payloadHash, lastPushedAt: new Date(), lastError: null }
        }))
      );
      result.updatedCount += batch.length;
    }
    result.completed = true;
    return result;
  }

  private async pushWebhookGuestRows(connection: ConnectionRecord): Promise<GuestSyncResult> {
    const config = normalizeWideSheetConfig(connection.assignmentFieldMappingJson);
    const attendees = await this.prisma.registrationAttendee.findMany({
      where: { registration: { conferenceId: connection.conferenceId, status: RegistrationStatus.CONFIRMED } },
      orderBy: { createdAt: "asc" },
      include: {
        sku: { select: { name: true } },
        registration: {
          select: {
            id: true,
            registrationNo: true,
            status: true,
            conferenceId: true,
            conference: { select: { title: true } }
          }
        }
      }
    });
    const result: GuestSyncResult = {
      readCount: attendees.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      completed: false
    };
    if (!config.writeRegistrationFields) {
      result.skippedCount = attendees.length;
      result.completed = true;
      return result;
    }

    const webhookUrl = decryptSecret(connection.webhookUrlEnc);
    if (!webhookUrl) throw new BadRequestException("尚未配置智能表接收外部数据 Webhook URL");
    validateSmartSheetWebhookUrl(webhookUrl);
    if (!connection.webhookSchemaJson) throw new BadRequestException("尚未配置智能表 Webhook 示例字段");
    const schema = normalizeSmartSheetWebhookSchema(connection.webhookSchemaJson);
    const mappings = await this.prisma.wecomSmartSheetGuestRecord.findMany({ where: { connectionId: connection.id } });
    const mappingByAttendee = new Map(mappings.map((item) => [item.attendeeId, item]));
    const prepared = attendees.map((attendee) => {
      const values = wideGuestValues(config, attendee);
      const payloadHash = hashJson(values);
      return { attendee, values, payloadHash, mapping: mappingByAttendee.get(attendee.id) };
    });
    const additions = prepared.filter((item) => !item.mapping?.remoteRecordId);
    const updates = prepared.filter((item) => item.mapping?.remoteRecordId && item.mapping.payloadHash !== item.payloadHash);
    result.skippedCount = prepared.length - additions.length - updates.length;

    for (const batch of chunks(additions, 100)) {
      const addRecords = batch.map((item) => ({
        values: buildSmartSheetWebhookValues(withWideSyncedAt(config, item.values), schema)
      }));
      const { recordIds } = await this.client.sendSmartSheetWebhook(webhookUrl, {
        schema: schema.schema,
        add_records: addRecords
      });
      if (recordIds.length !== batch.length) {
        throw new BadRequestException(`智能表 Webhook 返回 ${recordIds.length} 个记录 ID，预期 ${batch.length} 个；已停止以避免重复写入`);
      }
      await this.prisma.$transaction(batch.map((item, index) => this.prisma.wecomSmartSheetGuestRecord.upsert({
        where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
        create: {
          connectionId: connection.id,
          attendeeId: item.attendee.id,
          remoteRecordId: recordIds[index],
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        },
        update: {
          remoteRecordId: recordIds[index],
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        }
      })));
      result.createdCount += batch.length;
    }

    for (const batch of chunks(updates, 100)) {
      await this.client.sendSmartSheetWebhook(webhookUrl, {
        schema: schema.schema,
        update_records: batch.map((item) => ({
          record_id: item.mapping!.remoteRecordId!,
          values: buildSmartSheetWebhookValues(withWideSyncedAt(config, item.values), schema)
        }))
      });
      await this.prisma.$transaction(batch.map((item) => this.prisma.wecomSmartSheetGuestRecord.update({
        where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
        data: { payloadHash: item.payloadHash, lastPushedAt: new Date(), lastError: null }
      })));
      result.updatedCount += batch.length;
    }
    result.completed = true;
    return result;
  }

  private async pullAssignmentRows(connection: SheetConnectionRecord, session: SmartSheetSession): Promise<AssignmentSyncResult> {
    if (readSmartSheetMode(connection.assignmentFieldMappingJson) === SMART_SHEET_MODE.EXISTING_WIDE_SHEET) {
      return this.pullExistingWideSheetAssignments(connection, session);
    }
    const [records, fields] = await Promise.all([
      session.getRecords(connection.assignmentSheetId),
      session.getFields(connection.assignmentSheetId)
    ]);
    const mapping = mergeFieldMapping(DEFAULT_ASSIGNMENT_FIELD_MAPPING, connection.assignmentFieldMappingJson);
    const titles = fieldTitles(fields);
    const canWriteSystemFields = [mapping.assignmentId, mapping.publishState, mapping.syncedAt].every((title) => titles.has(title));
    const result: AssignmentSyncResult = {
      readCount: records.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      completed: false,
      errors: []
    };
    const statusUpdates: Array<{ record_id: string; values: Record<string, unknown> }> = [];

    for (const record of records) {
      try {
        const values = record.values ?? {};
        if (isBlankAssignmentRow(values, mapping)) {
          result.skippedCount += 1;
          continue;
        }
        const attendee = await this.resolveAttendee(connection.conferenceId, values, mapping);
        const draft = assignmentDraft(values, mapping);
        const draftHash = hashDraft(draft);
        const remoteUpdatedAt = parseRemoteTimestamp(record.update_time);
        const existing = await this.prisma.guestScheduleAssignment.findUnique({
          where: { connectionId_remoteRecordId: { connectionId: connection.id, remoteRecordId: record.record_id } }
        });
        let assignmentId: string;
        let state: "DRAFT" | "CHANGED" | "PUBLISHED";
        if (!existing) {
          const created = await this.prisma.guestScheduleAssignment.create({
            data: {
              conferenceId: connection.conferenceId,
              attendeeId: attendee.id,
              connectionId: connection.id,
              ...draft,
              source: GuestScheduleSource.WECOM_SMART_SHEET,
              remoteRecordId: record.record_id,
              remoteUpdatedAt,
              draftHash,
              hasUnpublishedChanges: true
            }
          });
          assignmentId = created.id;
          state = "DRAFT";
          result.createdCount += 1;
        } else if (existing.draftHash !== draftHash || existing.attendeeId !== attendee.id || existing.archivedAt) {
          const changed = draftHash !== existing.publishedHash;
          const updated = await this.prisma.guestScheduleAssignment.update({
            where: { id: existing.id },
            data: {
              attendeeId: attendee.id,
              ...draft,
              source: GuestScheduleSource.WECOM_SMART_SHEET,
              remoteUpdatedAt,
              draftHash,
              hasUnpublishedChanges: changed,
              archivedAt: null
            }
          });
          assignmentId = updated.id;
          state = !updated.publishedHash ? "DRAFT" : changed ? "CHANGED" : "PUBLISHED";
          result.updatedCount += 1;
        } else {
          assignmentId = existing.id;
          state = !existing.publishedHash ? "DRAFT" : existing.hasUnpublishedChanges ? "CHANGED" : "PUBLISHED";
          result.skippedCount += 1;
          if (remoteUpdatedAt && existing.remoteUpdatedAt?.getTime() !== remoteUpdatedAt.getTime()) {
            await this.prisma.guestScheduleAssignment.update({ where: { id: existing.id }, data: { remoteUpdatedAt } });
          }
        }
        const publishedState = stateLabel(state);
        const shouldWriteSystemFields = canWriteSystemFields && (
          readCellText(values[mapping.assignmentId]) !== assignmentId
          || readCellText(values[mapping.publishState]) !== publishedState
          || !readCellText(values[mapping.syncedAt])
        );
        if (shouldWriteSystemFields) {
          statusUpdates.push({
            record_id: record.record_id,
            values: {
              [mapping.assignmentId]: smartText(assignmentId),
              [mapping.publishState]: smartText(publishedState),
              [mapping.syncedAt]: smartText(new Date().toISOString())
            }
          });
        }
      } catch (error) {
        result.errorCount += 1;
        result.errors.push(`${record.record_id}: ${errorMessage(error, "记录无法导入")}`);
      }
    }

    if (canWriteSystemFields) {
      for (const batch of chunks(statusUpdates, 200)) {
        await session.updateRecords(connection.assignmentSheetId, batch);
      }
    }
    result.completed = true;
    return result;
  }

  private async syncExistingWideSheetGuests(connection: SheetConnectionRecord, session: SmartSheetSession): Promise<GuestSyncResult> {
    const config = normalizeWideSheetConfig(connection.assignmentFieldMappingJson);
    const [attendees, records, mappings] = await Promise.all([
      this.prisma.registrationAttendee.findMany({
        where: { registration: { conferenceId: connection.conferenceId, status: RegistrationStatus.CONFIRMED } },
        orderBy: { createdAt: "asc" },
        include: {
          sku: { select: { name: true } },
          registration: {
            select: {
              id: true,
              registrationNo: true,
              status: true,
              conferenceId: true,
              conference: { select: { title: true } }
            }
          }
        }
      }),
      session.getRecords(connection.guestSheetId),
      this.prisma.wecomSmartSheetGuestRecord.findMany({ where: { connectionId: connection.id } })
    ]);
    const recordById = new Map(records.map((item) => [item.record_id, item]));
    const remoteIndexes = buildWideRemoteIndexes(records, config);
    const mappingByAttendee = new Map(mappings.map((item) => [item.attendeeId, item]));
    const additions: Array<{ attendee: SyncAttendee; values: Record<string, unknown>; payloadHash: string }> = [];
    const updates: Array<{ attendee: SyncAttendee; record: WecomSmartSheetRecord; values: Record<string, unknown>; payloadHash: string }> = [];
    const links: Array<{ attendee: SyncAttendee; record: WecomSmartSheetRecord; payloadHash: string | null }> = [];
    const result: GuestSyncResult = {
      readCount: attendees.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      completed: false
    };

    for (const attendee of attendees) {
      const currentMapping = mappingByAttendee.get(attendee.id);
      const mappedRecord = currentMapping?.remoteRecordId ? recordById.get(currentMapping.remoteRecordId) : undefined;
      const record = mappedRecord ?? findWideRecordForAttendee(attendee, remoteIndexes, config);
      const values = wideGuestValues(config, attendee);
      const payloadHash = hashJson(values);
      if (!record) {
        if (config.writeRegistrationFields) additions.push({ attendee, values, payloadHash });
        else result.skippedCount += 1;
        continue;
      }
      if (config.writeRegistrationFields && Object.keys(values).length > 0 && currentMapping?.payloadHash !== payloadHash) {
        updates.push({ attendee, record, values, payloadHash });
      } else {
        links.push({ attendee, record, payloadHash: config.writeRegistrationFields ? payloadHash : currentMapping?.payloadHash ?? null });
        result.skippedCount += 1;
      }
    }

    for (const batch of chunks(additions, 200)) {
      const recordIds = await session.addRecords(
        connection.guestSheetId,
        batch.map((item) => ({ values: withWideSyncedAt(config, item.values) }))
      );
      if (recordIds.length !== batch.length) {
        throw new BadRequestException(`智能表新增返回 ${recordIds.length} 个记录 ID，预期 ${batch.length} 个`);
      }
      await this.prisma.$transaction(batch.map((item, index) => this.prisma.wecomSmartSheetGuestRecord.upsert({
        where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
        create: {
          connectionId: connection.id,
          attendeeId: item.attendee.id,
          remoteRecordId: recordIds[index],
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        },
        update: {
          remoteRecordId: recordIds[index],
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        }
      })));
      result.createdCount += batch.length;
    }

    for (const batch of chunks(updates, 200)) {
      await session.updateRecords(
        connection.guestSheetId,
        batch.map((item) => ({ record_id: item.record.record_id, values: withWideSyncedAt(config, item.values) }))
      );
      await this.prisma.$transaction(batch.map((item) => this.prisma.wecomSmartSheetGuestRecord.upsert({
        where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
        create: {
          connectionId: connection.id,
          attendeeId: item.attendee.id,
          remoteRecordId: item.record.record_id,
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        },
        update: {
          remoteRecordId: item.record.record_id,
          payloadHash: item.payloadHash,
          lastPushedAt: new Date(),
          lastError: null
        }
      })));
      result.updatedCount += batch.length;
    }

    for (const batch of chunks(links, 200)) {
      await this.prisma.$transaction(batch.map((item) => this.prisma.wecomSmartSheetGuestRecord.upsert({
        where: { connectionId_attendeeId: { connectionId: connection.id, attendeeId: item.attendee.id } },
        create: {
          connectionId: connection.id,
          attendeeId: item.attendee.id,
          remoteRecordId: item.record.record_id,
          payloadHash: item.payloadHash,
          lastPushedAt: null,
          lastError: null
        },
        update: {
          remoteRecordId: item.record.record_id,
          payloadHash: item.payloadHash,
          lastError: null
        }
      })));
    }
    result.completed = true;
    return result;
  }

  private async pullExistingWideSheetAssignments(
    connection: SheetConnectionRecord,
    session: SmartSheetSession
  ): Promise<AssignmentSyncResult> {
    const records = await session.getRecords(connection.assignmentSheetId);
    return this.applyExistingWideSheetAssignments(connection, records);
  }

  private async applyExistingWideSheetAssignments(
    connection: ConnectionRecord,
    records: WecomSmartSheetRecord[]
  ): Promise<AssignmentSyncResult> {
    const config = normalizeWideSheetConfig(connection.assignmentFieldMappingJson);
    const attendees = await this.prisma.registrationAttendee.findMany({
      where: { registration: { conferenceId: connection.conferenceId, status: RegistrationStatus.CONFIRMED } },
      select: { id: true, name: true, phone: true, company: true }
    });
    const attendeeIndexes = buildWideAttendeeIndexes(attendees);
    const enabledRules = config.schedules.filter((rule) => rule.enabled);
    const result: AssignmentSyncResult = {
      readCount: records.length,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      errorCount: 0,
      completed: false,
      errors: []
    };

    for (const record of records) {
      const values = record.values ?? {};
      const attendee = findWideAttendeeForRecord(values, config, attendeeIndexes);
      if (!attendee) {
        result.skippedCount += 1;
        continue;
      }
      const activeRules = enabledRules.filter((rule) => isWideRulePresent(values, rule));
      if (!activeRules.length) {
        result.skippedCount += 1;
        continue;
      }
      for (const rule of activeRules) {
        const remoteRecordId = `${record.record_id}:${rule.id}`;
        try {
          const draft = wideAssignmentDraft(values, rule);
          const draftHash = hashDraft(draft);
          const remoteUpdatedAt = parseRemoteTimestamp(record.update_time);
          const existing = await this.prisma.guestScheduleAssignment.findUnique({
            where: { connectionId_remoteRecordId: { connectionId: connection.id, remoteRecordId } }
          });
          if (!existing) {
            await this.prisma.guestScheduleAssignment.create({
              data: {
                conferenceId: connection.conferenceId,
                attendeeId: attendee.id,
                connectionId: connection.id,
                ...draft,
                source: GuestScheduleSource.WECOM_SMART_SHEET,
                remoteRecordId,
                remoteUpdatedAt,
                draftHash,
                hasUnpublishedChanges: true
              }
            });
            result.createdCount += 1;
          } else if (existing.draftHash !== draftHash || existing.attendeeId !== attendee.id || existing.archivedAt) {
            const changed = draftHash !== existing.publishedHash;
            await this.prisma.guestScheduleAssignment.update({
              where: { id: existing.id },
              data: {
                attendeeId: attendee.id,
                ...draft,
                source: GuestScheduleSource.WECOM_SMART_SHEET,
                remoteUpdatedAt,
                draftHash,
                hasUnpublishedChanges: changed,
                archivedAt: null
              }
            });
            result.updatedCount += 1;
          } else {
            result.skippedCount += 1;
            if (remoteUpdatedAt && existing.remoteUpdatedAt?.getTime() !== remoteUpdatedAt.getTime()) {
              await this.prisma.guestScheduleAssignment.update({ where: { id: existing.id }, data: { remoteUpdatedAt } });
            }
          }
        } catch (error) {
          result.errorCount += 1;
          result.errors.push(`${record.record_id}/${rule.label}: ${errorMessage(error, "事项无法导入")}`);
        }
      }
    }
    result.completed = true;
    return result;
  }

  private async resolveAttendee(conferenceId: string, values: Record<string, unknown>, mapping: AssignmentFieldMapping) {
    const attendeeId = readCellText(values[mapping.attendeeId]);
    if (attendeeId) {
      const attendee = await this.prisma.registrationAttendee.findFirst({
        where: { id: attendeeId, registration: { conferenceId, status: RegistrationStatus.CONFIRMED } }
      });
      if (attendee) return attendee;
    }
    const phone = readCellText(values[mapping.phone]);
    if (!phone) throw new BadRequestException(`请填写“${mapping.attendeeId}”，或至少填写可唯一匹配的手机号`);
    const matches = await this.prisma.registrationAttendee.findMany({
      where: { phone, registration: { conferenceId, status: RegistrationStatus.CONFIRMED } },
      take: 2
    });
    if (matches.length !== 1) throw new BadRequestException(`手机号 ${maskPhone(phone)} 无法唯一匹配参会人`);
    return matches[0];
  }

  private async createSmartSheetSession(
    connection: SheetConnectionRecord,
    forceRefresh = false
  ): Promise<SmartSheetSession> {
    const transport = readSmartSheetTransport(connection.transport);
    if (transport === SMART_SHEET_TRANSPORT.SMART_BOT_API) {
      const botId = connection.smartBotId?.trim() || "";
      const secret = decryptSecret(connection.smartBotSecretEnc);
      const docUrl = connection.docUrl?.trim() || "";
      if (!botId || !secret) throw new BadRequestException("当前连接缺少智能机器人 Bot ID 或 Secret");
      if (!docUrl) throw new BadRequestException("当前智能机器人连接缺少完整智能表链接");
      const credentials: WecomSmartBotCredentials = { botId, secret };
      if (forceRefresh) await this.smartBot.verifyCredentials(credentials);
      return {
        getFields: (sheetId) => this.smartBot.getSmartSheetFields(credentials, docUrl, sheetId),
        getRecords: (sheetId) => this.smartBot.getSmartSheetRecords(credentials, docUrl, sheetId),
        addRecords: (sheetId, records) => this.smartBot.addSmartSheetRecords(credentials, docUrl, sheetId, records),
        updateRecords: (sheetId, records) => this.smartBot.updateSmartSheetRecords(credentials, docUrl, sheetId, records)
      };
    }
    assertLegacyApiConnection(connection);
    const { accessToken } = await this.tokens.getAccessToken(connection.integration, "self_built_app", forceRefresh);
    return {
      getFields: (sheetId) => this.client.getSmartSheetFields(accessToken, connection.docId, sheetId),
      getRecords: (sheetId) => this.client.getSmartSheetRecords(accessToken, connection.docId, sheetId),
      addRecords: (sheetId, records) => this.client.addSmartSheetRecords(accessToken, connection.docId, sheetId, records),
      updateRecords: (sheetId, records) => this.client.updateSmartSheetRecords(accessToken, connection.docId, sheetId, records)
    };
  }

  private async getConnection(conferenceId: string) {
    const connection = await this.prisma.wecomSmartSheetConnection.findUnique({
      where: { conferenceId },
      include: { integration: true, conference: { select: { id: true, title: true } } }
    });
    if (!connection) throw new NotFoundException("该会议尚未配置企微智能表同步");
    return connection;
  }

  private async ensureConference(conferenceId: string): Promise<void> {
    const exists = await this.prisma.conference.count({ where: { id: conferenceId } });
    if (!exists) throw new NotFoundException("会议不存在");
  }

  private async getDefaultIntegrationId(): Promise<string> {
    const integration = await this.prisma.wecomIntegration.findFirst({ orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }] });
    if (!integration) throw new BadRequestException("请先在企微接入配置中创建自建应用配置");
    return integration.id;
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityId: string, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType: "WecomSmartSheetConnection", entityId, summary, metadataJson }
    });
  }
}

type ConnectionRecord = Prisma.WecomSmartSheetConnectionGetPayload<{
  include: { integration: true; conference: { select: { id: true; title: true } } };
}>;

type SheetConnectionRecord = ConnectionRecord & {
  guestSheetId: string;
  assignmentSheetId: string;
};

type LegacyApiConnectionRecord = SheetConnectionRecord & {
  integration: NonNullable<ConnectionRecord["integration"]>;
  docId: string;
};

type SmartSheetSession = {
  getFields: (sheetId: string) => Promise<Array<Record<string, unknown>>>;
  getRecords: (sheetId: string) => Promise<WecomSmartSheetRecord[]>;
  addRecords: (sheetId: string, records: Array<{ values: Record<string, unknown> }>) => Promise<string[]>;
  updateRecords: (
    sheetId: string,
    records: Array<{ record_id: string; values: Record<string, unknown> }>
  ) => Promise<void>;
};

type SyncAttendee = {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  title: string | null;
  sku: { name: string };
  registration: {
    id: string;
    registrationNo: string;
    status: RegistrationStatus;
    conferenceId: string;
    conference: { title: string };
  };
};

type WideAttendeeReference = Pick<SyncAttendee, "id" | "name" | "phone" | "company">;

type MultiIndex<T> = Map<string, T[]>;

type WideRemoteIndexes = {
  byAttendeeId: MultiIndex<WecomSmartSheetRecord>;
  byPhone: MultiIndex<WecomSmartSheetRecord>;
  byNameCompany: MultiIndex<WecomSmartSheetRecord>;
};

type WideAttendeeIndexes = {
  byId: Map<string, WideAttendeeReference>;
  byPhone: MultiIndex<WideAttendeeReference>;
  byNameCompany: MultiIndex<WideAttendeeReference>;
};

type GuestSyncResult = {
  readCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  completed: boolean;
};

type AssignmentSyncResult = {
  readCount: number;
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  completed: boolean;
  errors: string[];
};

function emptyGuestResult(): GuestSyncResult {
  return { readCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, completed: false };
}

function emptyAssignmentResult(): AssignmentSyncResult {
  return { readCount: 0, createdCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0, completed: false, errors: [] };
}

function guestValues(
  mapping: GuestFieldMapping,
  attendee: {
    id: string;
    name: string;
    phone: string;
    company: string | null;
    title: string | null;
    sku: { name: string };
    registration: {
      registrationNo: string;
      status: RegistrationStatus;
      conferenceId: string;
      conference: { title: string };
    };
  }
): Record<string, unknown> {
  return {
    [mapping.attendeeId]: smartText(attendee.id),
    [mapping.registrationNo]: smartText(attendee.registration.registrationNo),
    [mapping.conferenceId]: smartText(attendee.registration.conferenceId),
    [mapping.conferenceTitle]: smartText(attendee.registration.conference.title),
    [mapping.name]: smartText(attendee.name),
    [mapping.phone]: smartText(attendee.phone),
    [mapping.company]: smartText(attendee.company),
    [mapping.title]: smartText(attendee.title),
    [mapping.skuName]: smartText(attendee.sku.name),
    [mapping.registrationStatus]: smartText(attendee.registration.status === RegistrationStatus.CONFIRMED ? "已确认" : attendee.registration.status),
    [mapping.syncedAt]: smartText(new Date().toISOString())
  };
}

function wideGuestValues(config: ExistingWideSheetConfig, attendee: SyncAttendee): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  setSmartText(values, config.identity.attendeeIdField, attendee.id);
  setSmartText(values, config.identity.nameField, attendee.name);
  setSmartText(values, config.identity.phoneField, attendee.phone);
  setSmartText(values, config.identity.companyField, attendee.company);
  setSmartText(values, config.registration.registrationNoField, attendee.registration.registrationNo);
  setSmartText(values, config.registration.conferenceTitleField, attendee.registration.conference.title);
  setSmartText(values, config.registration.titleField, attendee.title);
  setSmartText(values, config.registration.skuNameField, attendee.sku.name);
  setSmartText(values, config.registration.registrationStatusField, "已确认");
  return values;
}

function withWideSyncedAt(
  config: ExistingWideSheetConfig,
  values: Record<string, unknown>
): Record<string, unknown> {
  if (!config.registration.syncedAtField) return values;
  return { ...values, [config.registration.syncedAtField]: smartText(new Date().toISOString()) };
}

function buildWideRemoteIndexes(
  records: WecomSmartSheetRecord[],
  config: ExistingWideSheetConfig
): WideRemoteIndexes {
  const indexes: WideRemoteIndexes = {
    byAttendeeId: new Map(),
    byPhone: new Map(),
    byNameCompany: new Map()
  };
  for (const record of records) {
    const values = record.values ?? {};
    addToIndex(indexes.byAttendeeId, normalizeComparable(readCellText(values[config.identity.attendeeIdField])), record);
    addToIndex(indexes.byPhone, normalizePhone(readCellText(values[config.identity.phoneField])), record);
    addToIndex(indexes.byNameCompany, nameCompanyKey(
      readCellText(values[config.identity.nameField]),
      readCellText(values[config.identity.companyField])
    ), record);
  }
  return indexes;
}

function findWideRecordForAttendee(
  attendee: SyncAttendee,
  indexes: WideRemoteIndexes,
  config: ExistingWideSheetConfig
): WecomSmartSheetRecord | undefined {
  if (config.identity.attendeeIdField) {
    const match = uniqueIndexValue(indexes.byAttendeeId, normalizeComparable(attendee.id));
    if (match) return match;
  }
  if (config.identity.phoneField) {
    const match = uniqueIndexValue(indexes.byPhone, normalizePhone(attendee.phone));
    if (match) return match;
  }
  if (config.identity.nameField && config.identity.companyField) {
    return uniqueIndexValue(indexes.byNameCompany, nameCompanyKey(attendee.name, attendee.company));
  }
  return undefined;
}

function buildWideAttendeeIndexes(attendees: WideAttendeeReference[]): WideAttendeeIndexes {
  const indexes: WideAttendeeIndexes = { byId: new Map(), byPhone: new Map(), byNameCompany: new Map() };
  for (const attendee of attendees) {
    indexes.byId.set(attendee.id, attendee);
    addToIndex(indexes.byPhone, normalizePhone(attendee.phone), attendee);
    addToIndex(indexes.byNameCompany, nameCompanyKey(attendee.name, attendee.company), attendee);
  }
  return indexes;
}

function findWideAttendeeForRecord(
  values: Record<string, unknown>,
  config: ExistingWideSheetConfig,
  indexes: WideAttendeeIndexes
): WideAttendeeReference | null {
  if (config.identity.attendeeIdField) {
    const attendeeId = readCellText(values[config.identity.attendeeIdField]);
    const match = attendeeId ? indexes.byId.get(attendeeId) : undefined;
    if (match) return match;
  }
  if (config.identity.phoneField) {
    const match = uniqueIndexValue(indexes.byPhone, normalizePhone(readCellText(values[config.identity.phoneField])));
    if (match) return match;
  }
  if (config.identity.nameField && config.identity.companyField) {
    const match = uniqueIndexValue(indexes.byNameCompany, nameCompanyKey(
      readCellText(values[config.identity.nameField]),
      readCellText(values[config.identity.companyField])
    ));
    if (match) return match;
  }
  return null;
}

function isWideRulePresent(values: Record<string, unknown>, rule: WideSheetScheduleRule): boolean {
  if (rule.triggerField) {
    const triggerValue = values[rule.triggerField];
    if (triggerValue === false || triggerValue === 0) return false;
    const triggerText = readCellText(triggerValue)?.trim().toLowerCase();
    if (triggerText && ["否", "不参加", "未参加", "无", "取消", "false", "no", "0", "未安排"].includes(triggerText)) return false;
    if (triggerText || triggerValue === true) return true;
  }
  return [
    rule.activityNameField,
    rule.startsAtField,
    rule.endsAtField,
    rule.locationField,
    rule.roleField,
    rule.tableNoField,
    rule.shareTopicField,
    rule.notesField
  ].some((field) => Boolean(field && readCellText(values[field])));
}

export function wideAssignmentDraft(
  values: Record<string, unknown>,
  rule: WideSheetScheduleRule
): GuestScheduleDraft {
  const name = (rule.activityNameField ? readCellText(values[rule.activityNameField]) : null)
    || rule.activityNameFallback
    || rule.label;
  const startsAt = rule.startsAtField ? readCellDate(values[rule.startsAtField]) : null;
  if (!name) throw new BadRequestException(`${rule.label}缺少事项名称`);
  if (!startsAt) throw new BadRequestException(`${rule.label}的“${rule.startsAtField || "开始时间"}”不是有效时间`);
  const endsAt = rule.endsAtField ? readCellDate(values[rule.endsAtField]) : null;
  if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new BadRequestException(`${rule.label}结束时间不能早于开始时间`);
  return {
    type: rule.type,
    name,
    startsAt,
    endsAt,
    location: rule.locationField ? readCellText(values[rule.locationField]) : null,
    role: rule.roleField ? readCellText(values[rule.roleField]) : null,
    tableNo: rule.tableNoField ? readCellText(values[rule.tableNoField]) : null,
    isTableLeader: rule.isTableLeaderField ? readCellBoolean(values[rule.isTableLeaderField]) : false,
    shareTopic: rule.shareTopicField ? readCellText(values[rule.shareTopicField]) : null,
    notes: rule.notesField ? readCellText(values[rule.notesField]) : null
  };
}

function setSmartText(values: Record<string, unknown>, field: string, value: unknown): void {
  if (!field) return;
  values[field] = smartText(value);
}

function addToIndex<T>(index: MultiIndex<T>, key: string, value: T): void {
  if (!key) return;
  const items = index.get(key);
  if (items) items.push(value);
  else index.set(key, [value]);
}

function uniqueIndexValue<T>(index: MultiIndex<T>, key: string): T | undefined {
  if (!key) return undefined;
  const items = index.get(key);
  return items?.length === 1 ? items[0] : undefined;
}

function normalizePhone(value: string | null): string {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length === 13 && digits.startsWith("86") ? digits.slice(2) : digits;
}

function nameCompanyKey(name: string | null, company: string | null): string {
  const normalizedName = normalizeComparable(name);
  const normalizedCompany = normalizeComparable(company);
  return normalizedName && normalizedCompany ? `${normalizedName}|${normalizedCompany}` : "";
}

function normalizeComparable(value: string | null): string {
  return (value || "").replace(/[\s&＆/\\·._-]+/g, "").toLowerCase();
}

function assignmentDraft(values: Record<string, unknown>, mapping: AssignmentFieldMapping): GuestScheduleDraft {
  const typeText = readCellText(values[mapping.type]);
  const name = readCellText(values[mapping.activityName]);
  const startsAt = readCellDate(values[mapping.startsAt]);
  if (!typeText) throw new BadRequestException(`“${mapping.type}”不能为空`);
  if (!name) throw new BadRequestException(`“${mapping.activityName}”不能为空`);
  if (!startsAt) throw new BadRequestException(`“${mapping.startsAt}”不是有效时间`);
  const endsAt = readCellDate(values[mapping.endsAt]);
  if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new BadRequestException("结束时间不能早于开始时间");
  return {
    type: parseScheduleType(typeText),
    name,
    startsAt,
    endsAt,
    location: readCellText(values[mapping.location]),
    role: readCellText(values[mapping.role]),
    tableNo: readCellText(values[mapping.tableNo]),
    isTableLeader: readCellBoolean(values[mapping.isTableLeader]),
    shareTopic: readCellText(values[mapping.shareTopic]),
    notes: readCellText(values[mapping.notes])
  };
}

function parseScheduleType(value: string): GuestScheduleType {
  const normalized = value.trim().toUpperCase();
  if ((Object.values(GuestScheduleType) as string[]).includes(normalized)) return normalized as GuestScheduleType;
  if (value.includes("工作坊")) return GuestScheduleType.WORKSHOP;
  if (value.includes("晚宴") || value.includes("晚餐")) return GuestScheduleType.DINNER;
  if (value.includes("演讲") || value.includes("分享")) return GuestScheduleType.SPEECH;
  if (value.includes("彩排")) return GuestScheduleType.REHEARSAL;
  if (value.includes("接待") || value.includes("报到")) return GuestScheduleType.RECEPTION;
  return GuestScheduleType.OTHER;
}

function isBlankAssignmentRow(values: Record<string, unknown>, mapping: AssignmentFieldMapping): boolean {
  return !readCellText(values[mapping.attendeeId])
    && !readCellText(values[mapping.phone])
    && !readCellText(values[mapping.activityName]);
}

function readCellText(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const parts = value.map(readCellText).filter((item): item is string => Boolean(item));
    return parts.join("、") || null;
  }
  if (isRecord(value)) {
    for (const key of ["text", "value", "title", "name"]) {
      const candidate = value[key];
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
      if (typeof candidate === "number") return String(candidate);
    }
  }
  return null;
}

function readCellDate(value: unknown): Date | null {
  const primitive = findDatePrimitive(value);
  if (primitive === null) return null;
  if (typeof primitive === "number") {
    const millis = primitive >= 20_000 && primitive <= 100_000
      ? Math.round((primitive - 25_569) * 86_400_000)
      : primitive < 10_000_000_000 ? primitive * 1000 : primitive;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const numeric = /^\d+(\.\d+)?$/.test(primitive) ? Number(primitive) : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric >= 20_000 && numeric <= 100_000
      ? Math.round((numeric - 25_569) * 86_400_000)
      : numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(primitive.replace(/\//g, "-"));
  return Number.isNaN(date.getTime()) ? null : date;
}

function findDatePrimitive(value: unknown): string | number | null {
  if (typeof value === "string" || typeof value === "number") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDatePrimitive(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (isRecord(value)) {
    for (const key of ["timestamp", "value", "date", "date_time", "number", "text"]) {
      const candidate = value[key];
      if (typeof candidate === "string" || typeof candidate === "number") return candidate;
    }
  }
  return null;
}

function readCellBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const text = readCellText(value)?.toLowerCase();
  return Boolean(text && ["是", "true", "yes", "y", "1", "桌长"].includes(text));
}

function parseRemoteTimestamp(value: string | number | undefined): Date | null {
  if (typeof value === "undefined") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const date = new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric);
  return Number.isNaN(date.getTime()) ? null : date;
}

function smartText(value: unknown): Array<{ type: "text"; text: string }> {
  if (value === null || typeof value === "undefined" || value === "") return [];
  return [{ type: "text", text: String(value) }];
}

function stateLabel(state: "DRAFT" | "CHANGED" | "PUBLISHED") {
  return ({ DRAFT: "待发布", CHANGED: "有待发布变更", PUBLISHED: "已发布" } as const)[state];
}

function fieldTitles(fields: Array<Record<string, unknown>>): Set<string> {
  return new Set(
    fields
      .map((field) => {
        for (const key of ["field_title", "field_name", "title", "name"]) {
          const value = field[key];
          if (typeof value === "string" && value.trim()) return value.trim();
        }
        return "";
      })
      .filter(Boolean)
  );
}

function formatFieldOptions(fields: Array<Record<string, unknown>>) {
  return fields.map((field, index) => {
    let title = "";
    for (const key of ["field_title", "field_name", "title", "name"]) {
      const value = field[key];
      if (typeof value === "string" && value.trim()) {
        title = value.trim();
        break;
      }
    }
    const id = ["field_id", "id"].map((key) => field[key]).find((value) => typeof value === "string");
    const type = ["field_type", "type"].map((key) => field[key]).find((value) => typeof value === "string");
    return { id: typeof id === "string" ? id : `field-${index + 1}`, title, type: typeof type === "string" ? type : "unknown" };
  }).filter((item) => item.title);
}

function canonicalSmartSheetUrl(value: string, sheetId: string): string {
  const url = new URL(value);
  url.searchParams.set("tab", sheetId);
  return url.toString();
}

function validateWideConfigStructure(config: ExistingWideSheetConfig): string[] {
  const issues: string[] = [];
  const hasIdentity = Boolean(
    config.identity.attendeeIdField
    || config.identity.phoneField
    || (config.identity.nameField && config.identity.companyField)
  );
  if (!hasIdentity) issues.push("嘉宾匹配至少选择系统参会人 ID、手机号，或姓名加公司");
  if (config.writeRegistrationFields && !config.identity.nameField) issues.push("写入新报名时必须映射姓名列");
  if (config.writeRegistrationFields && !config.identity.attendeeIdField && !config.identity.phoneField) {
    issues.push("写入新报名时必须映射系统参会人 ID 或手机号，避免重复新增");
  }
  const rules = config.schedules.filter((rule) => rule.enabled);
  if (!rules.length) issues.push("至少启用一条现场事项规则");
  const ids = new Set<string>();
  for (const rule of rules) {
    if (ids.has(rule.id)) issues.push(`事项规则“${rule.label}”标识重复`);
    ids.add(rule.id);
    if (!rule.startsAtField) issues.push(`${rule.label}未映射开始时间列`);
    if (!rule.activityNameField && !rule.activityNameFallback) issues.push(`${rule.label}未设置事项名称`);
  }
  return issues;
}

function readRequestedMode(value: unknown, storedMapping: unknown): SmartSheetMode {
  if (typeof value === "undefined" || value === null || value === "") return readSmartSheetMode(storedMapping);
  if (value === SMART_SHEET_MODE.EXISTING_WIDE_SHEET || value === SMART_SHEET_MODE.SEPARATE_SHEETS) return value;
  throw new BadRequestException("不支持的智能表连接模式");
}

function readRequestedTransport(value: unknown, storedValue: unknown): SmartSheetTransport {
  if (typeof value === "undefined" || value === null || value === "") return readSmartSheetTransport(storedValue);
  if (
    value === SMART_SHEET_TRANSPORT.SMART_BOT_API
    || value === SMART_SHEET_TRANSPORT.API
    || value === SMART_SHEET_TRANSPORT.WEBHOOK_AUTOMATION
  ) return value;
  throw new BadRequestException("不支持的智能表传输方式");
}

function formatConnection(connection: Prisma.WecomSmartSheetConnectionGetPayload<{
  include: { integration: { select: { id: true; name: true; enabled: true; verified: true; corpId: true; agentId: true; appSecretEnc: true } } };
}>) {
  const mode = readSmartSheetMode(connection.assignmentFieldMappingJson);
  const transport = readSmartSheetTransport(connection.transport);
  const webhookSchema = connection.webhookSchemaJson
    ? normalizeSmartSheetWebhookSchema(connection.webhookSchemaJson)
    : null;
  const webhookUrl = decryptSecret(connection.webhookUrlEnc);
  const automationToken = decryptSecret(connection.automationTokenEnc);
  const smartBotSecretConfigured = Boolean(decryptSecret(connection.smartBotSecretEnc));
  return {
    id: connection.id,
    conferenceId: connection.conferenceId,
    integrationId: connection.integrationId,
    docId: connection.docId,
    docUrl: connection.docUrl,
    guestSheetId: connection.guestSheetId,
    assignmentSheetId: connection.assignmentSheetId,
    transport,
    mode,
    sheetId: mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET ? connection.guestSheetId : null,
    guestFieldMapping: mergeFieldMapping(DEFAULT_GUEST_FIELD_MAPPING, connection.guestFieldMappingJson),
    assignmentFieldMapping: mode === SMART_SHEET_MODE.SEPARATE_SHEETS
      ? mergeFieldMapping(DEFAULT_ASSIGNMENT_FIELD_MAPPING, connection.assignmentFieldMappingJson)
      : DEFAULT_ASSIGNMENT_FIELD_MAPPING,
    wideSheetConfig: mode === SMART_SHEET_MODE.EXISTING_WIDE_SHEET
      ? normalizeWideSheetConfig(connection.assignmentFieldMappingJson)
      : null,
    enabled: connection.enabled,
    syncIntervalSeconds: connection.syncIntervalSeconds,
    syncing: Boolean(connection.syncLockedAt),
    lastGuestPushedAt: connection.lastGuestPushedAt?.toISOString() ?? null,
    lastAssignmentPulledAt: connection.lastAssignmentPulledAt?.toISOString() ?? null,
    lastAutomationReceivedAt: connection.lastAutomationReceivedAt?.toISOString() ?? null,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: connection.lastSyncStatus,
    lastError: connection.lastError,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    webhookConfigured: Boolean(webhookUrl),
    webhookUrlMasked: maskWebhookUrl(webhookUrl),
    webhookSample: webhookSchema ? formatSmartSheetWebhookSample(webhookSchema) : "",
    automationCallbackUrl: automationToken ? buildAutomationCallbackUrl(automationToken) : null,
    smartBotId: connection.smartBotId,
    smartBotSecretConfigured,
    smartBotSecretMasked: smartBotSecretConfigured ? "已安全保存" : "",
    integration: connection.integration ? formatIntegrationOption(connection.integration) : null
  };
}

function formatIntegrationOption(item: { id: string; name: string; enabled: boolean; verified: boolean; corpId: string | null; agentId: string | null; appSecretEnc: string | null }) {
  return {
    id: item.id,
    name: item.name,
    enabled: item.enabled,
    verified: item.verified,
    configured: Boolean(item.corpId && item.agentId && item.appSecretEnc)
  };
}

function formatRun(item: {
  id: string;
  trigger: string;
  status: GuestScheduleSyncStatus;
  guestReadCount: number;
  guestCreatedCount: number;
  guestUpdatedCount: number;
  assignmentReadCount: number;
  assignmentCreatedCount: number;
  assignmentUpdatedCount: number;
  skippedCount: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}) {
  return {
    ...item,
    startedAt: item.startedAt.toISOString(),
    finishedAt: item.finishedAt?.toISOString() ?? null
  };
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function buildAutomationCallbackUrl(token: string): string {
  const base = (process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || process.env.API_BASE_URL || "https://guanchaohuiji.com/api")
    .trim()
    .replace(/\/$/, "");
  return `${base}/guest-schedules/smart-sheet/automation/${encodeURIComponent(token)}`;
}

function maskWebhookUrl(value: string): string {
  if (!value) return "";
  try {
    const url = new URL(value);
    const key = url.searchParams.get("key") || "";
    url.searchParams.set("key", maskSecret(key));
    return url.toString();
  } catch {
    return "已配置";
  }
}

function resolveSubmittedSmartBotCredentials(
  body: Record<string, unknown>,
  existing: { smartBotId: string | null; smartBotSecretEnc: string | null } | null
): WecomSmartBotCredentials {
  const submittedBotId = readOptionalString(body.smartBotId);
  const submittedSecret = readOptionalString(body.smartBotSecret);
  if (submittedBotId && submittedBotId !== existing?.smartBotId && !submittedSecret) {
    throw new BadRequestException("更换 Bot ID 时请同时填写新的 Secret");
  }
  const botId = submittedBotId ?? existing?.smartBotId ?? "";
  const secret = submittedSecret
    ?? (botId === existing?.smartBotId ? decryptSecret(existing?.smartBotSecretEnc) : "");
  if (!botId || !secret) throw new BadRequestException("请填写智能机器人 Bot ID 和 Secret");
  return { botId, secret };
}

function assertSheetConnection(connection: ConnectionRecord): asserts connection is SheetConnectionRecord {
  if (!connection.guestSheetId || !connection.assignmentSheetId) {
    throw new BadRequestException("当前连接缺少智能表数据子表 ID");
  }
}

function assertLegacyApiConnection(connection: SheetConnectionRecord): asserts connection is LegacyApiConnectionRecord {
  if (!connection.integration) throw new BadRequestException("当前 API 连接缺少企业微信自建应用配置");
  if (!connection.docId) throw new BadRequestException("当前 API 连接缺少智能表文档 ID");
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message.slice(0, 1000);
  return fallback;
}

function maskPhone(phone: string): string {
  return phone.length >= 7 ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : "***";
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException("请求体必须是 JSON 对象");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === "" || typeof value === "undefined") return null;
  if (typeof value !== "string") throw new BadRequestException(`${field} 必须是字符串`);
  return value.trim() || null;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "boolean") throw new BadRequestException("enabled 必须是布尔值");
  return value;
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function ok<T>(data: T) {
  return { code: "OK", message: "ok", data };
}
