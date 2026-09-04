import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  CheckInStatus,
  CouponRedemptionStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  RegistrationStatus
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentsService } from "./payments.service";
import { WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";

const now = new Date("2026-06-06T14:50:00.000Z");
const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_user_1",
  nickname: "测试用户"
};

describe("PaymentsService mock confirm", () => {
  it("confirms a pending order and creates payment and registration", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const response = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        orderNo: "REG001",
        orderStatus: "PAID",
        paymentStatus: "SUCCESS",
        registrationId: "registration-1"
      }
    });
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.orders[0]?.paidAmountCent, 100000);
    assert.equal(prisma.orders[0]?.paidAt?.toISOString(), now.toISOString());
    assert.equal(prisma.payments.length, 1);
    assert.equal(prisma.payments[0]?.outTradeNo, "MOCK_REG001");
    assert.equal(prisma.payments[0]?.status, PaymentStatus.SUCCESS);
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.registrations[0]?.status, RegistrationStatus.CONFIRMED);
    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.registrationAttendees[0]?.checkInStatus, CheckInStatus.NOT_REQUIRED);
    assert.equal(prisma.registrations[0]?.attendeeName, "快照姓名");
    assert.equal(prisma.registrations[0]?.phone, "13900000000");
    assert.deepEqual(prisma.registrations[0]?.formDataJson, {
      name: "快照姓名",
      phone: "13900000000"
    });
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("is idempotent for repeated mock confirm", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const first = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);
    const second = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(first.data.registrationId, second.data.registrationId);
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.payments.length, 1);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("creates a pending check-in attendee when conference check-in is enabled", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({ checkInEnabled: true });
    const service = createService(prisma);

    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.registrationAttendees[0]?.checkInStatus, CheckInStatus.PENDING);
  });

  it("marks pending coupon redemptions used without recalculating the paid amount", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({
      couponRedemptions: [
        {
          couponId: "coupon-1",
          orderId: "order-REG001",
          userId: currentUser.id,
          status: CouponRedemptionStatus.PENDING,
          usedAt: null
        }
      ]
    });
    const service = createService(prisma);

    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(prisma.orders[0]?.paidAmountCent, 100000);
    assert.equal(prisma.couponRedemptions[0]?.status, CouponRedemptionStatus.USED);
    assert.equal(prisma.couponRedemptions[0]?.usedAt?.toISOString(), now.toISOString());
  });

  it("converts the claimed order reservation once when registration already exists", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({
      initialSoldCount: 1,
      simulateRegistrationCreateConflict: true
    });
    const service = createService(prisma);

    const response = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(response.data.registrationId, "registration-race");
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.skus[0]?.soldCount, 2);
    assert.equal(prisma.skus[0]?.lockedStock, 0);
  });

  it("hides orders that do not belong to current user", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_OTHER_USER" }, currentUser), NotFoundException);
  });

  it("returns 404 for missing orders", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "MISSING" }, currentUser), NotFoundException);
  });

  it("rejects cancelled, closed, and refunded orders", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_CANCELLED" }, currentUser), ConflictException);
    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_CLOSED" }, currentUser), ConflictException);
    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_REFUNDED" }, currentUser), ConflictException);
  });

  it("rejects expired orders without closing them", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_EXPIRED" }, currentUser), ConflictException);

    const expiredOrder = prisma.orders.find((order) => order.orderNo === "REG_EXPIRED");
    assert.equal(expiredOrder?.status, OrderStatus.PENDING);
  });

  it("rejects when mock payment mode is disabled", async () => {
    process.env.PAYMENT_MODE = "real";
    process.env.WECHAT_PAY_MOCK = "false";
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG001" }, currentUser), ForbiddenException);
  });

  it("rejects orders missing registration snapshot", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_NO_SNAPSHOT" }, currentUser), ConflictException);
  });

  it("requires login for mock confirm", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG001" }, undefined), UnauthorizedException);
  });
});

