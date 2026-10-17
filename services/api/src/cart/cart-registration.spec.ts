import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { CartService } from "./cart.service";

test("cart checkout preserves explicit self-declaration, treats legacy answers as delegated, and ignores client binding ids", async () => {
  let submitted: any;
  let query: any;
  let removed = false;
  const db: any = { registrationCartItem: {
    findMany: async (args: any) => { query = args; return [{ id: "cart", skuId: "server-sku", conferenceId: "conf", quantity: 2,
      attendeesJson: [{ formData: { name: "Self", phone: "13800000000" }, isSelf: true, boundUserId: "injected", skuId: "injected" }, { name: "Delegate", phone: "13900000000" }] }]; },
    deleteMany: async () => { removed = true; }
  } };
  const service = new CartService(db, { createOrder: async (body: any) => { submitted = body; return { code: "OK" }; } } as any);
  await service.checkoutRegistration({ itemIds: ["cart"] }, { id: "account", openid: null, nickname: null });
  assert.equal(query.where.userId, "account");
  assert.deepEqual(submitted.attendees, [
    { skuId: "server-sku", formData: { name: "Self", phone: "13800000000" }, isSelf: true },
    { skuId: "server-sku", formData: { name: "Delegate", phone: "13900000000" }, isSelf: false }
  ]);
  assert.equal(removed, true);
});

test("cart profile-validation failure preserves the saved cart", async () => {
  let removed = false;
  const service = new CartService({ registrationCartItem: {
    findMany: async () => [{ id: "cart", skuId: "sku", conferenceId: "conf", quantity: 1, attendeesJson: [{ formData: { name: "Self" }, isSelf: true }] }],
    deleteMany: async () => { removed = true; }
  } } as any, { createOrder: async () => { throw new Error("Profile incomplete"); } } as any);
  await assert.rejects(service.checkoutRegistration({ itemIds: ["cart"] }, { id: "account", openid: null, nickname: null }));
  assert.equal(removed, false);
});

test("cart displays exact package totals and marks obsolete party sizes unavailable", async () => {
  const sku = { id: "sku", name: "套餐", priceCent: 3333, stock: 20, lockedStock: 0, soldCount: 0, status: "ACTIVE",
    groupPricingJson: { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 0, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10000 }] } };
  const now = new Date();
  const row = { id: "cart", quantity: 3, sku, conference: { id: "conf", startsAt: now }, createdAt: now, updatedAt: now, attendeesJson: [] };
  const db: any = {
    registrationCartItem: { findMany: async () => [row, { ...row, id: "obsolete", quantity: 4 }] },
    cartItem: { findMany: async () => [] }
  };
  const data = (await new CartService(db, {} as any).list({ id: "account", openid: null, nickname: null })).data;
  assert.equal(data.registrationItems[0].subtotalCent, 10000);
  assert.equal(data.registrationItems[0].pricingError, null);
  assert.equal(data.registrationItems[1].subtotalCent, 0);
  assert.match(data.registrationItems[1].pricingError!, /重新选择/);
});

test("cart cannot bypass group party-size rules or alter registered party size", async () => {
  let writes = 0;
  const sku = { priceCent: 3333, stock: 20, lockedStock: 0, soldCount: 0, status: "ACTIVE", conference: { status: "PUBLISHED" },
    groupPricingJson: { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 0, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10000 }] } };
  const db: any = { registrationSku: { findFirst: async () => sku }, registrationCartItem: {
    findFirst: async () => ({ id: "cart", quantity: 3, sku }),
    create: async () => { writes++; return { id: "cart" }; }, update: async () => { writes++; return { id: "cart" }; }
  } };
  const service = new CartService(db, {} as any);
  const currentUser = { id: "account", openid: null, nickname: null };
  await assert.rejects(() => service.addRegistrationItem({ conferenceId: "conf", skuId: "sku", quantity: 4 }, currentUser), /套餐人数/);
  await assert.rejects(() => service.updateRegistrationItem("cart", { quantity: 4 }, currentUser), /重新填写参会人/);
  assert.equal(writes, 0);
  await service.addRegistrationItem({ conferenceId: "conf", skuId: "sku", quantity: 3 }, currentUser);
  assert.equal(writes, 1);
});
