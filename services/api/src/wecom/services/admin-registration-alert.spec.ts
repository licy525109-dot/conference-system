import "reflect-metadata";
import test, { TestContext } from "node:test";
import assert from "node:assert/strict";
import { AdminAlertRecipient, AdminRegistrationAlert, Prisma, WecomIntegration } from "@prisma/client";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AdminRegistrationAlertService, buildPaidAlert, validWecomRecipient } from "./admin-registration-alert.service";
import { AdminRegistrationAlertController } from "../admin-registration-alert.controller";
import { REQUIRED_ADMIN_PERMISSIONS } from "../../admin/require-permissions.decorator";
import { AdminJwtAuthGuard } from "../../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../../admin/admin-permission.guard";
import { PrismaService } from "../../prisma.service";
import { WecomTokenService } from "./wecom-token.service";
test("administrator alerts prohibit broadcast recipients and escape external text", () => {
  assert.equal(validWecomRecipient("@all"), false);
  assert.equal(validWecomRecipient("admin|outsider"), false);
  assert.equal(validWecomRecipient("admin.1"), true);
  const input = { id: "reg1", registrationNo: "R1", attendeeName: "<script>", paidAmountCent: 100, conference: { title: "会议" } };
  const payload = buildPaidAlert(input, "https://admin.example.com/", "admin.1", "1001");
  assert.ok(payload.textcard.description.includes("&lt;script&gt;"));
  assert.ok(!payload.textcard.description.includes("<script>"));
  assert.ok(payload.textcard.url.endsWith("#/mobile?registrationId=reg1"));
  assert.equal(payload.enable_duplicate_check, 1);
  assert.throws(() => buildPaidAlert(input, "http://admin.example.com", "admin.1", "1001"));
});

const NOW = Date.UTC(2030, 0, 1, 12);
const actor = { id: "config-admin", username: "config-admin", displayName: null };
const copy = <T>(value: T): T => structuredClone(value);
type Row = Record<string, unknown>;

// Deliberately bounded Prisma subset: unsupported predicates fail, never silently match.
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, expected]) => {
    if (key === "OR") return (expected as Row[]).some(part => matches(row, part));
    const actual = row[key];
    if (expected && typeof expected === "object" && !(expected instanceof Date)) {
      if (key === "recipient") return matches(actual as Row, expected as Row);
      return Object.entries(expected as Row).every(([op, value]) => {
        if (op === "not") return actual !== value;
        if (op === "in") return (value as unknown[]).includes(actual);
        if (op === "gt") return actual != null && (actual as number) > (value as number);
        if (op === "lte") return actual != null && (actual as number) <= (value as number);
        throw new Error(`Unsupported test predicate: ${op}`);
      });
    }
    return actual === expected;
  });
}

