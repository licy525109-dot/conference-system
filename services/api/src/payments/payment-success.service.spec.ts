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

  it("includes conference and payment fields required by the approved WeChat templates", async () => {
    const dispatchedNotifications: Array<Record<string, any>> = [];
    const prisma: any = {
      order: {
        findUnique: async () => ({
          id: "order-1",
          orderNo: "ORDER001",
          userId: "user-1",
          conferenceId: "conference-1",
          skuId: "sku-1",
          payableAmountCent: 12800,
          inventoryReservedAt: new Date("2026-09-04T08:00:00.000Z"),
          status: OrderStatus.PAID,
          registrationSnapshotJson: {},
          paidAt: new Date("2026-09-04T08:00:00.000Z"),
          conference: {
            checkInEnabled: true,
            title: "观潮会集",
            startsAt: new Date("2026-10-22T13:00:00.000Z"),
            location: "广东江门"
          },
          items: [{ skuId: "sku-1", quantity: 1 }],
          registration: {
            id: "registration-1",
            skuId: "sku-1",
            attendeeName: "张三",
            phone: "13800000000",
            formDataJson: {},
            attendees: [{ id: "attendee-1" }]
          }
        })
      },
      payment: { upsert: async () => ({}) },
      $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
    };
    const notifications: any = {
      dispatchBusinessNotification: async (input: Record<string, any>) => {
        dispatchedNotifications.push(input);
      }
    };
    const service = new PaymentSuccessService(prisma as PrismaService, notifications);

    await service.processPaymentSuccess({
      provider: "WECHAT",
      orderNo: "ORDER001",
      outTradeNo: "ORDER001",
      transactionId: "wx-transaction-1",
      paidAmountCent: 12800,
      paidAt: new Date("2026-09-04T08:00:00.000Z")
    });

    assert.equal(dispatchedNotifications[0]?.templateCode, "PAYMENT_SUCCESS");
    assert.deepEqual(dispatchedNotifications[0]?.variables, {
      会议名称: "观潮会集",
      会议时间: "2026-10-22 21:00",
      会议地点: "广东江门",
      参会人姓名: "张三",
      订单号: "ORDER001",
      报名状态: "报名成功",
      支付金额: "¥128.00",
      支付方式: "微信支付"
    });
  });
});