describe("PaymentsService payment status", () => {
  it("returns payment status with registrationId for current user", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);
    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    const response = await service.getPaymentStatus("REG001", currentUser);

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        orderNo: "REG001",
        status: OrderStatus.PAID,
        paidAt: now.toISOString(),
        paymentProvider: PaymentProvider.MOCK,
        paymentStatus: PaymentStatus.SUCCESS,
        registrationId: "registration-1"
      }
    });
  });

  it("hides payment status for other users' orders", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.getPaymentStatus("REG_OTHER_USER", currentUser), NotFoundException);
  });

  it("requires login for payment status", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.getPaymentStatus("REG001", undefined), UnauthorizedException);
  });

  it("reconciles a successful WeChat payment before returning pending status", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    process.env.WECHAT_PAY_ENABLED = "true";
    const prisma = createPrismaMock({ withWechatPayment: true });
    const transactionClient = {
      queryByOutTradeNo: async () => ({
        outTradeNo: "WECHAT_REG001",
        transactionId: "wx-transaction-query-1",
        tradeState: "SUCCESS",
        amountTotal: 100000,
        successTime: now
      })
    };
    const service = createService(prisma, transactionClient);

    const response = await service.getPaymentStatus("REG001", currentUser);

    assert.equal(response.data.status, OrderStatus.PAID);
    assert.equal(response.data.paymentProvider, PaymentProvider.WECHAT);
    assert.equal(response.data.paymentStatus, PaymentStatus.SUCCESS);
    assert.equal(response.data.registrationId, "registration-1");
    assert.equal(prisma.skus[0]?.lockedStock, 0);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });
});

