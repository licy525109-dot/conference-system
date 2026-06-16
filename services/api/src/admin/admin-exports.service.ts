import { Injectable } from "@nestjs/common";
import { AuditAction, CheckInStatus, OrderStatus, PaymentStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";
import { detectPaymentExceptions } from "./admin-payment-exceptions.service";

@Injectable()
export class AdminExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRegistrationsCsv(query: Record<string, unknown>, admin: CurrentAdmin): Promise<string> {
    const where = parseRegistrationWhere(query);
    const checkInStatus = readOptionalEnum(query, "checkInStatus", CheckInStatus);
    const rows = await this.prisma.registration.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 5000,
      select: {
        id: true,
        registrationNo: true,
        attendeeName: true,
        phone: true,
        paidAmountCent: true,
        status: true,
        confirmedAt: true,
        createdAt: true,
        adminRemark: true,
        conference: { select: { title: true } },
        sku: { select: { name: true } },
        order: {
          select: {
            orderNo: true,
            status: true,
            discountAmountCent: true
          }
        },
        attendees: {
          orderBy: [{ createdAt: "asc" }],
          select: {
            name: true,
            phone: true,
            company: true,
            checkInStatus: true
          }
        }
      }
    });

    const filteredRows = checkInStatus
      ? rows.filter((row) => row.attendees.some((attendee) => attendee.checkInStatus === checkInStatus))
      : rows;

    await this.writeExportAudit(admin, "Registration", "Export registrations", {
      filters: sanitizeFilters(query),
      rowCount: filteredRows.length
    });

    return toCsv([
      [
        "会议名称",
        "报名ID",
        "报名号",
        "订单号",
        "参会人姓名",
        "手机号",
        "单位",
        "票种",
        "支付状态",
        "报名状态",
        "实付金额(元)",
        "优惠金额(元)",
        "报名时间",
        "核销状态",
        "后台备注"
      ],
      ...filteredRows.map((row) => {
        const primaryAttendee = row.attendees[0];
        return [
          row.conference.title,
          row.id,
          row.registrationNo,
          row.order.orderNo,
          primaryAttendee?.name ?? row.attendeeName,
          primaryAttendee?.phone ?? row.phone,
          primaryAttendee?.company ?? "",
          row.sku.name,
          row.order.status === OrderStatus.PAID ? "已支付" : row.order.status,
          row.status,
          centsToYuan(row.paidAmountCent),
          centsToYuan(row.order.discountAmountCent),
          row.confirmedAt.toISOString(),
          summarizeCheckIn(row.attendees),
          row.adminRemark ?? ""
        ];
      })
    ]);
  }

  async exportOrdersCsv(query: Record<string, unknown>, admin: CurrentAdmin): Promise<string> {
    const where = parseOrderWhere(query);
    const paymentStatus = readOptionalEnum(query, "paymentStatus", PaymentStatus);
    const onlyExceptions = readOptionalBoolean(query, "onlyExceptions");
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 5000,
      select: {
        id: true,
        orderNo: true,
        originAmountCent: true,
        discountAmountCent: true,
        payableAmountCent: true,
        paidAmountCent: true,
        status: true,
        attendeeName: true,
        phone: true,
        paidAt: true,
        expiredAt: true,
        createdAt: true,
        conference: { select: { title: true } },
        user: {
          select: {
            wechatNickname: true,
            phone: true
          }
        },
        payments: {
          orderBy: [{ createdAt: "desc" }],
          select: {
            id: true,
            provider: true,
            status: true,
            outTradeNo: true,
            transactionId: true,
            amountCent: true,
            failedReason: true,
            paidAt: true,
            createdAt: true
          }
        },
        registration: {
          select: {
            id: true,
            registrationNo: true,
            status: true
          }
        }
      }
    });

    const filteredRows = rows.filter((row) => {
      const latestPayment = row.payments[0] ?? null;
      if (paymentStatus && latestPayment?.status !== paymentStatus) return false;
      if (onlyExceptions && detectPaymentExceptions(row).length === 0) return false;
      return true;
    });

    await this.writeExportAudit(admin, "Order", "Export orders", {
      filters: sanitizeFilters(query),
      rowCount: filteredRows.length
    });

    return toCsv([
      [
        "订单号",
        "会议名称",
        "用户昵称",
        "手机号",
        "订单状态",
        "支付状态",
        "支付方式",
        "原价(元)",
        "优惠金额(元)",
        "实付金额(元)",
        "微信支付单号",
        "创建时间",
        "支付时间",
        "退款状态",
        "后台备注"
      ],
      ...filteredRows.map((row) => {
        const latestPayment = row.payments[0] ?? null;
        const exceptions = detectPaymentExceptions(row);
        return [
          row.orderNo,
          row.conference.title,
          row.user?.wechatNickname ?? "",
          row.phone ?? row.user?.phone ?? "",
          row.status,
          latestPayment?.status ?? "",
          latestPayment?.provider ?? "",
          centsToYuan(row.originAmountCent),
          centsToYuan(row.discountAmountCent),
          row.paidAmountCent === null ? "" : centsToYuan(row.paidAmountCent),
          latestPayment?.transactionId ?? "",
          row.createdAt.toISOString(),
          row.paidAt?.toISOString() ?? latestPayment?.paidAt?.toISOString() ?? "",
          row.status === OrderStatus.REFUNDED ? "已退款" : "",
          exceptions.map((item) => item.message).join("；")
        ];
      })
    ]);
  }

  private async writeExportAudit(admin: CurrentAdmin, entityType: string, summary: string, metadataJson: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action: AuditAction.SYSTEM,
        entityType,
        entityId: null,
        summary,
        metadataJson
      }
    });
  }
}

