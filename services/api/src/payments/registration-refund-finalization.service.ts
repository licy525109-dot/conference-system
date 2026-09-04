import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { CheckInStatus, CouponRedemptionStatus, OrderStatus, Prisma, RefundStatus, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface RegistrationRefundFinalizationResult {
  fullyRefunded: boolean;
  finalizedNow: boolean;
  refundedAmountCent: number;
  paidAmountCent: number;
}

@Injectable()
export class RegistrationRefundFinalizationService {
  private readonly logger = new Logger(RegistrationRefundFinalizationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async finalizeIfFullyRefunded(orderId: string): Promise<RegistrationRefundFinalizationResult> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          orderNo: true,
          skuId: true,
          status: true,
          paidAmountCent: true,
          payableAmountCent: true
        }
      });
      if (!order) throw new NotFoundException("Registration order not found while finalizing refund");

      const paidAmountCent = order.paidAmountCent ?? order.payableAmountCent;
      const aggregate = await tx.refund.aggregate({
        where: { orderId, status: RefundStatus.SUCCESS },
        _sum: { amountCent: true }
      });
      const refundedAmountCent = aggregate._sum.amountCent ?? 0;
      if (refundedAmountCent < paidAmountCent) {
        return { fullyRefunded: false, finalizedNow: false, refundedAmountCent, paidAmountCent };
      }

      if (refundedAmountCent > paidAmountCent) {
        this.logger.error(JSON.stringify({
          event: "registration_refund_overpaid",
          orderId,
          orderNo: order.orderNo,
          paidAmountCent,
          refundedAmountCent
        }));
      }

      const registration = await tx.registration.findUnique({
        where: { orderId },
        select: { id: true }
      });
      if (order.status === OrderStatus.REFUNDED) {
        await markRegistrationRefunded(tx, registration?.id);
        await returnCouponAfterFullRefund(tx, orderId);
        return { fullyRefunded: true, finalizedNow: false, refundedAmountCent, paidAmountCent };
      }
      if (order.status !== OrderStatus.PAID) {
        throw new ConflictException(`Cannot finalize refund from registration order status ${order.status}`);
      }

      const claim = await tx.order.updateMany({
        where: { id: orderId, status: OrderStatus.PAID },
        data: { status: OrderStatus.REFUNDED }
      });
      if (claim.count === 0) {
        return { fullyRefunded: true, finalizedNow: false, refundedAmountCent, paidAmountCent };
      }

      const items = await tx.orderItem.findMany({
        where: { orderId },
        select: { skuId: true, quantity: true }
      });
      const quantityBySku = new Map<string, number>();
      for (const item of items) {
        if (item.quantity > 0) quantityBySku.set(item.skuId, (quantityBySku.get(item.skuId) ?? 0) + item.quantity);
      }
      if (quantityBySku.size === 0 && registration) {
        const attendees = await tx.registrationAttendee.findMany({
          where: { registrationId: registration.id },
          select: { skuId: true }
        });
        for (const attendee of attendees) {
          quantityBySku.set(attendee.skuId, (quantityBySku.get(attendee.skuId) ?? 0) + 1);
        }
      }
      if (quantityBySku.size === 0) {
        quantityBySku.set(order.skuId, 1);
      }
      for (const [skuId, quantity] of quantityBySku) {
        const restored = await tx.registrationSku.updateMany({
          where: { id: skuId, soldCount: { gte: quantity } },
          data: { soldCount: { decrement: quantity } }
        });
        if (restored.count !== 1) {
          throw new ConflictException(`Registration inventory is inconsistent for refunded SKU ${skuId}`);
        }
      }

      await markRegistrationRefunded(tx, registration?.id);
      await returnCouponAfterFullRefund(tx, orderId);

      return { fullyRefunded: true, finalizedNow: true, refundedAmountCent, paidAmountCent };
    });
  }
}

async function returnCouponAfterFullRefund(tx: Prisma.TransactionClient, orderId: string) {
  await tx.couponRedemption.updateMany({
    where: { orderId, status: CouponRedemptionStatus.USED },
    data: { status: CouponRedemptionStatus.CANCELLED, usedAt: null }
  });
}

async function markRegistrationRefunded(tx: Prisma.TransactionClient, registrationId: string | undefined) {
  if (!registrationId) return;
  await tx.registration.update({
    where: { id: registrationId },
    data: { status: RegistrationStatus.REFUNDED }
  });
  await tx.registrationAttendee.updateMany({
    where: { registrationId },
    data: { checkInStatus: CheckInStatus.CANCELLED }
  });
}