function setup(t: TestContext) {
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  const previousWorker = process.env.ADMIN_PAID_ALERT_WORKER_ENABLED;
  const previousUrl = process.env.ADMIN_PUBLIC_URL;
  process.env.ADMIN_PAID_ALERT_WORKER_ENABLED = "true";
  process.env.ADMIN_PUBLIC_URL = "https://admin.example.com/";
  t.after(() => {
    if (previousWorker === undefined) delete process.env.ADMIN_PAID_ALERT_WORKER_ENABLED; else process.env.ADMIN_PAID_ALERT_WORKER_ENABLED = previousWorker;
    if (previousUrl === undefined) delete process.env.ADMIN_PUBLIC_URL; else process.env.ADMIN_PUBLIC_URL = previousUrl;
  });
  const state = {
    recipient: { id: "recipient-1", adminUserId: "admin-1", integrationId: "app-1", wecomUserId: "admin.1", enabled: true, enabledSince: new Date(NOW - 60_000), createdAt: new Date(NOW - 60_000), updatedAt: new Date(NOW - 60_000) } as AdminAlertRecipient | null,
    integration: { id: "app-1", enabled: true, corpId: "corp-test", agentId: "1001", appSecretEnc: "test-only-encrypted-placeholder" } as WecomIntegration,
    allowed: true, adminEnabled: true,
    registrations: [{ id: "reg-1", registrationNo: "REG1", attendeeName: "Guest", paidAmountCent: 101, conference: { title: "Conference" }, status: "CONFIRMED", source: "PAYMENT", createdAt: new Date(NOW - 10_000), order: { status: "PAID", paidAt: new Date(NOW - 10_000) } }],
    alerts: [] as AdminRegistrationAlert[],
    audits: [] as unknown[], sql: [] as string[], operations: 0, failSentWrite: false,
    tokenHook: null as (() => Promise<void>) | null,
    pendingHook: null as (() => void) | null,
    reply: async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ errcode: 0 }))
  };
  const touch = () => { assert.ok(++state.operations < 500, "test exceeded bounded database budget"); };
  const withRecipient = (row: AdminRegistrationAlert) => ({ ...row, recipient: state.recipient });
  let transactionTail = Promise.resolve();
  const db = {
    $transaction: async (work: unknown, options?: { isolationLevel?: string }) => {
      touch();
      if (Array.isArray(work)) return Promise.all(work);
      assert.equal(options?.isolationLevel, "ReadCommitted");
      const previous = transactionTail;
      let unlock!: () => void;
      transactionTail = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      try { return await (work as (tx: typeof db) => Promise<unknown>)(db); } finally { unlock(); }
    },
    $queryRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      touch();
      const sql = strings.join("?"); state.sql.push(sql);
      if (sql.includes("pg_advisory_xact_lock")) { assert.match(String(values[0]), /^admin-paid-alert:/); return []; }
      assert.match(sql, /NOT EXISTS/); assert.match(sql, /LIMIT 50/);
      assert.match(sql, /o\."paidAt" > \?/); assert.match(sql, /r\."createdAt" > \?/);
      const since = values[0] as Date; const recipientId = values[2] as string;
      return state.registrations.filter(r => r.source === "PAYMENT" && r.status === "CONFIRMED" && r.paidAmountCent > 0 && r.createdAt > since && r.order.status === "PAID" && r.order.paidAt > since && !state.alerts.some(a => a.registrationId === r.id && a.recipientId === recipientId)).slice(0, 50).map(r => ({ id: r.id }));
    },
    adminUser: {
      findUnique: async () => { touch(); return { enabled: state.adminEnabled, roles: state.allowed ? [{ role: { code: "staff", permissions: [{ permission: { code: "registration:view" } }] } }] : [] }; },
      findMany: async () => [{ id: "admin-1", displayName: "Staff", username: "staff" }]
    },
    wecomIntegration: {
      findUnique: async () => { touch(); return copy(state.integration); },
      findMany: async ({ select }: { select: Row }) => { assert.deepEqual(Object.keys(select).sort(), ["agentId", "id", "name"]); return [{ id: "app-1", name: "App", agentId: "1001" }]; }
    },
    adminAlertRecipient: {
      findUnique: async () => { touch(); return copy(state.recipient); },
      findMany: async ({ where }: { where?: Row }) => { touch(); return state.recipient && matches(state.recipient as unknown as Row, where) ? [copy(state.recipient)] : []; },
      upsert: async ({ create, update }: { create: Row; update: Row }) => {
        touch(); state.recipient = { ...(state.recipient ?? { id: "recipient-1", createdAt: new Date() }), ...(state.recipient ? update : create), updatedAt: new Date() } as AdminAlertRecipient; return copy(state.recipient);
      }
    },
    registration: {
      findMany: async ({ where }: { where: Row }) => { touch(); return copy(state.registrations.filter(r => matches(r, where))); },
      findUnique: async ({ where }: { where: { id: string } }) => { touch(); return copy(state.registrations.find(r => r.id === where.id) ?? null); }
    },
    adminRegistrationAlert: {
      findUnique: async ({ where, include }: { where: { id: string }; include?: unknown }) => { touch(); const a = state.alerts.find(r => r.id === where.id); return a ? copy(include ? withRecipient(a) : a) : null; },
      findMany: async (args: { where?: Row; take?: number; select?: Row }) => {
        touch(); assert.ok(args.take && args.take <= 50);
        const rows = state.alerts.map(withRecipient).filter(r => matches(r as unknown as Row, args.where)).slice(0, args.take);
        if (args.select) { assert.ok(!args.select.payloadJson && !args.select.leaseToken); return rows.map(r => Object.fromEntries(Object.keys(args.select!).map(k => [k, (r as unknown as Row)[k]]))); }
        const result = copy(rows); state.pendingHook?.(); return result;
      },
      count: async ({ where }: { where: Row }) => { touch(); return state.alerts.filter(a => matches(a as unknown as Row, where)).length; },
      upsert: async ({ create, update }: { create: Prisma.AdminRegistrationAlertUncheckedCreateInput; update: Row }) => {
        touch(); assert.deepEqual(update, {});
        let row = state.alerts.find(a => a.registrationId === create.registrationId && a.recipientId === create.recipientId);
        if (!row) { row = { id: `alert-${state.alerts.length}`, status: "PENDING", attempts: 0, nextAttemptAt: new Date(), firstAttemptAt: null, leaseToken: null, leaseUntil: null, sentAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date(), ...create } as AdminRegistrationAlert; state.alerts.push(row); }
        return copy(row);
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        touch();
        if (state.failSentWrite && data.status === "SENT") { state.failSentWrite = false; throw new Error("database unavailable"); }
        let count = 0;
        for (const row of state.alerts) if (matches(withRecipient(row) as unknown as Row, where)) {
          const update = { ...data }; if (update.attempts) update.attempts = row.attempts + (update.attempts as { increment: number }).increment;
          Object.assign(row, update); count++;
        }
        return { count };
      }
    },
    auditLog: { create: async (data: unknown) => { state.audits.push(copy(data)); return {}; } }
  };
  const tokenCalls: Array<{ refresh: boolean }> = [];
  const tokens = { getAccessToken: async (_integration: unknown, mode: string, refresh: boolean) => {
    assert.equal(mode, "self_built_app"); tokenCalls.push({ refresh }); await state.tokenHook?.(); return { accessToken: "mock-token/with?symbols" };
  } };
  const requests: Array<{ url: string; init: RequestInit }> = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.ok(requests.length < 10, "test exceeded bounded HTTP budget");
    assert.equal(new URL(url).origin, "https://qyapi.weixin.qq.com");
    assert.equal(init.redirect, "error"); assert.ok(init.signal instanceof AbortSignal);
    requests.push({ url, init }); return state.reply(url, init);
  });
  const makeService = () => new AdminRegistrationAlertService(db as unknown as PrismaService, tokens as unknown as WecomTokenService);
  const service = makeService();
  const configure = (overrides: Row = {}) => service.configure({ adminUserId: "admin-1", integrationId: "app-1", wecomUserId: "admin.1", enabled: true, ...overrides }, actor);
  const seed = () => {
    const recipient = state.recipient!;
    const row: AdminRegistrationAlert = { id: "alert-seed", registrationId: "reg-1", recipientId: recipient.id, status: "PENDING", attempts: 0, nextAttemptAt: new Date(), firstAttemptAt: null, leaseToken: null, leaseUntil: null, sentAt: null, lastError: null, createdAt: new Date(), updatedAt: new Date(), payloadJson: { configurationKey: JSON.stringify([recipient.adminUserId, recipient.integrationId, recipient.wecomUserId, recipient.enabledSince.toISOString(), state.integration.corpId, state.integration.agentId]), message: buildPaidAlert(state.registrations[0], process.env.ADMIN_PUBLIC_URL!, recipient.wecomUserId, state.integration.agentId!) } };
    state.alerts.push(row); return row;
  };
  return { state, service, makeService, configure, seed, requests, tokenCalls };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

