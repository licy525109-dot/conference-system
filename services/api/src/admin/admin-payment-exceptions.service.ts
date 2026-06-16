import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

export interface PaymentExceptionItem {
  code: string;
  level: "warning" | "danger";
  message: string;
}

const OVERDUE_MINUTES = 30;

const paymentExceptionOrderSelect = {
  id: true,
  orderNo: true,
  status: true,
  payableAmountCent: true,
  paidAmountCent: true,
  expiredAt: true,
  paidAt: true,
  createdAt: true,
  payments: {
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      amountCent: true,
      failedReason: true,
      createdAt: true,
      paidAt: true
    }
  },
  registration: {
    select: {
      id: true,
      registrationNo: true,
      status: true
    }
  }
} satisfies Prisma.OrderSelect;

@Injectable()
export class AdminPaymentExceptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Record<string, unknown>) {
    const now = new Date();
    const conferenceId = readOptionalString(query, "conferenceId");
    const keyword = readOptionalString(query, "keyword");
    const orders = await this.prisma.order.findMany({
      where: {
        ...(conferenceId ? { conferenceId } : {}),
        ...(keyword
          ? {
              OR: [
                { orderNo: { contains: keyword, mode: "insensitive" } },
                { attendeeName: { contains: keyword, mode: "insensitive" } },
                { phone: { contains: keyword, mode: "insensitive" } },
                { payments: { some: { outTradeNo: { contains: keyword, mode: "insensitive" } } } },
                { payments: { some: { transactionId: { contains: keyword, mode: "insensitive" } } } }
              ]
            }
          : {})
      },
      orderBy: [{ createdAt: "desc" }],
      take: 300,
      select: {
        ...paymentExceptionOrderSelect,
        conference: { select: { title: true } },
        attendeeName: true,
        phone: true
      }
    });

    const items = orders
      .map((order) => ({
        orderNo: order.orderNo,
        conferenceTitle: order.conference.title,
        attendeeName: order.attendeeName,
        phone: order.phone,
        status: order.status,
        paidAmountCent: order.paidAmountCent,
        payableAmountCent: order.payableAmountCent,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        exceptions: detectPaymentExceptions(order, now)
      }))
      .filter((order) => order.exceptions.length > 0);

    return ok({ items, total: items.length });
  }

  async getOrderExceptions(orderNo: string) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      select: paymentExceptionOrderSelect
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return detectPaymentExceptions(order, new Date());
  }

  async review(orderNo: string, input: unknown, admin: CurrentAdmin) {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      select: paymentExceptionOrderSelect
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }

    const note = readRequiredNote(input);
    const exceptions = detectPaymentExceptions(order, new Date());
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action: AuditAction.UPDATE,
        entityType: "PaymentException",
        entityId: order.id,
        summary: `Review payment exception for order ${order.orderNo}`,
        metadataJson: {
          orderNo: order.orderNo,
          note,
          exceptionCodes: exceptions.map((item) => item.code)
        }
      }
    });

    return ok({
      orderNo: order.orderNo,
      note,
      exceptions
    });
  }
}

export function detectPaymentExceptions(
  order: Prisma.OrderGetPayload<{ select: typeof paymentExceptionOrderSelect }>,
  now = new Date()
): PaymentExceptionItem[] {
  const exceptions: PaymentExceptionItem[] = [];
  const latestPayment = order.payments[0] ?? null;
  const successfulPayments = order.payments.filter((payment) => payment.status === PaymentStatus.SUCCESS);
  const pendingAgeMinutes = minutesBetween(order.createdAt, now);
  const latestPaymentAgeMinutes = latestPayment ? minutesBetween(latestPayment.createdAt, now) : 0;

  if (order.status === OrderStatus.PENDING && ((order.expiredAt && order.expiredAt < now) || pendingAgeMinutes >= OVERDUE_MINUTES)) {
    exceptions.push({
      code: "ORDER_PENDING_OVERDUE",
      level: "warning",
      message: "订单待支付时间过长，需要确认用户是否仍需报名。"
    });
  }

  if (latestPayment?.status === PaymentStatus.PENDING && latestPaymentAgeMinutes >= OVERDUE_MINUTES) {
    exceptions.push({
      code: "PAYMENT_PENDING_OVERDUE",
      level: "warning",
      message: "支付记录长时间处于处理中，建议人工核对微信商户后台。"
    });
  }

  if (successfulPayments.length > 0 && order.status !== OrderStatus.PAID) {
    exceptions.push({
      code: "PAYMENT_SUCCESS_ORDER_NOT_PAID",
      level: "danger",
      message: "存在成功支付记录，但本地订单不是已支付状态。"
    });
  }

  if (order.status === OrderStatus.PAID && successfulPayments.length === 0 && order.payableAmountCent > 0) {
    exceptions.push({
      code: "ORDER_PAID_WITHOUT_SUCCESS_PAYMENT",
      level: "danger",
      message: "订单已支付，但缺少成功支付流水。"
    });
  }

  if (order.status === OrderStatus.PAID && !order.registration) {
    exceptions.push({
      code: "PAID_ORDER_MISSING_REGISTRATION",
      level: "danger",
      message: "订单已支付，但报名记录缺失。"
    });
  }

  if (order.registration && order.status !== OrderStatus.PAID) {
    exceptions.push({
      code: "REGISTRATION_WITH_UNPAID_ORDER",
      level: "danger",
      message: "报名记录已存在，但订单不是已支付状态。"
    });
  }

  if (successfulPayments.some((payment) => payment.amountCent !== order.payableAmountCent)) {
    exceptions.push({
      code: "PAYMENT_AMOUNT_MISMATCH",
      level: "danger",
      message: "成功支付流水金额与订单应付金额不一致。"
    });
  }

  if (order.paidAmountCent !== null && order.paidAmountCent !== order.payableAmountCent) {
    exceptions.push({
      code: "ORDER_PAID_AMOUNT_MISMATCH",
      level: "danger",
      message: "订单实付金额与应付金额不一致。"
    });
  }

  if (latestPayment?.status === PaymentStatus.FAILED) {
    exceptions.push({
      code: "LATEST_PAYMENT_FAILED",
      level: "warning",
      message: latestPayment.failedReason ? `最近一次支付失败：${latestPayment.failedReason}` : "最近一次支付失败。"
    });
  }

  return exceptions;
}

function minutesBetween(start: Date, end: Date): number {
  return Math.floor((end.getTime() - start.getTime()) / 60_000);
}

function readRequiredNote(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("Request body must be an object");
  }
  const note = (input as { note?: unknown }).note;
  if (typeof note !== "string" || note.trim().length === 0) {
    throw new BadRequestException("note is required");
  }
  return note.trim().slice(0, 1000);
}

function readOptionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok",
    data
  };
}
