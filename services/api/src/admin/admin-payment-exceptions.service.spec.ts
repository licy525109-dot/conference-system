import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { OrderStatus, PaymentStatus, RegistrationStatus } from "@prisma/client";
import { detectPaymentExceptions } from "./admin-payment-exceptions.service";

describe("Admin payment exception detection", () => {
  it("flags paid orders without registration", () => {
    const exceptions = detectPaymentExceptions({
      id: "order-1",
      orderNo: "REG001",
      status: OrderStatus.PAID,
      payableAmountCent: 70000,
      paidAmountCent: 70000,
      expiredAt: null,
      paidAt: new Date("2026-06-16T02:00:00.000Z"),
      createdAt: new Date("2026-06-16T01:00:00.000Z"),
      payments: [
        {
          id: "payment-1",
          status: PaymentStatus.SUCCESS,
          amountCent: 70000,
          failedReason: null,
          createdAt: new Date("2026-06-16T01:30:00.000Z"),
          paidAt: new Date("2026-06-16T02:00:00.000Z")
        }
      ],
      registration: null
    });

    assert.equal(exceptions.some((item) => item.code === "PAID_ORDER_MISSING_REGISTRATION"), true);
  });

  it("flags success payment amount mismatch without mutating payment state", () => {
    const exceptions = detectPaymentExceptions({
      id: "order-2",
      orderNo: "REG002",
      status: OrderStatus.PAID,
      payableAmountCent: 70000,
      paidAmountCent: 70000,
      expiredAt: null,
      paidAt: new Date("2026-06-16T02:00:00.000Z"),
      createdAt: new Date("2026-06-16T01:00:00.000Z"),
      payments: [
        {
          id: "payment-2",
          status: PaymentStatus.SUCCESS,
          amountCent: 1,
          failedReason: null,
          createdAt: new Date("2026-06-16T01:30:00.000Z"),
          paidAt: new Date("2026-06-16T02:00:00.000Z")
        }
      ],
      registration: {
        id: "registration-1",
        registrationNo: "R001",
        status: RegistrationStatus.CONFIRMED
      }
    });

    assert.deepEqual(
      exceptions.map((item) => item.code),
      ["PAYMENT_AMOUNT_MISMATCH"]
    );
  });
});