describe("PaymentsService WeChat refund notify", () => {
  it("marks a full registration refund successful only after a verified callback", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock();
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("SUCCESS", 10000));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    const response = await service.handleRefundNotify(refundNotifyRequest());

    assert.deepEqual(response, { code: "SUCCESS", message: "OK" });
    assert.equal(verifier.verifyCalls, 1);
    assert.equal(prisma.refundRecord.status, RefundStatus.SUCCESS);
    assert.equal(prisma.orderRecord.status, OrderStatus.REFUNDED);
    assert.equal(prisma.registrationUpdates[0]?.data.status, RegistrationStatus.REFUNDED);
    assert.equal(prisma.skuRecord.soldCount, 0);
    assert.equal(prisma.attendeeRecord.checkInStatus, CheckInStatus.CANCELLED);
    assert.equal(prisma.couponRedemptionRecord.status, CouponRedemptionStatus.CANCELLED);
    assert.equal(prisma.couponRedemptionRecord.usedAt, null);
  });

  it("does not downgrade a successful refund when a later failure notification arrives", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock({ refundStatus: RefundStatus.SUCCESS, orderStatus: OrderStatus.REFUNDED });
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("CLOSED", 10000));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    await service.handleRefundNotify(refundNotifyRequest());

    assert.equal(prisma.refundRecord.status, RefundStatus.SUCCESS);
    assert.equal(prisma.refundUpdates.length, 0);
    assert.equal(prisma.orderRecord.status, OrderStatus.REFUNDED);
    assert.equal(prisma.couponRedemptionRecord.status, CouponRedemptionStatus.CANCELLED);
  });

  it("keeps a processing refund notification non-terminal", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock({ refundStatus: RefundStatus.REQUESTED });
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("PROCESSING", 10000));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    await service.handleRefundNotify(refundNotifyRequest());

    assert.equal(prisma.refundRecord.status, RefundStatus.PROCESSING);
    assert.equal(prisma.refundUpdates[0]?.processedAt, null);
    assert.equal(prisma.refundUpdates[0]?.failedReason, null);
    assert.equal(prisma.orderRecord.status, OrderStatus.PAID);
  });

  it("routes a verified mall refund callback to mall finalization", async () => {
    withWechatRefundNotifyConfig();
    const order = { id: "mall-order-1", orderNo: "MALL001", userId: "user-1", paidAmountCent: 10000, payableAmountCent: 10000 };
    const refund = {
      id: "mall-refund-1",
      outRefundNo: "MALL_REFUND_ORDER001",
      refundNo: "MRF001",
      mallOrderId: order.id,
      afterSaleId: null,
      amountCent: 10000,
      status: RefundStatus.PROCESSING,
      order
    };
    const finalizeCalls: string[] = [];
    const prisma: any = {
      refund: { findFirst: async () => null },
      mallRefund: {
        findFirst: async () => refund,
        update: async ({ data }: any) => Object.assign(refund, data)
      },
      mallAfterSale: { update: async () => undefined },
      $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
    };
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("SUCCESS", 10000, 10000, refund.outRefundNo));
    const mallFinalization = {
      finalizeIfFullyRefunded: async (mallOrderId: string) => {
        finalizeCalls.push(mallOrderId);
        return { fullyRefunded: true, finalizedNow: true, refundedAmountCent: 10000, paidAmountCent: 10000 };
      }
    };
    const service = new PaymentsService(prisma as PrismaService, undefined, verifier, undefined, undefined, mallFinalization as never);

    const response = await service.handleRefundNotify(refundNotifyRequest());

    assert.deepEqual(response, { code: "SUCCESS", message: "OK" });
    assert.equal(refund.status, RefundStatus.SUCCESS);
    assert.deepEqual(finalizeCalls, [order.id]);
  });

  it("restores a mall order when WeChat closes the refund", async () => {
    withWechatRefundNotifyConfig();
    const order = { id: "mall-order-1", orderNo: "MALL001", userId: "user-1", status: "REFUNDING", paidAmountCent: 10000, payableAmountCent: 10000 };
    const refund = {
      id: "mall-refund-1",
      outRefundNo: "MALL_REFUND_ORDER001",
      refundNo: "MRF001",
      mallOrderId: order.id,
      afterSaleId: null,
      previousOrderStatus: "SHIPPED",
      amountCent: 10000,
      status: RefundStatus.PROCESSING,
      order
    };
    const prisma: any = {
      refund: { findFirst: async () => null },
      mallRefund: {
        findFirst: async () => refund,
        update: async ({ data }: any) => Object.assign(refund, data)
      },
      mallAfterSale: { update: async () => undefined },
      mallOrder: {
        updateMany: async ({ data }: any) => {
          Object.assign(order, data);
          return { count: 1 };
        }
      },
      $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
    };
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("CLOSED", 10000, 10000, refund.outRefundNo));
    const service = new PaymentsService(prisma as PrismaService, undefined, verifier);

    await service.handleRefundNotify(refundNotifyRequest());

    assert.equal(refund.status, RefundStatus.FAILED);
    assert.equal(order.status, "SHIPPED");
  });

  it("rejects an unsupported WeChat refund status without changing local state", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock();
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("UNKNOWN", 10000));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    await assert.rejects(() => service.handleRefundNotify(refundNotifyRequest()), BadRequestException);

    assert.equal(prisma.refundUpdates.length, 0);
    assert.equal(prisma.orderRecord.status, OrderStatus.PAID);
  });

  it("rejects a refund callback whose amount differs from the approved server amount", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock();
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("SUCCESS", 1));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    await assert.rejects(() => service.handleRefundNotify(refundNotifyRequest()), ConflictException);

    assert.equal(prisma.refundRecord.status, RefundStatus.PROCESSING);
    assert.equal(prisma.refundUpdates.length, 0);
    assert.equal(prisma.orderRecord.status, OrderStatus.PAID);
  });

  it("rejects a refund callback whose original order total differs from the paid order", async () => {
    withWechatRefundNotifyConfig();
    const prisma = createRefundNotifyPrismaMock();
    const verifier = new FakeRefundNotifyVerifier(refundNotifyPayload("SUCCESS", 10000, 9999));
    const service = new PaymentsService(prisma as unknown as PrismaService, undefined, verifier);

    await assert.rejects(() => service.handleRefundNotify(refundNotifyRequest()), ConflictException);

    assert.equal(prisma.refundUpdates.length, 0);
    assert.equal(prisma.orderRecord.status, OrderStatus.PAID);
  });
});

function withWechatRefundNotifyConfig(): void {
  process.env.WECHAT_PAY_APP_ID = "wx-test";
  process.env.WECHAT_PAY_MCH_ID = "1900000001";
  process.env.WECHAT_PAY_MCH_SERIAL_NO = "merchant-serial";
  process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
  process.env.WECHAT_PAY_PRIVATE_KEY_PATH = __filename;
  process.env.WECHAT_PAY_NOTIFY_URL = "https://example.com/api/payments/wechat/notify";
}

