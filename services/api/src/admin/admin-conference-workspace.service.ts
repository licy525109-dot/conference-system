import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminExportsService } from "./admin-exports.service";
import { AdminManagementService } from "./admin-management.service";
import { CurrentAdmin } from "./current-admin";
import { requireConferenceGrant } from "./conference-scope";

@Injectable()
export class AdminConferenceWorkspaceService {
  constructor(private readonly prisma: PrismaService, private readonly management: AdminManagementService, private readonly exports: AdminExportsService) {}
  async conferences(query: Record<string, unknown>, admin: CurrentAdmin) {
    const page = positiveInt(query.page, 1, 100000);
    const pageSize = positiveInt(query.pageSize, 20, 100);
    const where = { ...(admin.conferenceScopeMode === "ALL" ? {} : { id: { in: admin.conferenceIds ?? [] } }),
      ...(typeof query.keyword === "string" && query.keyword.trim() ? { title: { contains: query.keyword.trim(), mode: "insensitive" as const } } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.conference.findMany({ where, orderBy: { startsAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, select: { id: true, title: true, startsAt: true, endsAt: true, status: true, location: true } }),
      this.prisma.conference.count({ where })
    ]);
    return { code: "OK", message: "ok", data: { items, total, page, pageSize } };
  }
  conference(id: string, admin: CurrentAdmin) { requireConferenceGrant(admin, id); return this.management.getConference(id); }
  updateConference(id: string, body: unknown, admin: CurrentAdmin) {
    requireConferenceGrant(admin, id);
    // Whitelist prevents financial settings or ownership being smuggled into content edits.
    return this.management.updateConference(id, pick(body, ["title", "slug", "subtitle", "coverImage", "location", "startAt", "endAt", "registrationStartsAt", "registrationEndsAt", "groupRegistrationEnabled", "maxTicketsPerOrder", "showRegistrationCount", "showRemainingSeats"]), admin);
  }
  skus(id: string, admin: CurrentAdmin) { requireConferenceGrant(admin, id); return this.management.listSkus(id); }
  createSku(id: string, body: unknown, admin: CurrentAdmin) { requireConferenceGrant(admin, id); return this.management.createSku(id, pick(body, skuFields), admin); }
  async updateSku(id: string, body: unknown, admin: CurrentAdmin) {
    const row = await this.prisma.registrationSku.findUnique({ where: { id }, select: { conferenceId: true } });
    this.check(row, admin);
    return this.management.updateSku(id, pick(body, skuFields), admin);
  }
  fields(id: string, admin: CurrentAdmin) { requireConferenceGrant(admin, id); return this.management.listFormFields(id); }
  createField(id: string, body: unknown, admin: CurrentAdmin) { requireConferenceGrant(admin, id); return this.management.createFormField(id, pick(body, fieldFields), admin); }
  async updateField(id: string, body: unknown, admin: CurrentAdmin) {
    const row = await this.prisma.formField.findUnique({ where: { id }, select: { formDefinition: { select: { conferenceId: true } } } });
    this.check(row?.formDefinition, admin);
    return this.management.updateFormField(id, pick(body, fieldFields), admin);
  }
  async orders(query: Record<string, unknown>, admin: CurrentAdmin) {
    this.queryScope(query, admin);
    return projectList(await this.management.listOrders(cleanQuery(query)), value => scopedOrder(value, admin));
  }
  async order(orderNo: string, admin: CurrentAdmin) {
    const row = await this.prisma.order.findUnique({ where: { orderNo }, select: { conferenceId: true } });
    this.check(row, admin);
    return projectResponse(await this.management.getOrder(orderNo), value => scopedOrder(value, admin));
  }
  async registrations(query: Record<string, unknown>, admin: CurrentAdmin) {
    this.queryScope(query, admin);
    return projectList(await this.management.listRegistrations(cleanQuery(query)), value => scopedRegistration(value, admin));
  }
  async registration(id: string, admin: CurrentAdmin) {
    await this.registrationScope(id, admin);
    return projectResponse(await this.management.getRegistrationDetail(id), value => scopedRegistration(value, admin));
  }
  async remark(id: string, body: unknown, admin: CurrentAdmin) {
    await this.registrationScope(id, admin);
    return projectResponse(await this.management.updateRegistrationRemark(id, pick(body, ["adminRemark"]), admin),
      value => hasPermission(admin, "registration:view") ? scopedRegistration(value, admin)
        : select(value, ["id", "adminRemark", "remarkUpdatedAt"]));
  }
  async checkin(id: string, admin: CurrentAdmin) {
    const row = await this.prisma.registrationAttendee.findUnique({ where: { id }, select: { registration: { select: { conferenceId: true } } } });
    this.check(row?.registration, admin);
    return projectResponse(await this.management.checkInRegistrationAttendee(id, admin), value =>
      hasPermission(admin, "registration:view") ? scopedAttendee(value) : select(value, ["id", "checkInStatus", "checkedInAt"]));
  }
  exportRegistrations(query: Record<string, unknown>, admin: CurrentAdmin) { this.queryScope(query, admin); return this.exports.exportRegistrationsExcel(cleanQuery(query), admin); }
  private async registrationScope(id: string, admin: CurrentAdmin) { this.check(await this.prisma.registration.findUnique({ where: { id }, select: { conferenceId: true } }), admin); }
  private queryScope(query: Record<string, unknown>, admin: CurrentAdmin) {
    if (typeof query.conferenceId !== "string" || !query.conferenceId) throw new BadRequestException("请选择已授权的会议");
    requireConferenceGrant(admin, query.conferenceId);
  }
  private check(row: { conferenceId: string | null } | null | undefined, admin: CurrentAdmin) {
    if (!row?.conferenceId) throw new NotFoundException("记录不存在");
    requireConferenceGrant(admin, row.conferenceId);
  }
}
const skuFields = ["name", "description", "priceCent", "stock", "saleStartAt", "saleEndAt", "sortOrder", "status", "groupPricingJson"];
const fieldFields = ["fieldKey", "label", "type", "required", "placeholder", "optionsJson", "validationJson", "sortOrder", "enabled"];
function pick(input: unknown, allowed: string[]) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("请求内容无效");
  const entries = Object.entries(input);
  if (entries.some(([key]) => !allowed.includes(key))) throw new BadRequestException("包含当前入口不可修改的字段");
  return Object.fromEntries(entries);
}
function cleanQuery(query: Record<string, unknown>) { return Object.fromEntries(Object.entries(query).filter(([key]) => ["conferenceId", "page", "pageSize", "keyword", "status", "paymentStatus", "skuId", "checkInStatus"].includes(key))); }
function positiveInt(value: unknown, fallback: number, max: number) { const n = Number(value ?? fallback); if (!Number.isInteger(n) || n < 1 || n > max) throw new BadRequestException("分页参数无效"); return n; }

