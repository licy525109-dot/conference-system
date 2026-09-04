import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CouponRedemptionStatus, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { closePendingMallOrder, closePendingRegistrationOrder } from "./order-reservations";

const now = new Date("2026-09-04T08:00:00.000Z");

describe("order reservation release", () => {
  it("closes a registration order and releases stock, coupon and payment once", async () => {
    const state = {
      status: OrderStatus.PENDING,
      lockedStock: 2,
      couponStatus: CouponRedemptionStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      inventoryReservedAt: now
    };
    const tx = registrationTx(state);
    const order = { id: "order-1", orderNo: "ORDER001", inventoryReservedAt: now, items: [{ skuId: "sku-1", quantity: 2 }] };

    assert.equal(await closePendingRegistrationOrder(tx, order, now, "expired"), true);
    assert.equal(await closePendingRegistrationOrder(tx, order, now, "expired"), false);
    assert.equal(state.status, OrderStatus.CLOSED);
    assert.equal(state.lockedStock, 0);
    assert.equal(state.couponStatus, CouponRedemptionStatus.CANCELLED);
    assert.equal(state.paymentStatus, PaymentStatus.CLOSED);
    assert.equal(state.inventoryReservedAt, null);
  });

  it("closes a mall order and writes an inventory release ledger once", async () => {
    const state = {
      status: "PENDING_PAYMENT",
      lockedStock: 3,
      soldCount: 4,
      couponStatus: CouponRedemptionStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      inventoryLogs: [] as Array<Record<string, unknown>>
    };
    const tx = mallTx(state);
    const order = { id: "mall-order-1", orderNo: "SHOP001", items: [{ skuId: "product-sku-1", quantity: 3 }] };

    assert.equal(await closePendingMallOrder(tx, order, now, "expired", "ORDER_EXPIRED"), true);
    assert.equal(await closePendingMallOrder(tx, order, now, "expired", "ORDER_EXPIRED"), false);
    assert.equal(state.status, "CLOSED");
    assert.equal(state.lockedStock, 0);
    assert.equal(state.couponStatus, CouponRedemptionStatus.CANCELLED);
    assert.equal(state.paymentStatus, PaymentStatus.CLOSED);
    assert.equal(state.inventoryLogs.length, 1);
    assert.equal(state.inventoryLogs[0]?.action, "ORDER_EXPIRED");
  });
});

function registrationTx(state: {
  status: OrderStatus;
  lockedStock: number;
  couponStatus: CouponRedemptionStatus;
  paymentStatus: PaymentStatus;
  inventoryReservedAt: Date | null;
}): Prisma.TransactionClient {
  return {
    order: {
      updateMany: async ({ where, data }: any) => {
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      },
      update: async ({ data }: any) => {
        state.inventoryReservedAt = data.inventoryReservedAt;
        return {};
      }
    },
    registrationSku: {
      updateMany: async ({ where, data }: any) => {
        if (state.lockedStock < where.lockedStock.gte) return { count: 0 };
        state.lockedStock -= data.lockedStock.decrement;
        return { count: 1 };
      }
    },
    couponRedemption: {
      updateMany: async ({ where, data }: any) => {
        if (state.couponStatus === where.status) state.couponStatus = data.status;
        return { count: 1 };
      }
    },
    payment: {
      updateMany: async ({ where, data }: any) => {
        if (state.paymentStatus === where.status) state.paymentStatus = data.status;
        return { count: 1 };
      }
    }
  } as unknown as Prisma.TransactionClient;
}

function mallTx(state: {
  status: string;
  lockedStock: number;
  soldCount: number;
  couponStatus: CouponRedemptionStatus;
  paymentStatus: PaymentStatus;
  inventoryLogs: Array<Record<string, unknown>>;
}): Prisma.TransactionClient {
  return {
    mallOrder: {
      updateMany: async ({ where, data }: any) => {
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      }
    },
    productSku: {
      findUnique: async () => ({ id: "product-sku-1", lockedStock: state.lockedStock, soldCount: state.soldCount }),
      updateMany: async ({ where, data }: any) => {
        if (state.lockedStock < where.lockedStock.gte) return { count: 0 };
        state.lockedStock -= data.lockedStock.decrement;
        return { count: 1 };
      }
    },
    mallInventoryLog: {
      create: async ({ data }: any) => {
        state.inventoryLogs.push(data);
        return data;
      }
    },
    mallCouponRedemption: {
      updateMany: async ({ where, data }: any) => {
        if (state.couponStatus === where.status) state.couponStatus = data.status;
        return { count: 1 };
      }
    },
    mallPayment: {
      updateMany: async ({ where, data }: any) => {
        if (state.paymentStatus === where.status) state.paymentStatus = data.status;
        return { count: 1 };
      }
    }
  } as unknown as Prisma.TransactionClient;
}
