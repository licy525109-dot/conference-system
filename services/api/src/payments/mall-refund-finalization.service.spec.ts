import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { MallRefundFinalizationService } from "./mall-refund-finalization.service";

describe("MallRefundFinalizationService", () => {
  it("finalizes an order when successful partial refunds reach the paid amount", async () => {
    const state = createState([4_000, 6_000]);
    const service = new MallRefundFinalizationService(state.prisma);

    const result = await service.finalizeIfFullyRefunded("mall-order-1");

    assert.deepEqual(result, {
      fullyRefunded: true,
      finalizedNow: true,
      refundedAmountCent: 10_000,
      paidAmountCent: 10_000
    });
    assert.equal(state.status(), "REFUNDED");

    const repeated = await service.finalizeIfFullyRefunded("mall-order-1");
    assert.equal(repeated.finalizedNow, false);
  });

  it("restores the fulfillment state after a partial refund succeeds", async () => {
    const state = createState([4_000], "SHIPPED");
    const service = new MallRefundFinalizationService(state.prisma);

    const result = await service.finalizeIfFullyRefunded("mall-order-1");

    assert.equal(result.fullyRefunded, false);
    assert.equal(state.status(), "SHIPPED");
  });
});

function createState(successfulRefunds: number[], previousOrderStatus = "PAID") {
  let orderStatus = "REFUNDING";
  const tx = {
    mallOrder: {
      findUnique: async () => ({
        id: "mall-order-1",
        orderNo: "SHOP001",
        status: orderStatus,
        paidAmountCent: 10_000,
        payableAmountCent: 10_000
      }),
      updateMany: async ({ data }: { data: { status: string } }) => {
        if (orderStatus === data.status) return { count: 0 };
        orderStatus = data.status;
        return { count: 1 };
      }
    },
    mallRefund: {
      aggregate: async () => ({
        _sum: { amountCent: successfulRefunds.reduce((sum, amount) => sum + amount, 0) }
      }),
      findFirst: async () => successfulRefunds.length > 0 ? { previousOrderStatus } : null,
      count: async () => 0
    }
  };
  return {
    prisma: {
      $transaction: async (work: (client: typeof tx) => Promise<unknown>) => work(tx)
    } as unknown as PrismaService,
    status: () => orderStatus
  };
}