export interface ScopedWorkspaceUser { id: string; nickname: string | null }
type JsonObject = Record<string, unknown>;
type Envelope = { code: "OK"; message: "ok"; data: unknown };
function object(value: unknown): JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}
function select(value: unknown, keys: readonly string[]): JsonObject {
  const source = object(value);
  return Object.fromEntries(keys.filter(key => Object.hasOwn(source, key)).map(key => [key, source[key]]));
}
function rows(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function hasPermission(admin: CurrentAdmin, permission: string): boolean {
  return admin.permissions?.includes("*") === true || admin.permissions?.includes(permission) === true;
}
function projectResponse(response: Envelope, project: (value: unknown) => JsonObject) {
  return { code: response.code, message: response.message, data: project(response.data) };
}
function projectList(response: Envelope, project: (value: unknown) => JsonObject) {
  const data = object(response.data);
  return projectResponse(response, () => ({
    ...select(data, ["total", "page", "pageSize"]),
    items: rows(data.items).map(project),
    ...(data.summary ? { summary: select(data.summary, ["orderCount", "paidOrderCount", "payableAmountCent",
      "discountAmountCent", "paidAmountCent", "refundedAmountCent", "netPaidAmountCent"]) } : {})
  }));
}
function scopedUser(value: unknown): ScopedWorkspaceUser | null {
  const user = object(value);
  if (typeof user.id !== "string") return null;
  return { id: user.id, nickname: typeof user.nickname === "string" ? user.nickname
    : typeof user.wechatNickname === "string" ? user.wechatNickname : null };
}
function scopedAttendee(value: unknown): JsonObject {
  return select(value, ["id", "skuId", "skuName", "name", "phone", "company", "title", "formDataJson",
    "checkInStatus", "checkedInAt", "checkedInBy", "adminRemark", "createdAt"]);
}
function formFields(snapshot: unknown): JsonObject[] {
  return rows(object(snapshot).fields).map(field => select(field, ["key", "label", "type"]));
}
function formSnapshot(value: unknown): JsonObject | null {
  if (value === null || value === undefined) return null;
  const snapshot = object(value);
  return {
    ...select(snapshot, ["conferenceId", "skuId", "skuName", "attendeeName", "phone", "formData"]),
    fields: formFields(snapshot),
    ...(Array.isArray(snapshot.attendees) ? { attendees: snapshot.attendees.map(attendee =>
      select(attendee, ["skuId", "name", "phone", "company", "title", "formData"])) } : {})
  };
}
const orderFields = ["id", "orderNo", "conferenceId", "conferenceTitle", "skuId", "skuName",
  "paymentMerchantId", "paymentCompanyName", "originAmountCent", "discountAmountCent", "payableAmountCent",
  "paidAmountCent", "refundedAmountCent", "status", "paymentStatus", "paymentProvider", "outTradeNo",
  "transactionId", "attendeeName", "phone", "expiredAt", "paidAt", "createdAt"] as const;
function scopedOrder(value: unknown, admin: CurrentAdmin): JsonObject {
  const order = object(value);
  const result: JsonObject = { ...select(order, orderFields), user: scopedUser(order.user) };
  if (Array.isArray(order.items)) result.items = order.items.map(item =>
    select(item, ["id", "skuId", "skuName", "unitPriceCent", "quantity", "totalAmountCent", "pricingMode"]));
  if (Array.isArray(order.payments)) result.payments = order.payments.map(payment =>
    select(payment, ["id", "provider", "status", "outTradeNo", "transactionId", "amountCent", "paidAt", "createdAt"]));
  if (Array.isArray(order.discounts)) result.discounts = order.discounts.map(discount => ({
    ...select(discount, ["id", "type", "title", "amountCent", "couponId", "promotionRuleId", "createdAt"]), snapshotJson: null
  }));
  if (Array.isArray(order.paymentExceptions)) result.paymentExceptions = order.paymentExceptions.map(exception =>
    select(exception, ["code", "level", "message"]));
  if (Object.hasOwn(order, "registration")) result.registration = order.registration
    ? select(order.registration, ["id", "registrationNo", "status"]) : null;
  // Never forward arbitrary audit metadata or full account/financial snapshots into the scoped API.
  if (hasPermission(admin, "registration:view")) {
    if (Object.hasOwn(order, "submittedFormJson")) result.submittedFormJson = order.submittedFormJson;
    if (Object.hasOwn(order, "registrationSnapshotJson")) result.registrationSnapshotJson = formSnapshot(order.registrationSnapshotJson);
  }
  return result;
}
const registrationFields = ["id", "registrationNo", "conferenceId", "conferenceTitle", "skuId", "skuName",
  "attendeeName", "phone", "paidAmountCent", "status", "source", "complimentary", "orderNo", "confirmedAt",
  "adminRemark", "remarkUpdatedAt", "remarkUpdatedBy", "attendeeCount", "createdAt", "formDataJson"] as const;
function scopedRegistration(value: unknown, admin: CurrentAdmin): JsonObject {
  const registration = object(value);
  const result: JsonObject = { ...select(registration, registrationFields), user: scopedUser(registration.user) };
  if (registration.checkInProgress) result.checkInProgress = select(registration.checkInProgress, ["total", "checkedIn", "pending", "notRequired"]);
  if (Array.isArray(registration.attendees)) result.attendees = registration.attendees.map(scopedAttendee);
  if (registration.order) {
    const order = object(registration.order);
    result.formFields = formFields(order.registrationSnapshotJson);
    result.order = hasPermission(admin, "order:view") ? scopedOrder(order, admin) : select(order, ["orderNo", "status"]);
  }
  return result;
}
