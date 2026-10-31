import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { PaymentProvider, PaymentStatus, RefundStatus } from "@prisma/client";
import { AdminFinanceController } from "./admin-finance.controller";
import { AdminFinanceService } from "./admin-finance.service";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";
import type { CurrentAdmin } from "./current-admin";
import type { PrismaService } from "../prisma.service";
import type { PaymentMerchantService } from "../payments/payment-merchant.service";
import type { WechatPayRefundClient } from "../payments/wechat-pay.refund-client";

const admin: CurrentAdmin = { id: "finance-admin", username: "finance", displayName: "Finance", permissions: ["finance:view"] };
const day = "2026-10-30";
const timestamp = new Date(`${day}T12:00:00+08:00`);
type Row = Record<string, any>;

function billText(...orders: string[]) {
  return ["out_trade_no,transaction_id,amount,trade_state", ...orders.map(order => `${order},transaction-${order},1.00,SUCCESS`)].join("\n");
}

function payment(outTradeNo: string, merchantId: string | null, revision = "old", provider: PaymentProvider = PaymentProvider.WECHAT): Row {
  return {
    id: outTradeNo, outTradeNo, transactionId: `transaction-${outTradeNo}`, amountCent: 100,
    provider, status: PaymentStatus.SUCCESS, createdAt: timestamp, paidAt: timestamp,
    order: {
      id: `order-${outTradeNo}`, orderNo: `ORDER-${outTradeNo}`, status: "PAID", payableAmountCent: 100, paidAmountCent: 100,
      paymentMerchantRevisionId: merchantId ? `${merchantId}-${revision}` : null,
      paymentMerchantRevision: merchantId ? { merchantId } : null,
      paymentMerchantSnapshot: merchantId ? { source: "MANAGED", merchantId, revisionId: `${merchantId}-${revision}`, companyName: "Original Company" } : null,
      conference: { paymentMerchantId: "merchant-b", title: "Conference now uses B" }
    }
  };
}

