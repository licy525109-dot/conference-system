import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

test("external check-in real API and PostgreSQL", { skip: !process.env.EXTERNAL_CHECKIN_TEST_DATABASE_URL, timeout: 120_000 }, async t => {
  const url = new URL(process.env.EXTERNAL_CHECKIN_TEST_DATABASE_URL!);
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname)); assert.equal(url.pathname, "/external_checkin_test");
  process.env.DATABASE_URL = url.toString(); process.env.JWT_SECRET = randomBytes(48).toString("hex"); process.env.NODE_ENV = "test";
  const req = createRequire(resolve("services/api/package.json")), { NestFactory } = req("@nestjs/core"), { AppModule } = req("./dist/app.module.js");
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api");
  app.use(req("express").json({ limit: "4mb" }));
  app.use(req("./dist/security/request-rate-limit.js").createSensitiveEndpointRateLimiter());
  app.use("/api/external-checkin-assets", req("express").static(resolve("apps/admin/dist/assets")));
  await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl(), db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const eventIds: string[] = [], adminIds: string[] = [], roleIds: string[] = [];
  const password = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex"), passwordHash = `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")}`;
  const fields = [
    { key: "name", label: "姓名", input: true, required: true, match: false },
    { key: "code", label: "报名编号", input: true, required: true, match: true },
    { key: "company", label: "单位", input: true, required: false, match: false },
    { key: "internal", label: "内部座位", input: false, required: false, match: false }
  ];
  async function call(path: string, token?: string, body?: unknown, expected = body === undefined ? 200 : 201, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json(); assert.equal(response.status, expected, `${method} ${path}: ${payload.message}`); return payload.data;
  }
  const base = "/admin/external-checkins";
  let manager = "", viewer = "", scoped = "", a: any, b: any, meta: any;
  const rows = [{ name: "测试同名", code: "001", company: "原单位甲", internal: "A01" }, { name: "测试同名", code: "002", company: "原单位乙", internal: "A02" }];
  async function importRows(event: any, records: unknown[]) {
    const body = { rows: records, revision: event.revision }, plan = await call(`${base}/${event.id}/import/preview`, manager, body);
    assert.equal(plan.errors.length, 0); return call(`${base}/${event.id}/import`, manager, { ...body, digest: plan.digest });
  }
  try {
    await app.get(req("./dist/admin/admin-access.service.js").AdminAccessService).ensureBuiltInAccess();
    for (const label of ["manager", "viewer", "scoped"]) {
      const permissions = label === "viewer" ? ["external-checkin:view"] : ["external-checkin:view", "external-checkin:write"];
      const role = await db.role.create({ data: { code: `external-${label}-${suffix}`, name: "外部签到测试", permissions: { create: permissions.map(code => ({ permission: { connect: { code } } })) } } }); roleIds.push(role.id);
      const admin = await db.adminUser.create({ data: { username: `external-${label}-${suffix}`, passwordHash, conferenceScopeMode: label === "scoped" ? "ASSIGNED" : "ALL", roles: { create: { roleId: role.id } } } }); adminIds.push(admin.id);
      const login = await call("/admin/auth/login", undefined, { username: admin.username, password });
      if (label === "manager") manager = login.token; else if (label === "viewer") viewer = login.token; else scoped = login.token;
    }
    await t.test("admin authentication, write permission and scope isolation", async () => {
      await call(base, undefined, undefined, 401); await call(base, scoped, undefined, 403);
      await call(base, viewer, { title: "拒绝创建", fields }, 403);
      a = await call(base, manager, { title: "【测试数据】外部会议甲", fields, description: "仅报名编号核验" }); eventIds.push(a.id);
      b = await call(base, manager, { title: "【测试数据】外部会议乙", fields }); eventIds.push(b.id);
      assert.equal(a.enabled, false); assert.equal(a.statistics.total, 0);
      await call(`${base}/${a.id}`, manager, { ...a, enabled: true }, 409, "PATCH");
      await call(`${base}/${a.id}/export`, undefined, undefined, 401);
      await call(`${base}/${a.id}/import/preview`, viewer, { rows, revision: a.revision }, 403);
    });
    await t.test("atomic import, stale preview, digest validation, duplicates and ambiguity", async () => {
      const invalidRows = [rows[0], { ...rows[1], code: "001" }], body = { rows: invalidRows, revision: a.revision };
      const invalid = await call(`${base}/${a.id}/import/preview`, manager, body); assert.equal(invalid.errors.length, 1);
      await call(`${base}/${a.id}/import`, manager, { ...body, digest: invalid.digest }, 400);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: a.id } }), 0);
      const good = { rows, revision: a.revision }, preview = await call(`${base}/${a.id}/import/preview`, manager, good);
      await call(`${base}/${a.id}/import`, manager, { ...good, rows: [rows[0]], digest: preview.digest }, 409);
      a = await importRows(a, rows);
      await call(`${base}/${a.id}/import`, manager, { ...good, digest: preview.digest }, 409);
      const duplicates = await call(`${base}/${a.id}/import/preview`, manager, { rows, revision: a.revision }); assert.equal(duplicates.skipped, 2); assert.equal(duplicates.added, 0);
      a = await importRows(a, rows); assert.equal(a.statistics.total, 2);
      b = await importRows(b, [{ ...rows[0], code: "B01" }]);
      a = await call(`${base}/${a.id}`, manager, { ...a, enabled: true }, 200, "PATCH");
      b = await call(`${base}/${b.id}`, manager, { ...b, enabled: true }, 200, "PATCH");
    });
    await t.test("public metadata omits roster and internal fields; production HTML and assets work", async () => {
      meta = await call(`/external-checkins/${a.publicToken}`);
      assert.deepEqual(meta.fields.map((field: any) => field.key), ["name", "code", "company"]);
      assert.equal(meta.fields[2].required, false);
      const text = JSON.stringify(meta); for (const secret of ["测试同名", "原单位甲", "A01", "internal", "matchKey"]) assert.equal(text.includes(secret), false);
      const response = await fetch(`${origin}${a.publicPath}`); assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store");
      const html = await response.text(), src = html.match(/src="(\/api\/external-checkin-assets\/[^\"]+\.js)"/); assert.ok(src);
      assert.equal((await fetch(`${origin}${src[1]}`)).status, 200);
      await call("/external-checkins/invalid-token", undefined, undefined, 404);
    });
    await t.test("only selected fields verify; failure has no state mutation and no candidate disclosure", async () => {
      const endpoint = `/external-checkins/${a.publicToken}/submit`;
      await call(endpoint, undefined, { values: { code: "001" }, formVersion: meta.formVersion }, 400);
      const missing = await call(endpoint, undefined, { values: { name: "任意姓名", code: "999" }, formVersion: meta.formVersion });
      assert.equal(missing.success, false); assert.equal(missing.checkedInAt, null); assert.equal(JSON.stringify(missing).includes("原单位"), false);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: a.id, checkedInAt: { not: null } } }), 0);
      const otherMeta = await call(`/external-checkins/${b.publicToken}`);
      assert.equal((await call(`/external-checkins/${b.publicToken}/submit`, undefined, { values: { name: "姓名", code: "001" }, formVersion: otherMeta.formVersion })).success, false);
      const result = await call(endpoint, undefined, { values: { name: "现场填写不同姓名", code: "００１ ", company: "现场新单位", internal: "不应保存" }, formVersion: meta.formVersion });
      assert.equal(result.success, true); assert.equal(result.alreadyCheckedIn, false);
      const row = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: a.id, checkedInAt: { not: null } } });
      assert.deepEqual(row.values, rows[0]); assert.deepEqual(row.submittedValues, { name: "现场填写不同姓名", code: "001", company: "现场新单位" });
      const repeat = await call(endpoint, undefined, { values: { name: "另一填写", code: "001", company: "不覆盖" }, formVersion: meta.formVersion });
      assert.equal(repeat.alreadyCheckedIn, true); assert.equal(repeat.checkedInAt, result.checkedInAt);
      assert.deepEqual((await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: row.id } })).submittedValues, row.submittedValues);
    });
    await t.test("concurrent submissions record exactly one first check-in and audit entry", async () => {
      const body = { values: { name: "并发测试", code: "002", company: "" }, formVersion: meta.formVersion };
      const results = await Promise.all(Array.from({ length: 12 }, () => call(`/external-checkins/${a.publicToken}/submit`, undefined, body)));
      assert.equal(results.filter(result => !result.alreadyCheckedIn).length, 1);
      assert.equal(new Set(results.map(result => result.checkedInAt)).size, 1);
      const attendees = await db.externalCheckinAttendee.findMany({ where: { eventId: a.id } });
      assert.equal(await db.auditLog.count({ where: { entityType: "ExternalCheckinAttendee", entityId: { in: attendees.map(row => row.id) } } }), 2);
      a = await call(`${base}/${a.id}`, manager); assert.deepEqual(a.statistics, { total: 2, checkedIn: 2, pending: 0 });
      a = await importRows(a, rows); assert.equal(a.statistics.checkedIn, 2);
      const exported = await call(`${base}/${a.id}/export`, viewer); assert.equal(exported.items.length, 2); assert.ok(exported.items[0].submittedValues);
      assert.equal((await call(`${base}/${a.id}/attendees?status=PENDING`, viewer)).total, 0);
      assert.equal((await call(`${base}/${a.id}/attendees?keyword=原单位甲`, viewer)).total, 1);
      assert.equal((await call(`${base}/${a.id}/attendees?keyword=现场新单位`, viewer)).total, 1);
    });
    await t.test("pause is synchronized with submission; time windows and stale forms reject writes", async () => {
      let locked!: () => void, release!: () => void;
      const ready = new Promise<void>(resolve => { locked = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      const holding = db.$transaction(async tx => { await tx.$queryRaw`SELECT "id" FROM "external_checkin_events" WHERE "id" = ${a.id} FOR UPDATE`; await tx.externalCheckinEvent.update({ where: { id: a.id }, data: { enabled: false } }); locked(); await gate; });
      await ready;
      const attempt = call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "暂停竞争", code: "001" }, formVersion: meta.formVersion }, 409);
      release(); await holding; await attempt;
      a = await call(`${base}/${a.id}`, manager);
      a = await call(`${base}/${a.id}`, manager, { ...a, enabled: true, startsAt: new Date(Date.now() + 3600_000).toISOString() }, 200, "PATCH");
      await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "时间窗口", code: "001" }, formVersion: meta.formVersion }, 409);
      a = await call(`${base}/${a.id}`, manager, { ...a, startsAt: null, endsAt: new Date(Date.now() - 1000).toISOString() }, 200, "PATCH");
      await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "时间窗口", code: "001" }, formVersion: meta.formVersion }, 409);
      a = await call(`${base}/${a.id}`, manager, { ...a, enabled: false, endsAt: null }, 200, "PATCH");
      const ambiguous = fields.map(field => ({ ...field, match: field.key === "name" }));
      await call(`${base}/${a.id}`, manager, { ...a, fields: ambiguous }, 409, "PATCH");
      const newFields = fields.map(field => ({ ...field, match: ["name", "code"].includes(field.key) }));
      a = await call(`${base}/${a.id}`, manager, { ...a, fields: newFields }, 200, "PATCH");
      a = await call(`${base}/${a.id}`, manager, { ...a, enabled: true }, 200, "PATCH");
      await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "测试同名", code: "001" }, formVersion: meta.formVersion }, 409);
      const nextMeta = await call(`/external-checkins/${a.publicToken}`);
      assert.equal((await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "错误姓名", code: "001" }, formVersion: nextMeta.formVersion })).success, false);
      assert.equal((await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "测试同名", code: "001" }, formVersion: nextMeta.formVersion })).alreadyCheckedIn, true);
    });
    await t.test("no payment, order, user or registration records were created", async () => {
      assert.equal(await db.order.count(), 0); assert.equal(await db.payment.count(), 0); assert.equal(await db.user.count(), 0); assert.equal(await db.registration.count(), 0);
    });
  } finally {
    const attendees = await db.externalCheckinAttendee.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { OR: [{ adminUserId: { in: adminIds } }, { entityId: { in: [...eventIds, ...attendees.map(row => row.id)] } }] } });
    await db.externalCheckinEvent.deleteMany({ where: { id: { in: eventIds } } }); await db.adminUser.deleteMany({ where: { id: { in: adminIds } } }); await db.role.deleteMany({ where: { id: { in: roleIds } } });
    await db.$disconnect(); await app.close();
  }
});