function refundNotifyRequest() {
  const body = {
    id: "refund-notify-1",
    event_type: "REFUND.SUCCESS",
    resource_type: "encrypt-resource",
    resource: {
      algorithm: "AEAD_AES_256_GCM",
      ciphertext: "encrypted",
      nonce: "refund-nonce",
      associated_data: "refund"
    }
  };
  return {
    body,
    rawBody: Buffer.from(JSON.stringify(body), "utf8"),
    headers: { timestamp: "1", nonce: "nonce", signature: "signature", serial: "serial" }
  };
}

function refundNotifyPayload(status: string, amountCent: number, totalAmountCent = 10000, outRefundNo = "REG_REFUND_ORDER001"): Record<string, unknown> {
  return {
    out_refund_no: outRefundNo,
    refund_id: "5030000708202609010000000001",
    refund_status: status,
    success_time: status === "SUCCESS" ? "2026-09-03T15:00:00+08:00" : undefined,
    amount: { refund: amountCent, total: totalAmountCent }
  };
}

function createRefundNotifyPrismaMock(options: { refundStatus?: RefundStatus; orderStatus?: OrderStatus } = {}) {
  const orderRecord = { id: "order-1", orderNo: "ORDER001", paidAmountCent: 10000, payableAmountCent: 10000, status: options.orderStatus ?? OrderStatus.PAID };
  const refundRecord = {
    id: "refund-1",
    outRefundNo: "REG_REFUND_ORDER001",
    refundNo: "RF001",
    orderId: orderRecord.id,
    orderNo: orderRecord.orderNo,
    userId: "user-1",
    amountCent: 10000,
    status: options.refundStatus ?? RefundStatus.PROCESSING,
    order: orderRecord
  };
  const skuRecord = { id: "sku-1", soldCount: 1 };
  const registrationRecord = { id: "registration-1", orderId: orderRecord.id, status: RegistrationStatus.CONFIRMED };
  const attendeeRecord = { id: "attendee-1", registrationId: registrationRecord.id, checkInStatus: CheckInStatus.PENDING };
  const couponRedemptionRecord = {
    id: "coupon-redemption-1",
    orderId: orderRecord.id,
    status: CouponRedemptionStatus.USED,
    usedAt: now
  };
  const refundUpdates: Array<Record<string, any>> = [];
  const registrationUpdates: Array<Record<string, any>> = [];
  const prisma: any = {
    refundRecord,
    orderRecord,
    skuRecord,
    attendeeRecord,
    couponRedemptionRecord,
    refundUpdates,
    registrationUpdates,
    mallRefund: { findFirst: async () => null },
    order: {
      update: async ({ data }: any) => {
        Object.assign(orderRecord, data);
        return orderRecord;
      },
      findUnique: async () => orderRecord,
      updateMany: async ({ where, data }: any) => {
        if (orderRecord.id !== where.id || orderRecord.status !== where.status) return { count: 0 };
        Object.assign(orderRecord, data);
        return { count: 1 };
      }
    },
    orderItem: {
      findMany: async () => [{ skuId: skuRecord.id, quantity: 1 }]
    },
    registrationSku: {
      updateMany: async ({ where, data }: any) => {
        if (where.id !== skuRecord.id || skuRecord.soldCount < where.soldCount.gte) return { count: 0 };
        skuRecord.soldCount -= data.soldCount.decrement;
        return { count: 1 };
      }
    },
    registration: {
      findUnique: async () => registrationRecord,
      update: async (args: any) => {
        registrationUpdates.push(args);
        Object.assign(registrationRecord, args.data);
        return registrationRecord;
      }
    },
    registrationAttendee: {
      updateMany: async ({ data }: any) => {
        Object.assign(attendeeRecord, data);
        return { count: 1 };
      }
    },
    couponRedemption: {
      updateMany: async ({ where, data }: any) => {
        if (couponRedemptionRecord.orderId !== where.orderId || couponRedemptionRecord.status !== where.status) return { count: 0 };
        Object.assign(couponRedemptionRecord, data);
        return { count: 1 };
      }
    },
    refund: {
      findFirst: async () => refundRecord,
      update: async ({ data }: any) => {
        refundUpdates.push(data);
        Object.assign(refundRecord, data);
        return refundRecord;
      },
      aggregate: async ({ where }: any) => ({
        _sum: {
          amountCent: refundRecord.orderId === where.orderId && refundRecord.status === where.status ? refundRecord.amountCent : 0
        }
      })
    },
    $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
  };
  return prisma;
}

