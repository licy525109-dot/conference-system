import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, after, describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { AdminConferenceWorkspaceService } from "./admin-conference-workspace.service";
import { AdminExportsService } from "./admin-exports.service";
import { AdminManagementService } from "./admin-management.service";
import { CurrentAdmin } from "./current-admin";

type Row = Record<string, any>;
const now = new Date("2026-01-01T00:00:00Z");
const query = { conferenceId: "conference-owned", page: 1, pageSize: 10 };
const actor = (...permissions: string[]): CurrentAdmin => ({
  id: "scoped-admin", username: "operator", displayName: null,
  conferenceScopeMode: "ASSIGNED", conferenceIds: [query.conferenceId], permissions
});
const data = (response: { data: unknown }): Row => response.data as Row;
const minimalUser = { id: "payer", nickname: "Payer nickname" };

describe("scoped workspace real management response boundaries", () => {
  let originalSecret: string | undefined;
  before(() => {
    originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomBytes(32).toString("hex");
  });
  after(() => {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  it("redacts global user profiles from both real list formatters and preserves submitted contacts and totals", async () => {
    const { service, management } = fixture();
    const raw = data(await management.listOrders(query));
    assert.equal(raw.items[0].user.openid, "private-global-openid");
    assert.equal(raw.items[0].user.phone, "private-global-phone");
    const orders = data(await service.orders(query, actor("order:view")));
    const registrations = data(await service.registrations(query, actor("registration:view")));
    for (const result of [orders, registrations]) {
      assert.deepEqual(result.items[0].user, minimalUser);
      assert.equal(result.items[0].phone, "submitted-attendee-phone");
      assert.equal(result.total, 1);
      assert.equal(result.pageSize, 10);
      assertNoGlobalProfile(result);
    }
    assert.deepEqual(orders.summary, { orderCount: 1, paidOrderCount: 1, payableAmountCent: 12345,
      discountAmountCent: 100, paidAmountCent: 12345, refundedAmountCent: 0, netPaidAmountCent: 12345 });
  });

  it("order-only detail excludes all form snapshots and arbitrary audit metadata", async () => {
    const { service, management } = fixture();
    const raw = data(await management.getOrder("ORDER"));
    assert.equal(raw.submittedFormJson.privateAnswer, "submitted-answer");
    assert.equal(raw.registrationSnapshotJson.memberPricing.privateMarker, "private-membership");
    assert.equal(raw.exceptionReviewLogs[0].metadataJson.privateMarker, "private-audit");
    const result = data(await service.order("ORDER", actor("order:view")));
    assert.deepEqual(result.user, minimalUser);
    assertAbsent(result, ["submittedFormJson", "registrationSnapshotJson", "exceptionReviewLogs", "adminDeleteReason"]);
    assert.equal(result.payments[0].transactionId, "transaction-synthetic");
    assert.equal(result.payments[0].amountCent, 12345);
    assert.equal(result.paymentCompanyName, "Synthetic company");
    assert.deepEqual(result.registration, { id: "registration", registrationNo: "REG", status: "CONFIRMED" });
    assertNoGlobalProfile(result);
    assert.equal(JSON.stringify(result).includes("submitted-answer"), false);
  });

  it("registration-only detail keeps actual attendee answers and labels but no full order, payments, or credentials", async () => {
    const { service, management } = fixture();
    const raw = data(await management.getRegistrationDetail("registration"));
    assert.equal(raw.order.payments[0].transactionId, "transaction-synthetic");
    assert.ok(raw.credential.qrPayload);
    const result = data(await service.registration("registration", actor("registration:view")));
    assert.deepEqual(result.user, minimalUser);
    assert.deepEqual(result.order, { orderNo: "ORDER", status: "PAID" });
    assert.deepEqual(result.formFields, [{ key: "privateAnswer", label: "Submitted answer", type: "TEXT" }]);
    assert.equal(result.formDataJson.privateAnswer, "submitted-answer");
    assert.equal(result.attendees[0].phone, "submitted-attendee-phone");
    assert.equal(result.attendees[0].formDataJson.privateAnswer, "submitted-answer");
    assertAbsent(result, ["credential", "auditLogs", "timeline"]);
    assertNoGlobalProfile(result);
    assert.equal(JSON.stringify(result).includes("transaction-synthetic"), false);
    assert.equal(JSON.stringify(result).includes("private-membership"), false);
  });

  for (const permissions of [["order:view", "registration:view"], ["*"]]) {
    it(`retains authorized nested detail but never global profiles for ${permissions.join(",")}`, async () => {
      const { service, order } = fixture();
      const before = structuredClone(order);
      const orderDetail = data(await service.order("ORDER", actor(...permissions)));
      const registration = data(await service.registration("registration", actor(...permissions)));
      assert.equal(orderDetail.submittedFormJson.privateAnswer, "submitted-answer");
      assert.equal(orderDetail.registrationSnapshotJson.attendees[0].formData.privateAnswer, "submitted-answer");
      assert.equal(registration.order.payments[0].amountCent, 12345);
      assert.equal(registration.order.payableAmountCent, 12345);
      assert.equal(registration.order.registrationSnapshotJson.formData.privateAnswer, "submitted-answer");
      assert.deepEqual(registration.order.user, minimalUser);
      for (const result of [orderDetail, registration]) {
        assertNoGlobalProfile(result);
        const json = JSON.stringify(result);
        for (const marker of ["private-membership", "private-audit", "private-payment", "private-discount", "private-ticket"]) {
          assert.equal(json.includes(marker), false, marker);
        }
      }
      assert.deepEqual(order, before, "projection must not mutate the management response source");
    });
  }

  it("remark-write-only returns an acknowledgement, not a registration or order read", async () => {
    const { service } = fixture();
    const result = data(await service.remark("registration", { adminRemark: "Updated" }, actor("registration:write")));
    assert.deepEqual(Object.keys(result).sort(), ["adminRemark", "id", "remarkUpdatedAt"]);
    assert.equal(result.adminRemark, "Updated");
    assertNoGlobalProfile(result);
  });

  it("remark update with registration view still gates the nested order", async () => {
    const { service } = fixture();
    const result = data(await service.remark("registration", { adminRemark: "Updated" }, actor("registration:view", "registration:write")));
    assert.deepEqual(result.order, { orderNo: "ORDER", status: "PAID" });
    assert.deepEqual(result.user, minimalUser);
    assert.equal(result.attendees[0].formDataJson.privateAnswer, "submitted-answer");
    assertNoGlobalProfile(result);
  });

  it("checkin-write-only returns status without attendee contact or form data", async () => {
    const { service } = fixture();
    const result = data(await service.checkin("attendee", actor("checkin:write")));
    assert.deepEqual(Object.keys(result).sort(), ["checkInStatus", "checkedInAt", "id"]);
    assert.equal(result.checkInStatus, "CHECKED_IN");
    assertNoGlobalProfile(result);
  });

  it("checkin with registration view retains submitted attendee data", async () => {
    const { service } = fixture();
    const result = data(await service.checkin("attendee", actor("registration:view", "checkin:write")));
    assert.equal(result.checkInStatus, "CHECKED_IN");
    assert.equal(result.phone, "submitted-attendee-phone");
    assert.equal(result.formDataJson.privateAnswer, "submitted-answer");
    assertAbsent(result, ["user", "registration", "order"]);
  });

  it("allows null users and uses only nickname fallback, never account identity fields", async () => {
    const { service, order, registration, user } = fixture();
    user.nickname = null;
    user.wechatNickname = "Display nickname";
    assert.deepEqual(data(await service.order("ORDER", actor("order:view"))).user, { id: "payer", nickname: "Display nickname" });
    order.user = null;
    registration.user = null;
    assert.equal(data(await service.order("ORDER", actor("order:view"))).user, null);
    assert.equal(data(await service.registration("registration", actor("registration:view"))).user, null);
  });
});

function assertAbsent(value: Row, keys: string[]) {
  for (const key of keys) assert.equal(Object.hasOwn(value, key), false, key);
}
function assertNoGlobalProfile(value: unknown) {
  const serialized = JSON.stringify(value);
  for (const marker of ["private-global-openid", "private-global-phone", "private-real-name", "private-avatar"]) {
    assert.equal(serialized.includes(marker), false, marker);
  }
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) return node.forEach(visit);
    for (const [key, child] of Object.entries(node)) {
      if (key === "user" && child) assert.deepEqual(Object.keys(child).sort(), ["id", "nickname"]);
      visit(child);
    }
  };
  visit(value);
}

