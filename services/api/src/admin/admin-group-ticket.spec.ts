import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { AdminManagementService } from "./admin-management.service";
import { AdminManagementController } from "./admin-management.controller";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";
import { PrismaService } from "../prisma.service";

const rules = { version: 1, minQuantity: 3, minPayableAmountCent: 10000, tiers: [{ minQuantity: 5, unitPriceCent: 80000 }] };
const admin = { id: "qa-admin", username: "qa", displayName: "QA", permissions: ["conference:write"] };
function fixture(conference = { groupRegistrationEnabled: true, maxTicketsPerOrder: null as number | null }) {
  const writes: any[] = [], audits: any[] = [];
  const existing = { id: "sku", conferenceId: "conf", name: "团体票", priceCent: 100000, groupPricingJson: rules as unknown, stock: 100, lockedStock: 0, soldCount: 0 };
  const service = new AdminManagementService({
    conference: { findUnique: async () => ({ id: "conf", ...conference }) },
    registrationSku: {
      findUnique: async () => existing,
      create: async ({ data }: any) => { writes.push(data); return { id: "new", ...data }; },
      update: async ({ data }: any) => { writes.push(data); return { ...existing, ...data }; }
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } }
  } as unknown as PrismaService);
  return { service, writes, audits, existing };
}

test("admin saves normalized group rules and records the existing audit event", async () => {
  const f = fixture();
  await f.service.createSku("conf", { name: "团体票", priceCent: 100000, stock: 100, groupPricingJson: rules }, admin);
  assert.deepEqual(f.writes[0].groupPricingJson, rules);
  assert.equal(f.audits.length, 1);
});

test("normal creation and explicit clearing persist SQL null; omitted update preserves group rules", async () => {
  const f = fixture();
  await f.service.createSku("conf", { name: "普通票", priceCent: 100000, stock: 100 }, admin);
  assert.equal(f.writes[0].groupPricingJson, Prisma.DbNull);
  await f.service.updateSku("sku", { stock: 99 }, admin);
  assert.equal(Object.hasOwn(f.writes[1], "groupPricingJson"), false);
  await f.service.updateSku("sku", { groupPricingJson: null }, admin);
  assert.equal(f.writes[2].groupPricingJson, Prisma.DbNull);
});

test("rejects a base-price update that would make stored tiers more expensive", async () => {
  const f = fixture();
  await assert.rejects(() => f.service.updateSku("sku", { priceCent: 70000 }, admin), /高于上一档/);
  assert.equal(f.writes.length, 0);
  await f.service.updateSku("sku", { priceCent: 70000, groupPricingJson: null }, admin);
  assert.equal(f.writes[0].priceCent, 70000);
});

test("rejects group rules when group registration is disabled or order capacity is too low", async () => {
  for (const config of [{ groupRegistrationEnabled: false, maxTicketsPerOrder: null }, { groupRegistrationEnabled: true, maxTicketsPerOrder: 2 }]) {
    const f = fixture(config);
    await assert.rejects(() => f.service.createSku("conf", { name: "团体票", priceCent: 100000, stock: 100, groupPricingJson: rules }, admin), /团体报名|最大票数/);
    await assert.rejects(() => f.service.updateSku("sku", { groupPricingJson: rules }, admin), /团体报名|最大票数/);
    assert.equal(f.writes.length, 0);
  }
});

test("rejects tampered rules without persisting data", async () => {
  for (const groupPricingJson of [{ ...rules, minQuantity: 1 }, { ...rules, minPayableAmountCent: -1 }, { ...rules, tiers: [{ minQuantity: 5, unitPriceCent: 0.01 }] }]) {
    const f = fixture();
    await assert.rejects(() => f.service.createSku("conf", { name: "团体票", priceCent: 100000, stock: 100, groupPricingJson }, admin));
    assert.equal(f.writes.length, 0);
  }
});

test("SKU writes retain conference write permission requirements", () => {
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminManagementController.prototype.createSku), ["conference:write"]);
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminManagementController.prototype.updateSku), ["conference:write"]);
});

test("package totals, reference price and every party size are validated", async () => {
  const rules = { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 0, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10000 }, { quantity: 5, totalAmountCent: 15002 }] };
  const body = { name: "整团套餐", priceCent: 3333, stock: 100, groupPricingJson: rules };
  const f = fixture();
  await f.service.createSku("conf", body, admin);
  assert.deepEqual(f.writes[0].groupPricingJson, rules);
  await assert.rejects(() => f.service.createSku("conf", { ...body, priceCent: 3334 }, admin), /参考人均/);
  const limited = fixture({ groupRegistrationEnabled: true, maxTicketsPerOrder: 4 });
  await assert.rejects(() => limited.service.createSku("conf", body, admin), /最大票数/);
});

test("concurrent partial pricing updates cannot save an invalid base/tier combination", async () => {
  const state = { id: "sku", conferenceId: "conf", name: "团体票", priceCent: 100000, groupPricingJson: rules, soldCount: 0, lockedStock: 0 };
  let release!: () => void, reads = 0, audits = 0;
  const bothRead = new Promise<void>(resolve => { release = resolve; });
  const service = new AdminManagementService({
    conference: { findUnique: async () => ({ groupRegistrationEnabled: true, maxTicketsPerOrder: null }) },
    registrationSku: {
      findUnique: async () => { const snapshot = structuredClone(state); if (++reads === 2) release(); await bothRead; return snapshot; },
      update: async ({ where, data }: any) => {
        if (where.priceCent !== state.priceCent || JSON.stringify(where.groupPricingJson.equals) !== JSON.stringify(state.groupPricingJson)) throw { code: "P2025" };
        Object.assign(state, data);
        return state;
      }
    },
    auditLog: { create: async () => { audits++; return {}; } }
  } as unknown as PrismaService);
  const results = await Promise.allSettled([
    service.updateSku("sku", { priceCent: 90000 }, admin),
    service.updateSku("sku", { groupPricingJson: { ...rules, tiers: [{ minQuantity: 5, unitPriceCent: 95000 }] } }, admin)
  ]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
  assert.match(rejected.reason.message, /刷新后重新保存/);
  assert.ok(state.groupPricingJson.tiers[0].unitPriceCent <= state.priceCent);
  assert.equal(audits, 1);
});