function fakeFinance() {
  const state = {
    bills: [] as Row[], imports: [] as Row[], results: [] as Row[], audits: [] as Row[], queries: [] as Row[],
    merchants: [
      { id: "merchant-a", companyName: "Company A", mchId: "mch-a", enabled: false },
      { id: "merchant-b", companyName: "Company B", mchId: "mch-b", enabled: true }
    ],
    payments: [payment("A-OLD", "merchant-a"), payment("A-NEW", "merchant-a", "new"), payment("B", "merchant-b"), payment("LEGACY", null), payment("MOCK-A", "merchant-a", "old", PaymentProvider.MOCK), payment("MOCK-LEGACY", null, "old", PaymentProvider.MOCK)],
    mallPayments: [payment("MALL", null), payment("MALL-MOCK", null, "old", PaymentProvider.MOCK)]
  };
  const filterBills = (where: Row) => state.bills.filter(bill => (!where.merchantKey || bill.merchantKey === where.merchantKey) && (!where.status || bill.status === where.status));
  const filterResults = (where: Row) => state.results.filter(row => !where.bill?.merchantKey || state.bills.find(bill => bill.id === row.billId)?.merchantKey === where.bill.merchantKey);
  const findPayments = (rows: Row[], args: Row) => {
    state.queries.push(args);
    return rows.filter(row => args.take !== 0 && (!args.where.provider || row.provider === args.where.provider)
      && (!args.where.status || row.status === args.where.status)
      && (args.where.order?.paymentMerchantRevisionId !== null || row.order.paymentMerchantRevisionId === null)
      && (!args.where.order?.paymentMerchantRevision?.merchantId || row.order.paymentMerchantRevision?.merchantId === args.where.order.paymentMerchantRevision.merchantId));
  };
  const db: Row = {
    $transaction: async (operation: any) => typeof operation === "function" ? operation(db) : Promise.all(operation),
    paymentMerchant: {
      findUnique: async ({ where }: Row) => state.merchants.find(merchant => merchant.id === where.id) ?? null,
      findMany: async ({ select }: Row) => {
        assert.deepEqual(select, { id: true, companyName: true, mchId: true, enabled: true });
        return state.merchants;
      }
    },
    wechatBill: {
      upsert: async ({ where, create, update }: Row) => {
        assert.deepEqual(Object.keys(where), ["billDate_billType_merchantKey"]);
        const key = where.billDate_billType_merchantKey;
        let row = state.bills.find(bill => bill.billDate.getTime() === key.billDate.getTime() && bill.billType === key.billType && bill.merchantKey === key.merchantKey);
        if (row) Object.assign(row, update);
        else { row = { id: `bill-${state.bills.length + 1}`, createdAt: timestamp, updatedAt: timestamp, storagePath: null, downloadUrl: null, ...create }; state.bills.push(row!); }
        return row;
      },
      findUnique: async ({ where }: Row) => state.bills.find(bill => bill.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: Row) => { const row = state.bills.find(bill => bill.id === where.id); assert.ok(row); return row; },
      update: async ({ where, data }: Row) => { const row = state.bills.find(bill => bill.id === where.id); assert.ok(row); Object.assign(row, data); return row; },
      findMany: async ({ where }: Row) => filterBills(where),
      count: async ({ where }: Row) => filterBills(where).length
    },
    wechatBillImport: { create: async ({ data }: Row) => { const row = { id: `import-${state.imports.length + 1}`, ...data }; state.imports.push(row); return row; } },
    reconciliationResult: {
      deleteMany: async ({ where }: Row) => { state.results = state.results.filter(row => row.billId !== where.billId); return { count: 0 }; },
      createMany: async ({ data }: Row) => { state.results.push(...data); return { count: data.length }; },
      findMany: async ({ where }: Row) => filterResults(where).map(row => ({ ...row, bill: state.bills.find(bill => bill.id === row.billId) })),
      count: async ({ where }: Row) => filterResults(where).length
    },
    payment: { findMany: async (args: Row) => findPayments(state.payments, args), count: async () => state.payments.length },
    mallPayment: { findMany: async (args: Row) => findPayments(state.mallPayments, args), count: async () => state.mallPayments.length },
    auditLog: { create: async ({ data }: Row) => { state.audits.push(data); return data; } }
  };
  return { state, db: db as PrismaService, service: new AdminFinanceService(db as PrismaService) };
}

