import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AuditAction, PaymentProvider, PaymentStatus, RefundStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { AdminMallService } from "../admin/admin-mall.service";
import { CurrentAdmin } from "../admin/current-admin";
import { MallPaymentSuccessService } from "./mall-payment-success.service";
import { MallPaymentService } from "./mall-payment.service";

const now = new Date("2026-06-18T12:00:00.000Z");
const currentUser: CurrentUser = { id: "user-1", openid: "real-openid-1", nickname: "用户" };
const currentAdmin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };

describe("MallPaymentService", () => {
  it("creates WeChat prepay with server amount and mall out_trade_no", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock();
    const service = createMallPaymentService(prisma);

    const result = await service.prepayWechat("mall-order-1", currentUser);

    assert.equal(result.orderNo, "SHOP001");
    assert.equal(result.outTradeNo, "MALL_SHOP001");
    assert.equal(prisma.mallPayments[0]?.amountCent, 12000);
    assert.equal(prisma.lastPrepayBody?.amount?.total, 12000);
    assert.equal(prisma.lastPrepayBody?.notify_url, "https://example.com/api/mall/payments/wechat/notify");
  });

  it("rejects paying another user's mall order", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const service = createMallPaymentService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment("mall-order-other", currentUser), NotFoundException);
  });

  it("rejects closed mall orders", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const service = createMallPaymentService(createPrismaMock({ orderStatus: "CLOSED" }));

    await assert.rejects(() => service.confirmMockPayment("mall-order-1", currentUser), ConflictException);
  });

  it("mock pay marks order paid and converts locked stock to sold", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const prisma = createPrismaMock();
    const service = createMallPaymentService(prisma);

    const result = await service.confirmMockPayment("mall-order-1", currentUser);

    assert.equal(result.orderStatus, "PAID");
    assert.equal(prisma.orders[0]?.status, "PAID");
    assert.equal(prisma.orders[0]?.paidAmountCent, 12000);
    assert.equal(prisma.mallPayments[0]?.status, PaymentStatus.SUCCESS);
    assert.equal(prisma.skus[0]?.lockedStock, 0);
    assert.equal(prisma.skus[0]?.soldCount, 7);
    assert.equal(prisma.inventoryLogs[0]?.action, "PAYMENT_SUCCESS");
    assert.equal(prisma.auditLogs[0]?.action, AuditAction.SYSTEM);
    assert.equal("registration" in prisma, false);
  });

  it("is idempotent for duplicate mall payment success callbacks", async () => {
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = new MallPaymentSuccessService(prisma);

    await service.processPaymentSuccess({
      provider: PaymentProvider.WECHAT,
      outTradeNo: "MALL_SHOP001",
      transactionId: "wx-transaction-1",
      paidAmountCent: 12000,
      paidAt: now,
      rawSummary: { id: "notify-1" }
    });
    await service.processPaymentSuccess({
      provider: PaymentProvider.WECHAT,
      outTradeNo: "MALL_SHOP001",
      transactionId: "wx-transaction-1",
      paidAmountCent: 12000,
      paidAt: now,
      rawSummary: { id: "notify-1" }
    });

    assert.equal(prisma.orders[0]?.status, "PAID");
    assert.equal(prisma.skus[0]?.lockedStock, 0);
    assert.equal(prisma.skus[0]?.soldCount, 7);
    assert.equal(prisma.inventoryLogs.length, 1);
  });

  it("rejects amount mismatch without updating mall order or stock", async () => {
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = new MallPaymentSuccessService(prisma);

    await assert.rejects(
      () =>
        service.processPaymentSuccess({
          provider: PaymentProvider.WECHAT,
          outTradeNo: "MALL_SHOP001",
          transactionId: "wx-transaction-1",
          paidAmountCent: 1,
          paidAt: now
        }),
      ConflictException
    );
    assert.equal(prisma.orders[0]?.status, "PENDING_PAYMENT");
    assert.equal(prisma.skus[0]?.lockedStock, 2);
    assert.equal(prisma.skus[0]?.soldCount, 5);
  });

  it("rejects mock pay when mock mode is disabled", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    process.env.MALL_MOCK_PAYMENT_ENABLED = "false";
    const service = createMallPaymentService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment("mall-order-1", currentUser), ForbiddenException);
  });
});

