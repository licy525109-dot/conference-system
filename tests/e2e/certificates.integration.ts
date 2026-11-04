import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes, pbkdf2Sync, createHash } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

test("certificate real API: isolation, publication, import, permissions, grants and retained PNGs", { skip: !process.env.CERTIFICATE_TEST_DATABASE_URL, timeout: 120000 }, async () => {
  const url = new URL(process.env.CERTIFICATE_TEST_DATABASE_URL!);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname)); assert.equal(url.pathname, "/certificate_test");
  process.env.DATABASE_URL = url.toString(); process.env.JWT_SECRET = randomBytes(48).toString("hex"); process.env.NODE_ENV = "test";
  const req = createRequire(resolve("services/api/package.json"));
  const { NestFactory } = req("@nestjs/core"), { AppModule } = req("./dist/app.module.js");
  const app = await NestFactory.create(AppModule, { logger: false }); app.setGlobalPrefix("api");
  app.use(req("express").json({ limit: "4mb" })); await app.listen(0, "127.0.0.1");
  const origin = await app.getUrl(), db = new PrismaClient(), suffix = randomBytes(5).toString("hex");
  const adminIds: string[] = [], conferenceIds: string[] = [], projectIds: string[] = [], roleIds: string[] = [];
  const pwd = randomBytes(24).toString("hex"), salt = randomBytes(16).toString("hex");
  const passwordHash = `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(pwd, salt, 10000, 64, "sha512").toString("hex")}`;
  async function call(path: string, token?: string, body?: unknown, status = body === undefined ? 200 : 201, method = body === undefined ? "GET" : "POST") {
    const response = await fetch(`${origin}/api${path}`, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const payload = await response.json(); assert.equal(response.status, status, `${method} ${path}: ${payload.message}`); return payload.data;
  }
  async function image(publicId: string, token: string, download = false, expected = 201) {
    const r = await fetch(`${origin}/api/certificates/${publicId}/image`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, download }) }); assert.equal(r.status, expected); return Buffer.from(await r.arrayBuffer());
  }
  async function preview(projectId: string, token: string, body: unknown) {
    const r = await fetch(`${origin}/api/admin/certificates/${projectId}/preview`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    assert.equal(r.status, 201); return Buffer.from(await r.arrayBuffer());
  }
  try {
    await app.get(req("./dist/admin/admin-access.service.js").AdminAccessService).ensureBuiltInAccess();
    for (const label of ["A", "B"]) { const c = await db.conference.create({ data: { title: `证书接口测试 ${label}`, slug: `cert-${label}-${suffix}`, startsAt: new Date(), endsAt: new Date(Date.now()+86400000) } }); conferenceIds.push(c.id); }
    const permissions = [...["view", "write", "import", "publish", "export"].map(x => `certificate:${x}`), "registration:view"];
    const role = await db.role.create({ data: { code: `cert-role-${suffix}`, name: "证书测试管理员", permissions: { create: permissions.map(code => ({ permission: { connect: { code } } })) } } }); roleIds.push(role.id);
    const viewerRole = await db.role.create({ data: { code: `cert-read-${suffix}`, name: "证书测试只读", permissions: { create: [{ permission: { connect: { code: "certificate:view" } } }] } } }); roleIds.push(viewerRole.id);
    const tokens: string[] = [];
    for (const [i, label] of ["manager", "scoped", "viewer", "outsider"].entries()) {
      const a = await db.adminUser.create({ data: { username: `cert-${label}-${suffix}`, passwordHash, conferenceScopeMode: i === 1 || i === 3 ? "ASSIGNED" : "ALL", roles: { create: { roleId: i === 2 ? viewerRole.id : role.id } }, ...(i === 1 ? { conferenceGrants: { create: { conferenceId: conferenceIds[0] } } } : {}) } }); adminIds.push(a.id);
      tokens.push((await call("/admin/auth/login", undefined, { username: a.username, password: pwd })).token);
    }
    const [manager, scoped, viewer, outsider] = tokens;
    await call("/admin/certificates", undefined, undefined, 401);
    let a = await call("/admin/certificates", manager, { name: "会议 A 证书", conferenceId: conferenceIds[0] }); projectIds.push(a.id);
    let b = await call("/admin/certificates", manager, { name: "会议 B 证书", conferenceId: conferenceIds[1] }); projectIds.push(b.id);
    await call(`/admin/certificates/${a.id}`, outsider, undefined, 404);
    await call(`/admin/certificates/${b.id}`, scoped, undefined, 404);
    assert.equal((await call(`/admin/certificates/${a.id}/registration-source`, manager, { page: 1 })).rows.length, 0);
    await call(`/admin/certificates/${b.id}/registration-source`, scoped, { page: 1 }, 404);
    await call(`/admin/certificates/${a.id}`, viewer, { config: a.draft, draftRevision: a.draftRevision }, 403, "PATCH");
    assert.equal((await call("/admin/certificates", scoped)).items.length, 1);
    await call("/admin/certificates", scoped, { name: "不允许跨会议", conferenceId: conferenceIds[1] }, 403);
    const rows = [{ name: "同名人员", organization: "单位甲", certificateNo: "A-001", claimCode: "code-A-001", eligible: true }, { name: "同名人员", organization: "单位乙", certificateNo: "A-002", claimCode: "code-A-002", eligible: true }];
    async function importRows(p: any, records: unknown[], mode = "upsert") { const body = { rows: records, mode, draftRevision: p.draftRevision }; const plan = await call(`/admin/certificates/${p.id}/import/preview`, manager, body); assert.equal(plan.errors.length, 0); return call(`/admin/certificates/${p.id}/import`, manager, { ...body, digest: plan.digest }); }
    a = await importRows(a, rows); assert.equal((await call(`/admin/certificates/${a.id}/recipients`, manager)).total, 2);
    a = await importRows(a, rows); assert.equal((await call(`/admin/certificates/${a.id}/recipients`, manager)).total, 2);
    const stale = a.draftRevision - 1;
    await call(`/admin/certificates/${a.id}`, manager, { config: a.draft, draftRevision: stale }, 409, "PATCH");
    const tamperedBody = { rows, mode: "upsert", draftRevision: a.draftRevision }; const plan = await call(`/admin/certificates/${a.id}/import/preview`, manager, tamperedBody);
    await call(`/admin/certificates/${a.id}/import`, manager, { ...tamperedBody, rows: [rows[0]], digest: plan.digest }, 409);
    a = await call(`/admin/certificates/${a.id}/publish`, manager, { draftRevision: a.draftRevision });
    const originalRevision = a.publishedRevision;
    const firstMeta = await call(`/certificates/${a.publicId}`);
    assert.equal(firstMeta.name, "会议 A 证书"); assert.equal(JSON.stringify(firstMeta).includes("code-A-001"), false);
    const claim = { values: { name: "同名人员", claimCode: "code-A-001" } };
    const found = await call(`/certificates/${a.publicId}/search`, undefined, claim);
    const firstImage = await image(a.publicId, found.token); assert.equal(firstImage.subarray(1,4).toString(), "PNG");
    const firstRecipient = await db.certificateRecipient.findFirstOrThrow({ where: { projectId: a.id, certificateNo: "A-001" } });
    assert.deepEqual(await preview(a.id, manager, { recipientId: firstRecipient.id }), firstImage);
    assert.deepEqual(await preview(a.id, manager, { version: originalRevision, recipientId: firstRecipient.id }), firstImage);
    async function upload(projectId: string, token: string | undefined, bytes: Buffer, status: number) {
      const form = new FormData(); form.set("file", new Blob([new Uint8Array(bytes)], { type: "image/png" }), "template.png");
      const response = await fetch(`${origin}/api/admin/certificates/${projectId}/assets`, { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: form });
      const payload = await response.json(); assert.equal(response.status, status, payload.message); return payload.data;
    }
    await upload(a.id, undefined, firstImage, 401);
    await upload(a.id, viewer, firstImage, 403);
    await upload(b.id, scoped, firstImage, 404);
    await upload(a.id, manager, Buffer.from("invalid image"), 400);
    const asset = await upload(a.id, manager, firstImage, 201); assert.equal(asset.width, 1600); assert.equal(asset.kind, "image");
    const assetResponse = await fetch(`${origin}/api/admin/certificates/${a.id}/assets/${asset.id}`, { headers: { Authorization: `Bearer ${manager}` } });
    assert.equal(assetResponse.status, 200); assert.equal(Buffer.compare(Buffer.from(await assetResponse.arrayBuffer()), firstImage), 0);
    await image(b.publicId, found.token, false, 404);
    await call(`/certificates/${a.publicId}/search`, undefined, { values: { name: "同名人员", claimCode: "code-A-WRONG" } }, 404);
    await call(`/certificates/${a.publicId}/search`, undefined, { values: { name: "同名人员" } }, 400);
    await Promise.all(Array.from({ length: 4 }, () => call(`/certificates/${a.publicId}/search`, undefined, claim)));
    assert.equal(await db.certificateIssue.count({ where: { projectId: a.id } }), 1);
    const savedConfig = structuredClone(a.draft); savedConfig.title = "只在草稿中的标题"; savedConfig.templates[0].fields[0].text = "更新后的证书标题";
    a = await call(`/admin/certificates/${a.id}`, manager, { config: savedConfig, draftRevision: a.draftRevision }, 200, "PATCH");
    assert.equal((await call(`/certificates/${a.publicId}`)).title, firstMeta.title);
    assert.equal(createHash("sha256").update(await image(a.publicId, found.token)).digest("hex"), createHash("sha256").update(firstImage).digest("hex"));
    a = await call(`/admin/certificates/${a.id}/recipients`, manager, { draftRevision: a.draftRevision, record: { name: "未发布新增人员", organization: "草稿单位", certificateNo: "A-003", claimCode: "code-A-003", eligible: true, templateId: "default", custom: {}, role: "" } });
    const { CertificatesService } = req("./dist/certificates/certificates.service.js"), service = app.get(CertificatesService);
    const admin = { id: adminIds[0], username: "manager", displayName: null, permissions, conferenceScopeMode: "ALL" };
    const repair = { draftRevision: a.draftRevision, publishedRevision: a.publishedRevision, templateId: "default", fieldId: "number", before: structuredClone(a.draft.templates[0].fields.find((f: any) => f.id === "number")), after: { x: 20, align: "start", text: "" } };
    const beforeDraft = structuredClone(a.draft), beforeRoster = await db.certificateRecipient.findMany({ where: { projectId: a.id }, orderBy: { id: "asc" } });
    await assert.rejects(service.repairPublishedNumberLayout(a.id, repair, { ...admin, permissions: ["certificate:view"] }), /权限/);
    await assert.rejects(service.repairPublishedNumberLayout(a.id, { ...repair, draftRevision: a.draftRevision - 1 }, admin), /版本已变化/);
    a = await service.repairPublishedNumberLayout(a.id, repair, admin);
    assert.ok(a.draftRevision > a.publishedRevision); assert.equal(a.draft.title, savedConfig.title);
    Object.assign(beforeDraft.templates[0].fields.find((f: any) => f.id === "number"), repair.after);
    assert.deepEqual(a.draft, beforeDraft);
    assert.deepEqual(await db.certificateRecipient.findMany({ where: { projectId: a.id }, orderBy: { id: "asc" } }), beforeRoster);
    assert.equal(await db.certificatePublishedRecipient.count({ where: { version: { projectId: a.id, revision: a.publishedRevision } } }), 2);
    assert.equal((await call(`/certificates/${a.publicId}`)).title, firstMeta.title);
    const repairedGrant = await call(`/certificates/${a.publicId}/search`, undefined, claim), repairedImage = await image(a.publicId, repairedGrant.token);
    assert.notDeepEqual(repairedImage, firstImage);
    assert.deepEqual(await preview(a.id, manager, { version: a.publishedRevision, recipientId: firstRecipient.id }), repairedImage);
    assert.deepEqual(await preview(a.id, manager, { version: originalRevision, recipientId: firstRecipient.id }), firstImage);
    await call(`/certificates/${a.publicId}/search`, undefined, { values: { name: "未发布新增人员", claimCode: "code-A-003" } }, 404);
    b = await importRows(b, [{ ...rows[0], certificateNo: "B-001", claimCode: "code-B-001" }]);
    b = await call(`/admin/certificates/${b.id}/publish`, manager, { draftRevision: b.draftRevision });
    assert.equal((await call(`/certificates/${a.publicId}`)).title, firstMeta.title);
    await call(`/certificates/${b.publicId}/search`, undefined, claim, 404);
    a = await call(`/admin/certificates/${a.id}/publish`, manager, { draftRevision: a.draftRevision });
    assert.equal((await call(`/certificates/${a.publicId}`)).title, savedConfig.title);
    assert.equal(Buffer.compare(await image(a.publicId, found.token), firstImage), 0);
    a = await call(`/admin/certificates/${a.id}/state`, manager, { draftRevision: a.draftRevision, paused: true }, 200, "PATCH");
    await image(a.publicId, found.token, false, 410);
    await call(`/certificates/${b.publicId}/search`, undefined, { values: { name: "同名人员", claimCode: "code-B-001" } });
    a = await call(`/admin/certificates/${a.id}/state`, manager, { draftRevision: a.draftRevision, paused: false }, 200, "PATCH");
    a = await call(`/admin/certificates/${a.id}/state`, manager, { draftRevision: a.draftRevision, paused: false, archived: true }, 200, "PATCH");
    assert.equal(a.archived, true); assert.equal((await call(`/certificates/${a.publicId}`)).paused, false);
    a = await call(`/admin/certificates/${a.id}/state`, manager, { draftRevision: a.draftRevision, paused: false, archived: false }, 200, "PATCH");
    const nameOnly = structuredClone(a.draft); nameOnly.queryFields = [{ key: "name", label: "姓名", required: true }];
    a = await call(`/admin/certificates/${a.id}`, manager, { config: nameOnly, draftRevision: a.draftRevision }, 200, "PATCH");
    a = await call(`/admin/certificates/${a.id}/publish`, manager, { draftRevision: a.draftRevision });
    await call(`/certificates/${a.publicId}/search`, undefined, { values: { name: "同名人员" } }, 409);
    a = await call(`/admin/certificates/${a.id}/restore`, manager, { version: originalRevision, draftRevision: a.draftRevision });
    assert.equal(a.draft.title, firstMeta.title); assert.equal((await call(`/admin/certificates/${a.id}/recipients`, manager)).total, 2);
    a = await call(`/admin/certificates/${a.id}/publish`, manager, { draftRevision: a.draftRevision });
    await call(`/certificates/${a.publicId}/search`, undefined, claim);
    const limited = structuredClone(b.draft); limited.allowRepeatDownload = false;
    b = await call(`/admin/certificates/${b.id}`, manager, { config: limited, draftRevision: b.draftRevision }, 200, "PATCH");
    b = await call(`/admin/certificates/${b.id}/publish`, manager, { draftRevision: b.draftRevision });
    const limitedFound = await call(`/certificates/${b.publicId}/search`, undefined, { values: { name: "同名人员", claimCode: "code-B-001" } });
    const thumbnail = await image(b.publicId, limitedFound.token); const original = await image(b.publicId, limitedFound.token, true);
    assert.ok(thumbnail.readUInt32BE(16) <= 800); assert.equal(original.readUInt32BE(16), 1600);
    await image(b.publicId, limitedFound.token, true, 410);
    const issuance = (await call(`/admin/certificates/${b.id}/issues`, manager)).items[0];
    await call(`/admin/certificates/${b.id}/issues/${issuance.id}`, manager, { revoked: true }, 200, "PATCH");
    await image(b.publicId, limitedFound.token, false, 410);
    await call(`/admin/certificates/${b.id}/issues/${issuance.id}`, viewer, { revoked: false }, 403, "PATCH");
    const future = structuredClone(a.draft); future.startsAt = new Date(Date.now() + 86400000).toISOString();
    a = await call(`/admin/certificates/${a.id}`, manager, { config: future, draftRevision: a.draftRevision }, 200, "PATCH");
    a = await call(`/admin/certificates/${a.id}/publish`, manager, { draftRevision: a.draftRevision });
    await call(`/certificates/${a.publicId}/search`, undefined, claim, 410);
    const digest = createHash("sha256").update(found.token).digest("hex"); await db.certificateGrant.update({ where: { tokenHash: digest }, data: { expiresAt: new Date(0) } }); await image(a.publicId, found.token, false, 404);
    const third = await call("/admin/certificates", manager, { name: "复制 A 的独立项目", conferenceId: conferenceIds[0], copyFromId: a.id }); projectIds.push(third.id); assert.equal((await call(`/admin/certificates/${third.id}/recipients`, manager)).total, 0); assert.notEqual(third.publicId, a.publicId);
    const logs = await db.auditLog.findMany({ where: { entityId: { in: projectIds } } }); assert.ok(logs.length > 10); assert.equal(JSON.stringify(logs).includes("code-A-001"), false);
  } finally {
    await db.certificateGrant.deleteMany({ where: { issue: { projectId: { in: projectIds } } } });
    await db.certificateIssue.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.certificatePublishedRecipient.deleteMany({ where: { version: { projectId: { in: projectIds } } } });
    await db.certificateVersion.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.certificateRecipient.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.certificateAsset.deleteMany({ where: { projectId: { in: projectIds } } });
    await db.certificateProject.deleteMany({ where: { id: { in: projectIds } } });
    await db.auditLog.deleteMany({ where: { adminUserId: { in: adminIds } } });
    await db.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await db.role.deleteMany({ where: { id: { in: roleIds } } });
    await db.conference.deleteMany({ where: { id: { in: conferenceIds } } });
    await db.$disconnect(); await app.close();
  }
});
