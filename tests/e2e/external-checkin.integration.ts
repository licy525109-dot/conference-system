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
  let manager = "", viewer = "", scoped = "", a: any, b: any, c: any, d: any, meta: any;
  const rows = [{ name: "测试同名", code: "001", company: "原单位甲", internal: "A01" }, { name: "测试同名", code: "002", company: "原单位乙", internal: "A02" }];
  async function importRows(event: any, records: unknown[]) {
    const body = { rows: records, revision: event.revision }, plan = await call(`${base}/${event.id}/import/preview`, manager, body);
    const decisions = plan.duplicates.map((group: any) => ({ groupId: group.id, keepCandidateId: (group.candidates.find((candidate: any) => candidate.source === "existing") || group.candidates[0]).id }));
    assert.equal(plan.errors.length, 0); return call(`${base}/${event.id}/import`, manager, { ...body, decisions, digest: plan.digest });
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
      const invalid = await call(`${base}/${a.id}/import/preview`, manager, body); assert.equal(invalid.errors.length, 0); assert.equal(invalid.unresolved, 1);
      assert.deepEqual(invalid.duplicates[0].differingFields, ["company", "internal"]);
      assert.deepEqual(invalid.duplicates[0].candidates.map((candidate: any) => candidate.row), [2, 3]);
      await call(`${base}/${a.id}/import`, manager, { ...body, digest: invalid.digest }, 400);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: a.id } }), 0);
      const good = { rows, revision: a.revision }, preview = await call(`${base}/${a.id}/import/preview`, manager, good);
      await call(`${base}/${a.id}/import`, manager, { ...good, rows: [rows[0]], digest: preview.digest }, 409);
      a = await importRows(a, rows);
      await call(`${base}/${a.id}/import`, manager, { ...good, digest: preview.digest }, 409);
      const duplicates = await call(`${base}/${a.id}/import/preview`, manager, { rows, revision: a.revision }); assert.equal(duplicates.skipped, 2); assert.equal(duplicates.deduplicated, 2); assert.equal(duplicates.added, 0); assert.equal(duplicates.unresolved, 0);
      a = await importRows(a, rows); assert.equal(a.statistics.total, 2);
      b = await importRows(b, [{ ...rows[0], code: "B01" }]);
      a = await call(`${base}/${a.id}`, manager, { ...a, enabled: true }, 200, "PATCH");
      b = await call(`${base}/${b.id}`, manager, { ...b, enabled: true }, 200, "PATCH");
    });
    await t.test("file duplicates expose all rows and columns; choices are explicit, validated and atomic", async () => {
      c = await call(base, manager, { title: "【测试数据】名单重复处理与手动录入", fields }); eventIds.push(c.id);
      const records = [
        { ...rows[0], code: "D1", company: "第一条资料" },
        { ...rows[0], code: "D1", company: "第二条资料" },
        { ...rows[0], code: "D1", company: "管理员选中资料" },
        { ...rows[1], code: "D2" }, { ...rows[1], code: "D2", company: "差异单位" }, { ...rows[1], code: "D2" },
        { ...rows[0], code: "D3" }
      ];
      const body = { rows: records, rowNumbers: [2, 5, 8, 9, 10, 11, 15], source: "file", revision: c.revision };
      const plan = await call(`${base}/${c.id}/import/preview`, manager, body);
      assert.deepEqual([plan.added, plan.updated, plan.skipped, plan.deduplicated, plan.unresolved, plan.errors.length], [1, 0, 1, 1, 2, 0]);
      assert.deepEqual(plan.duplicates[0].candidates.map((candidate: any) => candidate.row), [2, 5, 8]);
      assert.deepEqual(plan.duplicates[0].differingFields, ["company"]);
      assert.deepEqual(plan.duplicates[0].candidates[2].values, records[2]);
      assert.deepEqual(plan.duplicates[1].differingFields, ["company"]); assert.equal(plan.duplicates[1].candidates.length, 2);
      const first = { groupId: plan.duplicates[0].id, keepCandidateId: plan.duplicates[0].candidates[2].id };
      const second = { groupId: plan.duplicates[1].id, keepCandidateId: plan.duplicates[1].candidates[0].id };
      for (const decisions of [[], [first], [first, first], [{ ...first, keepCandidateId: second.keepCandidateId }, second], [{ ...first, keepCandidateId: "existing:foreign-attendee" }, second], [first, second, { groupId: "foreign-group", keepCandidateId: "incoming:0" }]]) {
        await call(`${base}/${c.id}/import`, manager, { ...body, digest: plan.digest, decisions }, 400);
      }
      const decisions = [first, second];
      await call(`${base}/${c.id}/import`, manager, { ...body, rowNumbers: [2, 4, 8, 9, 10, 11, 15], digest: plan.digest, decisions }, 409);
      const invalidBody = { ...body, rows: [...records, { code: "" }], rowNumbers: [...body.rowNumbers, 16] };
      const invalid = await call(`${base}/${c.id}/import/preview`, manager, invalidBody);
      assert.equal(invalid.errors[0].row, 16);
      await call(`${base}/${c.id}/import`, manager, { ...invalidBody, digest: invalid.digest, decisions }, 400);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: c.id } }), 0);
      c = await call(`${base}/${c.id}/import`, manager, { ...body, digest: plan.digest, decisions });
      assert.equal(c.statistics.total, 3);
      const saved = await db.externalCheckinAttendee.findMany({ where: { eventId: c.id } });
      assert.deepEqual(saved.find(row => (row.values as any).code === "D1")?.values, records[2]);
    });
    await t.test("manual entry uses configured roster fields, requires verification values and enforces permissions", async () => {
      const body = { source: "manual", revision: c.revision, rows: [{ code: "M1", name: "手动测试嘉宾", company: "手动单位", internal: "M01" }], rowNumbers: [1] };
      await call(`${base}/${c.id}/import/preview`, undefined, body, 401);
      await call(`${base}/${c.id}/import/preview`, viewer, body, 403);
      await call(`${base}/${c.id}/import/preview`, scoped, body, 403);
      await call(`${base}/${c.id}/import/preview`, manager, { ...body, rows: [...body.rows, ...body.rows] }, 400);
      await call(`${base}/${c.id}/import/preview`, manager, { ...body, source: "unknown" }, 400);
      const invalid = await call(`${base}/${c.id}/import/preview`, manager, { ...body, rows: [{ name: "缺少核验信息" }] });
      assert.equal(invalid.errors[0].message, "请填写报名编号");
      await call(`${base}/${c.id}/import`, manager, { ...body, rows: [{ name: "缺少核验信息" }], digest: invalid.digest }, 400);
      const minimal = await call(`${base}/${c.id}/import/preview`, manager, { ...body, rows: [{ code: "仅核验必填" }] });
      assert.equal(minimal.errors.length, 0);
      const plan = await call(`${base}/${c.id}/import/preview`, manager, body);
      assert.equal(plan.added, 1); assert.equal(plan.unresolved, 0);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: c.id } }), 3);
      await call(`${base}/${c.id}/import`, viewer, { ...body, digest: plan.digest }, 403);
      await call(`${base}/${c.id}/import`, manager, { ...body, source: "file", digest: plan.digest }, 409);
      c = await call(`${base}/${c.id}/import`, manager, { ...body, digest: plan.digest });
      assert.equal(c.statistics.total, 4);
      const saved = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "M1" } } });
      assert.deepEqual(saved.values, body.rows[0]); assert.equal(saved.checkedInAt, null);
      assert.equal(await db.auditLog.count({ where: { entityId: c.id, summary: { startsWith: "手动录入外部名单" } } }), 1);
    });
    await t.test("keeping incoming duplicate updates in place and preserves first check-in, submitted values and historical fields", async () => {
      c = await call(`${base}/${c.id}`, manager, { ...c, enabled: true }, 200, "PATCH");
      const publicForm = await call(`/external-checkins/${c.publicToken}`);
      const checked = await call(`/external-checkins/${c.publicToken}/submit`, undefined, { formVersion: publicForm.formVersion, values: { code: "D1", name: "现场填写姓名", company: "现场填写单位" } });
      const original = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "D1" } } });
      await db.externalCheckinAttendee.update({ where: { id: original.id }, data: { values: { ...(original.values as object), historical: "已移除字段的历史值" } } });
      const incoming = { ...rows[0], code: "D1", company: "管理员手动修正", internal: "VIP01" };
      const body = { source: "manual", revision: c.revision, rows: [incoming], rowNumbers: [1] };
      const plan = await call(`${base}/${c.id}/import/preview`, manager, body), group = plan.duplicates[0];
      assert.deepEqual(group.candidates.map((candidate: any) => candidate.source), ["existing", "incoming"]);
      assert.equal(group.candidates[0].attendeeId, original.id); assert.equal(group.candidates[0].checkedInAt, checked.checkedInAt);
      assert.deepEqual(group.differingFields, ["company", "internal"]);
      const decisions = [{ groupId: group.id, keepCandidateId: group.candidates[1].id }];
      c = await call(`${base}/${c.id}/import`, manager, { ...body, digest: plan.digest, decisions });
      assert.deepEqual(c.statistics, { total: 4, checkedIn: 1, pending: 3 });
      const saved = await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: original.id } });
      assert.deepEqual(saved.values, { ...incoming, historical: "已移除字段的历史值" });
      assert.equal(saved.checkedInAt?.toISOString(), checked.checkedInAt); assert.deepEqual(saved.submittedValues, original.submittedValues); assert.equal(saved.createdAt.toISOString(), original.createdAt.toISOString());
      const identicalBody = { ...body, revision: c.revision }, identical = await call(`${base}/${c.id}/import/preview`, manager, identicalBody);
      assert.deepEqual(identical.duplicates, []); assert.equal(identical.unresolved, 0); assert.equal(identical.deduplicated, 1);
      c = await call(`${base}/${c.id}/import`, manager, { ...identicalBody, digest: identical.digest });
      assert.deepEqual((await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: original.id } })).values, saved.values);
      const repeat = await call(`/external-checkins/${c.publicToken}/submit`, undefined, { formVersion: publicForm.formVersion, values: { code: "D1", name: "重复签到" } });
      assert.equal(repeat.alreadyCheckedIn, true); assert.equal(repeat.checkedInAt, checked.checkedInAt);
    });
    await t.test("guest check-in invalidates reviewed candidates; re-preview and keeping existing retain all state", async () => {
      const original = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "D2" } } });
      const body = { source: "file", revision: c.revision, rows: [{ ...rows[1], code: "D2", company: "未选中更新" }, { ...rows[0], code: "D4" }], rowNumbers: [2, 3] };
      const plan = await call(`${base}/${c.id}/import/preview`, manager, body), group = plan.duplicates[0];
      assert.equal(group.candidates[0].checkedInAt, null);
      const decisions = [{ groupId: group.id, keepCandidateId: group.candidates[0].id }];
      const publicForm = await call(`/external-checkins/${c.publicToken}`);
      const checked = await call(`/external-checkins/${c.publicToken}/submit`, undefined, { formVersion: publicForm.formVersion, values: { code: "D2", name: "预检后现场签到" } });
      assert.equal((await call(`${base}/${c.id}`, manager)).revision, body.revision);
      await call(`${base}/${c.id}/import`, manager, { ...body, digest: plan.digest, decisions }, 409);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: c.id } }), 4);
      const refreshed = await call(`${base}/${c.id}/import/preview`, manager, body);
      assert.notEqual(refreshed.digest, plan.digest); assert.equal(refreshed.duplicates[0].candidates[0].checkedInAt, checked.checkedInAt);
      c = await call(`${base}/${c.id}/import`, manager, { ...body, digest: refreshed.digest, decisions });
      assert.deepEqual(c.statistics, { total: 5, checkedIn: 2, pending: 3 });
      const saved = await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: original.id } });
      assert.deepEqual(saved.values, original.values); assert.equal(saved.checkedInAt?.toISOString(), checked.checkedInAt);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: b.id } }), 1);
    });
    await t.test("discarding all different incoming records preserves existing records and deduplicates exact copies", async () => {
      const original = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "D1" } } });
      const next = { ...rows[0], code: "DISCARD", company: "候选一" };
      const body = { revision: c.revision, rows: [original.values, { ...(original.values as object), company: "不保留的变更" }, next, next, { ...next, company: "候选二" }] };
      const preview = await call(`${base}/${c.id}/import/preview`, manager, body);
      assert.equal(preview.deduplicated, 2); assert.equal(preview.unresolved, 2); assert.equal(preview.added, 0);
      const decisions = preview.duplicates.map((group: any) => ({ groupId: group.id, keepCandidateId: null }));
      c = await call(`${base}/${c.id}/import`, manager, { ...body, digest: preview.digest, decisions });
      assert.equal(c.statistics.total, 5);
      assert.deepEqual(await db.externalCheckinAttendee.findUnique({ where: { id: original.id } }), original);
      assert.equal(await db.externalCheckinAttendee.count({ where: { eventId: c.id, values: { path: ["code"], equals: "DISCARD" } } }), 0);
    });
    await t.test("administrator help is authorized, scoped, idempotent, audited and allowed outside self-service availability", async () => {
      d = await call(base, manager, { title: "【测试数据】管理员帮签与删除", fields }); eventIds.push(d.id);
      d = await importRows(d, ["HELP1", "HELP2", "RACE", "DELETE1", "DELETE2"].map(code => ({ ...rows[0], code })));
      const attendees = await db.externalCheckinAttendee.findMany({ where: { eventId: d.id } });
      const first = attendees.find(row => (row.values as any).code === "HELP1")!;
      const endpoint = `${base}/${d.id}/attendees/${first.id}`;
      for (const [token, status] of [[undefined, 401], [viewer, 403], [scoped, 403]] as const) {
        await call(`${endpoint}/checkin`, token, { revision: d.revision }, status);
        await call(endpoint, token, { revision: d.revision, checkedInAt: null }, status, "DELETE");
      }
      await call(`${base}/${b.id}/attendees/${first.id}/checkin`, manager, { revision: b.revision }, 404);
      await call(`${base}/${b.id}/attendees/${first.id}`, manager, { revision: b.revision, checkedInAt: null }, 404, "DELETE");
      await call(`${endpoint}/checkin`, manager, { revision: d.revision - 1 }, 409);
      const before = Date.now();
      const results = await Promise.all(Array.from({ length: 6 }, () => call(`${endpoint}/checkin`, manager, { revision: d.revision })));
      assert.equal(results.filter(result => !result.alreadyCheckedIn).length, 1);
      const signed = await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: first.id } });
      assert.ok(signed.checkedInAt!.getTime() >= before); assert.ok(signed.checkedInAt!.getTime() <= Date.now());
      assert.deepEqual(signed.values, first.values); assert.equal(signed.submittedValues, null);
      const logs = await db.auditLog.findMany({ where: { entityId: first.id } });
      assert.equal(logs.length, 1); assert.equal(logs[0].adminUserId, adminIds[0]); assert.equal((logs[0].metadataJson as any).source, "ADMIN");
      d = await call(`${base}/${d.id}`, manager, { ...d, enabled: true, startsAt: new Date(Date.now() + 3600_000).toISOString() }, 200, "PATCH");
      const second = attendees.find(row => (row.values as any).code === "HELP2")!;
      const form = await call(`/external-checkins/${d.publicToken}`);
      await call(`/external-checkins/${d.publicToken}/submit`, undefined, { values: { name: "时间窗测试", code: "HELP2" }, formVersion: form.formVersion }, 409);
      await call(`${base}/${d.id}/attendees/${second.id}/checkin`, manager, { revision: d.revision });
      d = await call(`${base}/${d.id}`, manager, { ...d, startsAt: null }, 200, "PATCH");
      const racer = attendees.find(row => (row.values as any).code === "RACE")!;
      const races = await Promise.all([
        call(`/external-checkins/${d.publicToken}/submit`, undefined, { values: { name: "现场与帮签竞争", code: "RACE" }, formVersion: form.formVersion }),
        ...Array.from({ length: 4 }, () => call(`${base}/${d.id}/attendees/${racer.id}/checkin`, manager, { revision: d.revision }))
      ]);
      assert.equal(races.filter(result => !result.alreadyCheckedIn).length, 1);
      assert.equal(await db.auditLog.count({ where: { entityId: racer.id } }), 1);
      const after = await db.externalCheckinAttendee.findUniqueOrThrow({ where: { id: racer.id } });
      await call(`${base}/${d.id}/attendees/${racer.id}/checkin`, manager, { revision: d.revision });
      assert.deepEqual(await db.externalCheckinAttendee.findUnique({ where: { id: racer.id } }), after);
      const guestSigned = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "D1" } } });
      assert.equal((await call(`${base}/${c.id}/attendees/${guestSigned.id}/checkin`, manager, { revision: c.revision })).alreadyCheckedIn, true);
      assert.deepEqual(await db.externalCheckinAttendee.findUnique({ where: { id: guestSigned.id } }), guestSigned);
      const pending = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: c.id, values: { path: ["code"], equals: "D4" } } });
      const body = { revision: c.revision, rows: [{ ...(pending.values as object), company: "帮签前预检" }] };
      const preview = await call(`${base}/${c.id}/import/preview`, manager, body);
      await call(`${base}/${c.id}/attendees/${pending.id}/checkin`, manager, { revision: c.revision });
      await call(`${base}/${c.id}/import`, manager, { ...body, digest: preview.digest, decisions: [{ groupId: preview.duplicates[0].id, keepCandidateId: preview.duplicates[0].candidates[1].id }] }, 409);
    });
    await t.test("deletion validates current status and revisions, coordinates with scans, updates statistics and pauses an empty roster", async () => {
      d = await call(`${base}/${d.id}`, manager);
      const target = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: d.id, values: { path: ["code"], equals: "DELETE1" } } });
      const endpoint = `${base}/${d.id}/attendees/${target.id}`, body = { revision: d.revision, checkedInAt: null };
      await call(endpoint, manager, { revision: d.revision }, 400, "DELETE");
      await call(endpoint, manager, { ...body, checkedInAt: "not-a-date" }, 400, "DELETE");
      await call(endpoint, manager, { ...body, revision: d.revision - 1 }, 409, "DELETE");
      const publicForm = await call(`/external-checkins/${d.publicToken}`), publicSubmit = `/external-checkins/${d.publicToken}/submit`;
      const signed = await call(publicSubmit, undefined, { values: { name: "删除确认期间签到", code: "DELETE1" }, formVersion: publicForm.formVersion });
      await call(endpoint, manager, body, 409, "DELETE");
      assert.equal(await db.externalCheckinAttendee.count({ where: { id: target.id } }), 1);
      const importBody = { revision: d.revision, rows: [{ ...rows[0], code: "STALE" }] };
      const preview = await call(`${base}/${d.id}/import/preview`, manager, importBody);
      d = await call(endpoint, manager, { ...body, checkedInAt: signed.checkedInAt }, 200, "DELETE");
      assert.equal(d.statistics.total, 4); assert.equal(d.statistics.checkedIn, 3);
      await call(`${base}/${d.id}/import`, manager, { ...importBody, digest: preview.digest }, 409);
      assert.equal((await call(publicSubmit, undefined, { values: { name: "删除后尝试", code: "DELETE1" }, formVersion: publicForm.formVersion })).success, false);
      assert.equal((await call(`${base}/${d.id}/attendees?keyword=DELETE1`, manager)).total, 0);
      const racing = await db.externalCheckinAttendee.findFirstOrThrow({ where: { eventId: d.id, values: { path: ["code"], equals: "DELETE2" } } });
      const [deletion, scan] = await Promise.all([
        fetch(`${origin}/api${base}/${d.id}/attendees/${racing.id}`, { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${manager}` }, body: JSON.stringify({ revision: d.revision, checkedInAt: null }) }),
        call(publicSubmit, undefined, { values: { name: "扫码与删除竞争", code: "DELETE2" }, formVersion: publicForm.formVersion })
      ]);
      assert.ok([200, 409].includes(deletion.status));
      const remainingRacer = await db.externalCheckinAttendee.findUnique({ where: { id: racing.id } });
      if (deletion.status === 200) { assert.equal(scan.success, false); assert.equal(remainingRacer, null); }
      else { assert.equal(scan.success, true); assert.ok(remainingRacer?.checkedInAt); }
      d = await call(`${base}/${d.id}`, manager);
      const remaining = await db.externalCheckinAttendee.findMany({ where: { eventId: d.id } });
      for (const attendee of remaining) d = await call(`${base}/${d.id}/attendees/${attendee.id}`, manager, { revision: d.revision, checkedInAt: attendee.checkedInAt?.toISOString() ?? null }, 200, "DELETE");
      assert.deepEqual(d.statistics, { total: 0, checkedIn: 0, pending: 0 }); assert.equal(d.enabled, false);
      assert.equal((await call(`/external-checkins/${d.publicToken}`)).available, false);
      const deletionLogs = await db.auditLog.findMany({ where: { adminUserId: adminIds[0], action: "DELETE", metadataJson: { path: ["eventId"], equals: d.id } } });
      assert.equal(deletionLogs.length, 5); assert.equal(deletionLogs.filter(log => (log.metadataJson as any).autoPaused).length, 1);
      await call(endpoint, manager, { revision: d.revision, checkedInAt: signed.checkedInAt }, 404, "DELETE");
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
    await t.test("appearance edits retain links, active guest forms and per-event isolation", async () => {
      const before = await call(`/external-checkins/${a.publicToken}`), originalPath = a.publicPath, originalFields = a.fields;
      const body = { revision: a.revision, appearance: { ...a.appearance, pageTitle: "甲会议现场", successTitle: "欢迎莅临", successMessage: "请前往主会场", failureTitle: "未能核验", failureMessage: "请到服务台核对报名编号" } };
      await call(`${base}/${a.id}/appearance`, undefined, body, 401, "PATCH");
      await call(`${base}/${a.id}/appearance`, viewer, body, 403, "PATCH");
      await call(`${base}/${a.id}/appearance`, scoped, body, 403, "PATCH");
      await call(`${base}/${a.id}/appearance`, manager, { ...body, appearance: { primaryColor: "red;display:none" } }, 400, "PATCH");
      a = await call(`${base}/${a.id}/appearance`, manager, body, 200, "PATCH");
      await call(`${base}/${a.id}/appearance`, manager, body, 409, "PATCH");
      assert.equal(a.publicPath, originalPath); assert.equal(a.enabled, true); assert.deepEqual(a.fields, originalFields);
      const after = await call(`/external-checkins/${a.publicToken}`);
      assert.equal(after.formVersion, before.formVersion); assert.equal(after.appearance.pageTitle, "甲会议现场");
      assert.equal((await call(`/external-checkins/${b.publicToken}`)).appearance.pageTitle, "");
      const failure = await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "无人", code: "404" }, formVersion: before.formVersion });
      assert.equal(failure.success, false); assert.equal(failure.message, body.appearance.failureMessage);
      a = await importRows(a, [{ ...rows[0], name: "外观测试", code: "003" }]);
      const success = await call(`/external-checkins/${a.publicToken}/submit`, undefined, { values: { name: "外观测试", code: "003" }, formVersion: before.formVersion });
      assert.equal(success.success, true); assert.equal(success.alreadyCheckedIn, false); assert.equal(success.message, body.appearance.successMessage);
      const list = await call(base, viewer); assert.equal(list.items.find((event: any) => event.id === a.id).publicPath, originalPath);
    });
    await t.test("image uploads are authenticated and isolated; only saved images are public", async () => {
      const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=", "base64");
      async function upload(token: string, bytes = png, type = "image/png", status = 201) {
        const form = new FormData(); form.append("file", new Blob([bytes], { type }), "logo.png");
        const res = await fetch(`${origin}/api${base}/${a.id}/images`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
        assert.equal(res.status, status); return (await res.json()).data;
      }
      await upload("", png, "image/png", 401); await upload(viewer, png, "image/png", 403); await upload(scoped, png, "image/png", 403);
      await upload(manager, Buffer.from("<svg onload='alert(1)'/>"), "image/svg+xml", 400);
      await upload(manager, png, "image/jpeg", 400);
      await upload(manager, Buffer.alloc(5 * 1024 * 1024 + 1), "image/png", 413);
      const asset = await upload(manager); assert.equal((await upload(manager)).id, asset.id);
      const adminImage = `${origin}/api${base}/${a.id}/images/${asset.id}`, image = `${origin}/api/external-checkins/${a.publicToken}/images/${asset.id}`;
      assert.equal((await fetch(adminImage)).status, 401);
      assert.equal((await fetch(adminImage, { headers: { Authorization: `Bearer ${scoped}` } })).status, 403);
      assert.equal((await fetch(adminImage, { headers: { Authorization: `Bearer ${viewer}` } })).status, 200);
      assert.equal((await fetch(`${origin}/api${base}/${b.id}/images/${asset.id}`, { headers: { Authorization: `Bearer ${manager}` } })).status, 404);
      assert.equal((await fetch(image)).status, 404);
      await call(`${base}/${b.id}/appearance`, manager, { revision: b.revision, appearance: { logoAssetId: asset.id } }, 400, "PATCH");
      a = await call(`${base}/${a.id}/appearance`, manager, { revision: a.revision, appearance: { ...a.appearance, logoAssetId: asset.id } }, 200, "PATCH");
      const publicImage = await fetch(image); assert.equal(publicImage.status, 200); assert.equal(publicImage.headers.get("content-type"), "image/png"); assert.equal(publicImage.headers.get("cache-control"), "no-store");
      assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), png);
      assert.equal((await fetch(`${origin}/api/external-checkins/${b.publicToken}/images/${asset.id}`)).status, 404);
      a = await call(`${base}/${a.id}/appearance`, manager, { revision: a.revision, appearance: { ...a.appearance, logoAssetId: "" } }, 200, "PATCH");
      assert.equal((await fetch(image)).status, 404);
    });
    await t.test("no payment, order, user or registration records were created", async () => {
      assert.equal(await db.order.count(), 0); assert.equal(await db.payment.count(), 0); assert.equal(await db.user.count(), 0); assert.equal(await db.registration.count(), 0);
    });
  } finally {
    const attendees = await db.externalCheckinAttendee.findMany({ where: { eventId: { in: eventIds } }, select: { id: true } });
    await db.auditLog.deleteMany({ where: { OR: [{ adminUserId: { in: adminIds } }, { entityId: { in: [...eventIds, ...attendees.map(row => row.id)] } }, ...eventIds.map(id => ({ metadataJson: { path: ["eventId"], equals: id } }))] } });
    await db.externalCheckinEvent.deleteMany({ where: { id: { in: eventIds } } }); await db.adminUser.deleteMany({ where: { id: { in: adminIds } } }); await db.role.deleteMany({ where: { id: { in: roleIds } } });
    await db.$disconnect(); await app.close();
  }
});