function fixture() {
  const user: Row = { id: "payer", realName: "private-real-name", openid: "private-global-openid",
    nickname: "Payer nickname", wechatNickname: null, wechatAvatarUrl: "private-avatar",
    phone: "private-global-phone", createdAt: now, lastActiveAt: now };
  const attendee: Row = { id: "attendee", skuId: "sku", sku: { name: "Admission" }, name: "Submitted attendee",
    phone: "submitted-attendee-phone", company: "Submitted company", title: null,
    formDataJson: { privateAnswer: "submitted-answer" }, checkInStatus: "PENDING", checkedInAt: null,
    checkedInBy: null, adminRemark: null, createdAt: now };
  const payment = { id: "payment", provider: "WECHAT", status: "SUCCESS", outTradeNo: "trade-synthetic",
    transactionId: "transaction-synthetic", amountCent: 12345, paidAt: now, createdAt: now,
    failedReason: "private-payment", extraProfile: user };
  const order: Row = { id: "order", orderNo: "ORDER", conferenceId: query.conferenceId, conference: { title: "Conference" },
    skuId: "sku", sku: { name: "Admission" }, items: [{ id: "item", skuId: "sku", skuName: "Admission", unitPriceCent: 12445,
      quantity: 1, totalAmountCent: 12445, futureField: "private-ticket" }], refunds: [],
    originAmountCent: 12445, discountAmountCent: 100, payableAmountCent: 12345, paidAmountCent: 12345,
    status: "PAID", attendeeName: attendee.name, phone: attendee.phone, expiredAt: null, paidAt: now, createdAt: now,
    adminDeletedAt: null, adminDeleteReason: "private-audit", user, payments: [payment],
    paymentMerchantSnapshot: { merchantId: "merchant", companyName: "Synthetic company" },
    registration: { id: "registration", registrationNo: "REG", status: "CONFIRMED", futureProfile: user },
    submittedFormJson: { privateAnswer: "submitted-answer" },
    registrationSnapshotJson: { formData: attendee.formDataJson,
      fields: [{ key: "privateAnswer", label: "Submitted answer", type: "TEXT", futureProfile: user }],
      attendees: [{ skuId: "sku", formData: attendee.formDataJson, futureProfile: user }],
      memberPricing: { privateMarker: "private-membership" }, futureProfile: user },
    discounts: [{ id: "discount", type: "COUPON", title: "Discount", amountCent: 100, couponId: null,
      promotionRuleId: null, createdAt: now, snapshotJson: { privateMarker: "private-discount" }, futureProfile: user }] };
  const registration: Row = { id: "registration", registrationNo: "REG", conferenceId: query.conferenceId,
    conference: order.conference, skuId: "sku", sku: order.sku, attendeeName: attendee.name, phone: attendee.phone,
    paidAmountCent: 12345, status: "CONFIRMED", source: "PAYMENT", confirmedAt: now, adminRemark: null,
    remarkUpdatedAt: null, remarkUpdatedBy: null, createdAt: now, attendees: [attendee], user, order,
    formDataJson: attendee.formDataJson, credentialVersion: 0 };
  const db = {
    order: { findUnique: async () => order, findMany: async () => [order], count: async () => 1,
      aggregate: async () => ({ _sum: { payableAmountCent: 12345, discountAmountCent: 100, paidAmountCent: 12345 }, _count: { _all: 1 } }) },
    refund: { aggregate: async () => ({ _sum: { amountCent: 0 } }) },
    registration: { findUnique: async () => registration, findMany: async () => [registration], count: async () => 1,
      update: async ({ data: patch }: { data: Row }) => Object.assign(registration, patch) },
    registrationAttendee: { findUnique: async () => ({ ...attendee, registration }),
      update: async ({ data: patch }: { data: Row }) => Object.assign(attendee, patch) },
    auditLog: { create: async () => ({}), findMany: async () => [{ id: "audit", action: "UPDATE", entityType: "PaymentException",
      entityId: "order", summary: "Review", metadataJson: { privateMarker: "private-audit", user }, createdAt: now, adminUser: null }] },
    $transaction: async (operation: unknown) => typeof operation === "function" ? operation(db) : Promise.all(operation as Promise<unknown>[])
  };
  const prisma = db as unknown as PrismaService;
  const management = new AdminManagementService(prisma);
  const service = new AdminConferenceWorkspaceService(prisma, management, {} as AdminExportsService);
  return { service, management, order, registration, user };
}