test("payload rejects broadcast, multiple recipients, invalid agent IDs and credential-bearing URLs", () => {
  const reg = { id: "r", registrationNo: "R", attendeeName: "Guest", paidAmountCent: 1, conference: { title: "Meeting" } };
  for (const id of ["@all", "@ALL", "a|b", "a,b", " a", "", "a\n"]) assert.throws(() => buildPaidAlert(reg, "https://admin.example.com", id, "1"));
  for (const id of ["0", "-1", "NaN", "9007199254740992", "1.5"]) assert.throws(() => buildPaidAlert(reg, "https://admin.example.com", "a", id));
  for (const url of ["invalid", "http://admin.example.com", "https://user:password@admin.example.com", "https://admin.example.com?token=example"]) assert.throws(() => buildPaidAlert(reg, url, "a", "1"));
});

test("configuration routes require authenticated account managers with registration access", () => {
  assert.deepEqual(Reflect.getMetadata(GUARDS_METADATA, AdminRegistrationAlertController), [AdminJwtAuthGuard, AdminPermissionGuard]);
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminRegistrationAlertController.prototype.get), ["notification:view", "system:account", "registration:view"]);
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminRegistrationAlertController.prototype.put), ["notification:write", "system:account", "wecom:send", "registration:view"]);
});