function parseOrderWhere(query: Record<string, unknown>): Prisma.OrderWhereInput {
  const conferenceId = readOptionalString(query, "conferenceId");
  const status = readOptionalEnum(query, "status", OrderStatus);
  const keyword = readOptionalString(query, "keyword");
  return {
    ...(conferenceId ? { conferenceId } : {}),
    ...(status ? { status } : {}),
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
  };
}

function parseRegistrationWhere(query: Record<string, unknown>): Prisma.RegistrationWhereInput {
  const conferenceId = readOptionalString(query, "conferenceId");
  const status = readOptionalEnum(query, "status", RegistrationStatus);
  const keyword = readOptionalString(query, "keyword");
  return {
    ...(conferenceId ? { conferenceId } : {}),
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [
            { registrationNo: { contains: keyword, mode: "insensitive" } },
            { attendeeName: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } },
            { order: { orderNo: { contains: keyword, mode: "insensitive" } } }
          ]
        }
      : {})
  };
}

function summarizeCheckIn(attendees: Array<{ checkInStatus: CheckInStatus }>): string {
  if (attendees.length === 0) return "暂无";
  const checkedIn = attendees.filter((item) => item.checkInStatus === CheckInStatus.CHECKED_IN).length;
  const pending = attendees.filter((item) => item.checkInStatus === CheckInStatus.PENDING).length;
  const notRequired = attendees.filter((item) => item.checkInStatus === CheckInStatus.NOT_REQUIRED).length;
  if (notRequired === attendees.length) return "无需核销";
  return `已核销 ${checkedIn} / 待核销 ${pending} / 无需 ${notRequired}`;
}

function sanitizeFilters(query: Record<string, unknown>): Prisma.InputJsonObject {
  const allowed = ["keyword", "conferenceId", "status", "paymentStatus", "checkInStatus", "onlyExceptions"];
  return Object.fromEntries(allowed.map((key) => [key, typeof query[key] === "string" || typeof query[key] === "boolean" ? query[key] : null]));
}

function toCsv(rows: Array<Array<string | number>>): string {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number): string {
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

function centsToYuan(value: number): string {
  return (value / 100).toFixed(2);
}

function readOptionalString(input: Record<string, unknown>, field: string): string | undefined {
  const value = input[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readOptionalBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  const value = input[field];
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

function readOptionalEnum<TEnum extends Record<string, string>>(input: Record<string, unknown>, field: string, enumObject: TEnum): TEnum[keyof TEnum] | undefined {
  const value = input[field];
  if (typeof value !== "string" || value.length === 0) return undefined;
  return Object.values(enumObject).includes(value) ? (value as TEnum[keyof TEnum]) : undefined;
}
