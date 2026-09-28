import { BadRequestException } from "@nestjs/common";
import { OrderStatus, PaymentStatus, Prisma } from "@prisma/client";
import { detectPaymentExceptions, paymentExceptionOrderSelect } from "./admin-payment-exceptions.service";

export function parseAdminOrderWhere(query: Record<string, unknown>): Prisma.OrderWhereInput {
  const text = (key: string) => typeof query[key] === "string" ? query[key].trim() : "";
  const status = text("status");
  const paymentStatus = text("paymentStatus");
  if (status && !Object.values(OrderStatus).includes(status as OrderStatus)) throw new BadRequestException("订单状态无效");
  if (paymentStatus && !Object.values(PaymentStatus).includes(paymentStatus as PaymentStatus)) throw new BadRequestException("支付状态无效");
  const criteria: Prisma.OrderWhereInput[] = [{ adminDeletedAt: query.deleted === true || query.deleted === "true" ? { not: null } : null }];
  if (text("conferenceId")) criteria.push({ conferenceId: text("conferenceId") });
  if (status) criteria.push({ status: status as OrderStatus });
  if (paymentStatus) criteria.push({ payments: { some: { status: paymentStatus as PaymentStatus } } });
  if (text("skuId")) criteria.push({ OR: [
    { items: { some: { skuId: text("skuId") } } },
    { items: { none: {} }, skuId: text("skuId") }
  ] });
  const keyword = text("keyword");
  if (keyword) criteria.push({ OR: [
    { orderNo: { contains: keyword, mode: "insensitive" } },
    { attendeeName: { contains: keyword, mode: "insensitive" } },
    { phone: { contains: keyword, mode: "insensitive" } },
    { user: { realName: { contains: keyword, mode: "insensitive" } } },
    { user: { nickname: { contains: keyword, mode: "insensitive" } } },
    { payments: { some: { outTradeNo: { contains: keyword, mode: "insensitive" } } } },
    { payments: { some: { transactionId: { contains: keyword, mode: "insensitive" } } } }
  ] });
  return { AND: criteria };
}

// Share the same scope across pagination, totals, exports and bulk close.
export async function resolveAdminOrderWhere(client: Pick<Prisma.TransactionClient, "order">, query: Record<string, unknown>) {
  const where = parseAdminOrderWhere(query);
  if (query.onlyExceptions !== true && query.onlyExceptions !== "true") return where;
  const rows = await client.order.findMany({ where, select: paymentExceptionOrderSelect });
  const now = new Date();
  return { AND: [where, { id: { in: rows.filter(row => detectPaymentExceptions(row, now).length > 0).map(row => row.id) } }] } satisfies Prisma.OrderWhereInput;
}

export function orderTicketItems(order: {
  skuId: string; sku: { name: string }; originAmountCent: number;
  items: Array<{ id: string; skuId: string; skuName: string; unitPriceCent: number; quantity: number; totalAmountCent: number }>;
}) {
  return order.items.length ? order.items : [{
    id: "legacy", skuId: order.skuId, skuName: order.sku.name,
    unitPriceCent: order.originAmountCent, quantity: 1, totalAmountCent: order.originAmountCent
  }];
}
