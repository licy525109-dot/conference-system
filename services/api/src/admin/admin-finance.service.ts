import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, InvoiceStatus, OrderStatus, PaymentProvider, PaymentStatus, Prisma, RefundStatus } from "@prisma/client";
import { isMallMockRefundEnabled, isMallWechatRefundConfigured } from "../mall/mall-payment.config";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

type FinanceSourceType = "REGISTRATION" | "MALL" | "ALL";
type DateRange = { gte?: Date; lte?: Date };
type BillRow = {
  outTradeNo: string | null;
  transactionId: string | null;
  amountCent: number | null;
  status: string | null;
  paidAt: string | null;
  raw: Record<string, unknown>;
};
export type LocalPaymentRow = {
  sourceType: Exclude<FinanceSourceType, "ALL">;
  orderNo: string;
  outTradeNo: string;
  transactionId: string | null;
  amountCent: number;
  expectedAmountCent: number;
  status: string;
  paidAt: Date | null;
  orderStatus: string;
};

const ACTIVE_REFUND_STATUSES: RefundStatus[] = [RefundStatus.REQUESTED, RefundStatus.APPROVED, RefundStatus.PROCESSING];
const FINISHED_REFUND_STATUSES: RefundStatus[] = [RefundStatus.SUCCESS];
const PAID_MALL_ORDER_STATUSES = ["PAID", "SHIPPED", "COMPLETED", "REFUNDING", "REFUNDED"] as const;

