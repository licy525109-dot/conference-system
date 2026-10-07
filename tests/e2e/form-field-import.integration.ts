import "reflect-metadata";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { ConflictException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { AdminManagementService } from "../../services/api/src/admin/admin-management.service";
import { PrismaService } from "../../services/api/src/prisma.service";

test("isolated PostgreSQL: field copy, idempotency, audit rollback and concurrent import", {
  skip: !process.env.FORM_FIELD_IMPORT_TEST_DATABASE_URL
}, async () => {
  const databaseUrl = process.env.FORM_FIELD_IMPORT_TEST_DATABASE_URL!;
  const url = new URL(databaseUrl);
  assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
  assert.equal(url.pathname, "/form_field_import_qa", "Only run against the disposable feature-test database");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const service = new AdminManagementService(db as PrismaService);
  const prefix = `field-import-${randomUUID()}`;
  const ids: string[] = [];
  let adminId = "";
  try {
    const account = await db.adminUser.create({ data: { username: prefix, passwordHash: "disabled-test-account" } });
    adminId = account.id;
    const admin = { id: account.id, username: prefix, displayName: "QA", permissions: ["conference:view", "conference:write"] };
    for (const name of ["source", "target", "rollback", "race"]) {
      const conference = await db.conference.create({ data: { title: name, slug: `${prefix}-${name}`, startsAt: new Date("2030-01-01"), endsAt: new Date("2030-01-02") } });
      ids.push(conference.id);
    }
    const [sourceId, targetId, rollbackId, raceId] = ids;
    const source = await db.formDefinition.create({ data: { conferenceId: sourceId, fields: { create: [
      { label: "姓名", fieldKey: "name", type: "TEXT", required: true, sortOrder: 0 },
      { label: "用餐", fieldKey: "meal", type: "SELECT", required: true, optionsJson: [{ label: "素食", value: "veg" }], validationJson: { maxLength: 50 }, sortOrder: 4 },
      { label: "单位", fieldKey: "company", type: "TEXT", placeholder: "请填写单位", enabled: false, sortOrder: 8 }
    ] } }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
    const target = await db.formDefinition.create({ data: { conferenceId: targetId, fields: { create: { label: "原姓名", fieldKey: "name", type: "TEXT", enabled: false, sortOrder: 7 } } } });
    const body = { sourceConferenceId: sourceId, fieldIds: source.fields.map(field => field.id).reverse() };
    const result = (await service.importFormFields(targetId, body, admin)).data as any;
    assert.equal(result.copiedCount, 2);
    assert.deepEqual(result.skippedFieldKeys, ["name"]);
    const copied = await db.formField.findMany({ where: { formDefinitionId: target.id }, orderBy: { sortOrder: "asc" } });
    assert.deepEqual(copied.map(field => [field.fieldKey, field.sortOrder]), [["name", 7], ["meal", 8], ["company", 9]]);
    assert.equal(copied[0].label, "原姓名");
    assert.deepEqual(copied[1].optionsJson, source.fields[1].optionsJson);
    assert.deepEqual(copied[1].validationJson, source.fields[1].validationJson);
    assert.equal(copied[2].enabled, false);
    assert.equal(copied[2].optionsJson, null);
    assert.equal(copied[2].placeholder, "请填写单位");
    assert.equal(source.fields.some(field => copied.some(item => item.id === field.id)), false);
    assert.equal(((await service.importFormFields(targetId, body, admin)).data as any).copiedCount, 0);
    assert.equal(await db.auditLog.count({ where: { entityId: target.id, adminUserId: admin.id } }), 1);
    await db.formField.update({ where: { id: copied[1].id }, data: { label: "目标会议独立编辑" } });
    assert.deepEqual(await db.formField.findMany({ where: { formDefinitionId: source.id }, orderBy: { sortOrder: "asc" } }), source.fields);

    // An invalid actor fails the audit FK after createMany; the entire import must roll back.
    await assert.rejects(() => service.importFormFields(rollbackId, body, { ...admin, id: "missing-admin" }));
    assert.equal(await db.formDefinition.findUnique({ where: { conferenceId: rollbackId } }), null);
    const raced = await Promise.allSettled([
      service.importFormFields(raceId, body, admin), service.importFormFields(raceId, body, admin)
    ]);
    assert.ok(raced.some(item => item.status === "fulfilled"));
    for (const item of raced) if (item.status === "rejected") assert.ok(item.reason instanceof ConflictException);
    const raceForm = await db.formDefinition.findUniqueOrThrow({ where: { conferenceId: raceId } });
    assert.equal(await db.formField.count({ where: { formDefinitionId: raceForm.id } }), 3);
    assert.equal(((await service.importFormFields(raceId, body, admin)).data as any).copiedCount, 0);
    assert.equal(await db.auditLog.count({ where: { entityId: raceForm.id } }), 1);
    assert.equal(await db.order.count({ where: { conferenceId: { in: ids } } }), 0);
    assert.equal(await db.registration.count({ where: { conferenceId: { in: ids } } }), 0);
  } finally {
    if (adminId) await db.auditLog.deleteMany({ where: { adminUserId: adminId } });
    await db.conference.deleteMany({ where: { id: { in: ids } } });
    if (adminId) await db.adminUser.delete({ where: { id: adminId } });
    await db.$disconnect();
  }
});