test("first enable only enqueues newly paid registrations, not historical paid imports", { timeout: 2000 }, async t => {
  const h = setup(t); h.state.recipient = null;
  await h.configure();
  assert.equal(h.state.recipient!.enabledSince.getTime(), NOW);
  const old = h.state.registrations[0];
  h.state.registrations.push({ ...copy(old), id: "late-import", createdAt: new Date(NOW + 1) });
  h.state.registrations.push({ ...copy(old), id: "new-paid", registrationNo: "REG2", createdAt: new Date(NOW + 1), order: { status: "PAID", paidAt: new Date(NOW + 1) } });
  t.mock.timers.tick(2);
  await h.service.tick();
  assert.deepEqual(h.state.alerts.map(a => a.registrationId), ["new-paid"]);
  assert.equal(h.requests.length, 1); assert.equal(h.state.alerts[0].status, "SENT");
  assert.ok(h.state.sql.some(sql => sql.includes("NOT EXISTS")));
});

test("two workers claim once and repeated scans do not duplicate delivery", { timeout: 2000 }, async t => {
  const h = setup(t);
  await Promise.all([h.service.tick(), h.makeService().tick()]);
  await h.service.tick();
  assert.equal(h.state.alerts.length, 1); assert.equal(h.requests.length, 1); assert.equal(h.state.alerts[0].attempts, 1);
  const message = JSON.parse(h.requests[0].init.body as string);
  assert.equal(message.touser, "admin.1"); assert.equal(message.toparty, undefined); assert.equal(message.configurationKey, undefined);
  assert.equal(new URL(h.requests[0].url).searchParams.get("access_token"), "mock-token/with?symbols");
  assert.ok(!JSON.stringify(h.state.alerts).includes("mock-token"));
});

test("disabled worker never touches database or transport", { timeout: 2000 }, async t => {
  const h = setup(t); process.env.ADMIN_PAID_ALERT_WORKER_ENABLED = "false";
  await h.service.tick(); assert.equal(h.state.operations, 0); assert.equal(h.requests.length, 0);
});

test("stale candidate cannot steal a newly renewed lease", { timeout: 2000 }, async t => {
  const h = setup(t); const alert = h.seed();
  h.state.pendingHook = () => { alert.status = "SENDING"; alert.leaseToken = "another-worker"; alert.leaseUntil = new Date(NOW + 120_000); };
  await h.service.tick();
  assert.equal(alert.leaseToken, "another-worker"); assert.equal(alert.attempts, 0); assert.equal(h.requests.length, 0);
});

test("expired leases recover, but active leases and exhausted dedup windows are not resent", { timeout: 2000 }, async t => {
  const h = setup(t); const alert = h.seed();
  alert.status = "SENDING"; alert.leaseToken = "expired"; alert.leaseUntil = new Date(NOW - 1); alert.firstAttemptAt = new Date(NOW - 60_000); alert.attempts = 1;
  await h.service.tick(); assert.equal(alert.status, "SENT"); assert.equal(alert.attempts, 2);
  alert.status = "SENDING"; alert.leaseToken = "active"; alert.leaseUntil = new Date(NOW + 1); alert.firstAttemptAt = new Date(NOW - 4 * 3600_000);
  await h.service.tick(); assert.equal(alert.status, "SENDING");
  t.mock.timers.tick(2); await h.service.tick(); assert.equal(alert.status, "REVIEW"); assert.equal(h.requests.length, 1);
});

