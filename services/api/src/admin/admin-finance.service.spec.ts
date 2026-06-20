import "reflect-metadata";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { InvoiceStatus, OrderStatus, PaymentProvider, PaymentStatus, RefundStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PublicOperationsService } from "./public-operations.service";
import { AdminFinanceService, buildBillReconciliationResults, LocalPaymentRow, parseWechatBillRows } from "./admin-finance.service";
import { CurrentAdmin } from "./current-admin";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };
const user: CurrentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };

beforeEach(() => {
  delete process.env.REFUND_ENABLED;
  delete process.env.REFUND_MODE;
  delete process.env.MOCK_REFUND_ENABLED;
  delete process.env.WECHAT_REFUND_ENABLED;
  delete process.env.INVOICE_ENABLED;
});

describe("AdminFinanceService production workflows", () => {
  it("lists registration and mall payments in one read-only feed", async () => {
    const service = new AdminFinanceService(createFinancePrismaMock());

    const result = await service.listPayments({ page: 1, pageSize: 20, sourceType: "ALL" });

    assert.equal(result.data.total, 2);
    assert.deepEqual(
      result.data.items.map((item) => item.sourceType).sort(),
      ["MALL", "REGISTRATION"]
    );
    assert.equal(result.data.items.some((item) => item.orderNo === "ORDER001"), true);
    assert.equal(result.data.items.some((item) => item.orderNo === "SHOP001"), true);
    assert.equal(result.data.items.every((item) => item.includedInRevenue === false), true);
  });

  it("counts only successful real payments as actual revenue and subtracts successful real refunds", async () => {
    const service = new AdminFinanceService(createFinancePrismaMock({ revenueProbe: true }));

    const result = await service.overview();

    assert.equal(result.data.cards.registrationPaidAmountCent, 1);
    assert.equal(result.data.cards.mallPaidAmountCent, 0);
    assert.equal(result.data.cards.totalRevenueCent, 1);
    assert.equal(result.data.cards.mockPaymentAmountCent, 22000);
    assert.equal(result.data.cards.refundAmountCent, 1);
    assert.equal(result.data.cards.netRevenueCent, 0);
  });

  it("rejects registration over-refund and does not fake success without provider config", async () => {
    process.env.REFUND_ENABLED = "true";
    const prisma = createFinancePrismaMock({ seededRefunds: false });
    const service = new AdminFinanceService(prisma);

    await assert.rejects(() => service.createRefund({ sourceType: "REGISTRATION", orderNo: "ORDER001", amountCent: 11000, reason: "金额超限测试" }, admin), BadRequestException);

    const created = await service.createRefund({ sourceType: "REGISTRATION", orderNo: "ORDER001", amountCent: 5000, reason: "用户申请退款" }, admin);
    const createdData = created.data as any;
    const approved = await service.approveRefund(createdData.id, admin);
    const approvedData = approved.data as any;

    assert.equal(approvedData.status, RefundStatus.PROCESSING);
    assert.equal(approvedData.provider, null);
    assert.match(String(approvedData.failedReason), /微信退款未配置/);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
  });

  it("mock registration refund can complete and update fully refunded order", async () => {
    process.env.REFUND_ENABLED = "true";
    process.env.REFUND_MODE = "mock";
    const prisma = createFinancePrismaMock({ seededRefunds: false });
    const service = new AdminFinanceService(prisma);

    const created = await service.createRefund({ sourceType: "REGISTRATION", orderNo: "ORDER001", amountCent: 10000, reason: "全额退款测试" }, admin);
    const createdData = created.data as any;
    const approved = await service.approveRefund(createdData.id, admin);
    const approvedData = approved.data as any;

    assert.equal(approvedData.status, RefundStatus.SUCCESS);
    assert.equal(approvedData.provider, PaymentProvider.MOCK);
    assert.equal(prisma.orders[0]?.status, OrderStatus.REFUNDED);
  });

  it("parses WeChat bill text and produces matched, mismatch, system-only, and WeChat-only results", () => {
    const parsed = parseWechatBillRows("交易时间,商户订单号,微信支付订单号,交易状态,应结订单金额\n2026-06-18 10:00:00,ORDER001,WX001,SUCCESS,100.00\n2026-06-18 10:02:00,SHOP001,WX002,SUCCESS,130.00\n2026-06-18 10:03:00,WXONLY,WX003,SUCCESS,88.00");
    const localRows: LocalPaymentRow[] = [
      localPayment("REGISTRATION", "ORDER001", "ORDER001", 10000),
      localPayment("MALL", "SHOP001", "SHOP001", 12000),
      localPayment("REGISTRATION", "ORDER002", "ORDER002", 6600)
    ];

    const results = buildBillReconciliationResults("bill-1", localRows, parsed.rows);
    const types = results.map((item) => item.type).sort();

    assert.deepEqual(types, ["AMOUNT_MISMATCH", "MATCHED", "SYSTEM_ONLY", "WECHAT_ONLY"]);
  });
});

