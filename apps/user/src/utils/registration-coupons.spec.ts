import assert from "node:assert/strict";
import test from "node:test";
import { couponFitsRegistration, readPendingRegistrationCoupon } from "./registration-coupons";
import type { MyCouponItem } from "../services/operations";

const coupon: MyCouponItem = { id: "owned", status: "UNUSED", usable: true, coupon: {
  id: "coupon", code: "private", name: "受邀优惠", scope: "CONFERENCE", type: "AMOUNT",
  discountAmountCent: 100, discountPercent: null, minAmountCent: 500, minQuantity: 1,
  endAt: null, conferenceId: "a", allowedSkuIds: ["s"]
} };
const selection = [{ skuId: "s", quantity: 1, priceCent: 600 }];
test("only owned usable coupons in the selected meeting are offered", () => {
  assert.equal(couponFitsRegistration(coupon, "a", selection), true);
  assert.equal(couponFitsRegistration(coupon, "b", selection), false);
  assert.equal(couponFitsRegistration({ ...coupon, usable: false }, "a", selection), false);
  assert.equal(couponFitsRegistration({ ...coupon, coupon: { ...coupon.coupon, scope: "MALL" } }, "a", selection), false);
  assert.equal(couponFitsRegistration(coupon, "a", []), false);
});
test("ineligible SKUs cannot satisfy amount and quantity thresholds", () => {
  assert.equal(couponFitsRegistration(coupon, "a", [{ skuId: "s", quantity: 1, priceCent: 100 }, { skuId: "foreign", quantity: 9, priceCent: 900 }]), false);
  assert.equal(couponFitsRegistration({ ...coupon, coupon: { ...coupon.coupon, minQuantity: 2 } }, "a", selection), false);
});
test("expired and disabled coupons are hidden even if stale API usable says true", () => {
  assert.equal(couponFitsRegistration({ ...coupon, coupon: { ...coupon.coupon, enabled: false } }, "a", selection), false);
  assert.equal(couponFitsRegistration({ ...coupon, coupon: { ...coupon.coupon, endAt: "2026-09-20" } }, "a", selection, Date.parse("2026-09-21")), false);
});
test("private coupon handoff is bounded by account, meeting, scope and time", () => {
  const stored = { code: " private ", scope: "CONFERENCE", userId: "u1", conferenceId: "a", savedAt: 100 };
  assert.equal(readPendingRegistrationCoupon(stored, "a", "u1", 101), "private");
  assert.equal(readPendingRegistrationCoupon(stored, "a", "u2", 101), "");
  assert.equal(readPendingRegistrationCoupon(stored, "b", "u1", 101), "");
  assert.equal(readPendingRegistrationCoupon(stored, "a", "u1", 99), "");
  assert.equal(readPendingRegistrationCoupon(stored, "a", "u1", 1800100), "");
  assert.equal(readPendingRegistrationCoupon({ ...stored, userId: undefined }, "a", "u1", 101), "");
});