test("disable while token is loading fences the sender even after role revocation", { timeout: 2000 }, async t => {
  const h = setup(t); const started = deferred(); const release = deferred();
  h.state.tokenHook = async () => { started.resolve(); await release.promise; };
  const running = h.service.tick(); await started.promise;
  h.state.allowed = false; h.state.integration.enabled = false;
  await h.configure({ enabled: false }); release.resolve(); await running;
  assert.equal(h.requests.length, 0); assert.equal(h.state.alerts[0].status, "CANCELLED"); assert.equal(h.state.alerts[0].leaseToken, null);
});

test("send-time checks revoke roles, disabled admins, integrations, registrations and payload broadcast", { timeout: 3000 }, async t => {
  const h = setup(t);
  const changes: Array<() => void> = [() => { h.state.allowed = false; }, () => { h.state.adminEnabled = false; }, () => { h.state.integration.enabled = false; }, () => { h.state.integration.corpId = "another-corp"; }, () => { h.state.registrations[0].status = "REFUNDED"; }, () => { h.state.registrations[0].order.status = "REFUNDED"; }, () => { h.state.recipient!.wecomUserId = "@all"; }];
  for (const change of changes) {
    h.state.allowed = true; h.state.adminEnabled = true; h.state.integration.enabled = true; h.state.integration.corpId = "corp-test"; h.state.registrations[0].status = "CONFIRMED"; h.state.registrations[0].order.status = "PAID"; h.state.recipient!.wecomUserId = "admin.1";
    h.state.alerts = []; h.seed(); h.state.tokenHook = async () => { change(); };
    await h.service.tick(); assert.equal(h.state.alerts[0].status, "CANCELLED");
  }
  assert.equal(h.requests.length, 0);
});

test("token acquisition cannot renew or finish a lease already taken by another worker", { timeout: 2000 }, async t => {
  const h = setup(t); const row = h.seed();
  h.state.tokenHook = async () => { row.leaseToken = "new-owner"; row.leaseUntil = new Date(NOW + 120_000); };
  await h.service.tick();
  assert.equal(row.leaseToken, "new-owner"); assert.equal(row.status, "SENDING"); assert.equal(h.requests.length, 0);
});

test("long token wait cannot send on expired lease or outside retry window", { timeout: 2000 }, async t => {
  const h = setup(t); const row = h.seed();
  h.state.tokenHook = async () => { t.mock.timers.tick(120_001); };
  await h.service.tick(); assert.equal(row.status, "PENDING"); assert.equal(h.requests.length, 0);
  row.nextAttemptAt = new Date();
  h.state.tokenHook = async () => { t.mock.timers.tick(4 * 3600_000); };
  await h.service.tick(); assert.equal(row.status, "REVIEW"); assert.equal(h.requests.length, 0);
});

test("same configuration preserves watermark, changed config cancels pending and leaves sent history", { timeout: 2000 }, async t => {
  const h = setup(t); const row = h.seed(); const since = h.state.recipient!.enabledSince.getTime();
  await h.configure(); assert.equal(h.state.recipient!.enabledSince.getTime(), since); assert.equal(row.status, "PENDING");
  row.status = "SENDING"; row.leaseUntil = new Date(NOW + 120_000);
  await assert.rejects(h.configure({ wecomUserId: "admin.2" }), /正在发送/);
  row.status = "PENDING"; await h.configure({ wecomUserId: "admin.2" });
  assert.equal(row.status, "CANCELLED"); assert.ok(h.state.recipient!.enabledSince.getTime() > since);
  row.status = "SENT"; await h.configure({ enabled: false }); assert.equal(row.status, "SENT");
  const disabledSince = h.state.recipient!.enabledSince.getTime();
  await h.configure(); assert.ok(h.state.recipient!.enabledSince.getTime() > disabledSince);
  assert.ok(!JSON.stringify(h.state.audits).includes("test-only-encrypted-placeholder"));
});

test("invalid recipients and revoked accounts cannot enable alerts", { timeout: 2000 }, async t => {
  const h = setup(t);
  await assert.rejects(h.configure({ wecomUserId: "@all" }));
  h.state.allowed = false; await assert.rejects(h.configure(), /权限/);
  h.state.allowed = true; h.state.integration.agentId = "0"; await assert.rejects(h.configure(), /配置/);
  assert.equal(h.state.audits.length, 0); assert.equal(h.requests.length, 0);
});

