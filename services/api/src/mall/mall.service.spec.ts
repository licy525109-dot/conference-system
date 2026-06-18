import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { AdminMallService } from "../admin/admin-mall.service";
import { CurrentAdmin } from "../admin/current-admin";
import { MallService } from "./mall.service";

const currentUser: CurrentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };
const currentAdmin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };

describe("MallService createOrder", () => {
  it("rejects client-submitted amount fields", async () => {
    const service = new MallService(createMallPrismaMock());

    await assert.rejects(
      () =>
        service.createOrder(
          {
            items: [{ skuId: "sku-1", quantity: 1 }],
            receiverName: "张三",
            receiverPhone: "13800000000",
            receiverAddress: "上海",
            payableAmountCent: 1
          },
          currentUser
        ),
      BadRequestException
    );
  });

  it("creates a pending-payment order from server-side price and locks stock", async () => {
    const prisma = createMallPrismaMock();
    const service = new MallService(prisma);

    const response = await service.createOrder(
      {
        items: [{ skuId: "sku-1", quantity: 2 }],
        receiverName: "张三",
        receiverPhone: "13800000000",
        receiverAddress: "上海"
      },
      currentUser
    );

    assert.equal(response.data.status, "PENDING_PAYMENT");
    assert.equal(response.data.payableAmountCent, 18000);
    assert.equal(response.data.paidAmountCent, null);
    assert.equal(response.data.paymentEnabled, false);
    assert.equal(prisma.skus[0].lockedStock, 3);
    assert.equal(prisma.skus[0].soldCount, 1);
    assert.equal(prisma.inventoryLogs[0].action, "ORDER_LOCK");
    assert.equal(prisma.inventoryLogs[0].quantity, 2);
  });

  it("rejects insufficient available stock after locked stock is considered", async () => {
    const prisma = createMallPrismaMock({ lockedStock: 4, soldCount: 1, stock: 5 });
    const service = new MallService(prisma);

    await assert.rejects(
      () =>
        service.createOrder(
          {
            items: [{ skuId: "sku-1", quantity: 1 }],
            receiverName: "张三",
            receiverPhone: "13800000000",
            receiverAddress: "上海"
          },
          currentUser
        ),
      ConflictException
    );
  });
});

describe("AdminMallService order close", () => {
  it("closes a pending mall order and releases locked stock", async () => {
    const prisma = createMallPrismaMock({ lockedStock: 2, soldCount: 0 });
    await new MallService(prisma).createOrder(
      {
        items: [{ skuId: "sku-1", quantity: 1 }],
        receiverName: "张三",
        receiverPhone: "13800000000",
        receiverAddress: "上海"
      },
      currentUser
    );
    const service = new AdminMallService(prisma);

    const response = await service.closeOrder(prisma.orders[0].id, currentAdmin);

    assert.equal(response.data.status, "CLOSED");
    assert.equal(prisma.skus[0].lockedStock, 2);
    assert.equal(prisma.inventoryLogs.at(-1)?.action, "ORDER_CLOSE");
    assert.equal(prisma.auditLogs[0].action, AuditAction.UPDATE);
  });
});