class FakeRefundNotifyVerifier extends WechatPayNotifyVerifier {
  verifyCalls = 0;

  constructor(private readonly payload: Record<string, unknown>) {
    super();
  }

  override verifySignature(): void {
    this.verifyCalls += 1;
  }

  override decryptResource(): Record<string, unknown> {
    return this.payload;
  }
}

function withMockPaymentMode(): void {
  process.env.PAYMENT_MODE = "mock";
  process.env.WECHAT_PAY_MOCK = "true";
}

function createService(prisma: PrismaService, transactionClient?: { queryByOutTradeNo(outTradeNo: string): Promise<unknown> }): PaymentsService {
  class TestPaymentsService extends PaymentsService {
    protected override getCurrentTime(): Date {
      return now;
    }
  }

  return new TestPaymentsService(prisma, undefined, undefined, undefined, undefined, undefined, transactionClient as never);
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const orders: OrderRecord[] = [
    createOrder("REG001", currentUser.id, OrderStatus.PENDING),
    createOrder("REG_OTHER_USER", "user-2", OrderStatus.PENDING),
    createOrder("REG_CANCELLED", currentUser.id, OrderStatus.CANCELLED),
    createOrder("REG_CLOSED", currentUser.id, OrderStatus.CLOSED),
    createOrder("REG_REFUNDED", currentUser.id, OrderStatus.REFUNDED),
    createOrder("REG_EXPIRED", currentUser.id, OrderStatus.PENDING, {
      expiredAt: new Date("2026-06-06T14:00:00.000Z")
    }),
    createOrder("REG_NO_SNAPSHOT", currentUser.id, OrderStatus.PENDING, {
      registrationSnapshotJson: null
    })
  ];
  const payments: PaymentRecord[] = options.withWechatPayment
    ? [{
        id: "payment-wechat-1",
        orderId: "order-REG001",
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        outTradeNo: "WECHAT_REG001",
        amountCent: 100000,
        paidAt: null
      }]
    : [];
  const registrations: RegistrationRecord[] = [];
  const registrationAttendees: RegistrationAttendeeRecord[] = [];
  const couponRedemptions: CouponRedemptionRecord[] = [...(options.couponRedemptions ?? [])];
  const skus: SkuRecord[] = [{ id: "sku-1", lockedStock: 1, soldCount: options.initialSoldCount ?? 0 }];

  const mock: PrismaMockShape = {
    orders,
    payments,
    registrations,
    registrationAttendees,
    couponRedemptions,
    skus,
    order: {
      findFirst: async (args: OrderFindFirstArgs) => {
        const order = findOwnedOrder(orders, args.where.orderNo, args.where.userId);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments, options.checkInEnabled ?? false) : null;
      },
      findUnique: async (args: OrderFindUniqueArgs) => {
        const order = orders.find((item) => item.orderNo === args.where.orderNo);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments, options.checkInEnabled ?? false) : null;
      },
      update: async (args: OrderUpdateArgs) => {
        const order = orders.find((item) => item.id === args.where.id);
        assert.ok(order);
        Object.assign(order, args.data);
      },
      updateMany: async (args: OrderUpdateManyArgs) => {
        const order = orders.find((item) => item.id === args.where.id && item.status === args.where.status);
        if (!order) return { count: 0 };
        Object.assign(order, args.data);
        return { count: 1 };
      }
    },
    payment: {
      upsert: async (args: PaymentUpsertArgs) => {
        const payment = payments.find((item) => item.outTradeNo === args.where.outTradeNo);
        if (payment) {
          Object.assign(payment, args.update);
          return payment;
        }

        const created = {
          id: `payment-${payments.length + 1}`,
          ...args.create
        };
        payments.push(created);
        return created;
      }
    },
    registration: {
      findUnique: async (args: RegistrationFindUniqueArgs) => {
        const registration = registrations.find((item) => item.orderId === args.where.orderId);
        return registration ? { id: registration.id } : null;
      },
      create: async (args: RegistrationCreateArgs) => {
        if (options.simulateRegistrationCreateConflict) {
          registrations.push({
            id: "registration-race",
            ...args.data
          });
          throw { code: "P2002" };
        }

        if (registrations.some((item) => item.orderId === args.data.orderId)) {
          throw { code: "P2002" };
        }

        const created = {
          id: `registration-${registrations.length + 1}`,
          ...args.data
        };
        registrations.push(created);
        return { id: created.id };
      }
    },
    registrationAttendee: {
      create: async (args: RegistrationAttendeeCreateArgs) => {
        registrationAttendees.push({
          id: `registration-attendee-${registrationAttendees.length + 1}`,
          ...args.data
        });
      }
    },
    registrationSku: {
      update: async (args: SkuUpdateArgs) => {
        const sku = skus.find((item) => item.id === args.where.id);
        assert.ok(sku);
        sku.soldCount += args.data.soldCount.increment;
      },
      updateMany: async (args: SkuUpdateManyArgs) => {
        const sku = skus.find((item) => item.id === args.where.id);
        if (!sku || sku.lockedStock < args.where.lockedStock.gte) return { count: 0 };
        sku.lockedStock -= args.data.lockedStock.decrement;
        sku.soldCount += args.data.soldCount.increment;
        return { count: 1 };
      }
    },
    couponRedemption: {
      updateMany: async (args: CouponRedemptionUpdateManyArgs) => {
        for (const redemption of couponRedemptions) {
          if (redemption.orderId === args.where.orderId && redemption.status === args.where.status) {
            redemption.status = args.data.status;
            redemption.usedAt = args.data.usedAt;
          }
        }
      }
    },
    $transaction: async <TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>) => operation(mock)
  };

  return mock as PrismaMockShape & PrismaService;
}