describe("AdminMallService mall refunds", () => {
  it("creates a mall refund and completes it in mock refund mode", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const prisma = createPrismaMock({ orderStatus: "REFUNDING", afterSaleStatus: "APPROVED", paidAmountCent: 12000 });
    const service = new AdminMallService(prisma);

    const result = await service.processAfterSaleRefund("after-sale-1", currentAdmin);

    assert.equal(result.data.status, "COMPLETED");
    assert.equal(prisma.refunds.length, 1);
    assert.equal(prisma.refunds[0]?.status, RefundStatus.SUCCESS);
    assert.equal(prisma.refunds[0]?.provider, PaymentProvider.MOCK);
    assert.equal(prisma.orders[0]?.status, "REFUNDED");
  });

  it("is idempotent for duplicate mall refund processing", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const prisma = createPrismaMock({ orderStatus: "REFUNDING", afterSaleStatus: "APPROVED", paidAmountCent: 12000 });
    const service = new AdminMallService(prisma);

    await service.processAfterSaleRefund("after-sale-1", currentAdmin);
    await service.processAfterSaleRefund("after-sale-1", currentAdmin);

    assert.equal(prisma.refunds.length, 1);
    assert.equal(prisma.orders[0]?.status, "REFUNDED");
  });

  it("does not fake success when WeChat refund is not configured", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    delete process.env.WECHAT_PAY_REFUND_ENABLED;
    delete process.env.MALL_WECHAT_REFUND_ENABLED;
    const prisma = createPrismaMock({ orderStatus: "REFUNDING", afterSaleStatus: "APPROVED", paidAmountCent: 12000 });
    const service = new AdminMallService(prisma);

    const result = await service.processAfterSaleRefund("after-sale-1", currentAdmin);

    assert.equal(result.data.status, "PROCESSING");
    assert.equal(prisma.refunds[0]?.status, RefundStatus.PROCESSING);
    assert.equal(prisma.refunds[0]?.provider, null);
    assert.match(prisma.refunds[0]?.failedReason || "", /微信退款未配置/);
    assert.equal(prisma.orders[0]?.status, "REFUNDING");
  });

  it("rejects over-refund records", async () => {
    process.env.WECHAT_PAY_MODE = "mock";
    const prisma = createPrismaMock({
      orderStatus: "REFUNDING",
      afterSaleStatus: "APPROVED",
      paidAmountCent: 12000,
      refunds: [{ amountCent: 13000, status: RefundStatus.REQUESTED }]
    });
    const service = new AdminMallService(prisma);

    await assert.rejects(() => service.processAfterSaleRefund("after-sale-1", currentAdmin), ConflictException);
  });
});

function withWechatPayConfig(): void {
  process.env.WECHAT_PAY_MODE = "real";
  process.env.WECHAT_PAY_ENABLED = "true";
  process.env.WECHAT_PAY_APP_ID = "wx-real-app";
  process.env.WECHAT_PAY_MCH_ID = "1900000001";
  process.env.WECHAT_PAY_MCH_SERIAL_NO = "merchant-serial";
  process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
  process.env.WECHAT_PAY_PRIVATE_KEY_PATH = "/Users/yangyang/Projects/conference-system/package.json";
  process.env.WECHAT_PAY_NOTIFY_URL = "https://example.com/api/payments/wechat/notify";
  process.env.WECHAT_PAY_MALL_NOTIFY_URL = "https://example.com/api/mall/payments/wechat/notify";
}

