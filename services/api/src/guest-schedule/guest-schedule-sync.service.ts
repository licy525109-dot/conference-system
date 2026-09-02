import { createHash } from "node:crypto";
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
import { WecomTokenService } from "../wecom/services/wecom-token.service";
import {
  AssignmentFieldMapping,
  DEFAULT_ASSIGNMENT_FIELD_MAPPING,
  DEFAULT_GUEST_FIELD_MAPPING,
  GuestFieldMapping,
  GUEST_SCHEDULE_TYPE_LABELS,
  mergeFieldMapping
} from "./guest-schedule.constants";
import { GuestScheduleDraft, hashDraft } from "./guest-schedule.service";

@Injectable()
export class GuestScheduleSyncService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: WecomClientAdapter,
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
        guestFieldMapping: DEFAULT_GUEST_FIELD_MAPPING,
        assignmentFieldMapping: DEFAULT_ASSIGNMENT_FIELD_MAPPING,
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

  async saveConfig(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    await this.ensureConference(conferenceId);
    const body = readObject(input);
    const existing = await this.prisma.wecomSmartSheetConnection.findUnique({ where: { conferenceId } });
    const integrationId = readOptionalString(body.integrationId) ?? existing?.integrationId ?? (await this.getDefaultIntegrationId());
    const integration = await this.prisma.wecomIntegration.findUnique({ where: { id: integrationId } });
    if (!integration) throw new BadRequestException("请选择有效的企业微信自建应用配置");

    const docId = readOptionalString(body.docId) ?? existing?.docId;
    const guestSheetId = readOptionalString(body.guestSheetId) ?? existing?.guestSheetId;
    const assignmentSheetId = readOptionalString(body.assignmentSheetId) ?? existing?.assignmentSheetId;
    if (!docId || !guestSheetId || !assignmentSheetId) {
      throw new BadRequestException("文档 ID、报名嘉宾子表 ID 和嘉宾事项子表 ID 均不能为空");
    }
    const enabled = readOptionalBoolean(body.enabled) ?? existing?.enabled ?? false;
    if (enabled && (!integration.enabled || !integration.corpId || !integration.appSecretEnc)) {
      throw new BadRequestException("启用同步前，请先完成并启用企业微信自建应用配置");
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
    const assignmentFieldMapping = mergeFieldMapping(
      DEFAULT_ASSIGNMENT_FIELD_MAPPING,
      body.assignmentFieldMapping ?? existing?.assignmentFieldMappingJson
    );

    const connection = await this.prisma.wecomSmartSheetConnection.upsert({
      where: { conferenceId },
      create: {
        conferenceId,
        integrationId,
        docId,
        docUrl: readOptionalString(body.docUrl),
        guestSheetId,
        assignmentSheetId,
        guestFieldMappingJson: guestFieldMapping,
        assignmentFieldMappingJson: assignmentFieldMapping,
        enabled,
        syncIntervalSeconds
      },
      update: {
        integrationId,
        docId,
        docUrl: typeof body.docUrl !== "undefined" ? readNullableString(body.docUrl, "docUrl") : existing?.docUrl,
        guestSheetId,
        assignmentSheetId,
        guestFieldMappingJson: guestFieldMapping,
        assignmentFieldMappingJson: assignmentFieldMapping,
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
      assignmentSheetId
    });
    return ok(formatConnection(connection));
  }

  async check(conferenceId: string) {
    const connection = await this.getConnection(conferenceId);
    const { accessToken } = await this.tokens.getAccessToken(connection.integration, "self_built_app", true);
    const [guestFields, assignmentFields] = await Promise.all([
      this.client.getSmartSheetFields(accessToken, connection.docId, connection.guestSheetId),
      this.client.getSmartSheetFields(accessToken, connection.docId, connection.assignmentSheetId)
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
      const { accessToken } = await this.tokens.getAccessToken(connection.integration, "self_built_app");

      try {
        guestResult = await this.pushGuestRows(connection, accessToken);
      } catch (error) {
        errors.push(errorMessage(error, "报名嘉宾写入失败"));
      }
      try {
        assignmentResult = await this.pullAssignmentRows(connection, accessToken);
      } catch (error) {
        errors.push(errorMessage(error, "嘉宾事项读取失败"));
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

  private async pushGuestRows(connection: ConnectionRecord, accessToken: string): Promise<GuestSyncResult> {
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
      const recordIds = await this.client.addSmartSheetRecords(
        accessToken,
        connection.docId,
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
      await this.client.updateSmartSheetRecords(
        accessToken,
        connection.docId,
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

  private async pullAssignmentRows(connection: ConnectionRecord, accessToken: string): Promise<AssignmentSyncResult> {
    const [records, fields] = await Promise.all([
      this.client.getSmartSheetRecords(accessToken, connection.docId, connection.assignmentSheetId),
      this.client.getSmartSheetFields(accessToken, connection.docId, connection.assignmentSheetId)
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
        await this.client.updateSmartSheetRecords(accessToken, connection.docId, connection.assignmentSheetId, batch);
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
    const millis = primitive < 10_000_000_000 ? primitive * 1000 : primitive;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const numeric = /^\d{10,13}$/.test(primitive) ? Number(primitive) : Number.NaN;
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
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
    for (const key of ["timestamp", "value", "date", "text"]) {
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

function formatConnection(connection: Prisma.WecomSmartSheetConnectionGetPayload<{
  include: { integration: { select: { id: true; name: true; enabled: true; verified: true; corpId: true; agentId: true; appSecretEnc: true } } };
}>) {
  return {
    id: connection.id,
    conferenceId: connection.conferenceId,
    integrationId: connection.integrationId,
    docId: connection.docId,
    docUrl: connection.docUrl,
    guestSheetId: connection.guestSheetId,
    assignmentSheetId: connection.assignmentSheetId,
    guestFieldMapping: mergeFieldMapping(DEFAULT_GUEST_FIELD_MAPPING, connection.guestFieldMappingJson),
    assignmentFieldMapping: mergeFieldMapping(DEFAULT_ASSIGNMENT_FIELD_MAPPING, connection.assignmentFieldMappingJson),
    enabled: connection.enabled,
    syncIntervalSeconds: connection.syncIntervalSeconds,
    syncing: Boolean(connection.syncLockedAt),
    lastGuestPushedAt: connection.lastGuestPushedAt?.toISOString() ?? null,
    lastAssignmentPulledAt: connection.lastAssignmentPulledAt?.toISOString() ?? null,
    lastSyncAt: connection.lastSyncAt?.toISOString() ?? null,
    lastSyncStatus: connection.lastSyncStatus,
    lastError: connection.lastError,
    createdAt: connection.createdAt.toISOString(),
    updatedAt: connection.updatedAt.toISOString(),
    integration: formatIntegrationOption(connection.integration)
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
