import assert from "node:assert/strict";
import test from "node:test";
import type { CartRegistrationItem } from "../services/cart";
import { registrationCartSelectionError, registrationCartState } from "./registration-cart-ui";

const regular: CartRegistrationItem = {
  id: "regular", quantity: 2, couponCode: null, attendees: [], subtotalCent: 20000, pricingError: null,
  conference: { id: "conference", title: "会议", startAt: "2026-12-01", location: null, status: "PUBLISHED" },
  sku: { id: "regular-sku", name: "普通票", priceCent: 10000, stock: 100, soldCount: 0, status: "ACTIVE" },
  createdAt: "2026-10-17", updatedAt: "2026-10-17"
};
const group: CartRegistrationItem = {
  ...regular, id: "group", quantity: 5, subtotalCent: 40000,
  sku: { ...regular.sku, groupPricingJson: { version: 1, minQuantity: 3, minPayableAmountCent: 0, tiers: [{ minQuantity: 5, unitPriceCent: 8000 }] } }
};
const packageItem: CartRegistrationItem = {
  ...regular, id: "package", quantity: 5, subtotalCent: 1400001,
  sku: { ...regular.sku, priceCent: 280000, groupPricingJson: { version: 1, mode: "PACKAGE", minQuantity: 5, minPayableAmountCent: 0, tiers: [], packages: [{ quantity: 5, totalAmountCent: 1400001 }] } }
};

test("ordinary and legacy cart items retain quantity editing and server subtotals", () => {
  for (const item of [regular, { ...regular, pricingError: undefined }, { ...regular, sku: { ...regular.sku, groupPricingJson: null } }]) {
    const state = registrationCartState(item);
    assert.equal(state.canEditQuantity, true);
    assert.equal(state.canSelect, true);
    assert.equal(state.priceLabel, "¥200.00");
  }
});

test("per-person group cart items display tier subtotal and require re-registration to edit headcount", () => {
  const state = registrationCartState(group);
  assert.equal(state.isGroup, true);
  assert.equal(state.canEditQuantity, false);
  assert.equal(state.canSelect, true);
  assert.equal(state.quantityLabel, "5人团体票");
  assert.equal(state.priceLabel, "¥400.00");
  assert.notEqual(group.subtotalCent, group.sku.priceCent * group.quantity);
});

test("package cart items show the exact server whole-group amount including indivisible cents", () => {
  const state = registrationCartState(packageItem);
  assert.equal(state.quantityLabel, "5人套餐");
  assert.equal(state.priceLabel, "¥14000.01/团");
  assert.equal(state.canEditQuantity, false);
  assert.equal(state.canSelect, true);
  assert.equal(registrationCartState({ ...packageItem, subtotalCent: 1400003 }).priceLabel, "¥14000.03/团");
});

test("pricing errors block selection and editing without presenting invalid zero subtotal as free", () => {
  for (const item of [regular, group, packageItem]) {
    const state = registrationCartState({ ...item, subtotalCent: 0, pricingError: "票种人数或价格规则已更新" });
    assert.equal(state.canSelect, false);
    assert.equal(state.canEditQuantity, false);
    assert.equal(state.priceLabel, "暂不可计价");
    assert.equal(state.pricingError, "票种人数或价格规则已更新");
  }
  assert.equal(registrationCartState({ ...packageItem, subtotalCent: 0 }).canSelect, true);
});

test("single and batch checkout validation reject stale, missing, and repriced selections", () => {
  const invalid = { ...packageItem, subtotalCent: 0, pricingError: "套餐已失效，请重新报名" };
  assert.equal(registrationCartSelectionError([regular, group, packageItem], [regular.id, group.id, packageItem.id]), "");
  assert.equal(registrationCartSelectionError([regular, invalid], [invalid.id]), invalid.pricingError);
  assert.equal(registrationCartSelectionError([regular, invalid], [regular.id, invalid.id]), invalid.pricingError);
  assert.match(registrationCartSelectionError([regular], [packageItem.id]), /已更新/);
  assert.equal(registrationCartSelectionError([invalid], []), "");
});