test("ambiguous failure retries with bounded backoff, identical payload and scrubbed errors", { timeout: 2000 }, async t => {
  const h = setup(t); h.state.reply = async () => { throw new Error("secret=https://qyapi.weixin.qq.com/?access_token=mock-token/with?symbols"); };
  await h.service.tick(); const row = h.state.alerts[0]; const payload = h.requests[0].init.body;
  assert.equal(row.status, "PENDING"); assert.equal(row.lastError, "DELIVERY_FAILED"); assert.equal(row.nextAttemptAt.getTime(), NOW + 60_000);
  await h.service.tick(); assert.equal(h.requests.length, 1);
  t.mock.timers.tick(60_000); h.state.reply = async () => new Response(JSON.stringify({ errcode: 0 }));
  await h.service.tick(); assert.equal(row.status, "SENT"); assert.equal(h.requests[1].init.body, payload); assert.equal(row.attempts, 2);
  assert.ok(!JSON.stringify(row).includes("mock-token"));
});

test("expired token is refreshed on next retry without exposing credentials", { timeout: 2000 }, async t => {
  const h = setup(t); h.state.reply = async () => new Response(JSON.stringify({ errcode: 42001, errmsg: "sensitive upstream text" }));
  await h.service.tick(); assert.equal(h.state.alerts[0].lastError, "WECOM_42001");
  t.mock.timers.tick(60_000); h.state.reply = async () => new Response(JSON.stringify({ errcode: 0 }));
  await h.service.tick(); assert.deepEqual(h.tokenCalls, [{ refresh: false }, { refresh: true }]); assert.equal(h.state.alerts[0].status, "SENT");
});

test("token exceptions never leak raw URL or secret in configuration results", { timeout: 2000 }, async t => {
  const h = setup(t); h.state.tokenHook = async () => { throw new Error("appSecret=sample-secret&access_token=sample-token"); };
  await h.service.tick(); assert.equal(h.state.alerts[0].lastError, "DELIVERY_FAILED"); assert.equal(h.requests.length, 0);
  const snapshot = JSON.stringify((await h.service.configuration()).data);
  assert.ok(!snapshot.includes("sample-secret") && !snapshot.includes("sample-token") && !snapshot.includes("payloadJson") && !snapshot.includes("leaseToken"));
});

test("malformed provider success stays uncertain and never becomes SENT", { timeout: 2000 }, async t => {
  const h = setup(t);
  for (const body of ["null", "{}", JSON.stringify({ errcode: "0" }), "not-json"]) {
    h.state.alerts = []; h.state.reply = async () => new Response(body);
    await h.service.tick(); assert.equal(h.state.alerts[0].status, "PENDING"); assert.equal(h.state.alerts[0].lastError, "DELIVERY_FAILED");
  }
  assert.equal(h.requests.length, 4);
});

test("invalid or unlicensed user is not marked sent and does not retry forever", { timeout: 2000 }, async t => {
  const h = setup(t);
  for (const field of ["invaliduser", "unlicenseduser"]) {
    h.state.alerts = []; h.state.reply = async () => new Response(JSON.stringify({ errcode: 0, [field]: "admin.1" }));
    await h.service.tick(); assert.equal(h.state.alerts[0].status, "FAILED"); assert.equal(h.state.alerts[0].lastError, "RECIPIENT_REJECTED");
  }
  await h.service.tick(); assert.equal(h.requests.length, 2);
});

test("last ambiguous attempt and accepted-but-unsaved result require manual review", { timeout: 2000 }, async t => {
  const h = setup(t); const row = h.seed(); row.attempts = 4; row.firstAttemptAt = new Date(NOW - 60_000);
  h.state.reply = async () => { throw new Error("connection interrupted"); };
  await h.service.tick(); assert.equal(row.status, "REVIEW"); assert.equal(row.attempts, 5);
  h.state.alerts = []; h.state.failSentWrite = true; h.state.reply = async () => new Response(JSON.stringify({ errcode: 0 }));
  await h.service.tick(); assert.equal(h.state.alerts[0].status, "REVIEW"); assert.equal(h.state.alerts[0].lastError, "DELIVERY_RESULT_NOT_SAVED");
  await h.service.tick(); assert.equal(h.requests.length, 2);
});