describe("finance merchant bill partitions", () => {
  it("creates independent same-day/type A, B and DEFAULT bills and remains idempotent within a merchant", async () => {
    const { service, state } = fakeFinance();
    const ids: unknown[] = [];
    for (const merchantKey of ["merchant-a", "merchant-b", undefined]) {
      ids.push((await service.createWechatBill({ billDate: day, merchantKey }, admin)).data.id);
    }
    assert.equal(new Set(ids).size, 3);
    assert.equal((await service.createWechatBill({ billDate: day, merchantKey: "merchant-a" }, admin)).data.id, ids[0]);
    assert.equal((await service.createWechatBill({ billDate: day, merchantKey: "DEFAULT" }, admin)).data.id, ids[2]);
    assert.equal(state.bills.length, 3);
    assert.equal(state.bills[2]!.summaryJson.merchantKey, "DEFAULT");
  });

  it("rejects unknown and malformed merchants before creating or importing any rows", async () => {
    const { service, state } = fakeFinance();
    for (const merchantKey of ["unknown", null, "", 42]) {
      await assert.rejects(() => service.createWechatBill({ billDate: day, merchantKey }, admin), BadRequestException);
      await assert.rejects(() => service.importWechatBill({ billDate: day, merchantKey, text: billText("B") }, admin), BadRequestException);
    }
    assert.equal(state.bills.length + state.imports.length, 0);
  });

  it("imports per merchant and clears only that bill's old results, retaining import provenance", async () => {
    const { service, state } = fakeFinance();
    const a = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD") }, admin)).data;
    const b = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-b", text: billText("B") }, admin)).data;
    const beforeB = structuredClone(state.bills[1]);
    state.results.push({ billId: a.id }, { billId: b.id });
    const next = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-NEW") }, admin)).data;
    assert.equal(next.id, a.id);
    assert.deepEqual(state.bills[1], beforeB);
    assert.deepEqual(state.results, [{ billId: b.id }]);
    assert.equal(state.imports.at(-1)!.errorJson.merchantKey, "merchant-a");
    assert.equal((next.summaryJson as Row).merchantKey, "merchant-a");
  });

  it("reconciles only original A registration payments across revisions, even when A is disabled and the conference now uses B", async () => {
    const { service, state } = fakeFinance();
    const bill = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD", "A-NEW") }, admin)).data;
    const result = await service.reconcileWechatBill(String(bill.id), admin);
    assert.deepEqual(state.results.map(row => [row.outTradeNo, row.type]), [["A-OLD", "MATCHED"], ["A-NEW", "MATCHED"]]);
    assert.equal((result.data.summaryJson as Row).localPaymentCount, 2);
    assert.deepEqual(state.queries[0]!.where.order, { paymentMerchantRevision: { merchantId: "merchant-a" } });
    assert.equal(state.queries[0]!.where.provider, PaymentProvider.WECHAT);
    assert.equal(state.queries[1]!.take, 0);
  });

  it("never matches a foreign merchant payment even if its outTradeNo is present in A's imported text", async () => {
    const { service, state } = fakeFinance();
    const bill = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD", "A-NEW", "B") }, admin)).data;
    await service.reconcileWechatBill(String(bill.id), admin);
    assert.equal(state.results.find(row => row.outTradeNo === "B")!.type, "WECHAT_ONLY");
    assert.equal(state.results.find(row => row.outTradeNo === "B")!.localAmountCent, null);
  });

  it("limits DEFAULT reconciliation to legacy registration and mall WECHAT payments, excluding mock and managed", async () => {
    const { service, state } = fakeFinance();
    const bill = (await service.importWechatBill({ billDate: day, text: billText("LEGACY", "MALL") }, admin)).data;
    await service.reconcileWechatBill(String(bill.id), admin);
    assert.deepEqual(state.results.map(row => [row.outTradeNo, row.type]), [["LEGACY", "MATCHED"], ["MALL", "MATCHED"]]);
    assert.deepEqual(state.queries[0]!.where.order, { paymentMerchantRevisionId: null });
  });

  it("does not attach an A bill's foreign-row reconciliation result to merchant B's payment feed", async () => {
    const { service } = fakeFinance();
    const bill = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD", "A-NEW", "B") }, admin)).data;
    await service.reconcileWechatBill(bill.id, admin);
    const feed = await service.listPayments({});
    assert.equal(feed.data.items.find(item => item.outTradeNo === "A-OLD")!.reconciliationStatus, "MATCHED");
    assert.equal(feed.data.items.find(item => item.outTradeNo === "B")!.reconciliationStatus, "UNRECONCILED");
  });

  it("rejects merchant overrides, managed mall reconciliation and mismatched import provenance", async () => {
    const { service, state } = fakeFinance();
    const bill = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD") }, admin)).data;
    await assert.rejects(() => service.reconcileWechatBill(String(bill.id), admin, { merchantKey: "merchant-b" }), BadRequestException);
    await assert.rejects(() => service.reconcileWechatBill(String(bill.id), admin, { sourceType: "MALL" }), BadRequestException);
    state.bills[0]!.summaryJson.merchantKey = "merchant-b";
    await assert.rejects(() => service.reconcileWechatBill(String(bill.id), admin), ConflictException);
    assert.equal(state.queries.length, 0);
  });

  it("requires an imported bill before producing results", async () => {
    const { service, state } = fakeFinance();
    const bill = (await service.createWechatBill({ billDate: day }, admin)).data;
    await assert.rejects(() => service.reconcileWechatBill(String(bill.id), admin), BadRequestException);
    assert.equal(state.results.length, 0);
  });

  it("filters both bill and reconciliation lists by merchant, with omitted filters showing all", async () => {
    const { service } = fakeFinance();
    for (const [merchantKey, outTradeNo] of [["merchant-a", "A-OLD"], ["merchant-b", "B"]]) {
      const bill = (await service.importWechatBill({ billDate: day, merchantKey, text: billText(outTradeNo!) }, admin)).data;
      await service.reconcileWechatBill(String(bill.id), admin);
    }
    assert.equal((await service.listWechatBills()).data.total, 2);
    const bills = await service.listWechatBills({ merchantKey: "merchant-a" });
    assert.equal(bills.data.total, 1);
    assert.equal(bills.data.items[0]!.merchantKey, "merchant-a");
    const results = await service.listReconciliationResults({ merchantKey: "merchant-b" });
    assert.equal(results.data.total, 1);
    assert.equal(results.data.items[0]!.merchantKey, "merchant-b");
    await assert.rejects(() => service.listWechatBills({ merchantKey: "unknown" }), BadRequestException);
  });

  it("returns public-only finance merchant options including disabled historical merchants", async () => {
    const { service } = fakeFinance();
    const result = await service.merchantOptions();
    assert.deepEqual(result.data.items.map(item => item.merchantKey), ["DEFAULT", "merchant-a", "merchant-b"]);
    assert.equal(result.data.items[1]!.enabled, false);
    assert.deepEqual(Object.keys(result.data.items[1]!).sort(), ["companyName", "enabled", "mchId", "merchantKey"]);
    assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, AdminFinanceController.prototype.merchantOptions), ["finance:view"]);
  });

  it("does not claim an automatic download or mutate imported data even with download flags enabled", async () => {
    await withEnv({ WECHAT_PAY_BILL_DOWNLOAD_ENABLED: "true", WECHAT_PAY_BILL_STORAGE_PATH: "/not-used" }, async () => {
      const { service, state } = fakeFinance();
      const bill = (await service.importWechatBill({ billDate: day, merchantKey: "merchant-a", text: billText("A-OLD") }, admin)).data;
      const before = structuredClone(state.bills[0]);
      const result = await service.downloadWechatBill(String(bill.id), admin);
      assert.equal(result.data.downloadImplemented, false);
      assert.match(result.data.skippedReason, /未创建下载任务/);
      assert.deepEqual(state.bills[0], before);
    });
  });
});