function createMallPaymentService(prisma: PrismaMock & PrismaService) {
  const paymentSuccess = new MallPaymentSuccessService(prisma);
  const wechatPayService = {
    createJsapiPrepay: async (input: { body: Record<string, any> }) => {
      prisma.lastPrepayBody = input.body;
      return "mall-prepay-test";
    }
  };
  const signer = {
    createRequestPaymentParams: () => ({
      timeStamp: "1700000000",
      nonceStr: "nonce-test",
      package: "prepay_id=mall-prepay-test",
      signType: "RSA" as const,
      paySign: "pay-sign-test"
    })
  };
  const notifyVerifier = {
    verifySignature: () => undefined,
    decryptResource: () => ({})
  };
  return new MallPaymentService(prisma, paymentSuccess, wechatPayService as any, signer as any, notifyVerifier as any);
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const orders: MallOrderRecord[] = [
    createOrder("mall-order-1", "SHOP001", currentUser.id, options.orderStatus ?? "PENDING_PAYMENT", options.paidAmountCent),
    createOrder("mall-order-other", "SHOP002", "user-2", "PENDING_PAYMENT", null)
  ];
  const skus: SkuRecord[] = [{ id: "sku-1", lockedStock: 2, soldCount: 5, stock: 10 }];
  const mallPayments: MallPaymentRecord[] = options.withWechatPayment ? [createPayment("MALL_SHOP001", PaymentProvider.WECHAT, orders[0]!.id)] : [];
  const refunds: MallRefundRecord[] = (options.refunds ?? []).map((item, index) =>
    createRefund({
      id: `refund-${index + 1}`,
      mallOrderId: orders[0]!.id,
      afterSaleId: "after-sale-1",
      amountCent: item.amountCent,
      status: item.status
    })
  );
  const afterSales: MallAfterSaleRecord[] = [
    {
      id: "after-sale-1",
      orderId: orders[0]!.id,
      type: "REFUND",
      status: options.afterSaleStatus ?? "REQUESTED",
      reason: "用户申请",
      note: null,
      handledAt: null,
      createdAt: now,
      updatedAt: now
    }
  ];
  const inventoryLogs: Array<Record<string, unknown>> = [];
  const auditLogs: Array<Record<string, unknown>> = [];

  const mock: PrismaMock = {
    orders,
    skus,
    mallPayments,
    refunds,
    afterSales,
    inventoryLogs,
    auditLogs,
    lastPrepayBody: null,
    mallOrder: {
      findFirst: async ({ where }: any) => {
        const order = orders.find((item) => item.id === where.id && item.userId === where.userId);
        return order ? toOrderResult(order, skus, mallPayments, refunds, afterSales) : null;
      },
      update: async ({ where, data, include }: any) => {
        const order = orders.find((item) => item.id === where.id);
        assert.ok(order);
        Object.assign(order, data, { updatedAt: now });
        return include ? toOrderResult(order, skus, mallPayments, refunds, afterSales) : order;
      }
    },
    mallPayment: {
      upsert: async ({ where, update, create }: any) => {
        const payment = mallPayments.find((item) => item.outTradeNo === where.outTradeNo);
        if (payment) {
          Object.assign(payment, update, { updatedAt: now });
          return payment;
        }
        const created = createPayment(create.outTradeNo, create.provider, create.mallOrderId, create.amountCent);
        created.status = create.status;
        mallPayments.push(created);
        return created;
      },
      findUnique: async ({ where, include }: any) => {
        const payment = mallPayments.find((item) => item.outTradeNo === where.outTradeNo);
        if (!payment) return null;
        return include ? { ...payment, order: toOrderResult(orders.find((item) => item.id === payment.mallOrderId)!, skus, mallPayments, refunds, afterSales) } : payment;
      },
      update: async ({ where, data }: any) => {
        const payment = mallPayments.find((item) => item.id === where.id);
        assert.ok(payment);
        Object.assign(payment, data, { updatedAt: now });
        return payment;
      }
    },
    productSku: {
      findUnique: async ({ where }: any) => skus.find((item) => item.id === where.id) ?? null,
      updateMany: async ({ where, data }: any) => {
        const sku = skus.find((item) => item.id === where.id);
        if (!sku || sku.lockedStock < where.lockedStock.gte) return { count: 0 };
        sku.lockedStock -= data.lockedStock.decrement;
        sku.soldCount += data.soldCount.increment;
        return { count: 1 };
      }
    },
    mallInventoryLog: {
      create: async ({ data }: any) => {
        inventoryLogs.push({ id: `inventory-log-${inventoryLogs.length + 1}`, createdAt: now, ...data });
      }
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }
    },
    mallAfterSale: {
      findUnique: async ({ where, include }: any) => findAfterSale(where.id, include),
      findUniqueOrThrow: async ({ where, include }: any) => {
        const item = findAfterSale(where.id, include);
        if (!item) throw new Error("after-sale not found");
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = afterSales.find((entry) => entry.id === where.id);
        assert.ok(item);
        Object.assign(item, data, { updatedAt: now });
        return item;
      }
    },
    mallRefund: {
      create: async ({ data }: any) => {
        const item = createRefund({ id: `refund-${refunds.length + 1}`, ...data });
        refunds.push(item);
        return item;
      },
      update: async ({ where, data }: any) => {
        const item = refunds.find((entry) => entry.id === where.id);
        assert.ok(item);
        Object.assign(item, data, { updatedAt: now });
        return item;
      }
    },
    $transaction: async (operation: any) => (Array.isArray(operation) ? Promise.all(operation) : operation(mock))
  };

  function findAfterSale(id: string, include: unknown) {
    const item = afterSales.find((entry) => entry.id === id);
    if (!item) return null;
    if (!include) return item;
    const order = orders.find((entry) => entry.id === item.orderId)!;
    return {
      ...item,
      order: {
        ...order,
        orderNo: order.orderNo,
        receiverName: order.receiverName,
        receiverPhone: order.receiverPhone,
        refunds: refunds.filter((refund) => refund.mallOrderId === order.id)
      },
      refunds: refunds.filter((refund) => refund.afterSaleId === item.id)
    };
  }

  return mock as PrismaMock & PrismaService;
}

