import { BadRequestException, Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { AdminAlertRecipient, AdminRegistrationAlert, Prisma, WecomIntegration } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../prisma.service";
import { WecomTokenService } from "./wecom-token.service";
import { CurrentAdmin } from "../../admin/current-admin";

const LEASE_MS = 120_000;
const RETRY_WINDOW_MS = 3.5 * 3600_000;
const MAX_ATTEMPTS = 5;
const ok = <T>(data: T) => ({ code: "OK", message: "ok", data });
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
type Delivery = AdminRegistrationAlert & { recipient: AdminAlertRecipient };
type PaidRegistration = { id: string; registrationNo: string; attendeeName: string; paidAmountCent: number; conference: { title: string } };

export function validWecomRecipient(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_.@-]{1,64}$/.test(value) && value.toLowerCase() !== "@all";
}

function validAgentId(value: string | null): boolean {
  return Boolean(value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0);
}

function adminUrl(baseUrl: string, registrationId: string): string {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new BadRequestException("管理员工作台地址无效"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search) throw new BadRequestException("管理员工作台需使用不带凭据或参数的 HTTPS 地址");
  url.hash = `/mobile?registrationId=${encodeURIComponent(registrationId)}`;
  return url.toString();
}

export function buildPaidAlert(registration: PaidRegistration, baseUrl: string, wecomUserId: string, agentId: string) {
  if (!validWecomRecipient(wecomUserId) || !validAgentId(agentId)) throw new BadRequestException("请使用有效的单个企微成员和自建应用 ID");
  if (!Number.isSafeInteger(registration.paidAmountCent) || registration.paidAmountCent <= 0) throw new BadRequestException("缴费金额无效");
  return {
    touser: wecomUserId, msgtype: "textcard", agentid: Number(agentId),
    textcard: { title: "嘉宾报名缴费成功", description: escapeHtml(`${registration.attendeeName} · ${registration.conference.title}`.slice(0, 160)) + `<div>实付：¥${(registration.paidAmountCent / 100).toFixed(2)}</div><div>报名号：${escapeHtml(registration.registrationNo)}</div>`, url: adminUrl(baseUrl, registration.id), btntxt: "查看报名" },
    enable_duplicate_check: 1, duplicate_check_interval: 14400
  };
}

function configured(integration: WecomIntegration | null): integration is WecomIntegration & { agentId: string } {
  return Boolean(integration?.enabled && integration.corpId && integration.appSecretEnc && validAgentId(integration.agentId));
}

function configurationKey(recipient: AdminAlertRecipient, integration: WecomIntegration): string {
  return JSON.stringify([recipient.adminUserId, recipient.integrationId, recipient.wecomUserId, recipient.enabledSince.toISOString(), integration.corpId, integration.agentId]);
}

