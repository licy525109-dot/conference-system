import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, CouponRedemptionStatus, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface MallPaymentCompletionInput {
  provider: PaymentProvider;
  outTradeNo: string;
  transactionId?: string | null;
  paidAmountCent: number;
  paidAt: Date;
  rawSummary?: Record<string, unknown>;
}

@Injectable()
export class MallPaymentCompletionService {
  constructor(private readonly prisma: PrismaService) {}

  async completePayment(input: MallPaymentCompletionInput) {
    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.mallPayment.findUnique({
        where: { outTradeNo: input.outTradeNo },
        include: { order: { include: { items: true } } }
      });
      if (!payment) throw new NotFoundException("Mall payment out_trade_no not found");
      if (input.paidAmountCent !== payment.order.payableAmountCent) throw new ConflictException("Mall payment amount does not match order payable amount");

      if (payment.status === PaymentStatus.SUCCESS) {
        await tx.mallPayment.update({
          where: { id: payment.id },
          data: buildPaymentCompletionData(input)
        });
        await markMallCouponUsed(tx, payment.mallOrderId, input.paidAt);
        return payment.order;
      }

      if (payment.order.status !== "PENDING_PAYMENT") throw new ConflictException("Only pending mall orders can be marked paid");

      await tx.mallPayment.update({
        where: { id: payment.id },
        data: buildPaymentCompletionData(input)
      });

      const paidOrder = await tx.mallOrder.update({
        where: { id: payment.mallOrderId },
        data: {
          status: "PAID",
          paidAmountCent: input.paidAmountCent,
          paidAt: input.paidAt
        },
        include: { items: true }
      });
      await markMallCouponUsed(tx, paidOrder.id, input.paidAt);

      for (const item of paidOrder.items) {
        await convertLockedStockToSold(tx, item.skuId, item.quantity, paidOrder.id);
      }

      await tx.auditLog.create({
        data: {
          action: AuditAction.SYSTEM,
          entityType: "MallOrder",
          entityId: paidOrder.id,
          summary: "Mall payment success",
          metadataJson: {
            orderNo: paidOrder.orderNo,
            outTradeNo: input.outTradeNo,
            provider: input.provider,
            paidAmountCent: input.paidAmountCent
          }
        }
      });

      return paidOrder;
    });

    return {
      orderId: result.id,
      orderNo: result.orderNo,
      orderStatus: result.status,
      paidAmountCent: result.paidAmountCent,
      paidAt: result.paidAt?.toISOString() ?? null,
      paymentStatus: PaymentStatus.SUCCESS
    };
  }
}

async function markMallCouponUsed(tx: Prisma.TransactionClient, mallOrderId: string, usedAt: Date) {
  const mallCouponRedemption = (tx as unknown as {
    mallCouponRedemption?: {
      updateMany: (args: {
        where: { mallOrderId: string; status: CouponRedemptionStatus };
        data: { status: CouponRedemptionStatus; usedAt: Date };
      }) => Promise<unknown>;
    };
  }).mallCouponRedemption;
  if (!mallCouponRedemption) return;
  await mallCouponRedemption.updateMany({
    where: { mallOrderId, status: CouponRedemptionStatus.PENDING },
    data: { status: CouponRedemptionStatus.USED, usedAt }
  });
}

function buildPaymentCompletionData(input: MallPaymentCompletionInput): Prisma.MallPaymentUpdateInput {
  return {
    provider: input.provider,
    status: PaymentStatus.SUCCESS,
    transactionId: input.transactionId ?? undefined,
    amountCent: input.paidAmountCent,
    paidAt: input.paidAt,
    notifyRawId: readRawId(input.rawSummary),
    failedReason: null
  };
}

function readRawId(value: Record<string, unknown> | undefined): string | undefined {
  return typeof value?.id === "string" ? value.id : undefined;
}

async function convertLockedStockToSold(tx: Prisma.TransactionClient, skuId: string, quantity: number, orderId: string) {
  const sku = await tx.productSku.findUnique({ where: { id: skuId } });
  if (!sku) throw new NotFoundException("Product SKU not found");
  if (sku.lockedStock < quantity) throw new ConflictException("Mall order locked stock is insufficient for payment success");

  const updated = await tx.productSku.updateMany({
    where: { id: skuId, lockedStock: { gte: quantity } },
    data: {
      lockedStock: { decrement: quantity },
      soldCount: { increment: quantity }
    }
  });
  if (updated.count !== 1) throw new ConflictException("Mall inventory is changing, please retry");

  await tx.mallInventoryLog.create({
    data: {
      skuId,
      orderId,
      action: "PAYMENT_SUCCESS",
      quantity,
      beforeLockedStock: sku.lockedStock,
      afterLockedStock: sku.lockedStock - quantity,
      beforeSoldCount: sku.soldCount,
      afterSoldCount: sku.soldCount + quantity,
      remark: "商城支付成功，锁定库存转为已售库存"
    }
  });
}
