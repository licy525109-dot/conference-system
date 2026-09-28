import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { OrderStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminManagementService } from "./admin-management.service";
import { AdminManagementController } from "./admin-management.controller";
import { AdminExportsService } from "./admin-exports.service";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";
import { parseAdminOrderWhere, orderTicketItems } from "./admin-order-query";

const admin = { id: "admin-qa", username: "qa", displayName: "QA", permissions: ["order:view", "order:delete"] };

describe("admin order filters and snapshots", () => {
  it("combines ticket, search and recycle scope without overwriting OR clauses", () => {
    const where = parseAdminOrderWhere({ skuId: "sku-b", keyword: "QA", conferenceId: "conference", deleted: true });
    assert.deepEqual(where.AND, [
      { adminDeletedAt: { not: null } }, { conferenceId: "conference" },
      { OR: [{ items: { some: { skuId: "sku-b" } } }, { items: { none: {} }, skuId: "sku-b" }] },
      { OR: [
        { orderNo: { contains: "QA", mode: "insensitive" } },
        { attendeeName: { contains: "QA", mode: "insensitive" } },
        { phone: { contains: "QA", mode: "insensitive" } },
        { user: { realName: { contains: "QA", mode: "insensitive" } } },
        { user: { nickname: { contains: "QA", mode: "insensitive" } } },
        { payments: { some: { outTradeNo: { contains: "QA", mode: "insensitive" } } } },
        { payments: { some: { transactionId: { contains: "QA", mode: "insensitive" } } } }
      ] }
    ]);
    assert.deepEqual(parseAdminOrderWhere({}).AND, [{ adminDeletedAt: null }]);
  });
  it("rejects invalid status instead of silently exporting every order", () => {
    assert.throws(() => parseAdminOrderWhere({ status: "paid-typo" }), BadRequestException);
    assert.throws(() => parseAdminOrderWhere({ paymentStatus: "PAID" }), BadRequestException);
  });
  it("uses all ticket snapshots, even when SKU names or prices have changed", () => {
    const items = [{ id: "item", skuId: "sku", skuName: "原票名", unitPriceCent: 12000, quantity: 2, totalAmountCent: 24000 }];
    assert.deepEqual(orderTicketItems({ skuId: "sku", sku: { name: "改名后" }, originAmountCent: 24000, items }), items);
    assert.equal(orderTicketItems({ skuId: "sku", sku: { name: "旧订单票种" }, originAmountCent: 12000, items: [] })[0].quantity, 1);
  });
  it("aggregates all filtered orders inside a consistent snapshot, not the page or payment attempts", async () => {
    const calls: Array<{ method: string; args: any }> = [];
    const tx = {
      order: {
        findMany: async (args: unknown) => { calls.push({ method: "findMany", args }); return []; },
        count: async (args: unknown) => { calls.push({ method: "count", args }); return 41; },
        aggregate: async (args: any) => {
          calls.push({ method: "aggregate", args });
          return args._count ? { _count: { _all: 30 }, _sum: { paidAmountCent: 300000 } }
            : { _sum: { payableAmountCent: 410000, discountAmountCent: 5000 } };
        }
      },
      refund: { aggregate: async (args: unknown) => { calls.push({ method: "refund", args }); return { _sum: { amountCent: 12000 } }; } }
    };
    const prisma = { $transaction: async (fn: Function, options: unknown) => {
      assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }); return fn(tx);
    } } as unknown as PrismaService;
    const response = await new AdminManagementService(prisma).listOrders({ skuId: "sku", page: 2, pageSize: 20 });
    const data = response.data as any;
    assert.equal(data.summary.paidAmountCent, 300000);
    assert.equal(data.summary.netPaidAmountCent, 288000);
    assert.equal(data.summary.orderCount, 41);
    assert.equal(calls[0].args.skip, 20);
    assert.equal(calls[0].args.take, 20);
    assert.deepEqual(calls[1].args.where, calls[0].args.where);
    assert.deepEqual(calls[4].args.where, { order: calls[0].args.where, status: "SUCCESS" });
    for (const call of calls.slice(1)) assert.equal(call.args.take, undefined);
  });
  it("requires order permissions on ticket, recycle, restore and delete endpoints", () => {
    const controller = AdminManagementController.prototype;
    for (const name of ["recycleOrders", "restoreOrder", "deleteOrder"] as const) {
      assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, controller[name]), ["order:delete"]);
    }
    assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, controller.orderSkuOptions), ["order:view"]);
  });
});