@Injectable()
export class AdminFinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const actualPaymentWhere = { status: PaymentStatus.SUCCESS, provider: PaymentProvider.WECHAT } as const;
    const mockPaymentWhere = { status: PaymentStatus.SUCCESS, provider: PaymentProvider.MOCK } as const;
    const actualRefundWhere = { status: RefundStatus.SUCCESS, provider: PaymentProvider.WECHAT } as const;
    const [registrationPaid, registrationMockPaid, registrationDiscounts, registrationPaidOrders, registrationPendingOrders, registrationCount, registrationRefunds, mallPaid, mallMockPaid, mallPaidOrders, mallPendingOrders, mallRefunds, conferenceRows] =
      await this.prisma.$transaction([
        this.prisma.payment.aggregate({ where: actualPaymentWhere, _sum: { amountCent: true } }),
        this.prisma.payment.aggregate({ where: mockPaymentWhere, _sum: { amountCent: true } }),
        this.prisma.order.aggregate({ _sum: { discountAmountCent: true } }),
        this.prisma.order.count({ where: { status: OrderStatus.PAID } }),
        this.prisma.order.count({ where: { status: OrderStatus.PENDING } }),
        this.prisma.registration.count(),
        this.prisma.refund.aggregate({ where: actualRefundWhere, _sum: { amountCent: true } }),
        this.prisma.mallPayment.aggregate({ where: actualPaymentWhere, _sum: { amountCent: true } }),
        this.prisma.mallPayment.aggregate({ where: mockPaymentWhere, _sum: { amountCent: true } }),
        this.prisma.mallOrder.count({ where: { status: { in: [...PAID_MALL_ORDER_STATUSES] } } }),
        this.prisma.mallOrder.count({ where: { status: "PENDING_PAYMENT" } }),
        this.prisma.mallRefund.aggregate({ where: actualRefundWhere, _sum: { amountCent: true } }),
        this.prisma.conference.findMany({
          orderBy: [{ createdAt: "desc" }],
          take: 20,
          select: {
            id: true,
            title: true,
            orders: {
              where: { payments: { some: actualPaymentWhere } },
              select: {
                discountAmountCent: true,
                payments: { where: actualPaymentWhere, select: { amountCent: true } }
              }
            },
            _count: { select: { registrations: true } }
          }
        })
      ]);
    const registrationPaidAmountCent = registrationPaid._sum.amountCent ?? 0;
    const mallPaidAmountCent = mallPaid._sum.amountCent ?? 0;
    const paidAmountCent = registrationPaidAmountCent + mallPaidAmountCent;
    const mockPaymentAmountCent = (registrationMockPaid._sum.amountCent ?? 0) + (mallMockPaid._sum.amountCent ?? 0);
    const refundAmountCent = (registrationRefunds._sum.amountCent ?? 0) + (mallRefunds._sum.amountCent ?? 0);
    return ok({
      cards: {
        totalRevenueCent: paidAmountCent,
        paidAmountCent,
        registrationPaidAmountCent,
        mallPaidAmountCent,
        mockPaymentAmountCent,
        discountAmountCent: registrationDiscounts._sum.discountAmountCent ?? 0,
        refundAmountCent,
        netRevenueCent: paidAmountCent - refundAmountCent,
        paidOrders: registrationPaidOrders + mallPaidOrders,
        pendingOrders: registrationPendingOrders + mallPendingOrders,
        registrationCount,
        mallPaidOrders
      },
      conferences: conferenceRows.map((conference) => ({
        id: conference.id,
        title: conference.title,
        revenueCent: conference.orders.reduce((sum, order) => sum + order.payments.reduce((paymentSum, payment) => paymentSum + payment.amountCent, 0), 0),
        discountAmountCent: conference.orders.reduce((sum, order) => sum + order.discountAmountCent, 0),
        paidOrderCount: conference.orders.length,
        registrationCount: conference._count.registrations
      }))
    });
  }

  async listPayments(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const sourceType = readSourceType(query.sourceType);
    const keyword = readOptionalString(query.keyword);
    const status = readPaymentStatus(query.status);
    const provider = readPaymentProvider(query.provider);
    const range = readDateRange(query);
    const take = Math.min(500, skip + pageSize);

    const registrationWhere: Prisma.PaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(range.gte || range.lte ? { createdAt: range } : {}),
      ...(keyword ? { OR: [{ outTradeNo: { contains: keyword, mode: "insensitive" } }, { transactionId: { contains: keyword, mode: "insensitive" } }, { order: { orderNo: { contains: keyword, mode: "insensitive" } } }, { order: { attendeeName: { contains: keyword, mode: "insensitive" } } }, { order: { phone: { contains: keyword, mode: "insensitive" } } }] } : {})
    };
    const mallWhere: Prisma.MallPaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(range.gte || range.lte ? { createdAt: range } : {}),
      ...(keyword ? { OR: [{ outTradeNo: { contains: keyword, mode: "insensitive" } }, { transactionId: { contains: keyword, mode: "insensitive" } }, { order: { orderNo: { contains: keyword, mode: "insensitive" } } }, { order: { receiverName: { contains: keyword, mode: "insensitive" } } }, { order: { receiverPhone: { contains: keyword, mode: "insensitive" } } }] } : {})
    };

    const [registrationItems, registrationTotal, mallItems, mallTotal] = await this.prisma.$transaction([
      sourceType === "MALL"
        ? this.prisma.payment.findMany({ where: { id: "__never__" }, take: 0 })
        : this.prisma.payment.findMany({
            where: registrationWhere,
            orderBy: [{ createdAt: "desc" }],
            take,
            include: { order: { include: { conference: true, user: true, refunds: { orderBy: { createdAt: "desc" }, take: 1 } } } }
          }),
      sourceType === "MALL" ? this.prisma.payment.count({ where: { id: "__never__" } }) : this.prisma.payment.count({ where: registrationWhere }),
      sourceType === "REGISTRATION"
        ? this.prisma.mallPayment.findMany({ where: { id: "__never__" }, take: 0 })
        : this.prisma.mallPayment.findMany({
            where: mallWhere,
            orderBy: [{ createdAt: "desc" }],
            take,
            include: { order: { include: { user: true, items: { take: 3 }, refunds: { orderBy: { createdAt: "desc" }, take: 1 } } } }
          }),
      sourceType === "REGISTRATION" ? this.prisma.mallPayment.count({ where: { id: "__never__" } }) : this.prisma.mallPayment.count({ where: mallWhere })
    ]);

    const rows = [
      ...registrationItems.map((item) => formatRegistrationPayment(item)),
      ...mallItems.map((item) => formatMallPayment(item))
    ].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const pageItems = rows.slice(skip, skip + pageSize);
    await this.attachReconciliationStatus(pageItems);
    return ok({ items: pageItems, total: registrationTotal + mallTotal, page, pageSize });
  }

  async listBatches(query: Record<string, unknown> = {}) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financeReconciliationBatch.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip,
        take: pageSize,
        include: { items: true }
      }),
      this.prisma.financeReconciliationBatch.count()
    ]);
    return ok({ items: items.map(formatBatch), total, page, pageSize });
  }

  async createBatch(admin: CurrentAdmin, input: unknown = {}) {
    const body = isRecord(input) ? input : {};
    const sourceType = readSourceType(body.sourceType);
    const range = readDateRange(body);
    const payments = await this.readLocalPayments({ sourceType, range, includePending: true });
    const differences = payments.flatMap((payment) => buildLocalPaymentDifferences(payment));
    const batch = await this.prisma.financeReconciliationBatch.create({
      data: {
        batchNo: `FIN${Date.now()}`,
        status: "FINISHED",
        source: sourceType,
        startedAt: new Date(),
        finishedAt: new Date(),
        createdBy: admin.id,
        summaryJson: {
          sourceType,
          checkedPayments: payments.length,
          differenceCount: differences.length,
          startAt: range.gte?.toISOString() ?? null,
          endAt: range.lte?.toISOString() ?? null
        },
        items: { create: differences }
      },
      include: { items: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "FinanceReconciliationBatch", batch.id, "Create finance reconciliation batch", { sourceType, differenceCount: differences.length });
    return ok(formatBatch(batch));
  }

  async listDifferences(query: Record<string, unknown> = {}) {
    const { page, pageSize, skip } = readPage(query);
    const status = readOptionalString(query.status) ?? "OPEN";
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.FinanceReconciliationItemWhereInput = {
      ...(status === "ALL" ? {} : { status }),
      ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: "insensitive" } }, { outTradeNo: { contains: keyword, mode: "insensitive" } }, { transactionId: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.financeReconciliationItem.findMany({ where, orderBy: [{ createdAt: "desc" }], skip, take: pageSize, include: { batch: true } }),
      this.prisma.financeReconciliationItem.count({ where })
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), batchNo: item.batch.batchNo })), total, page, pageSize });
  }

  async markDifferenceReviewed(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const current = await this.prisma.financeReconciliationItem.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Finance reconciliation item not found");
    const item = await this.prisma.financeReconciliationItem.update({
      where: { id },
      data: {
        status: "REVIEWED",
        detailJson: mergeJsonObject(current.detailJson, {
          reviewRemark: readNullableString(body.remark),
          reviewedBy: admin.id,
          reviewedAt: new Date().toISOString()
        })
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "FinanceReconciliationItem", id, "Mark finance difference reviewed", { type: current.type });
    return ok(formatDateFields(item));
  }

  async createRefund(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const sourceType = readSourceType(body.sourceType);
    if (sourceType === "ALL") throw new BadRequestException("sourceType must be REGISTRATION or MALL");
    return sourceType === "MALL" ? this.createMallRefund(body, admin) : this.createRegistrationRefund(body, admin);
  }

  async listRefunds(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const sourceType = readSourceType(query.sourceType);
    const keyword = readOptionalString(query.keyword);
    const status = readRefundStatus(query.status);
    const take = Math.min(500, skip + pageSize);
    const registrationWhere: Prisma.RefundWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ refundNo: { contains: keyword, mode: "insensitive" } }, { outRefundNo: { contains: keyword, mode: "insensitive" } }, { orderNo: { contains: keyword, mode: "insensitive" } }, { providerRefundId: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const mallWhere: Prisma.MallRefundWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ refundNo: { contains: keyword, mode: "insensitive" } }, { outRefundNo: { contains: keyword, mode: "insensitive" } }, { order: { orderNo: { contains: keyword, mode: "insensitive" } } }, { providerRefundId: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [registrationItems, registrationTotal, mallItems, mallTotal] = await this.prisma.$transaction([
      sourceType === "MALL" ? this.prisma.refund.findMany({ where: { id: "__never__" }, take: 0 }) : this.prisma.refund.findMany({ where: registrationWhere, orderBy: { createdAt: "desc" }, take, include: { order: { include: { conference: true, user: true, refunds: true } }, user: true } }),
      sourceType === "MALL" ? this.prisma.refund.count({ where: { id: "__never__" } }) : this.prisma.refund.count({ where: registrationWhere }),
      sourceType === "REGISTRATION" ? this.prisma.mallRefund.findMany({ where: { id: "__never__" }, take: 0 }) : this.prisma.mallRefund.findMany({ where: mallWhere, orderBy: { createdAt: "desc" }, take, include: { order: { include: { user: true, items: { take: 3 }, refunds: true } }, afterSale: true } }),
      sourceType === "REGISTRATION" ? this.prisma.mallRefund.count({ where: { id: "__never__" } }) : this.prisma.mallRefund.count({ where: mallWhere })
    ]);
    const rows: Array<Record<string, any>> = [
      ...registrationItems.map((item) => formatRegistrationRefund(item)),
      ...mallItems.map((item) => formatMallRefund(item))
    ];
    rows.sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)));
    return ok({ items: rows.slice(skip, skip + pageSize), total: registrationTotal + mallTotal, page, pageSize });
  }

  async refundConfig() {
    const publicBase = resolvePublicApiBase();
    const registrationWechatConfigured = isRegistrationWechatRefundConfigured() && Boolean(process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim());
    const mallWechatConfigured = isMallWechatRefundConfigured() && Boolean(process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim());
    return ok({
      registration: {
        enabled: isFeatureEnabled("REFUND_ENABLED"),
        requiresApproval: process.env.REFUND_REQUIRES_APPROVAL !== "false",
        mockEnabled: isRegistrationMockRefundEnabled(),
        wechatRefundEnabled: registrationWechatConfigured,
        callbackUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim() || `${publicBase}/payments/wechat/refund-notify`,
        autoRestoreQuota: process.env.REFUND_AUTO_RESTORE_QUOTA === "true",
        deadlineText: process.env.REFUND_DEADLINE_TEXT || "退款截止时间未配置，请按运营规则人工核对。",
        description: process.env.REFUND_DESCRIPTION || "未开启微信真实退款时，只记录退款申请和审核，不会自动打款。"
      },
      mall: {
        enabled: process.env.MALL_REFUND_MODE !== "disabled" || process.env.MALL_MOCK_REFUND_ENABLED === "true" || process.env.MALL_WECHAT_REFUND_ENABLED === "true",
        requiresApproval: process.env.MALL_REFUND_REQUIRES_APPROVAL !== "false",
        mockEnabled: isMallMockRefundEnabled(),
        wechatRefundEnabled: mallWechatConfigured,
        callbackUrl: process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim() || `${publicBase}/payments/wechat/refund-notify`,
        autoRestoreStock: process.env.MALL_REFUND_AUTO_RESTORE_STOCK === "true",
        deadlineText: process.env.MALL_REFUND_DEADLINE_TEXT || "商城退款截止时间未配置，请按售后规则人工核对。",
        description: process.env.MALL_REFUND_DESCRIPTION || "商城退款和报名退款彼此隔离；未配置微信退款时，不会自动打款。"
      },
      offlineMarkEnabled: process.env.OFFLINE_REFUND_MARK_ENABLED === "true",
      steps: [
        "配置商户证书、API v3 key、商户号和 WECHAT_PAY_REFUND_NOTIFY_URL。",
        "确认微信商户平台已设置退款通知地址，并完成公网 HTTPS 回调验证。",
        "发起退款后等待微信退款结果回调，或在退款详情中查询当前系统记录。",
        "未配置真实微信退款时，审批只进入处理中或待线下处理，不会显示退款成功。"
      ],
      requiredEnv: [
        { key: "REFUND_ENABLED", configured: typeof process.env.REFUND_ENABLED !== "undefined", restartRequired: true },
        { key: "REFUND_MODE / WECHAT_REFUND_ENABLED", configured: isRegistrationWechatRefundConfigured() || isRegistrationMockRefundEnabled(), restartRequired: true },
        { key: "MALL_REFUND_MODE / MALL_WECHAT_REFUND_ENABLED", configured: isMallWechatRefundConfigured() || isMallMockRefundEnabled(), restartRequired: true },
        { key: "WECHAT_PAY_REFUND_NOTIFY_URL", configured: Boolean(process.env.WECHAT_PAY_REFUND_NOTIFY_URL?.trim()), restartRequired: true }
      ]
    });
  }

  async approveRefund(id: string, admin: CurrentAdmin) {
    const registration = await this.prisma.refund.findUnique({ where: { id }, include: { order: true } });
    if (registration) return this.approveRegistrationRefund(registration, admin);
    const mall = await this.prisma.mallRefund.findUnique({ where: { id }, include: { order: true, afterSale: true } });
    if (mall) return this.approveMallRefund(mall, admin);
    throw new NotFoundException("Refund not found");
  }

  async rejectRefund(id: string, input: unknown, admin: CurrentAdmin) {
    const reason = readNullableString(readObject(input).reason);
    const registration = await this.prisma.refund.findUnique({ where: { id } });
    if (registration) {
      if (registration.status === RefundStatus.REJECTED) return ok(formatRegistrationRefund(registration));
      if (!([RefundStatus.REQUESTED, RefundStatus.APPROVED] as RefundStatus[]).includes(registration.status)) throw new ConflictException("当前退款状态不可驳回");
      const refund = await this.prisma.refund.update({ where: { id }, data: { status: RefundStatus.REJECTED, rejectReason: reason } });
      await this.writeAudit(admin, AuditAction.UPDATE, "Refund", id, "Reject registration refund", { reason });
      return ok(formatRegistrationRefund(refund));
    }
    const mall = await this.prisma.mallRefund.findUnique({ where: { id }, include: { afterSale: true, order: true } });
    if (!mall) throw new NotFoundException("Refund not found");
    if (mall.status === RefundStatus.REJECTED) return ok(formatMallRefund(mall));
    if (!([RefundStatus.REQUESTED, RefundStatus.APPROVED] as RefundStatus[]).includes(mall.status)) throw new ConflictException("当前退款状态不可驳回");
    const refund = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mallRefund.update({ where: { id }, data: { status: RefundStatus.REJECTED, rejectReason: reason } });
      if (mall.afterSaleId) await tx.mallAfterSale.update({ where: { id: mall.afterSaleId }, data: { status: "REJECTED", handledAt: new Date(), note: reason } });
      if (mall.order.status === "REFUNDING") await tx.mallOrder.update({ where: { id: mall.mallOrderId }, data: { status: "PAID" } });
      return updated;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallRefund", id, "Reject mall refund", { reason });
    return ok(formatMallRefund(refund));
  }

  async queryRefund(id: string) {
    const registration = await this.prisma.refund.findUnique({ where: { id }, include: { order: { include: { conference: true, user: true } }, user: true } });
    if (registration) return ok(formatRegistrationRefund(registration));
    const mall = await this.prisma.mallRefund.findUnique({ where: { id }, include: { order: { include: { user: true, items: { take: 3 } } }, afterSale: true } });
    if (mall) return ok(formatMallRefund(mall));
    throw new NotFoundException("Refund not found");
  }

  async listInvoices(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const status = readInvoiceStatus(query.status);
    const sourceType = readSourceType(query.sourceType);
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.InvoiceApplicationWhereInput = {
      ...(status ? { status } : {}),
      ...(sourceType === "ALL" ? {} : { sourceType }),
      ...(keyword ? { OR: [{ invoiceNo: { contains: keyword, mode: "insensitive" } }, { issuedInvoiceNo: { contains: keyword, mode: "insensitive" } }, { orderNo: { contains: keyword, mode: "insensitive" } }, { title: { contains: keyword, mode: "insensitive" } }, { taxNo: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.invoiceApplication.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { order: { include: { conference: true } }, user: true } }),
      this.prisma.invoiceApplication.count({ where })
    ]);
    return ok({ items: items.map(formatInvoice), total, page, pageSize });
  }

  async approveInvoice(id: string, admin: CurrentAdmin) {
    const current = await this.prisma.invoiceApplication.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Invoice application not found");
    if (current.status === InvoiceStatus.APPROVED) return ok(formatDateFields(current));
    if (current.status !== InvoiceStatus.REQUESTED) throw new ConflictException("当前发票状态不可审核通过");
    const item = await this.prisma.invoiceApplication.update({ where: { id }, data: { status: InvoiceStatus.APPROVED } });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Approve invoice application", { sourceType: current.sourceType, orderNo: current.orderNo });
    return ok(formatDateFields(item));
  }

  async rejectInvoice(id: string, input: unknown, admin: CurrentAdmin) {
    const current = await this.prisma.invoiceApplication.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Invoice application not found");
    if (current.status === InvoiceStatus.REJECTED) return ok(formatDateFields(current));
    if (!([InvoiceStatus.REQUESTED, InvoiceStatus.APPROVED] as InvoiceStatus[]).includes(current.status)) throw new ConflictException("当前发票状态不可驳回");
    const reason = readNullableString(readObject(input).reason);
    const item = await this.prisma.invoiceApplication.update({ where: { id }, data: { status: InvoiceStatus.REJECTED, rejectReason: reason } });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Reject invoice application", { reason });
    return ok(formatDateFields(item));
  }

  async markInvoiceIssued(id: string, input: unknown, admin: CurrentAdmin) {
    const body = isRecord(input) ? input : {};
    const current = await this.prisma.invoiceApplication.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Invoice application not found");
    if (current.status === InvoiceStatus.ISSUED) return ok(formatDateFields(current));
    if (current.status !== InvoiceStatus.APPROVED) throw new ConflictException("仅审核通过的发票申请可标记开票");
    const item = await this.prisma.invoiceApplication.update({
      where: { id },
      data: {
        status: InvoiceStatus.ISSUED,
        issuedAt: new Date(),
        issuedInvoiceNo: readNullableString(body.issuedInvoiceNo),
        invoiceLink: readNullableString(body.invoiceLink),
        remark: readNullableString(body.remark)
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "InvoiceApplication", id, "Mark invoice issued", { issuedInvoiceNo: item.issuedInvoiceNo });
    return ok(formatDateFields(item));
  }

  async createWechatBill(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const billDate = readRequiredDate(body.billDate, "billDate");
    const billType = readOptionalString(body.billType) ?? "TRADE";
    const bill = await this.prisma.wechatBill.upsert({
      where: { billDate_billType: { billDate, billType } },
      update: {},
      create: { billDate, billType, createdBy: admin.id, status: "CREATED" }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "WechatBill", bill.id, "Create WeChat bill batch", { billType, billDate: billDate.toISOString().slice(0, 10) });
    return ok(formatWechatBill(bill));
  }

  async listWechatBills(query: Record<string, unknown> = {}) {
    const { page, pageSize, skip } = readPage(query);
    const status = readOptionalString(query.status);
    const where: Prisma.WechatBillWhereInput = status ? { status } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wechatBill.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize }),
      this.prisma.wechatBill.count({ where })
    ]);
    return ok({ items: items.map(formatWechatBill), total, page, pageSize });
  }

  async importWechatBill(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const billDate = readRequiredDate(body.billDate, "billDate");
    const billType = readOptionalString(body.billType) ?? "TRADE";
    const text = readOptionalString(body.text) ?? readOptionalString(body.billText) ?? "";
    if (!text) throw new BadRequestException("账单文本不能为空，请粘贴微信账单 CSV/TXT 内容");
    const parsed = parseWechatBillRows(text);
    if (parsed.rows.length === 0) throw new BadRequestException("未解析到账单明细，请确认包含商户订单号、微信交易号、金额等字段");
    const importRecord = await this.prisma.wechatBillImport.create({
      data: {
        fileName: readOptionalString(body.fileName) ?? `manual-${billDate.toISOString().slice(0, 10)}.${billType.toLowerCase()}.txt`,
        status: "PARSED",
        rowCount: parsed.rows.length,
        createdBy: admin.id,
        errorJson: parsed.warnings.length ? ({ warnings: parsed.warnings } as Prisma.InputJsonObject) : undefined
      }
    });
    const summaryJson = {
      source: "manual-import",
      importId: importRecord.id,
      importedAt: new Date().toISOString(),
      rowCount: parsed.rows.length,
      warnings: parsed.warnings,
      rows: parsed.rows as unknown as Prisma.InputJsonArray
    } as Prisma.InputJsonObject;
    const bill = await this.prisma.wechatBill.upsert({
      where: { billDate_billType: { billDate, billType } },
      update: { status: "IMPORTED", storagePath: `manual-import:${importRecord.id}`, summaryJson },
      create: { billDate, billType, createdBy: admin.id, status: "IMPORTED", storagePath: `manual-import:${importRecord.id}`, summaryJson }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", bill.id, "Import WeChat bill rows", { rowCount: parsed.rows.length, importId: importRecord.id });
    return ok({ ...formatWechatBill(bill), importId: importRecord.id, rowCount: parsed.rows.length, warnings: parsed.warnings });
  }

  async downloadWechatBill(id: string, admin?: CurrentAdmin) {
    const bill = await this.prisma.wechatBill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException("Wechat bill not found");
    if (!isWechatBillDownloadEnabled()) {
      const updated = await this.prisma.wechatBill.update({
        where: { id },
        data: {
          status: "DOWNLOAD_SKIPPED",
          summaryJson: mergeJsonObject(bill.summaryJson, {
            downloadSkippedReason: "WECHAT_PAY_BILL_DOWNLOAD_ENABLED=false 或 WECHAT_PAY_BILL_STORAGE_PATH 未配置，未调用官方下载接口。",
            downloadCheckedAt: new Date().toISOString()
          })
        }
      });
      if (admin) await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", id, "Skip WeChat bill download", { reason: "download not configured" });
      return ok({ ...formatWechatBill(updated), skippedReason: "微信账单官方下载未配置，未伪造下载成功。" });
    }
    const updated = await this.prisma.wechatBill.update({
      where: { id },
      data: {
        status: "DOWNLOAD_REQUESTED",
        storagePath: `${process.env.WECHAT_PAY_BILL_STORAGE_PATH}/${bill.billDate.toISOString().slice(0, 10)}-${bill.billType}.csv`,
        summaryJson: mergeJsonObject(bill.summaryJson, {
          downloadRequestedAt: new Date().toISOString(),
          notice: "官方账单下载 provider 已启用；文件写入需由服务器任务完成后再导入解析。"
        })
      }
    });
    if (admin) await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", id, "Request WeChat bill download", { billType: bill.billType });
    return ok(formatWechatBill(updated));
  }

  async reconcileWechatBill(id: string, admin: CurrentAdmin, input: unknown = {}) {
    const bill = await this.prisma.wechatBill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundException("Wechat bill not found");
    const body = isRecord(input) ? input : {};
    const sourceType = readSourceType(body.sourceType);
    const billRows = extractBillRows(bill.summaryJson);
    const dayRange = billDayRange(bill.billDate);
    const localRows = await this.readLocalPayments({ sourceType, range: dayRange, includePending: true });
    const results = buildBillReconciliationResults(id, localRows, billRows);
    await this.prisma.$transaction([
      this.prisma.reconciliationResult.deleteMany({ where: { billId: id } }),
      ...(results.length ? [this.prisma.reconciliationResult.createMany({ data: results })] : []),
      this.prisma.wechatBill.update({
        where: { id },
        data: {
          status: "RECONCILED",
          summaryJson: mergeJsonObject(bill.summaryJson, {
            reconciledAt: new Date().toISOString(),
            sourceType,
            localPaymentCount: localRows.length,
            billRowCount: billRows.length,
            resultCount: results.length,
            resultSummary: summarizeReconciliationResults(results)
          })
        }
      })
    ]);
    await this.writeAudit(admin, AuditAction.SYSTEM, "WechatBill", id, "Reconcile WeChat bill", { sourceType, resultCount: results.length });
    const updated = await this.prisma.wechatBill.findUniqueOrThrow({ where: { id } });
    return ok({ ...formatWechatBill(updated), resultCount: results.length, resultSummary: summarizeReconciliationResults(results) });
  }

  async listReconciliationResults(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const status = readOptionalString(query.status);
    const type = readOptionalString(query.type);
    const keyword = readOptionalString(query.keyword);
    const where: Prisma.ReconciliationResultWhereInput = {
      ...(status && status !== "ALL" ? { status } : {}),
      ...(type ? { type } : {}),
      ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: "insensitive" } }, { outTradeNo: { contains: keyword, mode: "insensitive" } }, { transactionId: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.reconciliationResult.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { bill: true } }),
      this.prisma.reconciliationResult.count({ where })
    ]);
    return ok({ items: items.map(formatReconciliationResult), total, page, pageSize });
  }

  async markReconciliationReviewed(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const current = await this.prisma.reconciliationResult.findUnique({ where: { id } });
    if (!current) throw new NotFoundException("Reconciliation result not found");
    const item = await this.prisma.reconciliationResult.update({
      where: { id },
      data: {
        status: "REVIEWED",
        detailJson: mergeJsonObject(current.detailJson, {
          reviewRemark: readNullableString(body.remark),
          reviewedBy: admin.id,
          reviewedAt: new Date().toISOString()
        })
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "ReconciliationResult", id, "Mark reconciliation result reviewed", { type: current.type });
    return ok(formatDateFields(item));
  }

  private async createRegistrationRefund(body: Record<string, unknown>, admin: CurrentAdmin) {
    if (!isFeatureEnabled("REFUND_ENABLED")) return ok({ skippedReason: "REFUND_ENABLED=false", sourceType: "REGISTRATION" });
    const order = await this.prisma.order.findUnique({ where: { orderNo: readRequiredString(body, "orderNo") }, include: { refunds: true } });
    if (!order || order.status !== OrderStatus.PAID) throw new ConflictException("仅已支付报名订单可退款");
    const availableAmountCent = refundableAmount(order.paidAmountCent ?? order.payableAmountCent, order.refunds);
    const amountCent = readOptionalNonNegativeInt(body.amountCent) ?? availableAmountCent;
    if (amountCent <= 0 || amountCent > availableAmountCent) throw new BadRequestException("退款金额不能超过可退金额");
    const existing = order.refunds.find((item) => ACTIVE_REFUND_STATUSES.includes(item.status));
    if (existing) {
      if (existing.amountCent !== amountCent) throw new ConflictException("该报名订单已有处理中退款申请");
      return ok(formatRegistrationRefund(existing));
    }
    const refund = await this.prisma.refund.create({
      data: {
        refundNo: generateCode("RF"),
        outRefundNo: `REG_REFUND_${order.orderNo}_${Date.now()}`,
        orderNo: order.orderNo,
        orderId: order.id,
        userId: order.userId,
        amountCent,
        reason: readRequiredString(body, "reason"),
        status: RefundStatus.REQUESTED
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "Refund", refund.id, "Create registration refund request", { orderNo: order.orderNo, amountCent });
    return ok(formatRegistrationRefund(refund));
  }

  private async createMallRefund(body: Record<string, unknown>, admin: CurrentAdmin) {
    const order = await this.prisma.mallOrder.findUnique({ where: { orderNo: readRequiredString(body, "orderNo") }, include: { refunds: true, afterSales: { orderBy: { createdAt: "desc" }, take: 1 } } });
    if (!order || !PAID_MALL_ORDER_STATUSES.includes(order.status as (typeof PAID_MALL_ORDER_STATUSES)[number])) throw new ConflictException("仅已支付商城订单可退款");
    const availableAmountCent = refundableAmount(order.paidAmountCent ?? order.payableAmountCent, order.refunds);
    const amountCent = readOptionalNonNegativeInt(body.amountCent) ?? availableAmountCent;
    if (amountCent <= 0 || amountCent > availableAmountCent) throw new BadRequestException("商城退款金额不能超过可退金额");
    const existing = order.refunds.find((item) => ACTIVE_REFUND_STATUSES.includes(item.status));
    if (existing) {
      if (existing.amountCent !== amountCent) throw new ConflictException("该商城订单已有处理中退款申请");
      return ok(formatMallRefund(existing));
    }
    const afterSaleId = readNullableString(body.afterSaleId) ?? order.afterSales[0]?.id ?? null;
    const refund = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mallRefund.create({
        data: {
          refundNo: generateCode("MRF"),
          outRefundNo: `MALL_REFUND_${order.orderNo}_${Date.now()}`,
          mallOrderId: order.id,
          afterSaleId,
          amountCent,
        reason: readRequiredString(body, "reason"),
          status: RefundStatus.REQUESTED
        }
      });
      await tx.mallOrder.update({ where: { id: order.id }, data: { status: "REFUNDING" } });
      return created;
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MallRefund", refund.id, "Create mall refund request", { orderNo: order.orderNo, amountCent });
    return ok(formatMallRefund(refund));
  }

  private async approveRegistrationRefund(current: Prisma.RefundGetPayload<{ include: { order: true } }>, admin: CurrentAdmin) {
    if (current.status === RefundStatus.SUCCESS) return ok(formatRegistrationRefund(current));
    if (([RefundStatus.PROCESSING, RefundStatus.APPROVED] as RefundStatus[]).includes(current.status)) return ok(formatRegistrationRefund(current));
    if (current.status !== RefundStatus.REQUESTED) throw new ConflictException("当前退款状态不可批准");
    const now = new Date();
    if (isRegistrationMockRefundEnabled()) {
      const refund = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.refund.update({
          where: { id: current.id },
          data: { provider: PaymentProvider.MOCK, providerRefundId: `mock-${current.refundNo}`, status: RefundStatus.SUCCESS, approvedAt: now, processedAt: now, failedReason: null }
        });
        if (current.order && current.amountCent >= (current.order.paidAmountCent ?? current.order.payableAmountCent)) {
          await tx.order.update({ where: { id: current.order.id }, data: { status: OrderStatus.REFUNDED } });
          await tx.registration.updateMany({ where: { orderId: current.order.id }, data: { status: "REFUNDED" } });
        }
        return updated;
      });
      await this.writeAudit(admin, AuditAction.UPDATE, "Refund", current.id, "Approve registration refund with mock success", { provider: "MOCK" });
      return ok(formatRegistrationRefund(refund));
    }
    const refund = await this.prisma.refund.update({
      where: { id: current.id },
      data: {
        provider: isRegistrationWechatRefundConfigured() ? PaymentProvider.WECHAT : null,
        status: RefundStatus.PROCESSING,
        approvedAt: now,
        failedReason: isRegistrationWechatRefundConfigured() ? "微信报名退款 provider 已启用，真实出款待微信退款回调确认。" : "微信退款未配置，仅进入处理中，不会伪造退款成功。"
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "Refund", current.id, "Approve registration refund", { provider: refund.provider, status: refund.status });
    return ok(formatRegistrationRefund(refund));
  }

  private async approveMallRefund(current: Prisma.MallRefundGetPayload<{ include: { order: true; afterSale: true } }>, admin: CurrentAdmin) {
    if (current.status === RefundStatus.SUCCESS) return ok(formatMallRefund(current));
    if (([RefundStatus.PROCESSING, RefundStatus.APPROVED] as RefundStatus[]).includes(current.status)) return ok(formatMallRefund(current));
    if (current.status !== RefundStatus.REQUESTED) throw new ConflictException("当前退款状态不可批准");
    const now = new Date();
    if (isMallMockRefundEnabled()) {
      const refund = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.mallRefund.update({
          where: { id: current.id },
          data: { provider: PaymentProvider.MOCK, providerRefundId: `mock-${current.refundNo}`, status: RefundStatus.SUCCESS, approvedAt: now, processedAt: now, failedReason: null }
        });
        if (current.amountCent >= (current.order.paidAmountCent ?? current.order.payableAmountCent)) await tx.mallOrder.update({ where: { id: current.mallOrderId }, data: { status: "REFUNDED" } });
        if (current.afterSaleId) await tx.mallAfterSale.update({ where: { id: current.afterSaleId }, data: { status: "COMPLETED", handledAt: now } });
        return updated;
      });
      await this.writeAudit(admin, AuditAction.UPDATE, "MallRefund", current.id, "Approve mall refund with mock success", { provider: "MOCK" });
      return ok(formatMallRefund(refund));
    }
    const refund = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mallRefund.update({
        where: { id: current.id },
        data: {
          provider: isMallWechatRefundConfigured() ? PaymentProvider.WECHAT : null,
          status: RefundStatus.PROCESSING,
          approvedAt: now,
          failedReason: isMallWechatRefundConfigured() ? "微信商城退款 provider 已启用，真实出款待微信退款回调确认。" : "微信退款未配置，仅进入处理中，不会伪造退款成功。"
        }
      });
      await tx.mallOrder.update({ where: { id: current.mallOrderId }, data: { status: "REFUNDING" } });
      if (current.afterSaleId) await tx.mallAfterSale.update({ where: { id: current.afterSaleId }, data: { status: "PROCESSING", handledAt: now } });
      return updated;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallRefund", current.id, "Approve mall refund", { provider: refund.provider, status: refund.status });
    return ok(formatMallRefund(refund));
  }

  private async attachReconciliationStatus(items: Array<Record<string, unknown>>) {
    const outTradeNos = items.map((item) => String(item.outTradeNo || "")).filter(Boolean);
    if (outTradeNos.length === 0) return;
    const results = await this.prisma.reconciliationResult.findMany({
      where: { outTradeNo: { in: outTradeNos } },
      orderBy: { createdAt: "desc" }
    });
    const latest = new Map<string, Prisma.ReconciliationResultGetPayload<Record<string, never>>>();
    for (const result of results) {
      if (result.outTradeNo && !latest.has(result.outTradeNo)) latest.set(result.outTradeNo, result);
    }
    for (const item of items) {
      const result = latest.get(String(item.outTradeNo || ""));
      item.reconciliationStatus = result ? result.type === "MATCHED" ? "MATCHED" : result.status : "UNRECONCILED";
      item.reconciliationType = result?.type ?? null;
    }
  }

  private async readLocalPayments(input: { sourceType: FinanceSourceType; range: DateRange; includePending: boolean }): Promise<LocalPaymentRow[]> {
    const whereBase = input.range.gte || input.range.lte ? { createdAt: input.range } : {};
    const paymentStatusWhere = input.includePending ? {} : { status: PaymentStatus.SUCCESS };
    const [registration, mall] = await this.prisma.$transaction([
      input.sourceType === "MALL"
        ? this.prisma.payment.findMany({ where: { id: "__never__" }, take: 0 })
        : this.prisma.payment.findMany({ where: { ...whereBase, ...paymentStatusWhere }, include: { order: true }, take: 5000 }),
      input.sourceType === "REGISTRATION"
        ? this.prisma.mallPayment.findMany({ where: { id: "__never__" }, take: 0 })
        : this.prisma.mallPayment.findMany({ where: { ...whereBase, ...paymentStatusWhere }, include: { order: true }, take: 5000 })
    ]);
    const registrationRows = registration as any[];
    const mallRows = mall as any[];
    return [
      ...registrationRows.map((payment) => ({
        sourceType: "REGISTRATION" as const,
        orderNo: payment.order.orderNo,
        outTradeNo: payment.outTradeNo,
        transactionId: payment.transactionId,
        amountCent: payment.amountCent,
        expectedAmountCent: payment.order.payableAmountCent,
        status: payment.status,
        paidAt: payment.paidAt,
        orderStatus: payment.order.status
      })),
      ...mallRows.map((payment) => ({
        sourceType: "MALL" as const,
        orderNo: payment.order.orderNo,
        outTradeNo: payment.outTradeNo,
        transactionId: payment.transactionId,
        amountCent: payment.amountCent,
        expectedAmountCent: payment.order.payableAmountCent,
        status: payment.status,
        paidAt: payment.paidAt,
        orderStatus: payment.order.status
      }))
    ];
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadataJson?: Prisma.InputJsonValue) {
    return this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatRegistrationPayment(payment: any) {
  const refund = payment.order.refunds?.[0] ?? null;
  const includedInRevenue = isActualRevenuePayment(payment);
  return {
    id: payment.id,
    sourceType: "REGISTRATION",
    sourceLabel: "报名",
    provider: payment.provider,
    status: payment.status,
    outTradeNo: payment.outTradeNo,
    transactionId: payment.transactionId,
    amountCent: payment.amountCent,
    includedInRevenue,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    orderNo: payment.order.orderNo,
    orderStatus: payment.order.status,
    businessTitle: payment.order.conference.title,
    conferenceTitle: payment.order.conference.title,
    userName: payment.order.user?.wechatNickname || payment.order.user?.nickname || payment.order.attendeeName || null,
    userPhone: payment.order.user?.phone || payment.order.phone || null,
    refundStatus: refund?.status ?? null,
    reconciliationStatus: "UNRECONCILED",
    reconciliationType: null
  };
}

function formatMallPayment(payment: any) {
  const refund = payment.order.refunds?.[0] ?? null;
  const includedInRevenue = isActualRevenuePayment(payment);
  return {
    id: payment.id,
    sourceType: "MALL",
    sourceLabel: "商城",
    provider: payment.provider,
    status: payment.status,
    outTradeNo: payment.outTradeNo,
    transactionId: payment.transactionId,
    amountCent: payment.amountCent,
    includedInRevenue,
    paidAt: payment.paidAt?.toISOString() ?? null,
    createdAt: payment.createdAt.toISOString(),
    orderNo: payment.order.orderNo,
    orderStatus: payment.order.status,
    businessTitle: payment.order.items?.map((item: any) => item.productTitle).filter(Boolean).join(" / ") || "商城订单",
    conferenceTitle: null,
    userName: payment.order.user?.wechatNickname || payment.order.user?.nickname || payment.order.receiverName || null,
    userPhone: payment.order.user?.phone || payment.order.receiverPhone || null,
    refundStatus: refund?.status ?? null,
    reconciliationStatus: "UNRECONCILED",
    reconciliationType: null
  };
}

function isActualRevenuePayment(payment: { provider: PaymentProvider; status: PaymentStatus }) {
  return payment.status === PaymentStatus.SUCCESS && payment.provider === PaymentProvider.WECHAT;
}

function formatRegistrationRefund(refund: any) {
  const paidAmountCent = refund.order ? refund.order.paidAmountCent ?? refund.order.payableAmountCent : null;
  return {
    ...formatDateFields(refund),
    sourceType: "REGISTRATION",
    orderNo: refund.orderNo,
    businessTitle: refund.order?.conference?.title ?? "会议报名",
    userName: refund.user?.wechatNickname || refund.user?.nickname || refund.order?.attendeeName || null,
    userPhone: refund.user?.phone || refund.order?.phone || null,
    failedReason: refund.failedReason ?? null,
    maxRefundableAmountCent: typeof paidAmountCent === "number" && Array.isArray(refund.order?.refunds) ? refundableAmount(paidAmountCent, refund.order.refunds.filter((item: any) => item.id !== refund.id)) : null,
    refundNotice: refund.failedReason ?? refundStatusNotice("REGISTRATION", refund.status, refund.provider)
  };
}

function formatMallRefund(refund: any) {
  const paidAmountCent = refund.order ? refund.order.paidAmountCent ?? refund.order.payableAmountCent : null;
  return {
    ...formatDateFields(refund),
    sourceType: "MALL",
    orderNo: refund.order?.orderNo ?? null,
    businessTitle: refund.order?.items?.map((item: any) => item.productTitle).filter(Boolean).join(" / ") || "商城订单",
    userName: refund.order?.user?.wechatNickname || refund.order?.user?.nickname || refund.order?.receiverName || null,
    userPhone: refund.order?.user?.phone || refund.order?.receiverPhone || null,
    afterSaleStatus: refund.afterSale?.status ?? null,
    maxRefundableAmountCent: typeof paidAmountCent === "number" && Array.isArray(refund.order?.refunds) ? refundableAmount(paidAmountCent, refund.order.refunds.filter((item: any) => item.id !== refund.id)) : null,
    refundNotice: refund.failedReason ?? refundStatusNotice("MALL", refund.status, refund.provider)
  };
}

function refundStatusNotice(sourceType: "REGISTRATION" | "MALL", status: RefundStatus, provider: PaymentProvider | null) {
  if (status === RefundStatus.SUCCESS) return "退款已完成，净收入会扣减该金额。";
  if (status === RefundStatus.REJECTED) return "退款已驳回，不会影响订单实收。";
  if (status === RefundStatus.FAILED) return "退款失败，请检查失败原因后重新处理。";
  if (status === RefundStatus.PROCESSING && provider === PaymentProvider.WECHAT) return `${sourceType === "MALL" ? "商城" : "报名"}微信退款处理中，需等待微信退款回调确认到账。`;
  if (status === RefundStatus.PROCESSING) return "微信退款未配置，系统不会伪造退款成功，请线下处理或补齐微信退款配置。";
  return "退款待后台审批，审批后才进入退款处理。";
}

function formatInvoice(item: any) {
  return {
    ...formatDateFields(item),
    businessTitle: item.sourceType === "MALL" ? "商城订单" : item.order?.conference?.title ?? "会议报名",
    userName: item.user?.wechatNickname || item.user?.nickname || null,
    userPhone: item.user?.phone || item.phone || null
  };
}

function formatBatch(batch: Prisma.FinanceReconciliationBatchGetPayload<{ include: { items: true } }>) {
  return {
    ...formatDateFields(batch),
    differenceCount: batch.items.length
  };
}

function formatWechatBill(bill: Prisma.WechatBillGetPayload<Record<string, never>>) {
  const data = formatDateFields(bill);
  return { ...data, billDate: bill.billDate.toISOString().slice(0, 10) };
}

function formatReconciliationResult(item: Prisma.ReconciliationResultGetPayload<{ include: { bill: true } }>) {
  return {
    ...formatDateFields(item),
    billDate: item.bill?.billDate.toISOString().slice(0, 10) ?? null,
    billType: item.bill?.billType ?? null
  };
}

function formatDateFields(item: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...item };
  for (const key of Object.keys(output)) {
    const value = output[key];
    if (value instanceof Date) output[key] = value.toISOString();
  }
  return output;
}

function refundableAmount(paidAmountCent: number, refunds: Array<{ amountCent: number; status: RefundStatus }>) {
  const refundedCent = refunds.filter((item) => FINISHED_REFUND_STATUSES.includes(item.status)).reduce((sum, item) => sum + item.amountCent, 0);
  return Math.max(0, paidAmountCent - refundedCent);
}

function buildLocalPaymentDifferences(payment: LocalPaymentRow): Prisma.FinanceReconciliationItemCreateWithoutBatchInput[] {
  const items: Prisma.FinanceReconciliationItemCreateWithoutBatchInput[] = [];
  if (payment.status === PaymentStatus.SUCCESS && !["PAID", "SHIPPED", "COMPLETED", "REFUNDING", "REFUNDED"].includes(payment.orderStatus)) {
    items.push({
      orderNo: payment.orderNo,
      outTradeNo: payment.outTradeNo,
      transactionId: payment.transactionId,
      localAmountCent: payment.amountCent,
      type: "PAYMENT_SUCCESS_ORDER_NOT_PAID",
      detailJson: { sourceType: payment.sourceType, paymentStatus: payment.status, orderStatus: payment.orderStatus }
    });
  }
  if (payment.status === PaymentStatus.SUCCESS && payment.amountCent !== payment.expectedAmountCent) {
    items.push({
      orderNo: payment.orderNo,
      outTradeNo: payment.outTradeNo,
      transactionId: payment.transactionId,
      localAmountCent: payment.expectedAmountCent,
      remoteAmountCent: payment.amountCent,
      type: "AMOUNT_MISMATCH",
      detailJson: { sourceType: payment.sourceType, paymentAmountCent: payment.amountCent, expectedAmountCent: payment.expectedAmountCent }
    });
  }
  if (payment.status === PaymentStatus.SUCCESS && !payment.transactionId && payment.outTradeNo.includes("WECHAT")) {
    items.push({
      orderNo: payment.orderNo,
      outTradeNo: payment.outTradeNo,
      localAmountCent: payment.amountCent,
      type: "MISSING_TRANSACTION_ID",
      detailJson: { sourceType: payment.sourceType, paymentStatus: payment.status }
    });
  }
  return items;
}

export function buildBillReconciliationResults(billId: string, localRows: LocalPaymentRow[], billRows: BillRow[]): Prisma.ReconciliationResultCreateManyInput[] {
  const results: Prisma.ReconciliationResultCreateManyInput[] = [];
  const localByOutTradeNo = new Map(localRows.map((row) => [row.outTradeNo, row]));
  const remoteByOutTradeNo = new Map<string, BillRow[]>();
  for (const row of billRows) {
    if (!row.outTradeNo) continue;
    remoteByOutTradeNo.set(row.outTradeNo, [...(remoteByOutTradeNo.get(row.outTradeNo) ?? []), row]);
  }
  for (const [outTradeNo, rows] of remoteByOutTradeNo.entries()) {
    if (rows.length > 1) {
      results.push(toReconciliationCreate(billId, "DUPLICATE", null, rows[0], { duplicateCount: rows.length }));
      continue;
    }
    const remote = rows[0]!;
    const local = localByOutTradeNo.get(outTradeNo);
    if (!local) {
      results.push(toReconciliationCreate(billId, "WECHAT_ONLY", null, remote));
      continue;
    }
    if (remote.amountCent !== null && remote.amountCent !== local.amountCent) {
      results.push(toReconciliationCreate(billId, "AMOUNT_MISMATCH", local, remote));
    } else if (remote.status && !isRemoteSuccessStatus(remote.status)) {
      results.push(toReconciliationCreate(billId, "STATUS_MISMATCH", local, remote));
    } else {
      results.push(toReconciliationCreate(billId, "MATCHED", local, remote, undefined, "RESOLVED"));
    }
  }
  for (const local of localRows) {
    if (!remoteByOutTradeNo.has(local.outTradeNo)) results.push(toReconciliationCreate(billId, "SYSTEM_ONLY", local, null));
  }
  return results;
}

function toReconciliationCreate(billId: string, type: string, local: LocalPaymentRow | null, remote: BillRow | null, extra?: Record<string, unknown>, status = "OPEN"): Prisma.ReconciliationResultCreateManyInput {
  return {
    billId,
    orderNo: local?.orderNo ?? null,
    outTradeNo: local?.outTradeNo ?? remote?.outTradeNo ?? null,
    transactionId: local?.transactionId ?? remote?.transactionId ?? null,
    localAmountCent: local?.amountCent ?? null,
    remoteAmountCent: remote?.amountCent ?? null,
    type,
    status,
    detailJson: {
      sourceType: local?.sourceType ?? inferSourceFromOutTradeNo(remote?.outTradeNo),
      localStatus: local?.status ?? null,
      remoteStatus: remote?.status ?? null,
      remotePaidAt: remote?.paidAt ?? null,
      ...(extra ?? {})
    }
  };
}

function summarizeReconciliationResults(results: Prisma.ReconciliationResultCreateManyInput[]) {
  return results.reduce<Record<string, number>>((summary, item) => {
    summary[item.type] = (summary[item.type] ?? 0) + 1;
    return summary;
  }, {});
}

export function parseWechatBillRows(text: string): { rows: BillRow[]; warnings: string[] } {
  const warnings: string[] = [];
  const rawLines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("`----"));
  const headerIndex = rawLines.findIndex((line) => /商户订单号|out_trade_no/i.test(line));
  if (headerIndex < 0) return { rows: [], warnings: ["未找到商户订单号表头"] };
  const delimiter = rawLines[headerIndex]!.includes("\t") ? "\t" : ",";
  const headers = splitDelimitedLine(rawLines[headerIndex]!, delimiter).map(cleanBillCell);
  const rows: BillRow[] = [];
  for (const line of rawLines.slice(headerIndex + 1)) {
    const cells = splitDelimitedLine(line, delimiter).map(cleanBillCell);
    if (cells.length < 2) continue;
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
    const outTradeNo = pickRecordValue(record, ["商户订单号", "out_trade_no", "商户单号"]);
    if (!outTradeNo) continue;
    rows.push({
      outTradeNo,
      transactionId: pickRecordValue(record, ["微信支付订单号", "微信订单号", "transaction_id"]),
      amountCent: parseAmountCent(pickRecordValue(record, ["应结订单金额", "总金额", "订单金额", "amount"])),
      status: pickRecordValue(record, ["交易状态", "状态", "trade_state"]),
      paidAt: normalizeBillTime(pickRecordValue(record, ["交易时间", "支付完成时间", "success_time"])),
      raw: record
    });
  }
  return { rows, warnings };
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === "\"") {
      quoted = !quoted;
    } else if (char === delimiter && !quoted) {
      result.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function cleanBillCell(value: string): string {
  return value.replace(/^`/, "").replace(/^"|"$/g, "").trim();
}

function pickRecordValue(record: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const match = Object.entries(record).find(([header]) => header.toLowerCase() === key.toLowerCase() || header.includes(key));
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseAmountCent(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/[¥￥,\s]/g, "");
  const amount = Number.parseFloat(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function normalizeBillTime(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.replace(/\//g, "-"));
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

function extractBillRows(summaryJson: Prisma.JsonValue | null): BillRow[] {
  if (!isRecord(summaryJson)) return [];
  const rows = (summaryJson as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row: Record<string, any>) => ({
    outTradeNo: typeof row.outTradeNo === "string" ? row.outTradeNo : null,
    transactionId: typeof row.transactionId === "string" ? row.transactionId : null,
    amountCent: Number.isInteger(row.amountCent) ? row.amountCent : null,
    status: typeof row.status === "string" ? row.status : null,
    paidAt: typeof row.paidAt === "string" ? row.paidAt : null,
    raw: isRecord(row.raw) ? row.raw : {}
  }));
}

function isRemoteSuccessStatus(value: string): boolean {
  return /SUCCESS|成功|已支付/i.test(value);
}

function inferSourceFromOutTradeNo(value: string | null | undefined): FinanceSourceType | null {
  if (!value) return null;
  return value.startsWith("MALL_") ? "MALL" : "REGISTRATION";
}

function mergeJsonObject(current: Prisma.JsonValue | null | undefined, patch: Record<string, unknown>): Prisma.InputJsonObject {
  return { ...(isRecord(current) ? current : {}), ...patch } as Prisma.InputJsonObject;
}

function billDayRange(date: Date): DateRange {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { gte: start, lte: end };
}

function readDateRange(input: Record<string, unknown>): DateRange {
  const startAt = readOptionalDate(input.startAt);
  const endAt = readOptionalDate(input.endAt);
  return { ...(startAt ? { gte: startAt } : {}), ...(endAt ? { lte: endAt } : {}) };
}

function readPage(query: Record<string, unknown>) {
  const page = Math.max(1, readOptionalNonNegativeInt(query.page) ?? 1);
  const pageSize = Math.min(100, Math.max(1, readOptionalNonNegativeInt(query.pageSize) ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function readSourceType(value: unknown): FinanceSourceType {
  const source = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "ALL";
  if (source === "REGISTRATION" || source === "MALL" || source === "ALL") return source;
  throw new BadRequestException("sourceType 必须是 REGISTRATION / MALL / ALL");
}

function readPaymentStatus(value: unknown): PaymentStatus | undefined {
  if (!value) return undefined;
  const status = String(value).toUpperCase();
  if (Object.values(PaymentStatus).includes(status as PaymentStatus)) return status as PaymentStatus;
  throw new BadRequestException("支付状态不合法");
}

function readPaymentProvider(value: unknown): PaymentProvider | undefined {
  if (!value) return undefined;
  const provider = String(value).toUpperCase();
  if (Object.values(PaymentProvider).includes(provider as PaymentProvider)) return provider as PaymentProvider;
  throw new BadRequestException("支付渠道不合法");
}

function readRefundStatus(value: unknown): RefundStatus | undefined {
  if (!value) return undefined;
  const status = String(value).toUpperCase();
  if (Object.values(RefundStatus).includes(status as RefundStatus)) return status as RefundStatus;
  throw new BadRequestException("退款状态不合法");
}

function readInvoiceStatus(value: unknown): InvoiceStatus | undefined {
  if (!value) return undefined;
  const status = String(value).toUpperCase();
  if (Object.values(InvoiceStatus).includes(status as InvoiceStatus)) return status as InvoiceStatus;
  throw new BadRequestException("发票状态不合法");
}

function readObject(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new BadRequestException("请求体格式不正确");
  return value;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalNonNegativeInt(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isInteger(parsed)) return undefined;
  if (parsed < 0) throw new BadRequestException("数值不能为负数");
  return parsed;
}

function readOptionalDate(value: unknown): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException("日期格式不正确");
  return date;
}

function readRequiredDate(value: unknown, key: string): Date {
  const date = readOptionalDate(value);
  if (!date) throw new BadRequestException(`${key} 不能为空`);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isFeatureEnabled(name: string): boolean {
  return process.env[name] === "true";
}

function isRegistrationMockRefundEnabled(): boolean {
  return process.env.REFUND_MODE === "mock" || process.env.MOCK_REFUND_ENABLED === "true";
}

function isRegistrationWechatRefundConfigured(): boolean {
  return process.env.REFUND_MODE === "wechat" || process.env.WECHAT_REFUND_ENABLED === "true";
}

function isWechatBillDownloadEnabled(): boolean {
  return process.env.WECHAT_PAY_BILL_DOWNLOAD_ENABLED === "true" && Boolean(process.env.WECHAT_PAY_BILL_STORAGE_PATH?.trim());
}

function resolvePublicApiBase(): string {
  const base = (process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || process.env.API_BASE_URL || "https://guanchaohuiji.com/api").trim();
  return base.replace(/\/$/, "");
}

function generateCode(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