function createOrder(orderNo: string, userId: string, status: OrderStatus, overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: `order-${orderNo}`,
    orderNo,
    userId,
    conferenceId: "conf-1",
    skuId: "sku-1",
    payableAmountCent: 100000,
    paidAmountCent: null,
    status,
    expiredAt: new Date("2026-06-06T15:00:00.000Z"),
    inventoryReservedAt: new Date("2026-06-06T14:49:00.000Z"),
    paidAt: null,
    registrationSnapshotJson: {
      conferenceId: "conf-1",
      skuId: "sku-1",
      skuName: "住宿+参会",
      attendeeName: "快照姓名",
      phone: "13900000000",
      formData: {
        name: "快照姓名",
        phone: "13900000000"
      }
    },
    items: [{ skuId: "sku-1", quantity: 1 }],
    ...overrides
  };
}

function findOwnedOrder(orders: OrderRecord[], orderNo: string, userId: string): OrderRecord | undefined {
  return orders.find((order) => order.orderNo === orderNo && order.userId === userId);
}

function toOrderRead(
  order: OrderRecord,
  registrations: RegistrationRecord[],
  registrationAttendees: RegistrationAttendeeRecord[],
  payments: PaymentRecord[] = [],
  checkInEnabled = false
) {
  const registration = registrations.find((item) => item.orderId === order.id);
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    conferenceId: order.conferenceId,
    skuId: order.skuId,
    payableAmountCent: order.payableAmountCent,
    status: order.status,
    expiredAt: order.expiredAt,
    inventoryReservedAt: order.inventoryReservedAt,
    registrationSnapshotJson: order.registrationSnapshotJson,
    paidAt: order.paidAt,
    conference: {
      checkInEnabled,
      title: "测试会议"
    },
    items: order.items,
    payments: payments
      .filter((payment) => payment.orderId === order.id)
      .map((payment) => ({ provider: payment.provider, status: payment.status, outTradeNo: payment.outTradeNo })),
    registration: registration
      ? {
          id: registration.id,
          skuId: registration.skuId,
          attendeeName: registration.attendeeName,
          phone: registration.phone,
          formDataJson: registration.formDataJson,
          attendees: registrationAttendees
            .filter((attendee) => attendee.registrationId === registration.id)
            .map((attendee) => ({ id: attendee.id }))
        }
      : null
  };
}

interface PrismaMockOptions {
  initialSoldCount?: number;
  simulateRegistrationCreateConflict?: boolean;
  checkInEnabled?: boolean;
  couponRedemptions?: CouponRedemptionRecord[];
  withWechatPayment?: boolean;
}

