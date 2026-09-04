import "reflect-metadata";
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { BadGatewayException, BadRequestException, ConflictException } from "@nestjs/common";
import { CouponRedemptionStatus, InvoiceStatus, OrderStatus, PaymentProvider, PaymentStatus, RefundStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PublicOperationsService } from "./public-operations.service";
import { AdminFinanceService, buildBillReconciliationResults, LocalPaymentRow, parseWechatBillRows } from "./admin-finance.service";
import { CurrentAdmin } from "./current-admin";
import { WechatPayRefundClient, WechatPayRefundQueryResult, WechatPayRefundResult } from "../payments/wechat-pay.refund-client";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };
const user: CurrentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };
const readableTestKeyPath = resolve(__dirname, "../../../../package.json");

beforeEach(() => {
  delete process.env.REFUND_ENABLED;
  delete process.env.REFUND_MODE;
  delete process.env.MOCK_REFUND_ENABLED;
  delete process.env.WECHAT_REFUND_ENABLED;
  delete process.env.MALL_REFUND_MODE;
  delete process.env.MALL_WECHAT_REFUND_ENABLED;
  delete process.env.WECHAT_PAY_REFUND_NOTIFY_URL;
  delete process.env.WECHAT_PAY_APP_ID;
  delete process.env.WECHAT_PAY_MCH_ID;
  delete process.env.WECHAT_PAY_MCH_SERIAL_NO;
  delete process.env.WECHAT_PAY_API_V3_KEY;
  delete process.env.WECHAT_PAY_PRIVATE_KEY_PATH;
  delete process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH;
  delete process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID;
  delete process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO;
  delete process.env.WECHAT_PAY_NOTIFY_URL;
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

  it("exposes refund runtime config without treating missing WeChat refund as success", async () => {
    process.env.REFUND_ENABLED = "true";
    const service = new AdminFinanceService(createFinancePrismaMock());

    const result = await service.refundConfig();

    assert.equal(result.data.registration.enabled, true);
    assert.equal(result.data.registration.wechatRefundEnabled, false);
    assert.match(result.data.registration.callbackUrl, /\/payments\/wechat\/refund-notify$/);
    assert.equal(result.data.mall.enabled, false);
    assert.equal(result.data.mall.wechatRefundEnabled, false);
    assert.ok(result.data.steps.some((step) => step.includes("不会显示退款成功")));
  });

  it("reports the mall refund feature enabled only after an explicit mode is configured", async () => {
    process.env.MALL_REFUND_MODE = "wechat";
    const service = new AdminFinanceService(createFinancePrismaMock());

    const result = await service.refundConfig();

    assert.equal(result.data.mall.enabled, true);
  });

  it("reports WeChat refund ready only when the complete merchant runtime config is present", async () => {
    process.env.REFUND_ENABLED = "true";
    process.env.REFUND_MODE = "wechat";
    process.env.WECHAT_PAY_REFUND_NOTIFY_URL = "https://example.com/api/payments/wechat/refund-notify";
    const service = new AdminFinanceService(createFinancePrismaMock());

    const incomplete = await service.refundConfig();
    assert.equal(incomplete.data.registration.wechatRefundEnabled, false);

    withRegistrationWechatRefundConfig();
    const complete = await service.refundConfig();
    assert.equal(complete.data.registration.wechatRefundEnabled, true);
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
    assert.equal(prisma.registrationSkuRecord.soldCount, 0);
    assert.equal(prisma.registrationAttendeeRecord.checkInStatus, "CANCELLED");
    assert.equal(prisma.couponRedemptionRecord.status, CouponRedemptionStatus.CANCELLED);
    assert.equal(prisma.couponRedemptionRecord.usedAt, null);
  });

  it("finalizes and restores quota when successful partial refunds reach the paid total", async () => {
    process.env.REFUND_ENABLED = "true";
    process.env.REFUND_MODE = "mock";
    const prisma = createFinancePrismaMock({ seededRefunds: false });
    const service = new AdminFinanceService(prisma);

    const first = await service.createRefund({ sourceType: "REGISTRATION", orderNo: "ORDER001", amountCent: 4000, reason: "部分退款一" }, admin);
    await service.approveRefund((first.data as any).id, admin);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.registrationSkuRecord.soldCount, 1);
    assert.equal(prisma.couponRedemptionRecord.status, CouponRedemptionStatus.USED);

    const second = await service.createRefund({ sourceType: "REGISTRATION", orderNo: "ORDER001", amountCent: 6000, reason: "部分退款二" }, admin);
    await service.approveRefund((second.data as any).id, admin);

    assert.equal(prisma.orders[0]?.status, OrderStatus.REFUNDED);
    assert.equal(prisma.registrationSkuRecord.soldCount, 0);
    assert.equal(prisma.couponRedemptionRecord.status, CouponRedemptionStatus.CANCELLED);
    assert.equal(prisma.couponRedemptionRecord.usedAt, null);
  });

  it("creates an idempotent user refund request from the server-side paid balance", async () => {
    process.env.REFUND_ENABLED = "true";
    const prisma = createFinancePrismaMock({ seededRefunds: false });
    const service = new AdminFinanceService(prisma);

    const first = await service.requestRegistrationRefund({ orderNo: "ORDER001", amountCent: 1, reason: "临时无法参会" }, user);
    const second = await service.requestRegistrationRefund({ orderNo: "ORDER001", amountCent: 2, reason: "重复点击" }, user);

    assert.equal((first.data as any).amountCent, 10000);
    assert.equal((first.data as any).status, RefundStatus.REQUESTED);
    assert.equal((second.data as any).id, (first.data as any).id);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
  });

  it("allows self-service refund requests after check-in and after the conference starts", async () => {
    process.env.REFUND_ENABLED = "true";
    const checkedInPrisma = createFinancePrismaMock({ seededRefunds: false, registrationCheckedIn: true });
    const checkedInService = new AdminFinanceService(checkedInPrisma);
    const checkedIn = await checkedInService.requestRegistrationRefund({ orderNo: "ORDER001", reason: "已签到后退款" }, user);
    assert.equal((checkedIn.data as any).status, RefundStatus.REQUESTED);

    const startedPrisma = createFinancePrismaMock({ seededRefunds: false, conferenceStarted: true });
    const startedService = new AdminFinanceService(startedPrisma);
    const started = await startedService.requestRegistrationRefund({ orderNo: "ORDER001", reason: "会议开始后退款" }, user);
    assert.equal((started.data as any).status, RefundStatus.REQUESTED);
  });

  it("submits a real WeChat refund once and keeps the order paid until success", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const refundClient = new FakeRefundClient({
      refundId: "5030000708202609010000000001",
      outRefundNo: "REG_REFUND_ORDER001",
      status: "PROCESSING"
    });
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);

    const approved = await service.approveRefund((created.data as any).id, admin);
    const repeated = await service.approveRefund((created.data as any).id, admin);

    assert.equal((approved.data as any).status, RefundStatus.PROCESSING);
    assert.equal((repeated.data as any).status, RefundStatus.PROCESSING);
    assert.equal(refundClient.calls.length, 1);
    assert.equal(refundClient.calls[0]?.amountCent, 10000);
    assert.equal(refundClient.calls[0]?.totalAmountCent, 10000);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
  });

  it("keeps a failed WeChat submission approved so the same refund number can be retried", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const refundClient = new FailOnceRefundClient();
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);
    const refundId = (created.data as any).id;

    await assert.rejects(() => service.approveRefund(refundId, admin), /temporary refund provider failure/);
    const retryable = await prisma.refund.findUnique({ where: { id: refundId } });

    assert.equal(retryable?.status, RefundStatus.APPROVED);
    assert.equal(retryable?.processedAt, null);
    assert.match(String(retryable?.failedReason), /temporary refund provider failure/);
    await assert.rejects(
      () => service.rejectRefund(refundId, { reason: "误操作驳回" }, admin),
      (error: unknown) => error instanceof ConflictException && /结果未确认前不可驳回/.test(error.message)
    );

    const retried = await service.approveRefund(refundId, admin);
    assert.equal((retried.data as any).status, RefundStatus.PROCESSING);
    assert.equal(refundClient.calls.length, 2);
    assert.equal(refundClient.calls[0]?.outRefundNo, refundClient.calls[1]?.outRefundNo);
  });

  it("stores the actionable WeChat failure detail and request id", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const refundClient = {
      async createRefund() {
        throw new BadGatewayException({
          code: "WECHAT_PAY_REFUND_FAILED",
          message: "微信退款申请失败",
          detail: "基本账户余额不足，请充值后重新发起",
          requestId: "request-001"
        });
      }
    };
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);
    const refundId = (created.data as any).id;

    await assert.rejects(() => service.approveRefund(refundId, admin), BadGatewayException);
    const retryable = await prisma.refund.findUnique({ where: { id: refundId } });

    assert.match(String(retryable?.failedReason), /基本账户余额不足/);
    assert.match(String(retryable?.failedReason), /request-001/);
  });

  it("waits for a provider query before marking an accepted WeChat refund successful", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const refundClient = new FakeRefundClient(
      {
        refundId: "5030000708202609010000000002",
        outRefundNo: "REG_REFUND_ORDER001",
        status: "SUCCESS"
      },
      {
        refundId: "5030000708202609010000000002",
        outRefundNo: "REG_REFUND_ORDER001",
        status: "SUCCESS",
        amountCent: 10000,
        totalAmountCent: 10000,
        successTime: "2026-06-18T11:00:00+08:00"
      }
    );
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);

    const approved = await service.approveRefund((created.data as any).id, admin);
    assert.equal((approved.data as any).status, RefundStatus.PROCESSING);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.registrationUpdates.length, 0);

    const queried = await service.queryRefund((created.data as any).id);
    const repeated = await service.queryRefund((created.data as any).id);

    assert.equal((queried.data as any).status, RefundStatus.SUCCESS);
    assert.equal((repeated.data as any).status, RefundStatus.SUCCESS);
    assert.equal(refundClient.queryCalls.length, 1);
    assert.equal(prisma.orders[0]?.status, OrderStatus.REFUNDED);
    assert.equal(prisma.registrationUpdates[0]?.data.status, "REFUNDED");
  });

  it("rejects a WeChat refund when the successful payment amount differs from the order", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const originalFindFirst = prisma.payment.findFirst;
    prisma.payment.findFirst = async (args: any) => {
      const payment = await originalFindFirst(args);
      return payment ? { ...payment, amountCent: 9999 } : null;
    };
    const refundClient = new FakeRefundClient({
      refundId: "5030000708202609010000000004",
      outRefundNo: "ignored-by-echo",
      status: "PROCESSING"
    });
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);

    await assert.rejects(
      () => service.approveRefund((created.data as any).id, admin),
      (error: unknown) => error instanceof ConflictException && /支付成功金额与订单实付金额不一致/.test(error.message)
    );
    assert.equal(refundClient.calls.length, 0);
  });

  it("rejects a WeChat refund response with a different merchant refund number", async () => {
    withRegistrationWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, wechatPayment: true });
    const refundClient = new FakeRefundClient(
      {
        refundId: "5030000708202609010000000005",
        outRefundNo: "MISMATCHED_REFUND_NO",
        status: "PROCESSING"
      },
      undefined,
      false
    );
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user);

    await assert.rejects(
      () => service.approveRefund((created.data as any).id, admin),
      (error: unknown) => error instanceof ConflictException && /商户退款单号与本地不一致/.test(error.message)
    );
    const retryable = await prisma.refund.findUnique({ where: { id: (created.data as any).id } });
    assert.equal(retryable?.status, RefundStatus.APPROVED);
  });

  it("submits a real mall WeChat refund and waits for verified provider status", async () => {
    withMallWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, mallWechatPayment: true });
    const refundClient = new FakeRefundClient(
      { refundId: "5030000708202609010000000100", outRefundNo: "ignored", status: "PROCESSING" },
      {
        refundId: "5030000708202609010000000100",
        outRefundNo: "ignored",
        status: "SUCCESS",
        amountCent: 12000,
        totalAmountCent: 12000,
        successTime: "2026-06-18T12:00:00+08:00"
      }
    );
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.createRefund({ sourceType: "MALL", orderNo: "SHOP001", amountCent: 12000, reason: "商城退款" }, admin);

    const approved = await service.approveRefund((created.data as any).id, admin);
    const queried = await service.queryRefund((created.data as any).id);

    assert.equal((approved.data as any).status, RefundStatus.PROCESSING);
    assert.equal((queried.data as any).status, RefundStatus.SUCCESS);
    assert.equal(refundClient.calls.length, 1);
    assert.equal(refundClient.queryCalls.length, 1);
    assert.equal(prisma.mallOrders[0]?.status, "REFUNDED");
  });

  it("restores the prior mall order state when WeChat closes a refund", async () => {
    withMallWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, mallWechatPayment: true, mallOrderStatus: "SHIPPED" });
    const refundClient = new FakeRefundClient(
      { refundId: "5030000708202609010000000101", outRefundNo: "ignored", status: "PROCESSING" },
      {
        refundId: "5030000708202609010000000101",
        outRefundNo: "ignored",
        status: "CLOSED",
        amountCent: 12000,
        totalAmountCent: 12000,
        successTime: null
      }
    );
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.createRefund({ sourceType: "MALL", orderNo: "SHOP001", amountCent: 12000, reason: "商城退款" }, admin);

    await service.approveRefund((created.data as any).id, admin);
    const queried = await service.queryRefund((created.data as any).id);

    assert.equal((queried.data as any).status, RefundStatus.FAILED);
    assert.equal(prisma.mallOrders[0]?.status, "SHIPPED");
  });

  it("retries a failed mall WeChat submission with the same refund number", async () => {
    withMallWechatRefundConfig();
    const prisma = createFinancePrismaMock({ seededRefunds: false, mallWechatPayment: true });
    const refundClient = new FailOnceRefundClient();
    const service = new AdminFinanceService(prisma, refundClient as unknown as WechatPayRefundClient);
    const created = await service.createRefund({ sourceType: "MALL", orderNo: "SHOP001", amountCent: 12000, reason: "商城退款" }, admin);
    const refundId = (created.data as any).id;

    await assert.rejects(() => service.approveRefund(refundId, admin), /temporary refund provider failure/);
    const retryable = await prisma.mallRefund.findUnique({ where: { id: refundId } });
    assert.equal(retryable?.status, RefundStatus.APPROVED);
    await assert.rejects(
      () => service.rejectRefund(refundId, { reason: "误操作驳回" }, admin),
      (error: unknown) => error instanceof ConflictException && /结果未确认前不可驳回/.test(error.message)
    );
    const retried = await service.approveRefund(refundId, admin);

    assert.equal((retried.data as any).status, RefundStatus.PROCESSING);
    assert.equal(refundClient.calls.length, 2);
    assert.equal(refundClient.calls[0]?.outRefundNo, refundClient.calls[1]?.outRefundNo);
  });

  it("restores the mall order status that existed before a rejected refund", async () => {
    const prisma = createFinancePrismaMock({ seededRefunds: false, mallOrderStatus: "SHIPPED" });
    const service = new AdminFinanceService(prisma);
    const created = await service.createRefund({ sourceType: "MALL", orderNo: "SHOP001", amountCent: 12000, reason: "误发起退款" }, admin);

    assert.equal(prisma.mallOrders[0]?.status, "REFUNDING");
    await service.rejectRefund((created.data as any).id, { reason: "继续履约" }, admin);

    assert.equal(prisma.mallOrders[0]?.status, "SHIPPED");
  });

  it("blocks registration and mall refunds until active invoices are handled", async () => {
    process.env.REFUND_ENABLED = "true";
    const prisma = createFinancePrismaMock({ seededRefunds: false });
    const service = new AdminFinanceService(prisma);
    prisma.invoices.push({ id: "invoice-1", sourceType: "REGISTRATION", orderNo: "ORDER001", status: InvoiceStatus.ISSUED });

    await assert.rejects(
      () => service.requestRegistrationRefund({ orderNo: "ORDER001", reason: "临时无法参会" }, user),
      (error: unknown) => error instanceof ConflictException && /作废或红冲/.test(error.message)
    );

    prisma.invoices[0].sourceType = "MALL";
    prisma.invoices[0].orderNo = "SHOP001";
    await assert.rejects(
      () => service.createRefund({ sourceType: "MALL", orderNo: "SHOP001", amountCent: 12000, reason: "商城退款" }, admin),
      (error: unknown) => error instanceof ConflictException && /作废或红冲/.test(error.message)
    );
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
  it("creates invoice application from server-side net paid amount and blocks duplicates", async () => {
    process.env.INVOICE_ENABLED = "true";
    const prisma = createFinancePrismaMock();
    const service = new PublicOperationsService(prisma);

    const created = await service.createInvoice({ sourceType: "REGISTRATION", orderNo: "ORDER001", title: "公司抬头", amountCent: 1 }, user);

    const createdData = created.data as Record<string, unknown>;
    assert.equal(createdData.amountCent, 9000);
    assert.equal(prisma.invoices[0]?.amountCent, 9000);
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

function createFinancePrismaMock(options: { seededRefunds?: boolean; revenueProbe?: boolean; wechatPayment?: boolean; mallWechatPayment?: boolean; registrationCheckedIn?: boolean; conferenceStarted?: boolean; mallOrderStatus?: "PAID" | "SHIPPED" | "COMPLETED" } = {}) {
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
      conference: { id: "conf-1", title: "会议一", startsAt: new Date(options.conferenceStarted ? "2000-01-01T00:00:00.000Z" : "2099-01-01T00:00:00.000Z") },
      registration: { attendees: [{ checkInStatus: options.registrationCheckedIn ? "CHECKED_IN" : "PENDING" }] },
      user: { id: "user-1", nickname: "用户", wechatNickname: "微信用户", phone: "13800000000" },
      refunds: [] as any[]
    }
  ];
  const mallOrders = [
    {
      id: "mall-order-1",
      orderNo: "SHOP001",
      userId: "user-1",
      status: options.mallOrderStatus ?? "PAID",
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
      provider: options.wechatPayment ? PaymentProvider.WECHAT : PaymentProvider.MOCK,
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
      provider: options.mallWechatPayment ? PaymentProvider.WECHAT : PaymentProvider.MOCK,
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
  const refunds: any[] = options.seededRefunds === false ? [] : [{ id: "old-refund-1", refundNo: "RFOLD", orderId: "order-1", orderNo: "ORDER001", userId: "user-1", amountCent: options.revenueProbe ? 1 : 1000, provider: options.revenueProbe ? PaymentProvider.WECHAT : PaymentProvider.MOCK, status: RefundStatus.SUCCESS, createdAt: now, updatedAt: now, requestedAt: now }];
  const mallRefunds: any[] = options.seededRefunds === false ? [] : [{ id: "old-mall-refund-1", refundNo: "MRFOLD", outRefundNo: "MALL_REFUND_SHOP001", mallOrderId: "mall-order-1", order: mallOrders[0], amountCent: 1000, status: RefundStatus.SUCCESS, createdAt: now, updatedAt: now, requestedAt: now }];
  const invoices: any[] = [];
  const invoiceProfiles: any[] = [];
  const auditLogs: any[] = [];
  const registrationUpdates: any[] = [];
  const registrationSku = { id: "registration-sku-1", soldCount: 1 };
  const registration = { id: "registration-1", orderId: "order-1", status: "CONFIRMED" };
  const registrationAttendee = { id: "attendee-1", registrationId: registration.id, checkInStatus: "PENDING" };
  const couponRedemption = {
    id: "coupon-redemption-1",
    orderId: "order-1",
    status: CouponRedemptionStatus.USED,
    usedAt: now
  };
  orders[0]!.refunds = refunds;
  mallOrders[0]!.refunds = mallRefunds;

  const prisma: any = {
    orders,
    mallOrders,
    invoices,
    auditLogs,
    registrationUpdates,
    registrationSkuRecord: registrationSku,
    registrationAttendeeRecord: registrationAttendee,
    couponRedemptionRecord: couponRedemption,
    $transaction: async (input: any) => (Array.isArray(input) ? Promise.all(input) : input(prisma)),
    payment: {
      findMany: async () => payments,
      findFirst: async ({ where }: any) => payments.find((item) =>
        item.order?.id === where.orderId && item.provider === where.provider && item.status === where.status
      ) ?? null,
      count: async () => payments.length,
      aggregate: async ({ where }: any = {}) => ({ _sum: { amountCent: sumAmounts(payments, where) } })
    },
    mallPayment: {
      findMany: async () => mallPayments,
      findFirst: async ({ where }: any) => mallPayments.find((item) =>
        item.order?.id === where.mallOrderId && item.provider === where.provider && item.status === where.status
      ) ?? null,
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
      },
      updateMany: async ({ where, data }: any) => {
        const order = orders.find((item) => item.id === where.id && item.status === where.status);
        if (!order) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      }
    },
    orderItem: {
      findMany: async ({ where }: any) => where.orderId === "order-1" ? [{ skuId: registrationSku.id, quantity: 1 }] : []
    },
    registrationSku: {
      updateMany: async ({ where, data }: any) => {
        if (where.id !== registrationSku.id || registrationSku.soldCount < where.soldCount.gte) return { count: 0 };
        registrationSku.soldCount -= data.soldCount.decrement;
        return { count: 1 };
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
      },
      updateMany: async ({ where, data }: any) => {
        const order = mallOrders.find((item) => item.id === where.id);
        const allowed = Array.isArray(where.status?.in) ? where.status.in.includes(order?.status) : order?.status === where.status;
        if (!order || !allowed) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
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
      findFirst: async ({ where }: any) => mallRefunds.find((item) =>
        (!where.mallOrderId || item.mallOrderId === where.mallOrderId) &&
        (!where.status || item.status === where.status)
      ) ?? null,
      findMany: async ({ where }: any = {}) => (where?.order?.userId ? mallRefunds.filter((item) => item.order.userId === where.order.userId) : mallRefunds),
      count: async ({ where }: any = {}) => mallRefunds.filter((item) =>
        (!where.mallOrderId || item.mallOrderId === where.mallOrderId) &&
        (!where.status?.in || where.status.in.includes(item.status))
      ).length,
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
    registration: {
      count: async () => 1,
      findUnique: async ({ where }: any) => where.orderId === registration.orderId ? registration : null,
      update: async (args: any) => {
        registrationUpdates.push(args);
        Object.assign(registration, args.data);
        return registration;
      },
      updateMany: async (args: any) => {
        registrationUpdates.push(args);
        return { count: 1 };
      }
    },
    registrationAttendee: {
      updateMany: async ({ where, data }: any) => {
        if (where.registrationId !== registration.id) return { count: 0 };
        Object.assign(registrationAttendee, data);
        return { count: 1 };
      }
    },
    couponRedemption: {
      updateMany: async ({ where, data }: any) => {
        if (where.orderId !== couponRedemption.orderId || where.status !== couponRedemption.status) return { count: 0 };
        Object.assign(couponRedemption, data);
        return { count: 1 };
      }
    },
    mallAfterSale: {
      findFirst: async ({ where }: any) => mallOrders[0]?.afterSales.find((afterSale) => afterSale.id === where.id && mallOrders[0]?.id === where.orderId) ?? null,
      update: async ({ where, data }: any) => {
        const item = mallOrders[0]?.afterSales.find((afterSale) => afterSale.id === where.id);
        if (!item) throw new Error("mall after-sale not found");
        Object.assign(item, data);
        return item;
      }
    },
    conference: { findMany: async () => [{ id: "conf-1", title: "会议一", orders: [{ ...orders[0], payments: payments.filter((item) => item.provider === PaymentProvider.WECHAT && item.status === PaymentStatus.SUCCESS), discountAmountCent: 0 }], _count: { registrations: 1 } }] },
    invoiceApplication: {
      findFirst: async ({ where }: any) => invoices.find((item) =>
        item.sourceType === where.sourceType &&
        item.orderNo === where.orderNo &&
        (!where.status?.in || where.status.in.includes(item.status))
      ) ?? null,
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

function withRegistrationWechatRefundConfig() {
  process.env.REFUND_ENABLED = "true";
  process.env.REFUND_MODE = "wechat";
  process.env.WECHAT_PAY_APP_ID = "wx-test";
  process.env.WECHAT_PAY_MCH_ID = "1900000001";
  process.env.WECHAT_PAY_MCH_SERIAL_NO = "merchant-serial";
  process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
  process.env.WECHAT_PAY_PRIVATE_KEY_PATH = readableTestKeyPath;
  process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH = readableTestKeyPath;
  process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID = "PUB_KEY_ID_test";
  process.env.WECHAT_PAY_NOTIFY_URL = "https://example.com/api/payments/wechat/notify";
  process.env.WECHAT_PAY_REFUND_NOTIFY_URL = "https://example.com/api/payments/wechat/refund-notify";
}

function withMallWechatRefundConfig() {
  withRegistrationWechatRefundConfig();
  process.env.MALL_REFUND_MODE = "wechat";
}

class FakeRefundClient {
  readonly calls: Array<Record<string, any>> = [];
  readonly queryCalls: Array<Record<string, any>> = [];

  constructor(
    private readonly result: WechatPayRefundResult,
    private readonly queryResult?: WechatPayRefundQueryResult,
    private readonly echoOutRefundNo = true
  ) {}

  async createRefund(input: Record<string, any>): Promise<WechatPayRefundResult> {
    this.calls.push(input);
    return this.echoOutRefundNo ? { ...this.result, outRefundNo: input.outRefundNo } : this.result;
  }

  async queryRefund(input: Record<string, any>): Promise<WechatPayRefundQueryResult> {
    this.queryCalls.push(input);
    if (!this.queryResult) throw new Error("query result not configured");
    return { ...this.queryResult, outRefundNo: input.outRefundNo };
  }
}

class FailOnceRefundClient {
  readonly calls: Array<Record<string, any>> = [];

  async createRefund(input: Record<string, any>): Promise<WechatPayRefundResult> {
    this.calls.push(input);
    if (this.calls.length === 1) throw new Error("temporary refund provider failure");
    return {
      refundId: "5030000708202609010000000003",
      outRefundNo: String(input.outRefundNo),
      status: "PROCESSING"
    };
  }
}

function sumAmounts(items: Array<{ amountCent: number; status: PaymentStatus | RefundStatus; provider?: PaymentProvider | null; orderId?: string | null }>, where: any = {}) {
  return items
    .filter((item) => (where?.status ? item.status === where.status : true))
    .filter((item) => (where?.provider ? item.provider === where.provider : true))
    .filter((item) => (where?.orderId ? item.orderId === where.orderId : true))
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
