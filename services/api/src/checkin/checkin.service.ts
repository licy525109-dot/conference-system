import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, CheckInStatus, CheckinActionType, OrderStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import { parseCheckinCredentialPayload } from "./checkin-credential";

export type CheckinMethod = "QR_SCAN" | "SELF_PHONE_NAME" | "SELF_CUSTOM_FIELDS" | "ADMIN_MANUAL";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

const VALID_METHODS: CheckinMethod[] = ["QR_SCAN", "SELF_PHONE_NAME", "SELF_CUSTOM_FIELDS", "ADMIN_MANUAL"];
const DEFAULT_ENABLED_METHODS: CheckinMethod[] = ["QR_SCAN", "ADMIN_MANUAL"];

@Injectable()
export class CheckinService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicConfig(conferenceId: string): Promise<ApiResponse<unknown>> {
    const conference = await this.findConferenceWithFields(conferenceId);
    return ok(formatCheckinConfig(conference));
  }

  async getMyStatus(registrationId: string, currentUser: CurrentUser): Promise<ApiResponse<unknown>> {
    if (!registrationId) throw new BadRequestException("registrationId is required");
    const registration = await this.prisma.registration.findFirst({
      where: { id: registrationId, userId: currentUser.id },
      include: { attendees: { orderBy: { createdAt: "asc" }, take: 1 }, conference: true }
    });
    if (!registration) throw new NotFoundException("未找到报名记录");
    const attendee = registration.attendees[0] ?? null;
    return ok({
      registrationId: registration.id,
      registrationNo: registration.registrationNo,
      conferenceId: registration.conferenceId,
      enabled: registration.conference.checkInEnabled,
      status: attendee?.checkInStatus ?? CheckInStatus.NOT_REQUIRED,
      checkedInAt: attendee?.checkedInAt?.toISOString() ?? null,
      message: registration.conference.checkInEnabled ? checkInStatusText(attendee?.checkInStatus) : "本会议无需签到核销"
    });
  }

  async selfCheckin(input: unknown, currentUser: CurrentUser): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const conferenceId = readRequiredString(body, "conferenceId");
    const requestedMethod = readOptionalString(body.method);
    const method = requestedMethod === "SELF_CUSTOM_FIELDS" ? "SELF_CUSTOM_FIELDS" : "SELF_PHONE_NAME";
    const values = readObject(body.values);
    const conference = await this.findConferenceWithFields(conferenceId);
    const config = formatCheckinConfig(conference);

    assertCheckinAvailable(config);
    if (!config.methods.includes(method)) {
      throw new ConflictException("当前会议未启用客户自助签到");
    }

    const registration = await this.findUserRegistration(conferenceId, readOptionalString(body.registrationId), currentUser);
    assertPaidRegistration(registration);
    const attendee = pickPrimaryAttendee(registration.attendees);
    if (attendee.checkInStatus === CheckInStatus.CHECKED_IN) {
      return ok(alreadyCheckedInResponse(attendee, registration, "已签到，无需重复核销"));
    }
    if (attendee.checkInStatus === CheckInStatus.CANCELLED) {
      throw new ConflictException("报名已取消，不能签到");
    }

    const matchedFields = method === "SELF_CUSTOM_FIELDS"
      ? this.matchCustomFields(config, registration, attendee, values)
      : this.matchPhoneAndName(config, registration, attendee, values);

    const updated = await this.completeCheckin({
      attendee,
      action: CheckinActionType.SELF_INPUT,
      method: "SELF_INPUT",
      operatorUserId: currentUser.id,
      matchedFields
    });
    return ok(successCheckinResponse(updated, registration, "签到完成"));
  }

  async scanCheckin(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const rawPayload = readRequiredString(body, "qrPayload");
    const parsed = parseCheckinCredentialPayload(rawPayload);
    if (!parsed.registrationId) {
      throw new BadRequestException("二维码无效或已过期");
    }
    const registration = await this.prisma.registration.findFirst({
      where: { id: parsed.registrationId, registrationNo: parsed.registrationNo },
      include: registrationCheckinInclude
    });
    if (!registration) throw new NotFoundException("未找到报名");
    const config = formatCheckinConfig(await this.findConferenceWithFields(registration.conferenceId));
    assertCheckinAvailable(config);
    if (!config.methods.includes("QR_SCAN")) {
      throw new ConflictException("当前会议未启用二维码扫码核销");
    }
    assertPaidRegistration(registration);
    const attendee = pickPrimaryAttendee(registration.attendees);
    if (attendee.checkInStatus === CheckInStatus.CHECKED_IN) {
      return ok(alreadyCheckedInResponse(attendee, registration, "已签到，无需重复核销"));
    }
    if (attendee.checkInStatus === CheckInStatus.CANCELLED) {
      throw new ConflictException("报名已取消，不能签到");
    }

    const updated = await this.completeCheckin({
      attendee,
      action: CheckinActionType.QR_SCAN,
      method: "QR_SCAN",
      operatorId: admin.id,
      remark: readOptionalString(body.remark)
    });
    return ok(successCheckinResponse(updated, registration, "签到成功"));
  }

  async getStaffMe(currentUser: CurrentUser): Promise<ApiResponse<unknown>> {
    const assignments = await this.prisma.checkinStaffAssignment.findMany({
      where: { userId: currentUser.id, enabled: true },
      include: { conference: { select: { id: true, title: true } }, user: staffUserSelect },
      orderBy: [{ createdAt: "desc" }]
    });
    return ok(formatStaffMe(currentUser.id, assignments));
  }

  async staffScanCheckin(input: unknown, currentUser: CurrentUser): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const rawPayload = readRequiredString(body, "qrPayload");
    const parsed = parseCheckinCredentialPayload(rawPayload);
    if (!parsed.registrationId) throw new BadRequestException("二维码无效或已过期");
    const registration = await this.prisma.registration.findFirst({
      where: { id: parsed.registrationId, registrationNo: parsed.registrationNo },
      include: registrationCheckinInclude
    });
    if (!registration) throw new NotFoundException("未找到报名");
    await this.assertStaffCanScan(currentUser.id, registration.conferenceId);
    const config = formatCheckinConfig(await this.findConferenceWithFields(registration.conferenceId));
    assertCheckinAvailable(config);
    if (!config.methods.includes("QR_SCAN")) throw new ConflictException("当前会议未启用二维码扫码核销");
    assertPaidRegistration(registration);
    const attendee = pickPrimaryAttendee(registration.attendees);
    if (attendee.checkInStatus === CheckInStatus.CHECKED_IN) {
      return ok(alreadyCheckedInResponse(attendee, registration, "已签到，无需重复核销"));
    }
    if (attendee.checkInStatus === CheckInStatus.CANCELLED) throw new ConflictException("报名已取消，不能签到");

    const updated = await this.completeCheckin({
      attendee,
      action: CheckinActionType.QR_SCAN,
      method: "QR_SCAN",
      operatorUserId: currentUser.id,
      remark: readOptionalString(body.remark)
    });
    return ok(successCheckinResponse(updated, registration, "签到成功"));
  }

  async adminManualCheckin(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const attendeeId = readOptionalString(body.attendeeId);
    const attendee = attendeeId
      ? await this.prisma.registrationAttendee.findUnique({
          where: { id: attendeeId },
          include: { registration: { include: registrationCheckinInclude } }
        })
      : await this.findAttendeeByCredential(readRequiredString(body, "credentialCode"));
    if (!attendee) throw new NotFoundException("Registration attendee not found");
    const registration = attendee.registration;
    const config = formatCheckinConfig(await this.findConferenceWithFields(registration.conferenceId));
    assertCheckinAvailable(config);
    if (!config.methods.includes("ADMIN_MANUAL")) {
      throw new ConflictException("当前会议未启用后台应急补签");
    }
    assertPaidRegistration(registration);
    if (attendee.checkInStatus === CheckInStatus.CHECKED_IN) {
      return ok(alreadyCheckedInResponse(attendee, registration, "已签到，无需重复核销"));
    }
    if (attendee.checkInStatus === CheckInStatus.CANCELLED) {
      throw new ConflictException("报名已取消，不能补签");
    }

    const updated = await this.completeCheckin({
      attendee,
      action: CheckinActionType.ADMIN_MANUAL,
      method: "ADMIN_MANUAL",
      operatorId: admin.id,
      remark: readOptionalString(body.remark)
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "CheckinLog", updated.logId ?? null, "Admin emergency check-in", {
      attendeeId: attendee.id,
      registrationId: registration.id,
      registrationNo: registration.registrationNo
    });
    return ok(successCheckinResponse(updated, registration, "签到成功"));
  }

  async revoke(attendeeId: string, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const attendee = await this.prisma.registrationAttendee.findUnique({
      where: { id: attendeeId },
      include: { registration: { include: { conference: true } } }
    });
    if (!attendee) throw new NotFoundException("Registration attendee not found");
    if (attendee.checkInStatus !== CheckInStatus.CHECKED_IN) {
      throw new ConflictException("仅已核销记录可撤销");
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.registrationAttendee.update({
        where: { id: attendeeId },
        data: { checkInStatus: CheckInStatus.PENDING, checkedInAt: null, checkedInBy: null }
      });
      await tx.checkinLog.create({
        data: {
          attendeeId,
          registrationId: attendee.registrationId,
          action: CheckinActionType.REVOKE,
          method: "REVOKE",
          result: "SUCCESS",
          beforeStatus: attendee.checkInStatus,
          afterStatus: CheckInStatus.PENDING,
          operatorId: admin.id
        }
      });
      return next;
    });
    return ok(formatDateFields(updated));
  }

  async listRecords(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const { page, pageSize, skip } = readPage(query);
    const conferenceId = readOptionalString(query.conferenceId);
    const method = readOptionalString(query.method);
    const result = readOptionalString(query.result);
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.CheckinLogWhereInput = {
      ...(conferenceId ? { registration: { conferenceId } } : {}),
      ...(method ? { method } : {}),
      ...(result ? { result } : {}),
      ...(keyword ? { OR: [
        { registration: { registrationNo: { contains: keyword, mode: "insensitive" } } },
        { registration: { attendeeName: { contains: keyword, mode: "insensitive" } } },
        { registration: { user: { wechatNickname: { contains: keyword, mode: "insensitive" } } } },
        { attendee: { phone: { contains: keyword, mode: "insensitive" } } }
      ] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.checkinLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: {
          registration: { select: { registrationNo: true, attendeeName: true, phone: true, conference: { select: { title: true } }, user: { select: userPublicSelect } } },
          attendee: { select: { name: true, phone: true, formDataJson: true } },
          operator: { select: { username: true, displayName: true } }
        }
      }),
      this.prisma.checkinLog.count({ where })
    ]);

    return ok({
      items: items.map((item) => ({
        id: item.id,
        conferenceTitle: item.registration.conference.title,
        wechatAvatarUrl: item.registration.user?.wechatAvatarUrl ?? null,
        wechatNickname: item.registration.user?.wechatNickname ?? item.registration.user?.nickname ?? null,
        registrationNo: item.registration.registrationNo,
        attendeeName: item.attendee.name || item.registration.attendeeName,
        phone: item.attendee.phone || item.registration.phone,
        method: item.method ?? actionToMethod(item.action),
        action: item.action,
        result: item.result ?? "SUCCESS",
        beforeStatus: item.beforeStatus,
        afterStatus: item.afterStatus,
        matchedFields: item.matchedFields,
        failureReason: item.failureReason,
        operatorName: item.operator?.displayName ?? item.operator?.username ?? item.operatorUserId ?? "用户本人",
        remark: item.remark,
        createdAt: item.createdAt.toISOString()
      })),
      total,
      page,
      pageSize
    });
  }

  async statistics(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const conferenceId = readOptionalString(query.conferenceId);
    const checkInStatus = readOptionalString(query.checkInStatus);
    const paymentStatus = readOptionalString(query.paymentStatus);
    const skuId = readOptionalString(query.skuId);
    const method = readOptionalString(query.method);
    const keyword = readOptionalString(query.keyword);
    const attendeeWhere: Prisma.RegistrationAttendeeWhereInput = {
      ...(conferenceId ? { registration: { conferenceId } } : {}),
      ...(skuId ? { skuId } : {}),
      ...(checkInStatus ? { checkInStatus: checkInStatus as CheckInStatus } : {}),
      ...(paymentStatus ? { registration: { ...(conferenceId ? { conferenceId } : {}), order: { status: paymentStatus as OrderStatus } } } : {}),
      ...(keyword ? { OR: [
        { name: { contains: keyword, mode: "insensitive" } },
        { phone: { contains: keyword, mode: "insensitive" } },
        { registration: { registrationNo: { contains: keyword, mode: "insensitive" } } },
        { registration: { attendeeName: { contains: keyword, mode: "insensitive" } } },
        { registration: { user: { wechatNickname: { contains: keyword, mode: "insensitive" } } } }
      ] } : {})
    };
    const registrationWhere: Prisma.RegistrationWhereInput = conferenceId ? { conferenceId } : {};
    const [registeredCount, paidCount, attendees, logs] = await this.prisma.$transaction([
      this.prisma.registration.count({ where: registrationWhere }),
      this.prisma.registration.count({ where: { ...registrationWhere, order: { status: OrderStatus.PAID } } }),
      this.prisma.registrationAttendee.findMany({ where: attendeeWhere, include: checkinStatsAttendeeInclude }),
      this.prisma.checkinLog.findMany({
        where: {
          ...(conferenceId ? { registration: { conferenceId } } : {}),
          ...(method ? { method } : {})
        },
        include: checkinStatsLogInclude,
        orderBy: { createdAt: "asc" }
      })
    ]);
    const checkedIn = attendees.filter((item) => item.checkInStatus === CheckInStatus.CHECKED_IN).length;
    const pending = attendees.filter((item) => item.checkInStatus === CheckInStatus.PENDING).length;
    const notRequired = attendees.filter((item) => item.checkInStatus === CheckInStatus.NOT_REQUIRED).length;
    const total = attendees.length;
    const latestSuccessLogByAttendee = new Map<string, CheckinStatsLog>();
    for (const log of logs) {
      if (log.afterStatus === CheckInStatus.CHECKED_IN) {
        latestSuccessLogByAttendee.set(log.attendeeId, log);
      }
    }
    const paidAttendees = attendees.filter((item) => item.registration.order?.status === OrderStatus.PAID);
    const attendeeRows = paidAttendees.map((item) => formatCheckinAttendeeRow(item, latestSuccessLogByAttendee.get(item.id) ?? null));
    const checkedInList = attendeeRows.filter((item) => item.checkInStatus === CheckInStatus.CHECKED_IN);
    const uncheckedInList = attendeeRows.filter((item) => item.checkInStatus !== CheckInStatus.CHECKED_IN);
    const failedList = logs.filter((log) => log.result === "FAILED").map(formatCheckinLogRow);
    const repeatedList = logs.filter((log) => log.failureReason === "DUPLICATE_CHECKIN" || log.result === "DUPLICATE").map(formatCheckinLogRow);

    return ok({
      registeredCount,
      paidCount,
      total,
      checkedIn,
      pending,
      notRequired,
      uncheckedIn: Math.max(0, paidCount - checkedIn),
      failedCount: failedList.length,
      repeatedCount: repeatedList.length,
      checkInRate: paidCount > 0 ? Number((checkedIn / paidCount).toFixed(4)) : 0,
      bySku: aggregateBy(attendees, (item) => item.sku.name, (rows) => ({
        total: rows.length,
        checkedIn: rows.filter((item) => item.checkInStatus === CheckInStatus.CHECKED_IN).length
      })),
      byMethod: aggregateBy(logs.filter((log) => log.afterStatus === CheckInStatus.CHECKED_IN), (log) => log.method ?? actionToMethod(log.action), (rows) => ({ count: rows.length })),
      byHour: aggregateBy(logs.filter((log) => log.afterStatus === CheckInStatus.CHECKED_IN), (log) => log.createdAt.toISOString().slice(0, 13) + ":00:00.000Z", (rows) => ({ count: rows.length })),
      checkedInList,
      uncheckedInList,
      paidList: attendeeRows,
      registeredList: attendees.map((item) => formatCheckinAttendeeRow(item, latestSuccessLogByAttendee.get(item.id) ?? null)),
      failedList,
      repeatedList,
      emptyReason: conferenceId && total === 0 ? "当前会议未开启签到或暂无报名人员" : "当前筛选条件无结果"
    });
  }

  async listStaffAssignments(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query.keyword);
    const conferenceId = readOptionalString(query.conferenceId);
    const where: Prisma.CheckinStaffAssignmentWhereInput = {
      ...(conferenceId ? { OR: [{ conferenceId }, { conferenceId: null }] } : {}),
      ...(keyword ? { user: { OR: [
        { nickname: { contains: keyword, mode: "insensitive" } },
        { wechatNickname: { contains: keyword, mode: "insensitive" } },
        { phone: { contains: keyword, mode: "insensitive" } },
        { openid: { contains: keyword, mode: "insensitive" } }
      ] } } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.checkinStaffAssignment.findMany({
        where,
        include: { user: staffUserSelect, conference: { select: { id: true, title: true } } },
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize
      }),
      this.prisma.checkinStaffAssignment.count({ where })
    ]);
    return ok({ items: items.map(formatStaffAssignment), total, page, pageSize });
  }

  async createStaffAssignment(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const userId = readRequiredString(body, "userId");
    const conferenceId = readOptionalString(body.conferenceId) ?? null;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundException("User not found");
    if (conferenceId) {
      const conference = await this.prisma.conference.findUnique({ where: { id: conferenceId }, select: { id: true } });
      if (!conference) throw new NotFoundException("Conference not found");
    }
    const assignment = await this.prisma.checkinStaffAssignment.create({
      data: {
        userId,
        conferenceId,
        enabled: readOptionalBoolean(body.enabled) ?? true,
        permissions: ["checkin:write"],
        remark: readOptionalString(body.remark),
        createdBy: admin.id
      },
      include: { user: staffUserSelect, conference: { select: { id: true, title: true } } }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CheckinStaffAssignment", assignment.id, "Grant check-in staff permission", { userId, conferenceId });
    return ok(formatStaffAssignment(assignment));
  }

  async updateStaffAssignment(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const enabled = readOptionalBoolean(body.enabled);
    const assignment = await this.prisma.checkinStaffAssignment.update({
      where: { id },
      data: {
        ...(typeof enabled === "boolean" ? { enabled, disabledAt: enabled ? null : new Date() } : {}),
        ...(typeof body.remark !== "undefined" ? { remark: readOptionalString(body.remark) ?? null } : {})
      },
      include: { user: staffUserSelect, conference: { select: { id: true, title: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "CheckinStaffAssignment", id, enabled ? "Update check-in staff permission" : "Disable check-in staff permission", {
      userId: assignment.userId,
      conferenceId: assignment.conferenceId,
      enabled: assignment.enabled
    });
    return ok(formatStaffAssignment(assignment));
  }

  private matchPhoneAndName(
    config: ReturnType<typeof formatCheckinConfig>,
    registration: RegistrationForCheckin,
    attendee: RegistrationForCheckin["attendees"][number],
    values: Record<string, unknown>
  ) {
    const phoneKey = config.fieldBindings.phoneFieldKey;
    const nameKey = config.fieldBindings.nameFieldKey;
    if (!phoneKey) throw new ConflictException("报名表单未配置对应字段，无法核销");
    if (!nameKey) throw new ConflictException("报名表单未配置对应字段，无法核销");
    const phoneField = config.fields.find((field) => field.fieldKey === phoneKey);
    const nameField = config.fields.find((field) => field.fieldKey === nameKey);
    if (!phoneField) throw new ConflictException("报名表单未配置对应字段，无法核销");
    if (!nameField) throw new ConflictException("报名表单未配置对应字段，无法核销");
    const inputPhone = normalizePhone(readValue(values, phoneKey));
    const actualPhone = normalizePhone(readRegistrationValue(registration, attendee, phoneKey));
    const inputName = normalizeText(readValue(values, nameKey));
    const actualName = normalizeText(readRegistrationValue(registration, attendee, nameKey));
    if (!inputPhone || !inputName || inputPhone !== actualPhone || inputName !== actualName) {
      throw new BadRequestException("手机号或姓名不匹配");
    }
    return [
      { fieldKey: phoneKey, label: phoneField.label, value: maskPhone(actualPhone) },
      { fieldKey: nameKey, label: nameField.label, value: actualName }
    ];
  }

  private matchCustomFields(
    config: ReturnType<typeof formatCheckinConfig>,
    registration: RegistrationForCheckin,
    attendee: RegistrationForCheckin["attendees"][number],
    values: Record<string, unknown>
  ) {
    const keys = config.fieldBindings.customFieldKeys;
    if (keys.length === 0) {
      throw new ConflictException("报名表单未配置对应字段，无法核销");
    }
    return keys.map((fieldKey) => {
      const field = config.fields.find((item) => item.fieldKey === fieldKey);
      if (!field) throw new ConflictException("报名表单未配置对应字段，无法核销");
      const inputValue = normalizeText(readValue(values, fieldKey));
      const actualValue = normalizeText(readRegistrationValue(registration, attendee, fieldKey));
      if (!inputValue || inputValue !== actualValue) {
        throw new BadRequestException(`${field.label}不匹配`);
      }
      return { fieldKey, label: field.label, value: actualValue };
    });
  }

  private async completeCheckin(input: {
    attendee: RegistrationForCheckin["attendees"][number] | AdminAttendeeForCheckin;
    action: CheckinActionType;
    method: string;
    operatorId?: string;
    operatorUserId?: string;
    matchedFields?: Prisma.InputJsonValue;
    remark?: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const next = await tx.registrationAttendee.update({
        where: { id: input.attendee.id },
        data: {
          checkInStatus: CheckInStatus.CHECKED_IN,
          checkedInAt: new Date(),
          checkedInBy: input.operatorId ?? input.operatorUserId ?? null
        }
      });
      const log = await tx.checkinLog.create({
        data: {
          attendeeId: input.attendee.id,
          registrationId: input.attendee.registrationId,
          action: input.action,
          method: input.method,
          result: "SUCCESS",
          beforeStatus: input.attendee.checkInStatus,
          afterStatus: CheckInStatus.CHECKED_IN,
          operatorId: input.operatorId,
          operatorUserId: input.operatorUserId,
          matchedFields: input.matchedFields,
          remark: input.remark ?? null
        }
      });
      return { ...next, logId: log.id };
    });
  }

  private async findConferenceWithFields(conferenceId: string) {
    if (!conferenceId) throw new BadRequestException("conferenceId is required");
    const conference = await this.prisma.conference.findUnique({
      where: { id: conferenceId },
      include: {
        formDefinition: {
          include: {
            fields: { where: { enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }
          }
        }
      }
    });
    if (!conference) throw new NotFoundException("Conference not found");
    return conference;
  }

  private async findUserRegistration(conferenceId: string, registrationId: string | undefined, currentUser: CurrentUser): Promise<RegistrationForCheckin> {
    const registration = await this.prisma.registration.findFirst({
      where: {
        conferenceId,
        userId: currentUser.id,
        ...(registrationId ? { id: registrationId } : {})
      },
      include: registrationCheckinInclude
    });
    if (!registration) {
      throw new NotFoundException(registrationId ? "未找到报名记录" : "当前用户未报名该会议");
    }
    return registration;
  }

  private async findAttendeeByCredential(credentialCode: string): Promise<AdminAttendeeForCheckin | null> {
    const parsed = parseCheckinCredentialPayload(credentialCode);
    const registration = await this.prisma.registration.findFirst({
      where: parsed.registrationId
        ? { id: parsed.registrationId, registrationNo: parsed.registrationNo }
        : { registrationNo: parsed.registrationNo },
      include: registrationCheckinInclude
    });
    const attendee = registration?.attendees.find((item) => item.checkInStatus !== CheckInStatus.CHECKED_IN) ?? registration?.attendees[0] ?? null;
    return attendee ? ({ ...attendee, registration } as AdminAttendeeForCheckin) : null;
  }

  private async assertStaffCanScan(userId: string, conferenceId: string) {
    const assignment = await this.prisma.checkinStaffAssignment.findFirst({
      where: {
        userId,
        enabled: true,
        OR: [{ conferenceId }, { conferenceId: null }]
      },
      select: { id: true }
    });
    if (!assignment) throw new ConflictException("无权限核销该会议");
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

export function readCheckinMethods(value: Prisma.JsonValue | null | undefined, enabled: boolean): CheckinMethod[] {
  if (!enabled) return [];
  const raw = Array.isArray(value) ? value.filter((item): item is CheckinMethod => typeof item === "string" && VALID_METHODS.includes(item as CheckinMethod)) : [];
  return raw.length > 0 ? [...new Set(raw)] : DEFAULT_ENABLED_METHODS;
}

export function formatCheckinConfig(conference: ConferenceWithFields) {
  const methods = readCheckinMethods(conference.checkInMethods, conference.checkInEnabled);
  const fieldBindings = normalizeFieldBindings(conference.checkInFieldBindings);
  const fields = (conference.formDefinition?.fields ?? []).map((field) => ({
    id: field.id,
    label: field.label,
    fieldKey: field.fieldKey,
    type: field.type,
    required: field.required
  }));
  const now = new Date();
  const startsAt = conference.checkInStartsAt ?? null;
  const endsAt = conference.checkInEndsAt ?? null;
  const availability = !conference.checkInEnabled
    ? { status: "DISABLED", message: "本会议无需签到核销" }
    : startsAt && now < startsAt
      ? { status: "NOT_STARTED", message: "签到尚未开始" }
      : endsAt && now > endsAt
        ? { status: "ENDED", message: "签到已结束" }
        : { status: "OPEN", message: "签到开放中" };
  return {
    conferenceId: conference.id,
    enabled: conference.checkInEnabled,
    startsAt: startsAt?.toISOString() ?? null,
    endsAt: endsAt?.toISOString() ?? null,
    methods,
    fieldBindings,
    fields,
    availability
  };
}

function assertCheckinAvailable(config: ReturnType<typeof formatCheckinConfig>) {
  if (!config.enabled) throw new ConflictException("本会议无需签到核销");
  if (config.availability.status === "NOT_STARTED") throw new ConflictException("签到尚未开始");
  if (config.availability.status === "ENDED") throw new ConflictException("签到已结束");
}

function assertPaidRegistration(registration: RegistrationForCheckin) {
  if (registration.status !== RegistrationStatus.CONFIRMED || registration.order.status !== OrderStatus.PAID) {
    throw new ConflictException("报名未支付，不能签到");
  }
}

function pickPrimaryAttendee(attendees: RegistrationForCheckin["attendees"]): RegistrationForCheckin["attendees"][number] {
  const attendee = attendees.find((item) => item.checkInStatus !== CheckInStatus.CHECKED_IN) ?? attendees[0];
  if (!attendee) throw new NotFoundException("Registration attendee not found");
  return attendee;
}

function successCheckinResponse(attendee: { id: string; checkInStatus: CheckInStatus; checkedInAt: Date | null; logId?: string }, registration: RegistrationForCheckin, message: string) {
  return {
    status: attendee.checkInStatus,
    message,
    registrationId: registration.id,
    registrationNo: registration.registrationNo,
    attendeeId: attendee.id,
    attendeeName: registration.attendeeName,
    checkedInAt: attendee.checkedInAt?.toISOString() ?? null,
    logId: attendee.logId ?? null
  };
}

function alreadyCheckedInResponse(attendee: { id: string; checkInStatus: CheckInStatus; checkedInAt: Date | null }, registration: RegistrationForCheckin, message: string) {
  return {
    status: attendee.checkInStatus,
    message,
    registrationId: registration.id,
    registrationNo: registration.registrationNo,
    attendeeId: attendee.id,
    attendeeName: registration.attendeeName,
    checkedInAt: attendee.checkedInAt?.toISOString() ?? null
  };
}

function readRegistrationValue(
  registration: RegistrationForCheckin,
  attendee: RegistrationForCheckin["attendees"][number],
  fieldKey: string
): string {
  const merged = {
    ...readObject(registration.formDataJson),
    ...readObject(attendee.formDataJson),
    attendeeName: registration.attendeeName,
    name: attendee.name || registration.attendeeName,
    phone: attendee.phone || registration.phone,
    mobile: attendee.phone || registration.phone,
    company: attendee.company ?? undefined,
    title: attendee.title ?? undefined
  };
  return readValue(merged, fieldKey);
}

function normalizeFieldBindings(value: Prisma.JsonValue | null | undefined) {
  const source = readObject(value);
  return {
    phoneFieldKey: readOptionalString(source.phoneFieldKey),
    nameFieldKey: readOptionalString(source.nameFieldKey),
    customFieldKeys: readStringArray(source.customFieldKeys)
  };
}

function checkInStatusText(status: CheckInStatus | undefined) {
  if (status === CheckInStatus.CHECKED_IN) return "已签到，无需重复核销";
  if (status === CheckInStatus.PENDING) return "待签到";
  if (status === CheckInStatus.CANCELLED) return "报名已取消";
  return "本会议无需签到核销";
}

function actionToMethod(action: CheckinActionType) {
  if (action === CheckinActionType.SELF_INPUT) return "SELF_INPUT";
  if (action === CheckinActionType.QR_SCAN || action === CheckinActionType.VERIFY) return "QR_SCAN";
  if (action === CheckinActionType.ADMIN_MANUAL || action === CheckinActionType.MANUAL) return "ADMIN_MANUAL";
  return action;
}

function formatCheckinAttendeeRow(
  item: CheckinStatsAttendee,
  log: CheckinStatsLog | null
) {
  const registrationData = readObject(item.registration.formDataJson);
  const attendeeData = readObject(item.formDataJson);
  const method = log ? log.method ?? actionToMethod(log.action) : null;
  const company = item.company || readValue(attendeeData, "company") || readValue(registrationData, "company");
  return {
    attendeeId: item.id,
    registrationId: item.registrationId,
    conferenceTitle: item.registration.conference.title,
    wechatAvatarUrl: item.registration.user?.wechatAvatarUrl ?? null,
    wechatNickname: item.registration.user?.wechatNickname ?? item.registration.user?.nickname ?? null,
    userPhone: item.registration.user?.phone ?? null,
    registrationNo: item.registration.registrationNo,
    attendeeName: item.name || item.registration.attendeeName,
    phone: item.phone || item.registration.phone || readValue(attendeeData, "phone") || readValue(registrationData, "phone"),
    company,
    skuName: item.sku.name,
    paymentStatus: item.registration.order.status,
    paymentStatusText: orderStatusText(item.registration.order.status),
    registrationStatus: item.registration.status,
    checkInStatus: item.checkInStatus,
    checkInStatusText: checkInStatusShortText(item.checkInStatus),
    checkedInAt: item.checkedInAt?.toISOString() ?? null,
    checkInMethod: method,
    checkInMethodText: method ? checkinMethodText(method) : "-",
    operatorName: log ? log.operator?.displayName ?? log.operator?.username ?? log.operatorUserId ?? "用户本人" : "-",
    failureReason: log?.failureReason ?? null,
    checkInLogAt: log?.createdAt.toISOString() ?? null,
    paidAt: item.registration.order.paidAt?.toISOString() ?? null
  };
}

function formatCheckinLogRow(log: CheckinStatsLog) {
  const method = log.method ?? actionToMethod(log.action);
  return {
    attendeeId: log.attendeeId,
    registrationId: log.registrationId,
    conferenceTitle: log.registration.conference.title,
    wechatAvatarUrl: log.registration.user?.wechatAvatarUrl ?? null,
    wechatNickname: log.registration.user?.wechatNickname ?? log.registration.user?.nickname ?? null,
    userPhone: log.registration.user?.phone ?? null,
    registrationNo: log.registration.registrationNo,
    attendeeName: log.attendee.name || log.registration.attendeeName,
    phone: log.attendee.phone || log.registration.phone,
    company: log.attendee.company,
    skuName: log.attendee.sku.name,
    checkInMethod: method,
    checkInMethodText: checkinMethodText(method),
    checkInStatus: log.afterStatus,
    checkInStatusText: checkInStatusShortText(log.afterStatus),
    result: log.result,
    failureReason: log.failureReason,
    operatorName: log.operator?.displayName ?? log.operator?.username ?? log.operatorUserId ?? "用户本人",
    checkedInAt: log.createdAt.toISOString(),
    checkInLogAt: log.createdAt.toISOString()
  };
}

function formatStaffMe(userId: string, assignments: StaffAssignment[]) {
  const enabled = assignments.length > 0;
  const hasAllConferences = assignments.some((item) => !item.conferenceId);
  return {
    userId,
    enabled,
    canScan: enabled,
    permissions: enabled ? ["checkin:write"] : [],
    scopeText: enabled ? (hasAllConferences ? "全部会议" : assignments.map((item) => item.conference?.title).filter(Boolean).join("、")) : "未授权",
    assignments: assignments.map(formatStaffAssignment)
  };
}

function formatStaffAssignment(item: StaffAssignment) {
  return {
    id: item.id,
    userId: item.userId,
    conferenceId: item.conferenceId,
    enabled: item.enabled,
    permissions: Array.isArray(item.permissions) ? item.permissions : ["checkin:write"],
    remark: item.remark,
    disabledAt: item.disabledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: item.user,
    conference: item.conference,
    scopeText: item.conference?.title ?? "全部会议"
  };
}

function checkInStatusShortText(status: CheckInStatus) {
  if (status === CheckInStatus.CHECKED_IN) return "已签到";
  if (status === CheckInStatus.PENDING) return "未签到";
  if (status === CheckInStatus.CANCELLED) return "已取消";
  return "无需核销";
}

function checkinMethodText(method: string) {
  return ({ SELF_INPUT: "客户自助", QR_SCAN: "工作人员扫码", ADMIN_MANUAL: "后台应急补签", REVOKE: "撤销核销" } as Record<string, string>)[method] ?? method;
}

function orderStatusText(status: OrderStatus) {
  return ({ PENDING: "待支付", PAID: "已支付", CANCELLED: "已取消", CLOSED: "已关闭", REFUNDED: "已退款" } as Record<string, string>)[status] ?? status;
}

function aggregateBy<T>(rows: T[], keyFn: (row: T) => string, valueFn: (rows: T[]) => Record<string, unknown>) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyFn(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, items]) => ({ key, ...valueFn(items) }));
}

function readPage(query: Record<string, unknown>) {
  const page = clampInt(query.page, 1, 1, 100000);
  const pageSize = clampInt(query.pageSize, 20, 1, 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "string" ? Number(value) : typeof value === "number" ? value : fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

function readRequiredString(source: Record<string, unknown>, key: string): string {
  const value = readOptionalString(source[key]);
  if (!value) throw new BadRequestException(`${key} is required`);
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : value === "true" ? true : value === "false" ? false : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : [];
}

function readObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function readValue(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (Array.isArray(value)) return value.join("、");
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function normalizeText(value: string) {
  return value.trim();
}

function maskPhone(value: string) {
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
}

function formatDateFields<T extends Record<string, unknown>>(item: T) {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]));
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return { code: "OK", message: "ok", data };
}

const registrationCheckinInclude = {
  order: { select: { status: true } },
  attendees: { orderBy: { createdAt: "asc" }, include: { sku: { select: { name: true } } } }
} satisfies Prisma.RegistrationInclude;

const userPublicSelect = {
  id: true,
  nickname: true,
  wechatNickname: true,
  wechatAvatarUrl: true,
  phone: true,
  openid: true
} satisfies Prisma.UserSelect;

const staffUserSelect = {
  select: userPublicSelect
} satisfies Prisma.UserDefaultArgs;

const checkinStatsAttendeeInclude = {
  sku: { select: { name: true } },
  registration: {
    select: {
      conferenceId: true,
      registrationNo: true,
      attendeeName: true,
      phone: true,
      status: true,
      formDataJson: true,
      user: { select: userPublicSelect },
      order: { select: { status: true, paidAt: true } },
      conference: { select: { title: true } }
    }
  }
} satisfies Prisma.RegistrationAttendeeInclude;

const checkinStatsLogInclude = {
  registration: {
    select: {
      registrationNo: true,
      attendeeName: true,
      phone: true,
      user: { select: userPublicSelect },
      conference: { select: { title: true } }
    }
  },
  attendee: { select: { name: true, phone: true, company: true, sku: { select: { name: true } } } },
  operator: { select: { username: true, displayName: true } }
} satisfies Prisma.CheckinLogInclude;

type RegistrationForCheckin = Prisma.RegistrationGetPayload<{ include: typeof registrationCheckinInclude }>;
type AdminAttendeeForCheckin = Prisma.RegistrationAttendeeGetPayload<{ include: { registration: { include: typeof registrationCheckinInclude } } }>;
type CheckinStatsAttendee = Prisma.RegistrationAttendeeGetPayload<{ include: typeof checkinStatsAttendeeInclude }>;
type CheckinStatsLog = Prisma.CheckinLogGetPayload<{ include: typeof checkinStatsLogInclude }>;
type StaffAssignment = Prisma.CheckinStaffAssignmentGetPayload<{ include: { user: typeof staffUserSelect; conference: { select: { id: true; title: true } } } }>;
type ConferenceWithFields = Prisma.ConferenceGetPayload<{
  include: {
    formDefinition: {
      include: {
        fields: true;
      };
    };
  };
}>;