function createOrder(id: string, orderNo: string, userId: string, status: string, paidAmountCent: number | null | undefined): MallOrderRecord {
  return {
    id,
    orderNo,
    userId,
    originAmountCent: 12000,
    discountAmountCent: 0,
    payableAmountCent: 12000,
    paidAmountCent: paidAmountCent ?? (status === "PAID" ? 12000 : null),
    status,
    receiverName: "张三",
    receiverPhone: "13800000000",
    receiverAddress: "上海",
    remark: null,
    paidAt: null,
    createdAt: now,
    updatedAt: now,
    user: { id: userId, openid: userId === currentUser.id ? "real-openid-1" : "real-openid-2" },
    items: [
      {
        id: "mall-order-item-1",
        orderId: id,
        skuId: "sku-1",
        productTitle: "会议周边",
        skuName: "标准款",
        unitPriceCent: 6000,
        quantity: 2,
        totalAmountCent: 12000,
        createdAt: now
      }
    ]
  };
}

function createPayment(outTradeNo: string, provider: PaymentProvider, mallOrderId: string, amountCent = 12000): MallPaymentRecord {
  return {
    id: `mall-payment-${outTradeNo}`,
    mallOrderId,
    provider,
    status: PaymentStatus.PENDING,
    outTradeNo,
    transactionId: null,
    amountCent,
    notifyRawId: null,
    paidAt: null,
    failedReason: null,
    createdAt: now,
    updatedAt: now
  };
}

function createRefund(input: Partial<MallRefundRecord>): MallRefundRecord {
  return {
    id: input.id || "refund-1",
    refundNo: input.refundNo || "MRF001",
    outRefundNo: input.outRefundNo || "MALL_REFUND_SHOP001",
    mallOrderId: input.mallOrderId || "mall-order-1",
    afterSaleId: input.afterSaleId ?? "after-sale-1",
    provider: input.provider ?? null,
    providerRefundId: input.providerRefundId ?? null,
    amountCent: input.amountCent ?? 12000,
    status: input.status ?? RefundStatus.REQUESTED,
    reason: input.reason ?? null,
    rejectReason: input.rejectReason ?? null,
    failedReason: input.failedReason ?? null,
    requestedAt: now,
    approvedAt: input.approvedAt ?? null,
    processedAt: input.processedAt ?? null,
    createdAt: now,
    updatedAt: now
  };
}

function toOrderResult(order: MallOrderRecord, _skus: SkuRecord[], payments: MallPaymentRecord[], refunds: MallRefundRecord[], afterSales: MallAfterSaleRecord[]) {
  return {
    ...order,
    payments: payments.filter((item) => item.mallOrderId === order.id),
    refunds: refunds.filter((item) => item.mallOrderId === order.id),
    afterSales: afterSales.filter((item) => item.orderId === order.id)
  };
}

interface PrismaMockOptions {
  orderStatus?: string;
  afterSaleStatus?: string;
  paidAmountCent?: number | null;
  withWechatPayment?: boolean;
  refunds?: Array<{ amountCent: number; status: RefundStatus }>;
}

interface PrismaMock {
  orders: MallOrderRecord[];
  skus: SkuRecord[];
  mallPayments: MallPaymentRecord[];
  refunds: MallRefundRecord[];
  afterSales: MallAfterSaleRecord[];
  inventoryLogs: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  lastPrepayBody: Record<string, any> | null;
  mallOrder: Record<string, (...args: any[]) => Promise<any>>;
  mallPayment: Record<string, (...args: any[]) => Promise<any>>;
  productSku: Record<string, (...args: any[]) => Promise<any>>;
  mallInventoryLog: Record<string, (...args: any[]) => Promise<any>>;
  auditLog: Record<string, (...args: any[]) => Promise<any>>;
  mallAfterSale: Record<string, (...args: any[]) => Promise<any>>;
  mallRefund: Record<string, (...args: any[]) => Promise<any>>;
  $transaction(operation: any): Promise<any>;
}

interface MallOrderRecord {
  id: string;
  orderNo: string;
  userId: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; openid: string };
  items: Array<{
    id: string;
    orderId: string;
    skuId: string;
    productTitle: string;
    skuName: string;
    unitPriceCent: number;
    quantity: number;
    totalAmountCent: number;
    createdAt: Date;
  }>;
}

interface SkuRecord {
  id: string;
  lockedStock: number;
  soldCount: number;
  stock: number;
}

interface MallPaymentRecord {
  id: string;
  mallOrderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  outTradeNo: string;
  transactionId: string | null;
  amountCent: number;
  notifyRawId: string | null;
  paidAt: Date | null;
  failedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MallAfterSaleRecord {
  id: string;
  orderId: string;
  type: string;
  status: string;
  reason: string | null;
  note: string | null;
  handledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MallRefundRecord {
  id: string;
  refundNo: string;
  outRefundNo: string;
  mallOrderId: string;
  afterSaleId: string | null;
  provider: PaymentProvider | null;
  providerRefundId: string | null;
  amountCent: number;
  status: RefundStatus;
  reason: string | null;
  rejectReason: string | null;
  failedReason: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