function createMallPrismaMock(options: { stock?: number; lockedStock?: number; soldCount?: number } = {}) {
  const now = new Date("2026-06-18T10:00:00.000Z");
  const skus: SkuRecord[] = [
    {
      id: "sku-1",
      productId: "product-1",
      name: "标准款",
      priceCent: 9000,
      stock: options.stock ?? 10,
      lockedStock: options.lockedStock ?? 1,
      soldCount: options.soldCount ?? 1,
      status: "ACTIVE",
      specsJson: null,
      createdAt: now,
      updatedAt: now,
      product: {
        id: "product-1",
        title: "会议周边",
        status: "PUBLISHED"
      }
    }
  ];
  const orders: OrderRecord[] = [];
  const inventoryLogs: InventoryLogRecord[] = [];
  const auditLogs: Array<Record<string, unknown>> = [];
  const mock: any = {
    skus,
    orders,
    inventoryLogs,
    auditLogs,
    productSku: {
      findUnique: async ({ where }: { where: { id: string } }) => skus.find((item) => item.id === where.id) ?? null,
      updateMany: async ({ where, data }: { where: { id: string; lockedStock: number; soldCount: number; stock: { gte: number } }; data: { lockedStock: { increment: number } } }) => {
        const sku = skus.find((item) => item.id === where.id);
        if (!sku || sku.lockedStock !== where.lockedStock || sku.soldCount !== where.soldCount || sku.stock < where.stock.gte) return { count: 0 };
        sku.lockedStock += data.lockedStock.increment;
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: { lockedStock: { decrement: number } } }) => {
        const sku = skus.find((item) => item.id === where.id);
        if (!sku) throw new Error("sku not found");
        sku.lockedStock -= data.lockedStock.decrement;
        return sku;
      }
    },
    mallOrder: {
      create: async ({ data }: { data: MallOrderCreateInput }) => {
        const order: OrderRecord = {
          id: `mall-order-${orders.length + 1}`,
          orderNo: data.orderNo,
          userId: data.userId,
          originAmountCent: data.originAmountCent,
          discountAmountCent: data.discountAmountCent,
          payableAmountCent: data.payableAmountCent,
          paidAmountCent: data.paidAmountCent,
          status: data.status,
          receiverName: data.receiverName,
          receiverPhone: data.receiverPhone,
          receiverAddress: data.receiverAddress,
          remark: data.remark ?? null,
          paidAt: null,
          createdAt: now,
          updatedAt: now,
          user: { id: currentUser.id, nickname: currentUser.nickname, wechatNickname: null, phone: null },
          items: data.items.create.map((item, index) => ({
            id: `mall-order-item-${index + 1}`,
            orderId: `mall-order-${orders.length + 1}`,
            skuId: item.sku.connect.id,
            productTitle: item.productTitle,
            skuName: item.skuName,
            unitPriceCent: item.unitPriceCent,
            quantity: item.quantity,
            totalAmountCent: item.totalAmountCent,
            createdAt: now
          })),
          shipments: [],
          afterSales: [],
          payments: [],
          refunds: []
        };
        orders.push(order);
        for (const log of data.inventoryLogs.create) {
          inventoryLogs.push({ id: `inventory-log-${inventoryLogs.length + 1}`, orderId: order.id, createdAt: now, ...log });
        }
        return order;
      },
      findUnique: async ({ where }: { where: { id: string } }) => orders.find((item) => item.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const order = orders.find((item) => item.id === where.id);
        if (!order) throw new Error("order not found");
        return order;
      },
      update: async ({ where, data }: { where: { id: string }; data: { status: string } }) => {
        const order = orders.find((item) => item.id === where.id);
        if (!order) throw new Error("order not found");
        Object.assign(order, data, { updatedAt: now });
        return order;
      }
    },
    mallInventoryLog: {
      create: async ({ data }: { data: Omit<InventoryLogRecord, "id" | "createdAt"> }) => {
        const log = { id: `inventory-log-${inventoryLogs.length + 1}`, createdAt: now, ...data };
        inventoryLogs.push(log);
        return log;
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async <T>(operation: ((tx: typeof mock) => Promise<T>) | Promise<T>[]) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(mock)
  };
  return mock as typeof mock & PrismaService;
}

interface SkuRecord {
  id: string;
  productId: string;
  name: string;
  priceCent: number;
  stock: number;
  lockedStock: number;
  soldCount: number;
  status: string;
  specsJson: null;
  createdAt: Date;
  updatedAt: Date;
  product: {
    id: string;
    title: string;
    status: string;
  };
}

interface MallOrderCreateInput {
  orderNo: string;
  userId: string;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: null;
  status: string;
  receiverName: string;
  receiverPhone: string;
  receiverAddress: string;
  remark?: string | null;
  items: {
    create: Array<{
      sku: { connect: { id: string } };
      productTitle: string;
      skuName: string;
      unitPriceCent: number;
      quantity: number;
      totalAmountCent: number;
    }>;
  };
  inventoryLogs: {
    create: Array<Omit<InventoryLogRecord, "id" | "orderId" | "createdAt">>;
  };
}

interface OrderRecord {
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
  user: { id: string; nickname: string | null; wechatNickname: string | null; phone: string | null };
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
  shipments: [];
  afterSales: [];
  payments: [];
  refunds: [];
}

interface InventoryLogRecord {
  id: string;
  skuId: string;
  orderId: string | null;
  action: string;
  quantity: number;
  beforeLockedStock: number;
  afterLockedStock: number;
  beforeSoldCount: number;
  afterSoldCount: number;
  remark?: string | null;
  createdAt: Date;
}
