import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RefundStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminMallService } from "./admin-mall.service";
import { CurrentAdmin } from "./current-admin";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };

describe("AdminMallService refund handoff", () => {
  it("routes an approved after-sale refund through the unified finance refund provider", async () => {
    const refunds: Array<Record<string, any>> = [];
    const auditLogs: Array<Record<string, any>> = [];
    const now = new Date("2026-09-04T08:00:00.000Z");
    const afterSale = {
      id: "after-sale-1",
      orderId: "mall-order-1",
      type: "REFUND",
      status: "APPROVED",
      previousOrderStatus: "SHIPPED",
      reason: "无法参加",
      note: null,
      attachmentsJson: null,
      handledAt: now,
      createdAt: now,
      updatedAt: now,
      order: {
        id: "mall-order-1",
        orderNo: "SHOP001",
        status: "REFUNDING",
        paidAmountCent: 12000,
        receiverName: "张三",
        receiverPhone: "13800000000",
        refunds
      },
      refunds
    };
    const prisma: any = {
      mallAfterSale: {
        findUnique: async () => afterSale,
        findUniqueOrThrow: async () => afterSale
      },
      mallRefund: {
        create: async ({ data }: any) => {
          const refund = {
            id: "mall-refund-1",
            status: RefundStatus.REQUESTED,
            requestedAt: now,
            approvedAt: null,
            processedAt: null,
            createdAt: now,
            updatedAt: now,
            ...data
          };
          refunds.unshift(refund);
          return refund;
        }
      },
      auditLog: {
        create: async ({ data }: any) => {
          auditLogs.push(data);
          return data;
        }
      },
      $transaction: async (operation: (tx: any) => Promise<unknown>) => operation(prisma)
    };
    const approvedRefundIds: string[] = [];
    const finance = {
      approveRefund: async (id: string) => {
        approvedRefundIds.push(id);
        Object.assign(refunds[0], { status: RefundStatus.PROCESSING });
        afterSale.status = "PROCESSING";
        return { code: "OK", message: "ok", data: refunds[0] };
      }
    };
    const service = new AdminMallService(
      prisma as PrismaService,
      finance as unknown as AdminFinanceService
    );

    const result = await service.processAfterSaleRefund(afterSale.id, admin);

    assert.deepEqual(approvedRefundIds, ["mall-refund-1"]);
    assert.equal(result.data.status, "PROCESSING");
    assert.equal(refunds[0]?.outRefundNo, "MALL_REFUND_SHOP001");
    assert.equal(refunds[0]?.previousOrderStatus, "SHIPPED");
    assert.equal(auditLogs.length, 1);
  });
});
