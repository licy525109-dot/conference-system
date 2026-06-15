import { Injectable } from "@nestjs/common";
import { AuditAction, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [paid, discounts, paidOrders, pendingOrders, registrationCount, conferenceRows] = await this.prisma.$transaction([
      this.prisma.order.aggregate({ where: { status: OrderStatus.PAID }, _sum: { paidAmountCent: true, payableAmountCent: true } }),
      this.prisma.order.aggregate({ _sum: { discountAmountCent: true } }),
      this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
      this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
      this.prisma.registration.count(),
      this.prisma.conference.findMany({
        orderBy: [{ createdAt: "desc" }],
        take: 20,
        select: {
          id: true,
          title: true,
          orders: { where: { status: OrderStatus.PAID }, select: { paidAmountCent: true, payableAmountCent: true, discountAmountCent: true } },
          _count: { select: { registrations: true } }
        }
      })
    ]);
    const paidAmountCent = paid._sum.paidAmountCent ?? paid._sum.payableAmountCent ?? 0;
    const discountAmountCent = discounts._sum.discountAmountCent ?? 0;
    return ok({
      cards: {
        totalRevenueCent: paidAmountCent,
        paidAmountCent,
        discountAmountCent,
        refundAmountCent: 0,
        netRevenueCent: paidAmountCent,
        paidOrders,
        pendingOrders,
        registrationCount
      },
      conferences: conferenceRows.map((conference) => ({
        id: conference.id,
        title: conference.title,
        revenueCent: conference.orders.reduce((sum, order) => sum + (order.paidAmountCent ?? order.payableAmountCent), 0),
        discountAmountCent: conference.orders.reduce((sum, order) => sum + order.discountAmountCent, 0),
        paidOrderCount: conference.orders.length,
        registrationCount: conference._count.registrations
      }))
    });
  }

  async listPayments(query: Record<string, unknown>) {
    const page = readOptionalInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const status = readOptionalString(query, "status") as PaymentStatus | undefined;
    const where: Prisma.PaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { outTradeNo: { contains: keyword, mode: "insensitive" } },
              { transactionId: { contains: keyword, mode: "insensitive" } },
              { order: { orderNo: { contains: keyword, mode: "insensitive" } } }
            ]
          }
        : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { order: { include: { conference: true } } }
      }),
      this.prisma.payment.count({ where })
    ]);
    return ok({ items: items.map(formatPayment), total, page, pageSize });
  }

  async listBatches() {
    const items = await this.prisma.financeReconciliationBatch.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: { items: true }
    });
    return ok({ items: items.map(formatBatch) });
  }

  async createBatch(admin: CurrentAdmin) {
    const payments = await this.prisma.payment.findMany({
      include: { order: true },
      orderBy: { createdAt: "desc" },
      take: 1000
    });
    const differences = payments.flatMap((payment) => {
      const items: Array<Prisma.FinanceReconciliationItemCreateWithoutBatchInput> = [];
      if (payment.status === PaymentStatus.SUCCESS && payment.order.status !== OrderStatus.PAID) {
        items.push({
          orderNo: payment.order.orderNo,
          outTradeNo: payment.outTradeNo,
          transactionId: payment.transactionId,
          localAmountCent: payment.amountCent,
          type: "PAYMENT_SUCCESS_ORDER_NOT_PAID",
          detailJson: { paymentStatus: payment.status, orderStatus: payment.order.status }
        });
      }
      if (payment.status === PaymentStatus.SUCCESS && payment.amountCent !== payment.order.payableAmountCent) {
        items.push({
          orderNo: payment.order.orderNo,
          outTradeNo: payment.outTradeNo,
          transactionId: payment.transactionId,
          localAmountCent: payment.order.payableAmountCent,
          remoteAmountCent: payment.amountCent,
          type: "AMOUNT_MISMATCH",
          detailJson: { paymentAmountCent: payment.amountCent, payableAmountCent: payment.order.payableAmountCent }
        });
      }
      if (payment.status === PaymentStatus.SUCCESS && !payment.transactionId) {
        items.push({
          orderNo: payment.order.orderNo,
          outTradeNo: payment.outTradeNo,
          localAmountCent: payment.amountCent,
          type: "MISSING_TRANSACTION_ID",
          detailJson: { paymentStatus: payment.status }
        });
      }
      return items;
    });
    const batch = await this.prisma.financeReconciliationBatch.create({
      data: {
        batchNo: `FIN${Date.now()}`,
        status: "FINISHED",
        source: "LOCAL",
        startedAt: new Date(),
        finishedAt: new Date(),
        createdBy: admin.id,
        summaryJson: {
          checkedPayments: payments.length,
          differenceCount: differences.length
        },
        items: { create: differences }
      },
      include: { items: true }
    });
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.CREATE, entityType: "FinanceReconciliationBatch", entityId: batch.id, summary: "Create finance reconciliation batch", metadataJson: { differenceCount: differences.length } } });
    return ok(formatBatch(batch));
  }

  async listDifferences() {
    const items = await this.prisma.financeReconciliationItem.findMany({
      where: { status: "OPEN" },
      orderBy: [{ createdAt: "desc" }],
      include: { batch: true }
    });
    return ok({ items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(), batchNo: item.batch.batchNo })) });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatPayment(payment: Prisma.PaymentGetPayload<{ include: { order: { include: { conference: true } } } }>) {
  return {
    id: payment.id,
    provider: payment.provider,
    status: payment.status,
    outTradeNo: payment.outTradeNo,
    transactionId: payment.transactionId,
    amountCent: payment.amountCent,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    orderNo: payment.order.orderNo,
    orderStatus: payment.order.status,
    conferenceTitle: payment.order.conference.title
  };
}

function formatBatch(batch: Prisma.FinanceReconciliationBatchGetPayload<{ include: { items: true } }>) {
  return {
    ...batch,
    startedAt: batch.startedAt?.toISOString() ?? null,
    finishedAt: batch.finishedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    updatedAt: batch.updatedAt.toISOString(),
    differenceCount: batch.items.length
  };
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}
