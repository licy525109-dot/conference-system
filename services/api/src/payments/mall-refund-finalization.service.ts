import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { RefundStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface MallRefundFinalizationResult {
  fullyRefunded: boolean;
  finalizedNow: boolean;
  refundedAmountCent: number;
  paidAmountCent: number;
}

const REFUNDABLE_ORDER_STATUSES = ["PAID", "SHIPPED", "COMPLETED", "REFUNDING"];

@Injectable()
export class MallRefundFinalizationService {
  private readonly logger = new Logger(MallRefundFinalizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async finalizeIfFullyRefunded(mallOrderId: string): Promise<MallRefundFinalizationResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.mallOrder.findUnique({
        where: { id: mallOrderId },
        select: {
          id: true,
          orderNo: true,
          status: true,
          paidAmountCent: true,
          payableAmountCent: true
        }
      });
      if (!order) throw new NotFoundException("Mall order not found while finalizing refund");

      const paidAmountCent = order.paidAmountCent ?? order.payableAmountCent;
      const [aggregate, latestSuccessfulRefund, activeRefundCount] = await Promise.all([
        tx.mallRefund.aggregate({
          where: { mallOrderId, status: RefundStatus.SUCCESS },
          _sum: { amountCent: true }
        }),
        tx.mallRefund.findFirst({
          where: { mallOrderId, status: RefundStatus.SUCCESS },
          orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
          select: { previousOrderStatus: true }
        }),
        tx.mallRefund.count({
          where: { mallOrderId, status: { in: [RefundStatus.REQUESTED, RefundStatus.APPROVED, RefundStatus.PROCESSING] } }
        })
      ]);
      const refundedAmountCent = aggregate._sum.amountCent ?? 0;
      if (refundedAmountCent < paidAmountCent) {
        if (order.status === "REFUNDING" && activeRefundCount === 0) {
          await tx.mallOrder.updateMany({
            where: { id: mallOrderId, status: "REFUNDING" },
            data: { status: restoreMallOrderStatus(latestSuccessfulRefund?.previousOrderStatus) }
          });
        }
        return { fullyRefunded: false, finalizedNow: false, refundedAmountCent, paidAmountCent };
      }

      if (refundedAmountCent > paidAmountCent) {
        this.logger.error(JSON.stringify({
          event: "mall_refund_overpaid",
          mallOrderId,
          orderNo: order.orderNo,
          paidAmountCent,
          refundedAmountCent
        }));
      }

      if (order.status === "REFUNDED") {
        return { fullyRefunded: true, finalizedNow: false, refundedAmountCent, paidAmountCent };
      }
      if (!REFUNDABLE_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictException(`Cannot finalize refund from mall order status ${order.status}`);
      }

      const claim = await tx.mallOrder.updateMany({
        where: { id: mallOrderId, status: { in: REFUNDABLE_ORDER_STATUSES } },
        data: { status: "REFUNDED" }
      });
      return {
        fullyRefunded: true,
        finalizedNow: claim.count === 1,
        refundedAmountCent,
        paidAmountCent
      };
    });
  }
}

function restoreMallOrderStatus(status: string | null | undefined): "PAID" | "SHIPPED" | "COMPLETED" {
  if (status === "SHIPPED" || status === "COMPLETED") return status;
  return "PAID";
}