describe("PublicOperationsService finance user scope", () => {
  it("creates invoice application from server-side paid amount and blocks duplicates", async () => {
    process.env.INVOICE_ENABLED = "true";
    const prisma = createFinancePrismaMock();
    const service = new PublicOperationsService(prisma);

    const created = await service.createInvoice({ sourceType: "REGISTRATION", orderNo: "ORDER001", title: "公司抬头", amountCent: 1 }, user);

    const createdData = created.data as Record<string, unknown>;
    assert.equal(createdData.amountCent, 10000);
    assert.equal(prisma.invoices[0]?.amountCent, 10000);
    await assert.rejects(() => service.createInvoice({ sourceType: "REGISTRATION", orderNo: "ORDER001", title: "重复抬头" }, user), ConflictException);
  });

  it("returns only current user's registration and mall refunds", async () => {
    const prisma = createFinancePrismaMock();
    const service = new PublicOperationsService(prisma);

    const result = await service.myRefunds(user);

    assert.equal(result.data.items.length, 2);
    assert.equal(result.data.items.every((item) => item.sourceType === "REGISTRATION" || item.sourceType === "MALL"), true);
  });
});

function createFinancePrismaMock(options: { seededRefunds?: boolean; revenueProbe?: boolean } = {}) {
  const now = new Date("2026-06-18T10:00:00.000Z");
  const orders = [
    {
      id: "order-1",
      orderNo: "ORDER001",
      userId: "user-1",
      conferenceId: "conf-1",
      status: OrderStatus.PAID,
      payableAmountCent: 10000,
      paidAmountCent: 10000,
      attendeeName: "张三",
      phone: "13800000000",
      conference: { id: "conf-1", title: "会议一" },
      user: { id: "user-1", nickname: "用户", wechatNickname: "微信用户", phone: "13800000000" },
      refunds: [] as any[]
    }
  ];
  const mallOrders = [
    {
      id: "mall-order-1",
      orderNo: "SHOP001",
      userId: "user-1",
      status: "PAID",
      payableAmountCent: 12000,
      paidAmountCent: 12000,
      receiverName: "李四",
      receiverPhone: "13900000000",
      user: { id: "user-1", nickname: "商城用户", wechatNickname: null, phone: "13900000000" },
      items: [{ productTitle: "商品一" }],
      refunds: [] as any[],
      afterSales: [{ id: "after-sale-1", status: "REQUESTED" }]
    }
  ];
  const payments: any[] = [
    {
      id: "payment-1",
      provider: PaymentProvider.MOCK,
      status: PaymentStatus.SUCCESS,
      outTradeNo: "ORDER001",
      transactionId: "mock-order-1",
      amountCent: 10000,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
      order: orders[0]
    }
  ];
  if (options.revenueProbe) {
    payments.push(
      {
        id: "payment-real-1",
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.SUCCESS,
        outTradeNo: "ORDER001_WECHAT",
        transactionId: "wx-real-1",
        amountCent: 1,
        paidAt: now,
        createdAt: new Date("2026-06-18T10:02:00.000Z"),
        updatedAt: now,
        order: orders[0]
      },
      {
        id: "payment-pending-1",
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        outTradeNo: "ORDER001_PENDING",
        transactionId: null,
        amountCent: 100000,
        paidAt: null,
        createdAt: new Date("2026-06-18T10:03:00.000Z"),
        updatedAt: now,
        order: orders[0]
      }
    );
  }
  const mallPayments: any[] = [
    {
      id: "mall-payment-1",
      provider: PaymentProvider.MOCK,
      status: PaymentStatus.SUCCESS,
      outTradeNo: "SHOP001",
      transactionId: "mock-shop-1",
      amountCent: 12000,
      paidAt: now,
      createdAt: new Date("2026-06-18T10:01:00.000Z"),
      updatedAt: now,
      order: mallOrders[0]
    }
  ];
  const refunds: any[] = options.seededRefunds === false ? [] : [{ id: "old-refund-1", refundNo: "RFOLD", orderNo: "ORDER001", userId: "user-1", amountCent: options.revenueProbe ? 1 : 1000, provider: options.revenueProbe ? PaymentProvider.WECHAT : PaymentProvider.MOCK, status: RefundStatus.SUCCESS, createdAt: now, updatedAt: now, requestedAt: now }];
  const mallRefunds: any[] = options.seededRefunds === false ? [] : [{ id: "old-mall-refund-1", refundNo: "MRFOLD", outRefundNo: "MALL_REFUND_SHOP001", mallOrderId: "mall-order-1", order: mallOrders[0], amountCent: 1000, status: RefundStatus.SUCCESS, createdAt: now, updatedAt: now, requestedAt: now }];
  const invoices: any[] = [];
  const invoiceProfiles: any[] = [];
  const auditLogs: any[] = [];
  orders[0]!.refunds = refunds;
  mallOrders[0]!.refunds = mallRefunds;

  const prisma: any = {
    orders,
    mallOrders,
    invoices,
    auditLogs,
    $transaction: async (input: any) => (Array.isArray(input) ? Promise.all(input) : input(prisma)),
    payment: {
      findMany: async () => payments,
      count: async () => payments.length,
      aggregate: async ({ where }: any = {}) => ({ _sum: { amountCent: sumAmounts(payments, where) } })
    },
    mallPayment: {
      findMany: async () => mallPayments,
      count: async () => mallPayments.length,
      aggregate: async ({ where }: any = {}) => ({ _sum: { amountCent: sumAmounts(mallPayments, where) } })
    },
    reconciliationResult: {
      findMany: async () => [],
      deleteMany: async () => ({ count: 0 }),
      createMany: async () => ({ count: 0 })
    },
    order: {
      aggregate: async () => ({ _sum: { discountAmountCent: 0 } }),
      count: async ({ where }: any = {}) => orders.filter((item) => (where?.status ? item.status === where.status : true)).length,
      findUnique: async ({ where }: any) => orders.find((item) => item.orderNo === where.orderNo || item.id === where.id) ?? null,
      findFirst: async ({ where }: any) => orders.find((item) => item.orderNo === where.orderNo && item.userId === where.userId) ?? null,
      update: async ({ where, data }: any) => {
        const order = orders.find((item) => item.id === where.id);
        if (!order) throw new Error("order not found");
        Object.assign(order, data);
        return order;
      }
    },
    mallOrder: {
      count: async ({ where }: any = {}) => mallOrders.filter((item) => (where?.status?.in ? where.status.in.includes(item.status) : where?.status ? item.status === where.status : true)).length,
      findUnique: async ({ where }: any) => mallOrders.find((item) => item.orderNo === where.orderNo || item.id === where.id) ?? null,
      findFirst: async ({ where }: any) => mallOrders.find((item) => item.orderNo === where.orderNo && item.userId === where.userId) ?? null,
      update: async ({ where, data }: any) => {
        const order = mallOrders.find((item) => item.id === where.id);
        if (!order) throw new Error("mall order not found");
        Object.assign(order, data);
        return order;
      }
    },
    refund: {
      findUnique: async ({ where, include }: any) => {
        const refund = refunds.find((item) => item.id === where.id) ?? null;
        return refund && include?.order ? { ...refund, order: orders.find((item) => item.id === refund.orderId) ?? null } : refund;
      },
      findFirst: async ({ where }: any) => refunds.find((item) => item.userId === where.userId || item.id === where.id) ?? null,
      findMany: async ({ where }: any = {}) => (where?.userId ? refunds.filter((item) => item.userId === where.userId) : refunds),
      count: async () => refunds.length,
      aggregate: async ({ where }: any = {}) => ({ _sum: { amountCent: sumAmounts(refunds, where) } }),
      create: async ({ data }: any) => {
        const refund = { id: `refund-${refunds.length + 1}`, createdAt: now, updatedAt: now, requestedAt: now, providerRefundId: null, provider: null, rejectReason: null, failedReason: null, ...data };
        refunds.push(refund);
        orders[0]!.refunds = refunds;
        return refund;
      },
      update: async ({ where, data }: any) => {
        const refund = refunds.find((item) => item.id === where.id);
        if (!refund) throw new Error("refund not found");
        Object.assign(refund, data, { updatedAt: now });
        return refund;
      }
    },
    mallRefund: {
      findUnique: async ({ where }: any) => mallRefunds.find((item) => item.id === where.id) ?? null,
      findMany: async ({ where }: any = {}) => (where?.order?.userId ? mallRefunds.filter((item) => item.order.userId === where.order.userId) : mallRefunds),
      count: async () => mallRefunds.length,
      aggregate: async ({ where }: any = {}) => ({ _sum: { amountCent: sumAmounts(mallRefunds, where) } }),
      create: async ({ data }: any) => {
        const refund = { id: `mall-refund-${mallRefunds.length + 1}`, createdAt: now, updatedAt: now, requestedAt: now, providerRefundId: null, provider: null, rejectReason: null, failedReason: null, order: mallOrders[0], ...data };
        mallRefunds.push(refund);
        mallOrders[0]!.refunds = mallRefunds;
        return refund;
      },
      update: async ({ where, data }: any) => {
        const refund = mallRefunds.find((item) => item.id === where.id);
        if (!refund) throw new Error("mall refund not found");
        Object.assign(refund, data, { updatedAt: now });
        return refund;
      }
    },
    registration: { count: async () => 1, updateMany: async () => ({ count: 1 }) },
    conference: { findMany: async () => [{ id: "conf-1", title: "会议一", orders: [{ ...orders[0], payments: payments.filter((item) => item.provider === PaymentProvider.WECHAT && item.status === PaymentStatus.SUCCESS), discountAmountCent: 0 }], _count: { registrations: 1 } }] },
    invoiceApplication: {
      findMany: async ({ where }: any = {}) => invoices.filter((item) => !where?.userId || item.userId === where.userId),
      count: async () => invoices.length,
      create: async ({ data }: any) => {
        const invoice = { id: `invoice-${invoices.length + 1}`, createdAt: now, updatedAt: now, issuedAt: null, rejectReason: null, issuedInvoiceNo: null, invoiceLink: null, ...data };
        invoices.push(invoice);
        return invoice;
      }
    },
    invoiceProfile: {
      findFirst: async ({ where }: any = {}) => invoiceProfiles.find((item) => item.userId === where.userId && item.isDefault === where.isDefault) ?? null,
      create: async ({ data }: any) => {
        const profile = { id: `invoice-profile-${invoiceProfiles.length + 1}`, createdAt: now, updatedAt: now, ...data };
        invoiceProfiles.push(profile);
        return profile;
      },
      update: async ({ where, data }: any) => {
        const profile = invoiceProfiles.find((item) => item.id === where.id);
        if (!profile) throw new Error("invoice profile not found");
        Object.assign(profile, data, { updatedAt: now });
        return profile;
      }
    },
    auditLog: {
      create: async ({ data }: any) => {
        auditLogs.push(data);
        return data;
      }
    }
  };
  return prisma as PrismaService & typeof prisma;
}

function sumAmounts(items: Array<{ amountCent: number; status: PaymentStatus | RefundStatus; provider?: PaymentProvider | null }>, where: any = {}) {
  return items
    .filter((item) => (where?.status ? item.status === where.status : true))
    .filter((item) => (where?.provider ? item.provider === where.provider : true))
    .reduce((sum, item) => sum + item.amountCent, 0);
}

function localPayment(sourceType: "REGISTRATION" | "MALL", orderNo: string, outTradeNo: string, amountCent: number): LocalPaymentRow {
  return {
    sourceType,
    orderNo,
    outTradeNo,
    transactionId: `tx-${outTradeNo}`,
    amountCent,
    expectedAmountCent: amountCent,
    status: PaymentStatus.SUCCESS,
    paidAt: new Date("2026-06-18T10:00:00.000Z"),
    orderStatus: sourceType === "MALL" ? "PAID" : OrderStatus.PAID
  };
}
