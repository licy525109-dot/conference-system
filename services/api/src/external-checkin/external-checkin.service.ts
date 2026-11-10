import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { AuditAction, type ExternalCheckinEvent, Prisma } from "@prisma/client";
import { externalCheckinIdentity, parseExternalCheckinFields, parseExternalCheckinValues, planExternalCheckinImport, type ExternalCheckinField, type ExternalCheckinValues } from "@conference/shared";
import { PrismaService } from "../prisma.service";
import type { CurrentAdmin } from "../admin/current-admin";

const MAX_ATTENDEES = 20_000;
type Tx = Prisma.TransactionClient;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const okFields = (event: ExternalCheckinEvent) => parseExternalCheckinFields(event.fields);
const formVersion = (fields: ExternalCheckinField[]) => hash(JSON.stringify(fields.filter(field => field.input)));
const publicPath = (event: ExternalCheckinEvent) => `/api/external-checkins/${event.publicToken}/page`;
export const externalCheckinOk = <T>(data: T) => ({ code: "OK", message: "ok", data });

@Injectable()
export class ExternalCheckinService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>, admin: CurrentAdmin) {
    access(admin);
    const page = pageNumber(query.page, 1), pageSize = 20;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.externalCheckinEvent.findMany({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize, include: { _count: { select: { attendees: true } } } }),
      this.prisma.externalCheckinEvent.count()
    ]);
    return { items: items.map(event => ({ ...event, publicPath: publicPath(event) })), total, page, pageSize };
  }

  async create(input: unknown, admin: CurrentAdmin) {
    access(admin, true);
    const config = readConfig(input);
    return this.prisma.$transaction(async tx => {
      const event = await tx.externalCheckinEvent.create({ data: { ...config, enabled: false, fields: config.fields as unknown as Prisma.InputJsonValue, publicToken: randomBytes(24).toString("base64url") } });
      await audit(tx, admin, event.id, "创建外部签到会议");
      return detail(tx, event);
    });
  }

  async detail(id: string, admin: CurrentAdmin) {
    access(admin);
    return this.prisma.$transaction(async tx => detail(tx, await findEvent(tx, id)));
  }

  async save(id: string, input: unknown, admin: CurrentAdmin) {
    access(admin, true);
    const body = object(input), config = readConfig(body);
    if (typeof body.enabled !== "boolean") throw new BadRequestException("请设置是否开启签到");
    const enabled = body.enabled;
    return this.prisma.$transaction(async tx => {
      const event = await lockEvent(tx, id); revision(event, body);
      const fields = okFields(event), formChanged = formVersion(fields) !== formVersion(config.fields);
      if (formChanged && (event.enabled || enabled)) throw new ConflictException("请先暂停签到，再调整嘉宾填写的字段");
      const matchKeys = (items: ExternalCheckinField[]) => items.filter(field => field.match).map(field => field.key).sort().join(",");
      if (matchKeys(fields) !== matchKeys(config.fields)) {
        const rows = await tx.externalCheckinAttendee.findMany({ where: { eventId: id }, select: { id: true, values: true } });
        const seen = new Set<string>();
        const updates = rows.map(row => {
          const values = checked(() => parseExternalCheckinValues(row.values, config.fields));
          const key = hash(externalCheckinIdentity(values, config.fields));
          if (seen.has(key)) throw new ConflictException("所选核对字段无法唯一识别现有名单，请增加核对字段");
          seen.add(key); return { id: row.id, key };
        });
        // The key includes the matching field keys, so changing the selection creates a new key namespace.
        for (const row of updates) await tx.externalCheckinAttendee.update({ where: { id: row.id }, data: { matchKey: row.key } });
      }
      if (enabled && await tx.externalCheckinAttendee.count({ where: { eventId: id } }) === 0) throw new ConflictException("请先导入名单，再开启签到");
      const next = await tx.externalCheckinEvent.update({ where: { id }, data: { ...config, fields: config.fields as unknown as Prisma.InputJsonValue, enabled, revision: { increment: 1 } } });
      await audit(tx, admin, id, enabled ? "保存并开启外部签到" : "保存外部签到配置（暂停）");
      return detail(tx, next);
    }, { timeout: 30_000 });
  }

  async import(id: string, input: unknown, admin: CurrentAdmin, commit: boolean) {
    access(admin, true);
    const body = object(input);
    return this.prisma.$transaction(async tx => {
      const event = await lockEvent(tx, id); revision(event, body);
      const fields = okFields(event), rows = await tx.externalCheckinAttendee.findMany({ where: { eventId: id }, select: { values: true } });
      const plan = checked(() => planExternalCheckinImport(body.rows, fields, rows.map(row => row.values as ExternalCheckinValues)));
      if (rows.length + plan.added > MAX_ATTENDEES) throw new BadRequestException(`单场会议最多 ${MAX_ATTENDEES} 人`);
      const digest = hash(JSON.stringify({ id, revision: event.revision, rows: body.rows }));
      if (!commit) return { added: plan.added, skipped: plan.skipped, errors: plan.errors, digest, revision: event.revision };
      if (body.digest !== digest) throw new ConflictException("导入内容已变化，请重新预检");
      if (plan.errors.length) throw new BadRequestException(`名单有 ${plan.errors.length} 个错误，请修正后重新预检`);
      if (plan.additions.length) await tx.externalCheckinAttendee.createMany({ data: plan.additions.map(values => ({ eventId: id, values, matchKey: hash(externalCheckinIdentity(values, fields)) })) });
      const next = await tx.externalCheckinEvent.update({ where: { id }, data: { revision: { increment: 1 } } });
      await audit(tx, admin, id, `导入外部名单：新增 ${plan.added}，跳过 ${plan.skipped}`);
      return detail(tx, next);
    }, { timeout: 30_000 });
  }

  async attendees(id: string, query: Record<string, unknown>, admin: CurrentAdmin, exporting = false) {
    access(admin);
    const event = await findEvent(this.prisma, id), page = pageNumber(query.page, 1), pageSize = 50;
    const keyword = typeof query.keyword === "string" ? query.keyword.trim().slice(0, 300) : "";
    if (query.status && !["PENDING", "CHECKED_IN"].includes(String(query.status))) throw new BadRequestException("签到状态无效");
    const where: Prisma.ExternalCheckinAttendeeWhereInput = {
      eventId: id,
      ...(query.status === "PENDING" ? { checkedInAt: null } : query.status === "CHECKED_IN" ? { checkedInAt: { not: null } } : {}),
      ...(keyword ? { OR: okFields(event).flatMap(field => [
        { values: { path: [field.key], string_contains: keyword } },
        ...(field.input ? [{ submittedValues: { path: [field.key], string_contains: keyword } }] : [])
      ]) } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.externalCheckinAttendee.findMany({ where, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: exporting ? MAX_ATTENDEES : pageSize, skip: exporting ? 0 : (page - 1) * pageSize, select: { id: true, values: true, submittedValues: true, checkedInAt: true } }),
      this.prisma.externalCheckinAttendee.count({ where })
    ]);
    if (exporting) await audit(this.prisma, admin, id, `导出外部签到名单：${items.length} 人`);
    return { items, total, page, pageSize };
  }

  async publicMeta(token: string) {
    const event = await publicEvent(this.prisma, token), fields = okFields(event).filter(field => field.input);
    return { title: event.title, description: event.description, fields: fields.map(({ key, label, required }) => ({ key, label, required })), formVersion: formVersion(fields), ...availability(event), startsAt: event.startsAt, endsAt: event.endsAt };
  }

  async submit(token: string, input: unknown) {
    const body = object(input);
    return this.prisma.$transaction(async tx => {
      // Shared event lock permits simultaneous guests while coordinating with pause/import/configuration.
      await tx.$queryRaw`SELECT "id" FROM "external_checkin_events" WHERE "publicToken" = ${token} FOR SHARE`;
      const event = await publicEvent(tx, token), state = availability(event), fields = okFields(event);
      if (!state.available) throw new ConflictException(state.message);
      if (body.formVersion !== formVersion(fields)) throw new ConflictException("签到字段已更新，请刷新页面后重新填写");
      const values = checked(() => parseExternalCheckinValues(body.values, fields, true));
      const attendee = await tx.externalCheckinAttendee.findUnique({ where: { eventId_matchKey: { eventId: event.id, matchKey: hash(externalCheckinIdentity(values, fields)) } }, select: { id: true } });
      if (!attendee) return { success: false, alreadyCheckedIn: false, checkedInAt: null, message: "签到失败，未查询到匹配名单，请核对填写内容或联系现场工作人员" };
      const updated = await tx.externalCheckinAttendee.updateMany({ where: { id: attendee.id, checkedInAt: null }, data: { checkedInAt: new Date(), submittedValues: values } });
      const result = await tx.externalCheckinAttendee.findUniqueOrThrow({ where: { id: attendee.id }, select: { checkedInAt: true } });
      if (updated.count) await tx.auditLog.create({ data: { action: AuditAction.UPDATE, entityType: "ExternalCheckinAttendee", entityId: attendee.id, summary: "外部嘉宾自助签到成功", metadataJson: { eventId: event.id } } });
      return { success: true, alreadyCheckedIn: !updated.count, checkedInAt: result.checkedInAt, message: updated.count ? "签到成功，欢迎参会" : "您已签到，无需重复签到" };
    });
  }
}

