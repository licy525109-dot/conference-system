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