describe("order recycle safety", () => {
  it("only archives explicit IDs and never touches money, inventory, registrations or payments", async () => {
    const fixture = recycleFixture();
    const result = await fixture.service.recycleOrders({ orderNos: ["QA-1", "QA-1"], reason: "测试订单" }, admin);
    assert.deepEqual(result.data, { deleted: 1, alreadyDeleted: 0 });
    assert.deepEqual(Object.keys(fixture.writes[0].data).sort(), ["adminDeleteReason", "adminDeletedAt", "adminDeletedBy"]);
    assert.deepEqual(fixture.writes[0].where, { id: { in: ["1"] }, adminDeletedAt: null });
    assert.equal(fixture.audits.length, 1);
  });
  for (const reason of ["", "x".repeat(301)]) it(`rejects invalid deletion reason length ${reason.length}`, async () => {
    const fixture = recycleFixture();
    await assert.rejects(() => fixture.service.recycleOrders({ orderNos: ["QA-1"], reason }, admin), BadRequestException);
    assert.equal(fixture.writes.length, 0);
  });
  it("blocks pending orders and active refunds before writing anything", async () => {
    for (const override of [{ status: OrderStatus.PENDING }, { refunds: [{ id: "refund" }] }]) {
      const fixture = recycleFixture(override);
      await assert.rejects(() => fixture.service.recycleOrders({ orderNos: ["QA-1"], reason: "test" }, admin), ConflictException);
      assert.equal(fixture.writes.length, 0);
    }
  });
  it("rejects an incomplete selection atomically", async () => {
    const fixture = recycleFixture();
    await assert.rejects(() => fixture.service.recycleOrders({ orderNos: ["QA-1", "missing"], reason: "test" }, admin), NotFoundException);
    assert.equal(fixture.writes.length, 0);
  });
  it("repeating a delete does not create another audit or alter financial status", async () => {
    const fixture = recycleFixture({ adminDeletedAt: new Date() });
    const result = await fixture.service.recycleOrders({ orderNos: ["QA-1"], reason: "test" }, admin);
    assert.deepEqual(result.data, { deleted: 0, alreadyDeleted: 1 });
    assert.equal(fixture.audits.length, 0);
  });
  it("restores only archive metadata, and is idempotent for active orders", async () => {
    const fixture = recycleFixture({ adminDeletedAt: new Date() });
    assert.deepEqual((await fixture.service.restoreOrder("QA-1", admin)).data, { restored: 1 });
    assert.deepEqual(fixture.writes[0].data, { adminDeletedAt: null, adminDeletedBy: null, adminDeleteReason: null });
    const active = recycleFixture();
    assert.deepEqual((await active.service.restoreOrder("QA-1", admin)).data, { restored: 0 });
    assert.equal(active.writes.length, 0);
  });
});

describe("order export safety", () => {
  it("exports all ticket snapshots, updated account name and refund amounts without multiplying payment", async () => {
    const now = new Date("2026-09-28T00:00:00Z");
    const row = {
      id: "qa", orderNo: "QA-1", skuId: "sku-a", sku: { name: "已改名" },
      items: [
        { id: "a", skuId: "sku-a", skuName: "标准票", quantity: 2, unitPriceCent: 318000, totalAmountCent: 636000 },
        { id: "b", skuId: "sku-b", skuName: "住宿票", quantity: 1, unitPriceCent: 368000, totalAmountCent: 368000 }
      ],
      originAmountCent: 1004000, discountAmountCent: 4000, payableAmountCent: 1000000, paidAmountCent: 1000000,
      refunds: [{ amountCent: 50000 }], status: "PAID", attendeeName: "参会人", phone: "13800000000",
      createdAt: now, paidAt: now, expiredAt: null, conference: { title: "会议" },
      user: { realName: "账号本人", nickname: "新昵称", wechatNickname: "旧昵称" },
      registration: { id: "reg", registrationNo: "R-QA", status: "CONFIRMED" },
      payments: [{ id: "payment", status: "SUCCESS", provider: "MOCK", amountCent: 1000000, paidAt: now, createdAt: now, transactionId: null }]
    };
    const prisma = { order: { findMany: async () => [row] }, auditLog: { create: async () => ({}) } } as unknown as PrismaService;
    const html = await new AdminExportsService(prisma).exportOrdersExcel({}, admin);
    assert.ok(html.includes("标准票 × 2") && html.includes("住宿票 × 1"));
    assert.ok(html.includes("<td>账号本人</td>"));
    assert.ok(html.includes("<td>10000.00</td><td>500.00</td><td>9500.00</td>"));
    assert.ok(!html.includes("已改名"));
  });

  it("uses the same SKU/recycle filters and refuses silently truncated exports", async () => {
    let query: any;
    let audited = false;
    const prisma = {
      order: { findMany: async (args: unknown) => { query = args; return Array(5001).fill({}); } },
      auditLog: { create: async () => { audited = true; } }
    } as unknown as PrismaService;
    await assert.rejects(() => new AdminExportsService(prisma).exportOrdersExcel({ skuId: "sku", deleted: true }, admin), /5000/);
    assert.deepEqual(query.where, parseAdminOrderWhere({ skuId: "sku", deleted: true }));
    assert.equal(query.take, 5001);
    assert.equal(audited, false);
  });
});

function recycleFixture(override: Record<string, unknown> = {}) {
  const order = { id: "1", orderNo: "QA-1", status: OrderStatus.PAID, adminDeletedAt: null, refunds: [], ...override };
  const writes: any[] = [], audits: any[] = [];
  const tx = {
    order: {
      findMany: async () => [order], findUnique: async () => order,
      updateMany: async (args: any) => { writes.push(args); return { count: args.where.id.in.length }; },
      update: async (args: any) => { writes.push(args); return order; }
    },
    auditLog: { create: async (args: unknown) => { audits.push(args); return {}; } }
  };
  const prisma = { $transaction: async (fn: Function, options: unknown) => {
    assert.deepEqual(options, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); return fn(tx);
  } } as unknown as PrismaService;
  return { service: new AdminManagementService(prisma), writes, audits };
}