function access(admin: CurrentAdmin, write = false) {
  const permissions = admin.permissions || [];
  if (admin.conferenceScopeMode !== "ALL" || (!permissions.includes("*") && (!permissions.includes("external-checkin:view") || (write && !permissions.includes("external-checkin:write"))))) throw new ForbiddenException("当前账号无权管理外部会议签到");
}
function object(input: unknown): Record<string, unknown> { if (!input || typeof input !== "object" || Array.isArray(input)) throw new BadRequestException("请求格式无效"); return input as Record<string, unknown>; }
function checked<T>(fn: () => T): T { try { return fn(); } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : "参数无效"); } }
function pageNumber(value: unknown, fallback: number) { if (value === undefined || value === "") return fallback; const n = Number(value); if (!Number.isSafeInteger(n) || n < 1 || n > 1_000_000) throw new BadRequestException("页码无效"); return n; }
function readConfig(input: unknown) {
  const body = object(input), title = typeof body.title === "string" ? body.title.trim() : "", description = typeof body.description === "string" ? body.description.trim() : "";
  if (!title || title.length > 120) throw new BadRequestException("会议名称应为 1–120 个字");
  if (description.length > 1000) throw new BadRequestException("签到说明不能超过 1000 个字");
  const date = (value: unknown) => { if (value === undefined || value === null || value === "") return null; if (typeof value !== "string" || !/T.*(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new BadRequestException("签到时间需要包含时区"); const d = new Date(value); if (!Number.isFinite(d.getTime())) throw new BadRequestException("签到时间无效"); return d; };
  const startsAt = date(body.startsAt), endsAt = date(body.endsAt);
  if (startsAt && endsAt && startsAt >= endsAt) throw new BadRequestException("签到结束时间必须晚于开始时间");
  return { title, description, startsAt, endsAt, fields: checked(() => parseExternalCheckinFields(body.fields)) };
}
function revision(event: ExternalCheckinEvent, body: Record<string, unknown>) { if (body.revision !== event.revision) throw new ConflictException("会议配置或名单已变化，请刷新后重试"); }
async function findEvent(tx: Tx, id: string) { const event = await tx.externalCheckinEvent.findUnique({ where: { id } }); if (!event) throw new NotFoundException("会议不存在"); return event; }
async function lockEvent(tx: Tx, id: string) { await tx.$queryRaw`SELECT "id" FROM "external_checkin_events" WHERE "id" = ${id} FOR UPDATE`; return findEvent(tx, id); }
async function publicEvent(tx: Tx, token: string) { if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new NotFoundException("签到二维码无效"); const event = await tx.externalCheckinEvent.findUnique({ where: { publicToken: token } }); if (!event) throw new NotFoundException("签到二维码无效"); return event; }
export function availability(event: Pick<ExternalCheckinEvent, "enabled" | "startsAt" | "endsAt">, now = new Date()) {
  if (!event.enabled) return { available: false, message: "签到暂未开放，请联系现场工作人员" };
  if (event.startsAt && now < event.startsAt) return { available: false, message: "签到尚未开始" };
  if (event.endsAt && now >= event.endsAt) return { available: false, message: "签到已结束" };
  return { available: true, message: "请填写以下信息，核对名单后完成签到" };
}
async function detail(tx: Tx, event: ExternalCheckinEvent) {
  const [{ total, checkedIn }] = await tx.$queryRaw<{ total: number; checkedIn: number }[]>`SELECT COUNT(*)::integer AS "total", COUNT("checkedInAt")::integer AS "checkedIn" FROM "external_checkin_attendees" WHERE "eventId" = ${event.id}`;
  return { ...event, publicPath: publicPath(event), statistics: { total, checkedIn, pending: total - checkedIn } };
}
async function audit(tx: Tx, admin: CurrentAdmin, eventId: string, summary: string) { await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.UPDATE, entityType: "ExternalCheckinEvent", entityId: eventId, summary } }); }
