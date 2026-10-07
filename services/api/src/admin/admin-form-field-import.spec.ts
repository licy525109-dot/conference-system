import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminManagementService } from "./admin-management.service";
import { AdminManagementController } from "./admin-management.controller";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";

const admin = { id: "qa-admin", username: "qa", displayName: "QA", permissions: ["conference:view", "conference:write"] };
const field = (id: string, extra = {}) => ({
  id, fieldKey: id, label: `Field ${id}`, type: "TEXT", required: false,
  placeholder: null, optionsJson: null, validationJson: null, sortOrder: 0, enabled: true, ...extra
});

function fixture(options: { source?: any[]; existing?: any[]; missing?: string; noForm?: boolean; fail?: string } = {}) {
  const source = options.source ?? [field("company"), field("meal", { sortOrder: 9 })];
  const existing = options.existing ?? [];
  const writes: any[] = [];
  const audits: any[] = [];
  let state = existing.map(item => ({ ...item }));
  const prisma = { $transaction: async (fn: Function, config: unknown) => {
    assert.deepEqual(config, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (options.fail?.startsWith("P")) throw { code: options.fail };
    const pending = [...state];
    const result = await fn({
      conference: { findUnique: async ({ where }: any) => where.id === options.missing ? null : { id: where.id } },
      formDefinition: {
        findUnique: async () => options.noForm ? null : { id: "source-form" },
        upsert: async (args: any) => { assert.equal(args.where.conferenceId, "target"); return { id: "target-form" }; }
      },
      formField: {
        findMany: async ({ where }: any) => where.formDefinitionId === "source-form"
          ? source.filter(item => where.id.in.includes(item.id)).sort((a, b) => a.sortOrder - b.sortOrder) : pending,
        createMany: async ({ data }: any) => {
          if (options.fail === "write") throw new Error("write failed");
          writes.push(...data);
          pending.push(...data.map((item: any, index: number) => ({ ...item, id: `new-${index}` })));
        }
      },
      auditLog: { create: async ({ data }: any) => {
        if (options.fail === "audit") throw new Error("audit failed");
        audits.push(data);
      } }
    });
    state = pending;
    return result;
  } } as unknown as PrismaService;
  const service = new AdminManagementService(prisma);
  const run = (input: unknown = { sourceConferenceId: "source", fieldIds: source.map(item => item.id) }) => service.importFormFields("target", input, admin);
  return { run, writes, audits, source, state: () => state };
}

test("copies selected configuration, including disabled fields and JSON rules, in source order with new IDs", async () => {
  const source = [field("meal", { sortOrder: 8, type: "SELECT", required: true, enabled: false, placeholder: "Choose", optionsJson: [{ label: "Vegetarian", value: "veg" }], validationJson: { maxLength: 50 } }), field("company", { sortOrder: 1 }), field("excluded")];
  const before = structuredClone(source);
  const f = fixture({ source, existing: [field("current", { sortOrder: 4 })] });
  const result = await f.run({ sourceConferenceId: "source", fieldIds: ["meal", "company"] });
  assert.equal((result.data as any).copiedCount, 2);
  assert.deepEqual(f.writes.map(item => [item.fieldKey, item.sortOrder]), [["company", 5], ["meal", 6]]);
  assert.deepEqual(f.writes[1], {
    formDefinitionId: "target-form", fieldKey: "meal", label: "Field meal", type: "SELECT", required: true,
    enabled: false, placeholder: "Choose", optionsJson: source[0].optionsJson, validationJson: source[0].validationJson, sortOrder: 6
  });
  assert.equal(f.writes[0].optionsJson, Prisma.DbNull);
  assert.equal(f.writes[0].validationJson, Prisma.DbNull);
  assert.deepEqual(source, before);
  assert.equal(f.audits[0].adminUserId, admin.id);
  assert.deepEqual(f.audits[0].metadataJson, { conferenceId: "target", sourceConferenceId: "source", sourceFieldIds: ["company", "meal"], copiedFieldKeys: ["company", "meal"], skippedFieldKeys: [] });
});

test("skips existing keys even when disabled; repeating import never duplicates or overwrites", async () => {
  const original = field("original", { fieldKey: "company", enabled: false, label: "Keep this", sortOrder: 2 });
  const f = fixture({ existing: [original] });
  const first = (await f.run()).data as any;
  assert.equal(first.copiedCount, 1);
  assert.deepEqual(first.skippedFieldKeys, ["company"]);
  const repeated = (await f.run()).data as any;
  assert.equal(repeated.copiedCount, 0);
  assert.deepEqual(f.state()[0], original);
  assert.equal(f.state().length, 2);
  assert.equal(f.audits.length, 1);
});

for (const input of [null, {}, { sourceConferenceId: "target", fieldIds: ["company"] },
  { sourceConferenceId: "source", fieldIds: [] }, { sourceConferenceId: "source", fieldIds: [1] },
  { sourceConferenceId: "source", fieldIds: [" "] }, { sourceConferenceId: "source", fieldIds: ["company", " company "] },
  { sourceConferenceId: "source", fieldIds: Array.from({ length: 201 }, (_, i) => String(i)) },
  { sourceConferenceId: "source", fieldIds: ["company", "foreign-field"] }
]) test(`rejects malformed or foreign selection: ${JSON.stringify(input).slice(0, 90)}`, async () => {
  const f = fixture();
  await assert.rejects(() => f.run(input), BadRequestException);
  assert.equal(f.writes.length, 0);
  assert.equal(f.audits.length, 0);
});

for (const missing of ["target", "source"]) test(`rejects missing ${missing} conference without writes`, async () => {
  const f = fixture({ missing });
  await assert.rejects(() => f.run(), NotFoundException);
  assert.equal(f.writes.length, 0);
});

test("rejects empty source configuration and sort overflow", async () => {
  const noForm = fixture({ noForm: true });
  await assert.rejects(() => noForm.run(), BadRequestException);
  const overflow = fixture({ existing: [field("existing", { sortOrder: 2147483647 })] });
  await assert.rejects(() => overflow.run(), BadRequestException);
  assert.equal(overflow.writes.length, 0);
});

for (const code of ["P2002", "P2034"]) test(`maps concurrent ${code} conflict to a safe retry`, async () => {
  await assert.rejects(() => fixture({ fail: code }).run(), ConflictException);
});

for (const fail of ["write", "audit"]) test(`does not commit fields if ${fail} fails`, async () => {
  const f = fixture({ fail });
  await assert.rejects(() => f.run(), new RegExp(`${fail} failed`));
  assert.equal(f.state().length, 0);
});

test("import endpoint requires read and write permissions and forwards the current administrator", async () => {
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminManagementController.prototype.importFormFields), ["conference:view", "conference:write"]);
  const body = { sourceConferenceId: "source", fieldIds: ["company"] };
  const controller = new AdminManagementController({ importFormFields: async (...args: unknown[]) => args } as unknown as AdminManagementService);
  assert.deepEqual(await controller.importFormFields("target", body, { currentAdmin: admin } as any), ["target", body, admin]);
});