@Injectable()
export class AdminRegistrationAlertService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  constructor(private readonly prisma: PrismaService, private readonly tokens: WecomTokenService) {}

  onModuleInit() {
    if (this.timer || process.env.NODE_ENV === "test" || process.env.ADMIN_PAID_ALERT_WORKER_ENABLED !== "true") return;
    this.timer = setInterval(() => void this.tick().catch(() => console.error("[ADMIN_PAID_ALERT_WORKER_FAILED]")), 15000);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  private async authorized(adminUserId: string, db: Prisma.TransactionClient = this.prisma) {
    const admin = await db.adminUser.findUnique({ where: { id: adminUserId }, select: { enabled: true, roles: { where: { role: { enabled: true } }, select: { role: { select: { code: true, permissions: { select: { permission: { select: { code: true } } } } } } } } } });
    return Boolean(admin?.enabled && admin.roles.some(r => r.role.code === "super_admin" || r.role.permissions.some(p => p.permission.code === "registration:view")));
  }

  // Configuration, enqueue and claim use the same lock, including first-time configuration.
  private locked<T>(adminUserId: string, work: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-paid-alert:${adminUserId}`}))::text`;
      return work(tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  async configuration() {
    const [recipients, integrations, admins, deliveries] = await this.prisma.$transaction([
      this.prisma.adminAlertRecipient.findMany({ orderBy: { createdAt: "asc" } }),
      this.prisma.wecomIntegration.findMany({ where: { enabled: true }, select: { id: true, name: true, agentId: true } }),
      this.prisma.adminUser.findMany({ where: { enabled: true }, select: { id: true, displayName: true, username: true } }),
      this.prisma.adminRegistrationAlert.findMany({ orderBy: { createdAt: "desc" }, take: 50, select: { id: true, registrationId: true, recipientId: true, status: true, attempts: true, sentAt: true, lastError: true, createdAt: true } })
    ]);
    return ok({ recipients, integrations, admins, deliveries, workerEnabled: process.env.ADMIN_PAID_ALERT_WORKER_ENABLED === "true", adminUrlConfigured: Boolean(process.env.ADMIN_PUBLIC_URL) });
  }

  async configure(body: Record<string, unknown>, admin: CurrentAdmin) {
    if (!body || !validWecomRecipient(body.wecomUserId) || typeof body.adminUserId !== "string" || !body.adminUserId || typeof body.integrationId !== "string" || !body.integrationId || typeof body.enabled !== "boolean") throw new BadRequestException("请指定管理员、企微应用、单个成员 UserID 和启用状态");
    const input = { adminUserId: body.adminUserId, integrationId: body.integrationId, wecomUserId: body.wecomUserId, enabled: body.enabled };
    return this.locked(input.adminUserId, async tx => {
      const existing = await tx.adminAlertRecipient.findUnique({ where: { adminUserId: input.adminUserId } });
      // Revoked accounts or broken integrations must still be possible to disable.
      if (input.enabled) {
        if (!await this.authorized(input.adminUserId, tx)) throw new BadRequestException("接收账号需要启用且有查看报名权限");
        if (!configured(await tx.wecomIntegration.findUnique({ where: { id: input.integrationId } }))) throw new BadRequestException("请先完成企业微信自建应用配置");
      }
      const changed = !existing || existing.wecomUserId !== input.wecomUserId || existing.integrationId !== input.integrationId || (!existing.enabled && input.enabled);
      if (existing && changed && input.enabled && await tx.adminRegistrationAlert.count({ where: { recipientId: existing.id, status: "SENDING", leaseUntil: { gt: new Date() } } })) throw new BadRequestException("正在发送，请稍后调整接收设置");
      const enabledSince = new Date(Math.max(Date.now(), (existing?.enabledSince.getTime() ?? 0) + 1));
      const recipient = await tx.adminAlertRecipient.upsert({ where: { adminUserId: input.adminUserId }, create: { ...input, enabledSince }, update: { ...input, ...(changed ? { enabledSince } : {}) } });
      if (changed || !input.enabled) await tx.adminRegistrationAlert.updateMany({ where: { recipientId: recipient.id, status: { not: "SENT" } }, data: { status: "CANCELLED", leaseToken: null, leaseUntil: null, lastError: "接收配置已变更或停用" } });
      await tx.auditLog.create({ data: { adminUserId: admin.id, action: "UPDATE", entityType: "AdminAlertRecipient", entityId: recipient.id, summary: input.enabled ? "启用管理员缴费提醒" : "停用管理员缴费提醒" } });
      return ok(recipient);
    });
  }

  private async enqueue(adminUserId: string, baseUrl: string) {
    await this.locked(adminUserId, async tx => {
      const recipient = await tx.adminAlertRecipient.findUnique({ where: { adminUserId } });
      if (!recipient?.enabled || !validWecomRecipient(recipient.wecomUserId) || !await this.authorized(adminUserId, tx)) return;
      const integration = await tx.wecomIntegration.findUnique({ where: { id: recipient.integrationId } });
      if (!configured(integration)) return;
      // A bounded anti-join avoids loading every historical delivery ID into a NOT IN list.
      const candidates = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT r.id FROM registrations r JOIN orders o ON o.id = r."orderId"
        WHERE r.source = 'PAYMENT' AND r.status = 'CONFIRMED' AND r."paidAmountCent" > 0
          AND r."createdAt" > ${recipient.enabledSince} AND o."paidAt" > ${recipient.enabledSince}
          AND o.status = 'PAID'
          AND NOT EXISTS (SELECT 1 FROM admin_registration_alerts a WHERE a."registrationId" = r.id AND a."recipientId" = ${recipient.id})
        ORDER BY r."createdAt", r.id LIMIT 50`;
      if (!candidates.length) return;
      const registrations = await tx.registration.findMany({ where: { id: { in: candidates.map(r => r.id) } }, include: { conference: { select: { title: true } } } });
      for (const registration of registrations) await tx.adminRegistrationAlert.upsert({
        where: { registrationId_recipientId: { registrationId: registration.id, recipientId: recipient.id } }, update: {},
        create: { registrationId: registration.id, recipientId: recipient.id, payloadJson: { configurationKey: configurationKey(recipient, integration), message: buildPaidAlert(registration, baseUrl, recipient.wecomUserId, integration.agentId) } }
      });
    });
  }

  async tick() {
    const baseUrl = process.env.ADMIN_PUBLIC_URL;
    if (this.busy || !baseUrl || process.env.ADMIN_PAID_ALERT_WORKER_ENABLED !== "true") return;
    adminUrl(baseUrl, "validation");
    this.busy = true;
    try {
      const recipients = await this.prisma.adminAlertRecipient.findMany({ where: { enabled: true } });
      for (const recipient of recipients) {
        try { await this.enqueue(recipient.adminUserId, baseUrl); } catch { console.error("[ADMIN_PAID_ALERT_ENQUEUE_FAILED]"); }
      }
      const now = new Date();
      const pending = await this.prisma.adminRegistrationAlert.findMany({ where: { recipient: { enabled: true }, nextAttemptAt: { lte: now }, OR: [{ status: "PENDING" }, { status: "SENDING", OR: [{ leaseUntil: { lte: now } }, { leaseUntil: null }] }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 30, include: { recipient: true } });
      for (const item of pending) {
        try { await this.deliver(item); } catch { console.error("[ADMIN_PAID_ALERT_DELIVERY_FAILED]"); }
      }
    } finally { this.busy = false; }
  }

  private async claim(candidate: Delivery) {
    return this.locked(candidate.recipient.adminUserId, async tx => {
      const item = await tx.adminRegistrationAlert.findUnique({ where: { id: candidate.id }, include: { recipient: true } });
      const now = new Date();
      if (!item || !item.recipient.enabled || item.nextAttemptAt > now || !(item.status === "PENDING" || (item.status === "SENDING" && (!item.leaseUntil || item.leaseUntil <= now)))) return null;
      if (item.attempts >= MAX_ATTEMPTS || (item.firstAttemptAt && now.getTime() - item.firstAttemptAt.getTime() >= RETRY_WINDOW_MS)) {
        await tx.adminRegistrationAlert.updateMany({ where: { id: item.id, status: item.status, leaseToken: item.leaseToken }, data: { status: "REVIEW", leaseToken: null, leaseUntil: null, lastError: "投递结果待核实，已停止自动重试" } });
        return null;
      }
      const leaseToken = randomUUID();
      const claimed = await tx.adminRegistrationAlert.updateMany({ where: { id: item.id, status: item.status, leaseToken: item.leaseToken }, data: { status: "SENDING", leaseToken, leaseUntil: new Date(now.getTime() + LEASE_MS), firstAttemptAt: item.firstAttemptAt ?? now, attempts: { increment: 1 } } });
      return claimed.count ? { ...item, leaseToken, firstAttemptAt: item.firstAttemptAt ?? now, attempts: item.attempts + 1 } : null;
    });
  }

  private async deliveryContext(item: Delivery, db: Prisma.TransactionClient = this.prisma) {
    const recipient = await db.adminAlertRecipient.findUnique({ where: { id: item.recipientId } });
    if (!recipient?.enabled || !validWecomRecipient(recipient.wecomUserId) || !await this.authorized(recipient.adminUserId, db)) return null;
    const integration = await db.wecomIntegration.findUnique({ where: { id: recipient.integrationId } });
    if (!configured(integration)) return null;
    const snapshot = item.payloadJson as { configurationKey?: string; message?: ReturnType<typeof buildPaidAlert> } | null;
    const message = snapshot?.message;
    if (snapshot?.configurationKey !== configurationKey(recipient, integration) || !message || message.touser !== recipient.wecomUserId || message.agentid !== Number(integration.agentId) || message.msgtype !== "textcard" || message.enable_duplicate_check !== 1 || message.duplicate_check_interval !== 14400 || message.textcard?.url !== adminUrl(process.env.ADMIN_PUBLIC_URL!, item.registrationId)) return null;
    const registration = await db.registration.findUnique({ where: { id: item.registrationId }, select: { status: true, source: true, paidAmountCent: true, createdAt: true, order: { select: { status: true, paidAt: true } } } });
    if (!registration || registration.status !== "CONFIRMED" || registration.source !== "PAYMENT" || registration.paidAmountCent <= 0 || registration.createdAt <= recipient.enabledSince || registration.order.status !== "PAID" || !registration.order.paidAt || registration.order.paidAt <= recipient.enabledSince) return null;
    // Only the approved single-user protocol fields are sent, never persisted metadata or credentials.
    return { integration, message: { touser: message.touser, agentid: message.agentid, msgtype: message.msgtype, textcard: { title: message.textcard.title, description: message.textcard.description, url: message.textcard.url, btntxt: message.textcard.btntxt }, enable_duplicate_check: 1, duplicate_check_interval: 14400 } };
  }

  private async deliver(candidate: Delivery) {
    const item = await this.claim(candidate);
    if (!item) return;
    const finish = (data: Prisma.AdminRegistrationAlertUpdateManyMutationInput) => this.prisma.adminRegistrationAlert.updateMany({ where: { id: item.id, leaseToken: item.leaseToken, status: "SENDING" }, data: { ...data, leaseToken: null, leaseUntil: null } });
    let accepted = false;
    try {
      const context = await this.deliveryContext(item);
      if (!context) { await finish({ status: "CANCELLED", lastError: "配置、权限或报名状态已变更" }); return; }
      const forceRefresh = item.lastError === "WECOM_40014" || item.lastError === "WECOM_42001";
      const auth = await this.tokens.getAccessToken(context.integration, "self_built_app", forceRefresh);
      if (!auth.accessToken) throw new Error("DELIVERY_FAILED");
      let blockedStatus: "CANCELLED" | "PENDING" | "REVIEW" = "CANCELLED";
      const ready = await this.locked(item.recipient.adminUserId, async tx => {
        const current = await tx.adminRegistrationAlert.findUnique({ where: { id: item.id } });
        const now = new Date();
        if (!current || current.status !== "SENDING" || current.leaseToken !== item.leaseToken) return null;
        if (now.getTime() - item.firstAttemptAt.getTime() >= RETRY_WINDOW_MS || item.attempts > MAX_ATTEMPTS) { blockedStatus = "REVIEW"; return null; }
        if (process.env.ADMIN_PAID_ALERT_WORKER_ENABLED !== "true" || !current.leaseUntil || current.leaseUntil <= now) { blockedStatus = "PENDING"; return null; }
        const refreshed = await this.deliveryContext(item, tx);
        if (!refreshed || refreshed.integration.appSecretEnc !== context.integration.appSecretEnc) return null;
        const sendAt = new Date();
        if (sendAt.getTime() - item.firstAttemptAt.getTime() >= RETRY_WINDOW_MS) { blockedStatus = "REVIEW"; return null; }
        const renewed = await tx.adminRegistrationAlert.updateMany({ where: { id: item.id, leaseToken: item.leaseToken, status: "SENDING", leaseUntil: { gt: sendAt } }, data: { leaseUntil: new Date(sendAt.getTime() + LEASE_MS) } });
        if (!renewed.count) { blockedStatus = "PENDING"; return null; }
        return refreshed;
      });
      if (!ready) { await finish({ status: blockedStatus, nextAttemptAt: new Date(Date.now() + 60_000), lastError: "发送前配置或租约已变更" }); return; }
      const response = await fetch(`https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${encodeURIComponent(auth.accessToken)}`, {
        method: "POST", redirect: "error", headers: { "content-type": "application/json" }, body: JSON.stringify(ready.message), signal: AbortSignal.timeout(15_000)
      });
      const result = await response.json() as { errcode?: number; invaliduser?: string; unlicenseduser?: string } | null;
      if (!result || !Number.isSafeInteger(result.errcode)) throw new Error("DELIVERY_FAILED");
      if (!response.ok || result.errcode !== 0) throw new Error(`WECOM_${result.errcode || response.status}`);
      if (result.invaliduser || result.unlicenseduser) throw new Error("RECIPIENT_REJECTED");
      accepted = true;
      await finish({ status: "SENT", sentAt: new Date(), lastError: null });
    } catch (error) {
      const code = error instanceof Error && /^(WECOM_\d+|RECIPIENT_REJECTED)$/.test(error.message) ? error.message : "DELIVERY_FAILED";
      const nextAttemptAt = new Date(Date.now() + Math.min(900, 60 * 2 ** (item.attempts - 1)) * 1000);
      const stop = item.attempts >= MAX_ATTEMPTS || nextAttemptAt.getTime() - item.firstAttemptAt.getTime() >= RETRY_WINDOW_MS;
      // An accepted response followed by a local write failure is uncertain, not a new send request.
      await finish({ status: accepted || stop ? "REVIEW" : code === "RECIPIENT_REJECTED" ? "FAILED" : "PENDING", nextAttemptAt, lastError: accepted ? "DELIVERY_RESULT_NOT_SAVED" : code });
    }
  }
}
