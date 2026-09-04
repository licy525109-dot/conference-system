import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { OrderLifecycleService } from "./order-lifecycle.service";

const originalWechatPayMode = process.env.WECHAT_PAY_MODE;

afterEach(() => {
  if (typeof originalWechatPayMode === "undefined") delete process.env.WECHAT_PAY_MODE;
  else process.env.WECHAT_PAY_MODE = originalWechatPayMode;
});

describe("OrderLifecycleService WeChat reconciliation", () => {
  it("fulfills a provider-paid registration order instead of closing it", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    const prisma = createPrisma({ registration: [registrationOrder()] });
    let completedOrderNo = "";
    const service = new OrderLifecycleService(
      prisma as never,
      createWechatClient({ tradeState: "SUCCESS", amountTotal: 8800, transactionId: "wx-1" }) as never,
      { processPaymentSuccess: async (input: { orderNo: string }) => { completedOrderNo = input.orderNo; } } as never,
      { completePayment: async () => undefined } as never
    );

    const result = await service.closeExpiredOrders(new Date("2026-09-04T12:00:00Z"));

    assert.equal(completedOrderNo, "REG001");
    assert.deepEqual(result, { registration: 0, mall: 0 });
    assert.equal(prisma.localCloseCount, 0);
  });

  it("closes the provider order before releasing local registration inventory", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    const prisma = createPrisma({ registration: [registrationOrder()] });
    let providerClosed = false;
    const service = new OrderLifecycleService(
      prisma as never,
      createWechatClient({ tradeState: "NOTPAY" }, () => { providerClosed = true; }) as never,
      { processPaymentSuccess: async () => undefined } as never,
      { completePayment: async () => undefined } as never
    );

    const result = await service.closeExpiredOrders(new Date("2026-09-04T12:00:00Z"));

    assert.equal(providerClosed, true);
    assert.equal(prisma.localCloseCount, 1);
    assert.deepEqual(result, { registration: 1, mall: 0 });
  });

  it("keeps inventory reserved when provider reconciliation fails", async () => {
    process.env.WECHAT_PAY_MODE = "real";
    const prisma = createPrisma({ registration: [registrationOrder()] });
    const client = {
      queryByOutTradeNo: async () => { throw new Error("provider unavailable"); },
      closeByOutTradeNo: async () => undefined
    };
    const service = new OrderLifecycleService(
      prisma as never,
      client as never,
      { processPaymentSuccess: async () => undefined } as never,
      { completePayment: async () => undefined } as never
    );

    const result = await service.closeExpiredOrders(new Date("2026-09-04T12:00:00Z"));

    assert.equal(prisma.localCloseCount, 0);
    assert.deepEqual(result, { registration: 0, mall: 0 });
  });
});

function registrationOrder() {
  return {
    id: "order-1",
    orderNo: "REG001",
    inventoryReservedAt: null,
    items: [{ skuId: "sku-1", quantity: 1 }],
    payments: [{ outTradeNo: "REG001" }]
  };
}

function createWechatClient(
  result: { tradeState: string; amountTotal?: number; transactionId?: string },
  onClose: () => void = () => undefined
) {
  return {
    queryByOutTradeNo: async () => ({
      outTradeNo: "REG001",
      transactionId: result.transactionId ?? null,
      tradeState: result.tradeState,
      amountTotal: result.amountTotal ?? null,
      successTime: new Date("2026-09-04T11:59:00Z")
    }),
    closeByOutTradeNo: async () => { onClose(); }
  };
}

function createPrisma(input: { registration?: unknown[]; mall?: unknown[] }) {
  const state = {
    localCloseCount: 0,
    order: {
      findMany: async () => input.registration ?? []
    },
    mallOrder: {
      findMany: async () => input.mall ?? []
    },
    $transaction: async (operation: (tx: unknown) => Promise<boolean>) => operation({
      order: {
        updateMany: async () => {
          state.localCloseCount += 1;
          return { count: 1 };
        },
        update: async () => ({})
      },
      registrationSku: { updateMany: async () => ({ count: 1 }) },
      couponRedemption: { updateMany: async () => ({ count: 1 }) },
      payment: { updateMany: async () => ({ count: 1 }) },
      mallOrder: { updateMany: async () => ({ count: 1 }) },
      productSku: { findUnique: async () => null, updateMany: async () => ({ count: 1 }) },
      mallInventoryLog: { create: async () => ({}) },
      mallCouponRedemption: { updateMany: async () => ({ count: 1 }) },
      mallPayment: { updateMany: async () => ({ count: 1 }) }
    })
  };
  return state;
}
