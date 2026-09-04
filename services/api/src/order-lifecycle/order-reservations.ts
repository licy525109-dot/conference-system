import { ConflictException } from "@nestjs/common";
import { CouponRedemptionStatus, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";

export interface RegistrationReservationOrder {
  id: string;
  orderNo: string;
  inventoryReservedAt: Date | null;
  items: Array<{ skuId: string; quantity: number }>;
}

export interface MallReservationOrder {
  id: string;
  orderNo: string;
  items: Array<{ skuId: string; quantity: number }>;
}

export async function closePendingRegistrationOrder(
  tx: Prisma.TransactionClient,
  order: RegistrationReservationOrder,
  now: Date,
  failedReason: string
): Promise<boolean> {
  const claimed = await tx.order.updateMany({
    where: { id: order.id, status: OrderStatus.PENDING },
    data: { status: OrderStatus.CLOSED, closedAt: now }
  });
  if (claimed.count !== 1) return false;

  if (order.inventoryReservedAt) {
    for (const item of order.items) {
      const released = await tx.registrationSku.updateMany({
        where: { id: item.skuId, lockedStock: { gte: item.quantity } },
        data: { lockedStock: { decrement: item.quantity } }
      });
      if (released.count !== 1) {
        throw new ConflictException(`订单 ${order.orderNo} 的报名库存预占不一致`);
      }
    }
    await tx.order.update({
      where: { id: order.id },
      data: { inventoryReservedAt: null }
    });
  }

  await tx.couponRedemption.updateMany({
    where: { orderId: order.id, status: CouponRedemptionStatus.PENDING },
    data: { status: CouponRedemptionStatus.CANCELLED }
  });
  await tx.payment.updateMany({
    where: { orderId: order.id, status: PaymentStatus.PENDING },
    data: { status: PaymentStatus.CLOSED, failedReason }
  });
  return true;
}

export async function closePendingMallOrder(
  tx: Prisma.TransactionClient,
  order: MallReservationOrder,
  now: Date,
  failedReason: string,
  action: string
): Promise<boolean> {
  const claimed = await tx.mallOrder.updateMany({
    where: { id: order.id, status: "PENDING_PAYMENT" },
    data: { status: "CLOSED", closedAt: now }
  });
  if (claimed.count !== 1) return false;

  for (const item of order.items) {
    const sku = await tx.productSku.findUnique({
      where: { id: item.skuId },
      select: { id: true, lockedStock: true, soldCount: true }
    });
    if (!sku || sku.lockedStock < item.quantity) {
      throw new ConflictException(`订单 ${order.orderNo} 的商城库存预占不一致`);
    }
    const released = await tx.productSku.updateMany({
      where: { id: item.skuId, lockedStock: { gte: item.quantity } },
      data: { lockedStock: { decrement: item.quantity } }
    });
    if (released.count !== 1) {
      throw new ConflictException(`订单 ${order.orderNo} 的商城库存正在变化`);
    }
    await tx.mallInventoryLog.create({
      data: {
        skuId: item.skuId,
        orderId: order.id,
        action,
        quantity: item.quantity,
        beforeLockedStock: sku.lockedStock,
        afterLockedStock: sku.lockedStock - item.quantity,
        beforeSoldCount: sku.soldCount,
        afterSoldCount: sku.soldCount,
        remark: failedReason
      }
    });
  }

  await tx.mallCouponRedemption.updateMany({
    where: { mallOrderId: order.id, status: CouponRedemptionStatus.PENDING },
    data: { status: CouponRedemptionStatus.CANCELLED }
  });
  await tx.mallPayment.updateMany({
    where: { mallOrderId: order.id, status: PaymentStatus.PENDING },
    data: { status: PaymentStatus.CLOSED, failedReason }
  });
  return true;
}
