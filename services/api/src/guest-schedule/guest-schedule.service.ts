import { createHash } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  GuestScheduleSource,
  GuestScheduleType,
  NotificationChannelType,
  NotificationTaskStatus,
  NotificationTemplateStatus,
  Prisma,
  RegistrationStatus
} from "@prisma/client";
import { AdminNotificationsService } from "../admin/admin-notifications.service";
import { CurrentAdmin } from "../admin/current-admin";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import {
  GUEST_SCHEDULE_PAGE,
  GUEST_SCHEDULE_TEMPLATE_CODE,
  GUEST_SCHEDULE_TYPE_LABELS
} from "./guest-schedule.constants";

@Injectable()
export class GuestScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: AdminNotificationsService
  ) {}

  async listAdmin(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const conferenceId = readOptionalString(query.conferenceId);
    const type = query.type ? readScheduleType(query.type) : undefined;
    const state = readOptionalString(query.state)?.toUpperCase();
    const where: Prisma.GuestScheduleAssignmentWhereInput = {
      ...(conferenceId ? { conferenceId } : {}),
      ...(type ? { type } : {}),
      ...(state === "ARCHIVED" ? { archivedAt: { not: null } } : { archivedAt: null }),
      ...(state === "DRAFT" ? { publishedHash: null } : {}),
      ...(state === "CHANGED" ? { publishedHash: { not: null }, hasUnpublishedChanges: true } : {}),
      ...(state === "PUBLISHED" ? { publishedHash: { not: null }, hasUnpublishedChanges: false } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { location: { contains: keyword, mode: "insensitive" } },
              { role: { contains: keyword, mode: "insensitive" } },
              { shareTopic: { contains: keyword, mode: "insensitive" } },
              { tableNo: { contains: keyword, mode: "insensitive" } },
              { attendee: { name: { contains: keyword, mode: "insensitive" } } },
              { attendee: { phone: { contains: keyword } } },
              { attendee: { company: { contains: keyword, mode: "insensitive" } } },
              { attendee: { registration: { registrationNo: { contains: keyword, mode: "insensitive" } } } }
            ]
          }
        : {})
    };

    const [items, total, summary] = await Promise.all([
      this.prisma.guestScheduleAssignment.findMany({
        where,
        orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
        skip,
        take: pageSize,
        include: assignmentAdminInclude
      }),
      this.prisma.guestScheduleAssignment.count({ where }),
      this.getSummaryCounts(conferenceId)
    ]);

    return ok({
      items: items.map(formatAdminAssignment),
      total,
      page,
      pageSize,
      summary
    });
  }

  async listAttendees(query: Record<string, unknown>) {
    const conferenceId = readRequiredString(query, "conferenceId");
    const keyword = readOptionalString(query.keyword);
    const items = await this.prisma.registrationAttendee.findMany({
      where: {
        registration: { conferenceId, status: RegistrationStatus.CONFIRMED },
        ...(keyword
          ? {
              OR: [
                { name: { contains: keyword, mode: "insensitive" } },
                { phone: { contains: keyword } },
                { company: { contains: keyword, mode: "insensitive" } },
                { registration: { registrationNo: { contains: keyword, mode: "insensitive" } } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: 100,
      include: {
        sku: { select: { id: true, name: true } },
        registration: { select: { id: true, registrationNo: true, userId: true, status: true } }
      }
    });

    return ok({
      items: items.map((item) => ({
        id: item.id,
        name: item.name,
        phone: item.phone,
        company: item.company,
        title: item.title,
        sku: item.sku,
        registrationId: item.registration.id,
        registrationNo: item.registration.registrationNo,
        canReceiveMiniProgramMessage: Boolean(item.registration.userId)
      }))
    });
  }

  async create(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const attendee = await this.ensureAttendee(readRequiredString(body, "attendeeId"));
    const draft = readDraft(body);
    const item = await this.prisma.guestScheduleAssignment.create({
      data: {
        conferenceId: attendee.registration.conferenceId,
        attendeeId: attendee.id,
        ...draft,
        draftHash: hashDraft(draft),
        source: GuestScheduleSource.ADMIN,
        hasUnpublishedChanges: true
      },
      include: assignmentAdminInclude
    });
    await this.writeAudit(admin, AuditAction.CREATE, "GuestScheduleAssignment", item.id, "Create guest schedule assignment");
    return ok(formatAdminAssignment(item));
  }

  async update(id: string, input: unknown, admin: CurrentAdmin) {
    const existing = await this.prisma.guestScheduleAssignment.findUnique({ where: { id } });
    if (!existing || existing.archivedAt) throw new NotFoundException("嘉宾事项不存在");
    if (existing.source === GuestScheduleSource.WECOM_SMART_SHEET && existing.connectionId && existing.remoteRecordId) {
      throw new BadRequestException("企微智能表同步的事项请在智能表中修改，再回到后台同步并发布");
    }
    const body = readObject(input);
    const attendeeId = readOptionalString(body.attendeeId) ?? existing.attendeeId;
    const attendee = await this.ensureAttendee(attendeeId);
    if (attendee.registration.conferenceId !== existing.conferenceId) {
      throw new BadRequestException("不能把事项移动到其他会议的嘉宾");
    }
    const draft = readDraft(body, existing);
    const draftHash = hashDraft(draft);
    const item = await this.prisma.guestScheduleAssignment.update({
      where: { id },
      data: {
        attendeeId,
        ...draft,
        draftHash,
        hasUnpublishedChanges: draftHash !== existing.publishedHash,
        source: GuestScheduleSource.ADMIN
      },
      include: assignmentAdminInclude
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "GuestScheduleAssignment", id, "Update guest schedule assignment");
    return ok(formatAdminAssignment(item));
  }

  async archive(id: string, admin: CurrentAdmin) {
    const existing = await this.prisma.guestScheduleAssignment.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
    if (!existing) throw new NotFoundException("嘉宾事项不存在");
    if (!existing.archivedAt) {
      await this.prisma.guestScheduleAssignment.update({ where: { id }, data: { archivedAt: new Date() } });
      await this.writeAudit(admin, AuditAction.DELETE, "GuestScheduleAssignment", id, "Archive guest schedule assignment");
    }
    return ok({ id, archived: true });
  }

  async publish(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const ids = readStringArray(body.ids);
    if (ids.length === 0) throw new BadRequestException("请选择要发布的嘉宾事项");
    const notify = readOptionalBoolean(body.notify) ?? false;
    const assignments = await this.prisma.guestScheduleAssignment.findMany({
      where: { id: { in: ids }, archivedAt: null },
      include: assignmentAdminInclude
    });
    if (assignments.length !== new Set(ids).size) throw new BadRequestException("部分嘉宾事项不存在或已归档，请刷新后重试");

    const now = new Date();
    const userGroups = groupAssignmentsByUser(assignments);
    await this.prisma.$transaction([
      ...assignments.map((item) => {
        const snapshot = draftSnapshot(item);
        return this.prisma.guestScheduleAssignment.update({
          where: { id: item.id },
          data: {
            publishedSnapshotJson: snapshot as Prisma.InputJsonObject,
            publishedHash: item.draftHash,
            hasUnpublishedChanges: false,
            publishedAt: now,
            publishedById: admin.id
          }
        });
      }),
      ...userGroups.map((group) => this.prisma.userNotification.create({
        data: {
          userId: group.userId,
          type: "GUEST_SCHEDULE_PUBLISHED",
          title: `${group.conferenceTitle}会务安排已更新`,
          summary: buildScheduleNotificationSummary(group.assignments),
          route: `/pages/registrations/schedule?conferenceId=${group.conferenceId}`,
          sourceKey: `guest-schedule:${group.userId}:${group.conferenceId}:${now.getTime()}:${hashAssignmentIds(group.assignments)}`,
          payloadJson: {
            conferenceId: group.conferenceId,
            conferenceTitle: group.conferenceTitle,
            publishedAt: now.toISOString(),
            assignmentIds: group.assignments.map((item) => item.id),
            items: group.assignments.map((item) => ({
              id: item.id,
              type: item.type,
              typeLabel: GUEST_SCHEDULE_TYPE_LABELS[item.type],
              name: item.name,
              startsAt: item.startsAt.toISOString(),
              endsAt: item.endsAt?.toISOString() ?? null,
              location: item.location,
              role: item.role,
              tableNo: item.tableNo,
              isTableLeader: item.isTableLeader,
              shareTopic: item.shareTopic,
              notes: item.notes
            }))
          }
        }
      }))
    ]);
    await this.writeAudit(admin, AuditAction.UPDATE, "GuestScheduleAssignment", ids.join(","), "Publish guest schedule assignments", {
      count: assignments.length,
      notify
    });

    const notification = notify
      ? await this.sendPublishedNotification(assignments, admin)
      : { status: "NOT_REQUESTED", message: "已发布，未发送提醒" };

    return ok({
      publishedCount: assignments.length,
      publishedAt: now.toISOString(),
      notification
    });
  }

  async listMine(currentUser: CurrentUser, query: Record<string, unknown>) {
    const conferenceId = readOptionalString(query.conferenceId);
    const assignments = await this.prisma.guestScheduleAssignment.findMany({
      where: {
        archivedAt: null,
        publishedSnapshotJson: { not: Prisma.DbNull },
        ...(conferenceId ? { conferenceId } : {}),
        attendee: {
          registration: {
            userId: currentUser.id,
            status: RegistrationStatus.CONFIRMED
          }
        }
      },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
      include: {
        conference: { select: { id: true, title: true, coverImageUrl: true, location: true, startsAt: true, endsAt: true } },
        attendee: {
          select: {
            id: true,
            name: true,
            phone: true,
            company: true,
            title: true,
            registration: { select: { id: true, registrationNo: true } }
          }
        }
      }
    });

    const items = assignments.flatMap((item) => {
      const snapshot = parsePublishedSnapshot(item.publishedSnapshotJson);
      if (!snapshot) return [];
      return [{
        id: item.id,
        attendee: item.attendee,
        conference: {
          ...item.conference,
          startsAt: item.conference.startsAt.toISOString(),
          endsAt: item.conference.endsAt.toISOString()
        },
        ...snapshot,
        publishedAt: item.publishedAt?.toISOString() ?? null,
        updatedAt: item.publishedAt?.toISOString() ?? item.updatedAt.toISOString()
      }];
    }).sort((left, right) => {
      const timeDifference = new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime();
      return timeDifference || left.id.localeCompare(right.id);
    });

    return ok({ items, total: items.length });
  }

  async getSubscriptionConfig() {
    const template = await this.prisma.notificationTemplate.findUnique({ where: { code: GUEST_SCHEDULE_TEMPLATE_CODE } });
    const runtime = await this.notifications.getChannelRuntime(
      NotificationChannelType.WECHAT_SUBSCRIBE,
      template?.templateKey,
      template?.contentJson,
      GUEST_SCHEDULE_TEMPLATE_CODE
    );
    const templateId = template?.templateKey || runtime.templateKey || null;
    const enabled = Boolean(templateId && template?.status === NotificationTemplateStatus.ACTIVE && runtime.canSend);
    return ok({
      templateCode: GUEST_SCHEDULE_TEMPLATE_CODE,
      templateId,
      page: GUEST_SCHEDULE_PAGE,
      enabled,
      message: enabled
        ? "可申请接收会务安排更新提醒"
        : template?.status !== NotificationTemplateStatus.ACTIVE
          ? "管理员尚未启用会务安排订阅消息模板"
          : runtime.unavailableReason || "微信订阅消息通道尚未就绪"
    });
  }

  private async getSummaryCounts(conferenceId?: string) {
    const common: Prisma.GuestScheduleAssignmentWhereInput = {
      archivedAt: null,
      ...(conferenceId ? { conferenceId } : {})
    };
    const [total, draft, changed, published] = await Promise.all([
      this.prisma.guestScheduleAssignment.count({ where: common }),
      this.prisma.guestScheduleAssignment.count({ where: { ...common, publishedHash: null } }),
      this.prisma.guestScheduleAssignment.count({ where: { ...common, publishedHash: { not: null }, hasUnpublishedChanges: true } }),
      this.prisma.guestScheduleAssignment.count({ where: { ...common, publishedHash: { not: null }, hasUnpublishedChanges: false } })
    ]);
    return { total, draft, changed, published };
  }

  private async ensureAttendee(attendeeId: string) {
    const attendee = await this.prisma.registrationAttendee.findUnique({
      where: { id: attendeeId },
      include: { registration: { select: { id: true, conferenceId: true, userId: true, status: true } } }
    });
    if (!attendee || attendee.registration.status !== RegistrationStatus.CONFIRMED) {
      throw new BadRequestException("参会人不存在或报名已失效");
    }
    return attendee;
  }

  private async sendPublishedNotification(assignments: Array<AssignmentAdminRecord>, admin: CurrentAdmin) {
    const userGroups = groupAssignmentsByUser(assignments);
    if (userGroups.length === 0) {
      return { status: "SKIPPED", message: "这些嘉宾没有绑定小程序账号，安排已发布但无法推送" };
    }
    const template = await this.prisma.notificationTemplate.findUnique({ where: { code: GUEST_SCHEDULE_TEMPLATE_CODE } });
    if (!template || template.status !== NotificationTemplateStatus.ACTIVE) {
      return { status: "SKIPPED", message: "会务安排通知模板未启用，安排已发布但未推送" };
    }

    const taskIds: string[] = [];
    const errors: string[] = [];
    const updateTime = new Date().toISOString();
    let total = 0;
    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const group of userGroups) {
      try {
        const userIds = [group.userId];
        const assignmentName = buildScheduleNotificationSummary(group.assignments);
        const taskResult = await this.notifications.createTask(
          {
            name: `${group.conferenceTitle} - 嘉宾会务安排更新`,
            templateId: template.id,
            status: NotificationTaskStatus.PENDING,
            targetType: "GUEST_SCHEDULE",
            userIds,
            payloadJson: {
              userIds,
              page: GUEST_SCHEDULE_PAGE,
              variables: {
                conferenceTitle: group.conferenceTitle,
                assignmentName,
                updateTime,
                "会议名称": group.conferenceTitle,
                "安排名称": assignmentName,
                "更新时间": updateTime
              }
            }
          },
          admin
        ) as { data?: { id?: string } };
        const taskId = taskResult.data?.id;
        if (!taskId) throw new Error("通知任务创建后未返回任务 ID");
        taskIds.push(taskId);

        const sendResult = await this.notifications.sendNow(taskId, admin) as {
          data?: { result?: { successCount?: number; failedCount?: number; skippedCount?: number; total?: number } }
        };
        const result = sendResult.data?.result ?? {};
        const groupSuccessCount = result.successCount ?? 0;
        total += result.total ?? 1;
        successCount += groupSuccessCount;
        failedCount += result.failedCount ?? 0;
        skippedCount += result.skippedCount ?? 0;

        if (groupSuccessCount > 0) {
          try {
            await this.prisma.guestScheduleAssignment.updateMany({
              where: { id: { in: group.assignments.map((item) => item.id) } },
              data: { lastNotifiedAt: new Date() }
            });
          } catch (error) {
            errors.push(error instanceof Error ? `提醒已发送，但发送状态记录失败：${error.message}` : "提醒已发送，但发送状态记录失败");
          }
        }
      } catch (error) {
        total += 1;
        failedCount += 1;
        errors.push(error instanceof Error ? error.message : "未知错误");
      }
    }

    const status = successCount > 0
      ? failedCount > 0 || skippedCount > 0 || errors.length > 0 ? "PARTIAL_FAILED" : "SENT"
      : failedCount > 0 ? "FAILED" : "SKIPPED";
    const message = status === "SENT"
      ? "安排已发布并发送提醒"
      : status === "PARTIAL_FAILED"
        ? "安排已发布；部分提醒未成功，请查看通知任务原因"
        : status === "FAILED"
          ? `安排已发布，但提醒发送失败${errors[0] ? `：${errors[0]}` : ""}`
          : "安排已发布；提醒未发送，请查看通知任务原因";

    return {
      status,
      taskId: taskIds[0] ?? null,
      taskIds,
      total,
      successCount,
      failedCount,
      skippedCount,
      message
    };
  }

  private writeAudit(
    admin: CurrentAdmin,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summary: string,
    metadataJson?: Prisma.InputJsonValue
  ) {
    return this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson }
    });
  }
}

function groupAssignmentsByUser(assignments: AssignmentAdminRecord[]) {
  const groups = new Map<string, {
    userId: string;
    conferenceId: string;
    conferenceTitle: string;
    assignments: AssignmentAdminRecord[];
  }>();
  for (const assignment of assignments) {
    const userId = assignment.attendee.registration.userId;
    if (!userId) continue;
    const key = `${userId}:${assignment.conferenceId}`;
    const group = groups.get(key) ?? {
      userId,
      conferenceId: assignment.conferenceId,
      conferenceTitle: assignment.conference.title,
      assignments: []
    };
    group.assignments.push(assignment);
    groups.set(key, group);
  }
  return Array.from(groups.values());
}

function buildScheduleNotificationSummary(assignments: AssignmentAdminRecord[]) {
  const names = assignments.slice(0, 3).map((item) => item.name).join("、");
  return assignments.length > 3 ? `${names}等 ${assignments.length} 项安排` : names;
}

function hashAssignmentIds(assignments: AssignmentAdminRecord[]) {
  return createHash("sha256")
    .update(assignments.map((item) => item.id).sort().join(","))
    .digest("hex")
    .slice(0, 12);
}

const assignmentAdminInclude = {
  conference: { select: { id: true, title: true } },
  attendee: {
    include: {
      sku: { select: { id: true, name: true } },
      registration: { select: { id: true, registrationNo: true, userId: true, status: true } }
    }
  },
  connection: { select: { id: true, docUrl: true, assignmentSheetId: true, lastSyncAt: true } },
  publishedBy: { select: { id: true, displayName: true, username: true } }
} satisfies Prisma.GuestScheduleAssignmentInclude;

type AssignmentAdminRecord = Prisma.GuestScheduleAssignmentGetPayload<{ include: typeof assignmentAdminInclude }>;

function formatAdminAssignment(item: AssignmentAdminRecord) {
  return {
    ...item,
    state: item.archivedAt
      ? "ARCHIVED"
      : !item.publishedHash
        ? "DRAFT"
        : item.hasUnpublishedChanges
          ? "CHANGED"
          : "PUBLISHED",
    typeLabel: GUEST_SCHEDULE_TYPE_LABELS[item.type],
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    remoteUpdatedAt: item.remoteUpdatedAt?.toISOString() ?? null,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    lastNotifiedAt: item.lastNotifiedAt?.toISOString() ?? null,
    archivedAt: item.archivedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    connection: item.connection
      ? { ...item.connection, lastSyncAt: item.connection.lastSyncAt?.toISOString() ?? null }
      : null
  };
}

export type GuestScheduleDraft = {
  type: GuestScheduleType;
  name: string;
  startsAt: Date;
  endsAt: Date | null;
  location: string | null;
  role: string | null;
  tableNo: string | null;
  isTableLeader: boolean;
  shareTopic: string | null;
  notes: string | null;
};

function readDraft(input: Record<string, unknown>, fallback?: Partial<GuestScheduleDraft>): GuestScheduleDraft {
  const type = typeof input.type !== "undefined" ? readScheduleType(input.type) : fallback?.type;
  const name = typeof input.name !== "undefined" ? readRequiredString(input, "name") : fallback?.name;
  const startsAt = typeof input.startsAt !== "undefined" ? readDate(input.startsAt, "startsAt") : fallback?.startsAt;
  if (!type || !name || !startsAt) throw new BadRequestException("事项类型、名称和开始时间不能为空");
  const endsAt = typeof input.endsAt !== "undefined" ? readNullableDate(input.endsAt, "endsAt") : fallback?.endsAt ?? null;
  if (endsAt && endsAt.getTime() < startsAt.getTime()) throw new BadRequestException("结束时间不能早于开始时间");
  return {
    type,
    name,
    startsAt,
    endsAt,
    location: typeof input.location !== "undefined" ? readNullableString(input.location, "location") : fallback?.location ?? null,
    role: typeof input.role !== "undefined" ? readNullableString(input.role, "role") : fallback?.role ?? null,
    tableNo: typeof input.tableNo !== "undefined" ? readNullableString(input.tableNo, "tableNo") : fallback?.tableNo ?? null,
    isTableLeader: typeof input.isTableLeader !== "undefined" ? readBoolean(input.isTableLeader, "isTableLeader") : fallback?.isTableLeader ?? false,
    shareTopic: typeof input.shareTopic !== "undefined" ? readNullableString(input.shareTopic, "shareTopic") : fallback?.shareTopic ?? null,
    notes: typeof input.notes !== "undefined" ? readNullableString(input.notes, "notes") : fallback?.notes ?? null
  };
}

function draftSnapshot(item: GuestScheduleDraft & { id: string }): Prisma.InputJsonObject {
  return {
    id: item.id,
    type: item.type,
    typeLabel: GUEST_SCHEDULE_TYPE_LABELS[item.type],
    name: item.name,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt?.toISOString() ?? null,
    location: item.location,
    role: item.role,
    tableNo: item.tableNo,
    isTableLeader: item.isTableLeader,
    shareTopic: item.shareTopic,
    notes: item.notes
  } as Prisma.InputJsonObject;
}

function parsePublishedSnapshot(value: Prisma.JsonValue | null) {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" ? value.type : "OTHER";
  const name = typeof value.name === "string" ? value.name : "会务安排";
  const startsAt = typeof value.startsAt === "string" ? value.startsAt : null;
  if (!startsAt) return null;
  return {
    type,
    typeLabel: typeof value.typeLabel === "string" ? value.typeLabel : type,
    name,
    startsAt,
    endsAt: typeof value.endsAt === "string" ? value.endsAt : null,
    location: typeof value.location === "string" ? value.location : null,
    role: typeof value.role === "string" ? value.role : null,
    tableNo: typeof value.tableNo === "string" ? value.tableNo : null,
    isTableLeader: value.isTableLeader === true,
    shareTopic: typeof value.shareTopic === "string" ? value.shareTopic : null,
    notes: typeof value.notes === "string" ? value.notes : null
  };
}

export function hashDraft(draft: GuestScheduleDraft): string {
  return createHash("sha256")
    .update(JSON.stringify({
      type: draft.type,
      name: draft.name,
      startsAt: draft.startsAt.toISOString(),
      endsAt: draft.endsAt?.toISOString() ?? null,
      location: draft.location,
      role: draft.role,
      tableNo: draft.tableNo,
      isTableLeader: draft.isTableLeader,
      shareTopic: draft.shareTopic,
      notes: draft.notes
    }))
    .digest("hex");
}

function readScheduleType(value: unknown): GuestScheduleType {
  const normalized = typeof value === "string" ? value.trim().toUpperCase() : "";
  if ((Object.values(GuestScheduleType) as string[]).includes(normalized)) return normalized as GuestScheduleType;
  throw new BadRequestException("不支持的事项类型");
}

function readPage(query: Record<string, unknown>) {
  const page = clampInt(query.page, 1, 1, 100000);
  const pageSize = clampInt(query.pageSize, 20, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException("请求体必须是 JSON 对象");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} 不能为空`);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown, field: string): string | null {
  if (value === null || value === "" || typeof value === "undefined") return null;
  if (typeof value !== "string") throw new BadRequestException(`${field} 必须是字符串`);
  return value.trim() || null;
}

function readDate(value: unknown, field: string): Date {
  if (typeof value !== "string" && typeof value !== "number") throw new BadRequestException(`${field} 时间格式不正确`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${field} 时间格式不正确`);
  return date;
}

function readNullableDate(value: unknown, field: string): Date | null {
  if (value === null || value === "") return null;
  return readDate(value, field);
}

function readBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${field} 必须是布尔值`);
  return value;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "undefined") return undefined;
  return readBoolean(value, "value");
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) throw new BadRequestException("ids 必须是数组");
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())));
}

function ok<T>(data: T) {
  return { code: "OK", message: "ok", data };
}