interface PrismaMockShape {
  orders: OrderRecord[];
  payments: PaymentRecord[];
  registrations: RegistrationRecord[];
  registrationAttendees: RegistrationAttendeeRecord[];
  couponRedemptions: CouponRedemptionRecord[];
  skus: SkuRecord[];
  order: {
    findFirst(args: OrderFindFirstArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    findUnique(args: OrderFindUniqueArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    update(args: OrderUpdateArgs): Promise<void>;
    updateMany(args: OrderUpdateManyArgs): Promise<{ count: number }>;
  };
  payment: {
    upsert(args: PaymentUpsertArgs): Promise<PaymentRecord>;
  };
  registration: {
    findUnique(args: RegistrationFindUniqueArgs): Promise<{ id: string } | null>;
    create(args: RegistrationCreateArgs): Promise<{ id: string }>;
  };
  registrationAttendee: {
    create(args: RegistrationAttendeeCreateArgs): Promise<void>;
  };
  registrationSku: {
    update(args: SkuUpdateArgs): Promise<void>;
    updateMany(args: SkuUpdateManyArgs): Promise<{ count: number }>;
  };
  couponRedemption: {
    updateMany(args: CouponRedemptionUpdateManyArgs): Promise<void>;
  };
  $transaction<TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>): Promise<TResult>;
}

interface OrderRecord {
  id: string;
  orderNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: OrderStatus;
  expiredAt: Date | null;
  inventoryReservedAt: Date | null;
  paidAt: Date | null;
  registrationSnapshotJson: unknown;
  items: Array<{ skuId: string; quantity: number }>;
}

interface PaymentRecord {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  outTradeNo: string;
  amountCent: number;
  paidAt: Date | null;
  failedReason?: string | null;
}

interface RegistrationRecord {
  id: string;
  registrationNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  orderId: string;
  attendeeName: string;
  phone: string;
  formDataJson: unknown;
  paidAmountCent: number;
  status: RegistrationStatus;
  confirmedAt: Date;
}

interface RegistrationAttendeeRecord {
  id: string;
  registrationId: string;
  skuId: string;
  name: string;
  phone: string;
  company?: string;
  title?: string;
  formDataJson: unknown;
  checkInStatus: CheckInStatus;
}

interface SkuRecord {
  id: string;
  lockedStock: number;
  soldCount: number;
}

interface CouponRedemptionRecord {
  couponId: string;
  orderId: string;
  userId: string | null;
  status: CouponRedemptionStatus;
  usedAt: Date | null;
}

interface OrderFindFirstArgs {
  where: {
    orderNo: string;
    userId: string;
  };
}

interface OrderFindUniqueArgs {
  where: {
    orderNo: string;
  };
}

interface OrderUpdateArgs {
  where: {
    id: string;
  };
  data: Partial<Pick<OrderRecord, "status" | "paidAmountCent" | "paidAt">>;
}

interface OrderUpdateManyArgs {
  where: {
    id: string;
    status: OrderStatus;
  };
  data: Partial<Pick<OrderRecord, "status" | "paidAmountCent" | "paidAt">>;
}

interface PaymentUpsertArgs {
  where: {
    outTradeNo: string;
  };
  update: Partial<PaymentRecord>;
  create: Omit<PaymentRecord, "id">;
}

interface RegistrationFindUniqueArgs {
  where: {
    orderId: string;
  };
}

interface RegistrationCreateArgs {
  data: Omit<RegistrationRecord, "id">;
}

interface RegistrationAttendeeCreateArgs {
  data: Omit<RegistrationAttendeeRecord, "id">;
}

interface SkuUpdateArgs {
  where: {
    id: string;
  };
  data: {
    soldCount: {
      increment: number;
    };
  };
}

interface SkuUpdateManyArgs {
  where: {
    id: string;
    lockedStock: { gte: number };
  };
  data: {
    lockedStock: { decrement: number };
    soldCount: { increment: number };
  };
}

interface CouponRedemptionUpdateManyArgs {
  where: {
    orderId: string;
    status: CouponRedemptionStatus;
  };
  data: {
    status: CouponRedemptionStatus;
    usedAt: Date;
  };
}
