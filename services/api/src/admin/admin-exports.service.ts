import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction, CheckInStatus, OrderStatus, PaymentStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";
import { detectPaymentExceptions } from "./admin-payment-exceptions.service";
import { orderTicketItems, resolveAdminOrderWhere } from "./admin-order-query";

@Injectable()
export class AdminExportsService {
  constructor(private readonly prisma: PrismaService) {}

  async exportRegistrationsExcel(query: Record<string, unknown>, admin: CurrentAdmin): Promise<string> {
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

    return toExcelHtml("报名名单", [
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

  async exportOrdersExcel(query: Record<string, unknown>, admin: CurrentAdmin): Promise<string> {
    const where = await resolveAdminOrderWhere(this.prisma, query);
    const rows = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 5001,
      select: {
        id: true,
        orderNo: true,
        skuId: true,
        sku: { select: { name: true } },
        items: { orderBy: { id: "asc" }, select: { id: true, skuId: true, skuName: true, quantity: true, unitPriceCent: true, totalAmountCent: true } },
        refunds: { where: { status: "SUCCESS" }, select: { amountCent: true } },
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
            realName: true,
            nickname: true,
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

    if (rows.length > 5000) throw new BadRequestException("导出超过 5000 单，请缩小筛选范围后重试");
    const filteredRows = rows;

    await this.writeExportAudit(admin, "Order", "Export orders", {
      filters: sanitizeFilters(query),
      rowCount: filteredRows.length
    });

    return toExcelHtml("订单列表", [
      [
        "订单号",
        "会议名称",
        "票种明细（下单快照）",
        "票数",
        "下单账号",
        "手机号",
        "订单状态",
        "支付状态",
        "支付方式",
        "原价(元)",
        "优惠金额(元)",
        "实付金额(元)",
        "已退款(元)",
        "净收款(元)",
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
          orderTicketItems(row).map(item => `${item.skuName} × ${item.quantity}（单价 ¥${centsToYuan(item.unitPriceCent)}）`).join("；"),
          orderTicketItems(row).reduce((sum, item) => sum + item.quantity, 0),
          row.user?.realName || row.user?.nickname || row.user?.wechatNickname || "",
          row.phone ?? row.user?.phone ?? "",
          row.status,
          latestPayment?.status ?? "",
          latestPayment?.provider ?? "",
          centsToYuan(row.originAmountCent),
          centsToYuan(row.discountAmountCent),
          row.paidAmountCent === null ? "" : centsToYuan(row.paidAmountCent),
          centsToYuan(row.refunds.reduce((sum, item) => sum + item.amountCent, 0)),
          centsToYuan((row.paidAmountCent ?? 0) - row.refunds.reduce((sum, item) => sum + item.amountCent, 0)),
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
  const allowed = ["keyword", "conferenceId", "skuId", "status", "paymentStatus", "checkInStatus", "onlyExceptions", "deleted"];
  return Object.fromEntries(allowed.map((key) => [key, typeof query[key] === "string" || typeof query[key] === "boolean" ? query[key] : null]));
}

function toExcelHtml(sheetName: string, rows: Array<Array<string | number>>): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    table { border-collapse: collapse; }
    th, td { border: 1px solid #d9e2ef; padding: 6px 10px; mso-number-format:"\\@"; }
    th { background: #eef4ff; font-weight: 700; }
  </style>
</head>
<body>
  <table>
    <caption>${escapeHtml(sheetName)}</caption>
    ${rows
      .map((row, rowIndex) => `<tr>${row.map((cell) => (rowIndex === 0 ? "th" : "td")).map((tag, index) => `<${tag}>${escapeHtml(row[index])}</${tag}>`).join("")}</tr>`)
      .join("\n")}
  </table>
</body>
</html>`;
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
