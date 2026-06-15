import { Injectable } from "@nestjs/common";
import { CheckInStatus, OrderStatus, PaymentStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AdminDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(query: { dateFrom?: string; dateTo?: string; conferenceId?: string } = {}) {
    const todayStart = startOfToday();
    const range = readDateRange(query);
    const orderRangeWhere = range ? { createdAt: range } : {};
    const paidRangeWhere = range ? { paidAt: range } : {};
    const conferenceWhere = query.conferenceId ? { conferenceId: query.conferenceId } : {};
    const paidOrderWhere = { status: OrderStatus.PAID, ...conferenceWhere, ...paidRangeWhere } as const;
    const todayPaidOrderWhere = {
      status: OrderStatus.PAID,
      ...conferenceWhere,
      paidAt: { gte: todayStart }
    } as const;
    const orderWhere = { ...conferenceWhere, ...orderRangeWhere };
    const registrationWhere = { ...conferenceWhere, ...(range ? { createdAt: range } : {}) };

    const [
      todayRevenue,
      totalRevenue,
      todayOrders,
      paidOrders,
      pendingOrders,
      todayRegistrations,
      totalRegistrations,
      checkedInCount,
      pendingCheckInCount,
      couponUsedCount,
      discountTotal,
      conferenceRows,
      skuRows,
      recentOrders,
      recentRegistrations,
      successfulPayments,
      paymentAttempts
    ] = await this.prisma.$transaction([
      this.prisma.order.aggregate({ where: todayPaidOrderWhere, _sum: { paidAmountCent: true } }),
      this.prisma.order.aggregate({ where: paidOrderWhere, _sum: { paidAmountCent: true } }),
      this.prisma.order.count({ where: { ...conferenceWhere, createdAt: { gte: todayStart } } }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID, ...conferenceWhere, ...orderRangeWhere } }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING, ...conferenceWhere, ...orderRangeWhere } }),
      this.prisma.registration.count({ where: { ...conferenceWhere, createdAt: { gte: todayStart } } }),
      this.prisma.registration.count({ where: registrationWhere }),
      this.prisma.registrationAttendee.count({ where: { checkInStatus: CheckInStatus.CHECKED_IN } }),
      this.prisma.registrationAttendee.count({ where: { checkInStatus: CheckInStatus.PENDING } }),
      this.prisma.couponRedemption.count({ where: { status: "USED" } }),
      this.prisma.orderDiscount.aggregate({ where: range || query.conferenceId ? { order: orderWhere } : {}, _sum: { amountCent: true } }),
      this.prisma.conference.findMany({
        where: query.conferenceId ? { id: query.conferenceId } : {},
        orderBy: [{ registrations: { _count: "desc" } }, { createdAt: "desc" }],
        take: 5,
        select: {
          id: true,
          title: true,
          _count: {
            select: {
              orders: true,
              registrations: true
            }
          }
        }
      }),
      this.prisma.registrationSku.findMany({
        where: query.conferenceId ? { conferenceId: query.conferenceId } : {},
        orderBy: [{ soldCount: "desc" }, { createdAt: "desc" }],
        take: 8,
        select: {
          id: true,
          name: true,
          stock: true,
          soldCount: true,
          conference: {
            select: {
              title: true
            }
          }
        }
      }),
      this.prisma.order.findMany({
        where: orderWhere,
        orderBy: [{ createdAt: "desc" }],
        take: 8,
        select: {
          orderNo: true,
          attendeeName: true,
          payableAmountCent: true,
          paidAmountCent: true,
          status: true,
          createdAt: true,
          conference: { select: { title: true } }
        }
      }),
      this.prisma.registration.findMany({
        where: registrationWhere,
        orderBy: [{ createdAt: "desc" }],
        take: 8,
        select: {
          registrationNo: true,
          attendeeName: true,
          phone: true,
          paidAmountCent: true,
          createdAt: true,
          conference: { select: { title: true } }
        }
      }),
      this.prisma.payment.count({ where: { status: PaymentStatus.SUCCESS, ...(range || query.conferenceId ? { order: orderWhere } : {}) } }),
      this.prisma.payment.count({ where: range || query.conferenceId ? { order: orderWhere } : {} })
    ]);

    return ok({
      cards: {
        todayRevenueCent: todayRevenue._sum.paidAmountCent ?? 0,
        totalRevenueCent: totalRevenue._sum.paidAmountCent ?? 0,
        todayOrders,
        paidOrders,
        pendingOrders,
        todayRegistrations,
        totalRegistrations,
        checkedInCount,
        pendingCheckInCount,
        couponUsedCount,
        discountAmountCent: discountTotal._sum.amountCent ?? 0,
        paymentSuccessRate: paymentAttempts > 0 ? successfulPayments / paymentAttempts : null,
        registrationConversionRate: paidOrders > 0 ? totalRegistrations / paidOrders : null
      },
      hotConferences: conferenceRows.map((conference) => ({
        id: conference.id,
        title: conference.title,
        orderCount: conference._count.orders,
        registrationCount: conference._count.registrations
      })),
      hotSkus: skuRows.map((sku) => ({
        id: sku.id,
        name: sku.name,
        conferenceTitle: sku.conference.title,
        stock: sku.stock,
        soldCount: sku.soldCount,
        remainingStock: Math.max(0, sku.stock - sku.soldCount)
      })),
      inventoryAlerts: skuRows
        .filter((sku) => sku.stock - sku.soldCount <= 10)
        .map((sku) => ({
          id: sku.id,
          name: sku.name,
          conferenceTitle: sku.conference.title,
          remainingStock: Math.max(0, sku.stock - sku.soldCount)
        })),
      recentOrders: recentOrders.map((order) => ({
        ...order,
        conferenceTitle: order.conference.title,
        createdAt: order.createdAt.toISOString()
      })),
      recentRegistrations: recentRegistrations.map((registration) => ({
        ...registration,
        conferenceTitle: registration.conference.title,
        createdAt: registration.createdAt.toISOString()
      }))
    });
  }
}

function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok",
    data
  };
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function readDateRange(query: { dateFrom?: string; dateTo?: string }): { gte?: Date; lte?: Date } | undefined {
  const range: { gte?: Date; lte?: Date } = {};
  if (query.dateFrom) {
    const date = new Date(query.dateFrom);
    if (!Number.isNaN(date.getTime())) {
      range.gte = date;
    }
  }
  if (query.dateTo) {
    const date = new Date(query.dateTo);
    if (!Number.isNaN(date.getTime())) {
      range.lte = date;
    }
  }
  return range.gte || range.lte ? range : undefined;
}