function refundFixture(configFailure = false, missingRevision = false) {
  const order = payment("A-OLD", "merchant-a").order;
  if (missingRevision) order.paymentMerchantRevisionId = null;
  const refund: Row = { id: "refund-a", refundNo: "refund-number", outRefundNo: "refund-number", orderNo: order.orderNo, orderId: order.id, order,
    amountCent: 100, status: RefundStatus.REQUESTED, provider: null, reason: "test", createdAt: timestamp, updatedAt: timestamp };
  const calls: Row[] = [];
  const writes: Row[] = [];
  const db: Row = {
    $transaction: async (operation: any) => operation(db),
    refund: {
      findUnique: async () => ({ ...refund }),
      findUniqueOrThrow: async () => ({ ...refund }),
      updateMany: async ({ where, data }: Row) => {
        if (typeof where.status === "string" ? refund.status !== where.status : refund.status === where.status?.not) return { count: 0 };
        writes.push(data); Object.assign(refund, data); return { count: 1 };
      },
      update: async ({ data }: Row) => { writes.push(data); Object.assign(refund, data); return { ...refund }; }
    },
    payment: { findFirst: async ({ where }: Row) => { assert.equal(where.provider, PaymentProvider.WECHAT); return payment("A-OLD", "merchant-a"); } },
    auditLog: { create: async ({ data }: Row) => data }
  };
  const config = { mchId: "original-a" };
  const merchants = { configForOrder: async (original: Row) => {
    assert.strictEqual(original, order);
    assert.equal(original.paymentMerchantSnapshot.merchantId, "merchant-a");
    if (configFailure) throw new ConflictException("Original configuration is unavailable");
    return config;
  } };
  const client = {
    createRefund: async (input: Row) => { calls.push(input); assert.strictEqual(input.config, config); return { outRefundNo: refund.outRefundNo, refundId: "provider-refund-a", status: "SUCCESS" }; },
    queryRefund: async (input: Row) => { calls.push(input); assert.strictEqual(input.config, config); return { outRefundNo: refund.outRefundNo, refundId: "provider-refund-a", status: "PROCESSING", amountCent: 100, totalAmountCent: 100 }; }
  };
  return { refund, writes, calls, service: new AdminFinanceService(db as PrismaService, client as unknown as WechatPayRefundClient, undefined, undefined, undefined, merchants as unknown as PaymentMerchantService) };
}

