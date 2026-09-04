import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { PaymentSuccessService } from "./payment-success.service";

describe("PaymentSuccessService", () => {
  it("rejects a mismatched amount even when the order is already paid", async () => {
    const prisma: any = {
      order: {
        findUnique: async () => ({
          id: "order-1",
          orderNo: "ORDER001",
          payableAmountCent: 10000,
          status: OrderStatus.PAID
        })
      },
      $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
    };
    const service = new PaymentSuccessService(prisma as PrismaService);

    await assert.rejects(
      () => service.processPaymentSuccess({
        provider: "WECHAT",
        orderNo: "ORDER001",
        outTradeNo: "ORDER001",
        transactionId: "wx-transaction-1",
        paidAmountCent: 9999,
        paidAt: new Date("2026-09-04T08:00:00.000Z")
      }),
      (error: unknown) => error instanceof ConflictException && /amount does not match/.test(error.message)
    );
  });
});