describe("finance historical merchant refunds", () => {
  it("uses the pinned original merchant despite global mock mode, and acceptance never finalizes success", async () => {
    await withEnv({ REFUND_MODE: "mock", MOCK_REFUND_ENABLED: "true", NODE_ENV: "test" }, async () => {
      const { service, writes, calls } = refundFixture();
      const result = await service.approveRefund("refund-a", admin);
      assert.equal((result.data as Row).status, RefundStatus.PROCESSING);
      assert.equal((result.data as Row).provider, PaymentProvider.WECHAT);
      assert.equal(calls.length, 1);
      assert.equal(writes.some(write => write.provider === PaymentProvider.MOCK || write.status === RefundStatus.SUCCESS), false);
    });
  });

  it("fails closed when historical configuration is missing, including a managed snapshot without a revision", async () => {
    await withEnv({ REFUND_MODE: "mock", NODE_ENV: "test" }, async () => {
      for (const missingRevision of [false, true]) {
        const { service, refund, writes, calls } = refundFixture(true, missingRevision);
        await assert.rejects(() => service.approveRefund("refund-a", admin), ConflictException);
        assert.equal(refund.status, RefundStatus.APPROVED);
        assert.equal(calls.length, 0);
        assert.equal(writes.some(write => write.provider === PaymentProvider.MOCK || write.status === RefundStatus.SUCCESS), false);
      }
    });
  });

  it("queries a managed refund with its original configuration even when global WeChat refunds are disabled", async () => {
    await withEnv({ REFUND_MODE: "disabled", WECHAT_REFUND_ENABLED: "false" }, async () => {
      const { service, refund, calls } = refundFixture();
      refund.status = RefundStatus.PROCESSING;
      refund.provider = PaymentProvider.WECHAT;
      const result = await service.queryRefund("refund-a");
      assert.equal(calls.length, 1);
      assert.equal((result.data as Row).status, RefundStatus.PROCESSING);
      assert.equal((result.data as Row).paymentMerchantRevisionId, "merchant-a-old");
      assert.equal((result.data as Row).managedMerchant, true);
    });
  });

  it("separates default refund readiness from the original-order managed policy", async () => {
    await withEnv({ REFUND_MODE: "disabled", WECHAT_REFUND_ENABLED: "false" }, async () => {
      const { service } = refundFixture();
      const result = await service.refundConfig();
      assert.equal(result.data.registration.wechatRefundEnabled, false);
      assert.equal(result.data.registration.managedMerchantRefundMode, "ORIGINAL_ORDER");
    });
  });
});

async function withEnv(values: Record<string, string>, run: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  try { Object.assign(process.env, values); await run(); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
