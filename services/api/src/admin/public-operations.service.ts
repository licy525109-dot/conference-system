import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CouponClaimStatus, CouponRedemptionStatus, CouponScope, InvoiceStatus, Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { decryptSecret } from "../wecom/wecom.crypto";
import { resolveMallPaymentRuntime, type MallPaymentRuntimeConfig } from "../mall/mall-payment.config";

const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR || join(inferProjectRoot(process.cwd()), "uploads"));
const AFTERSALE_UPLOAD_DIR = join(UPLOADS_ROOT, "aftersales");
const AFTERSALE_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp"
};

@Injectable()
export class PublicOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async claimCoupon(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const body = readObject(input);
    const claimCode = readRequiredString(body, "claimCode");
    const campaign = await this.prisma.couponCampaign.findUnique({
      where: { claimCode },
      include: { coupons: { include: { coupon: true } } }
    });
    if (!campaign || !campaign.enabled) throw new NotFoundException("优惠活动不存在或已停用");
    const now = new Date();
    if (campaign.startAt && campaign.startAt > now) throw new ConflictException("优惠活动尚未开始");
    if (campaign.endAt && campaign.endAt < now) throw new ConflictException("优惠活动已结束");
    if (campaign.totalLimit !== null && campaign.claimedCount >= campaign.totalLimit) throw new ConflictException("优惠活动已领完");
    if (campaign.coupons.length === 0) throw new ConflictException("优惠活动未绑定优惠券");

    const claims = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.couponClaim.findMany({ where: { campaignId: campaign.id, userId: currentUser.id } });
      if (existing.length > 0) return existing;
      const created = [];
      for (const item of campaign.coupons) {
        created.push(
          await tx.couponClaim.create({
            data: { campaignId: campaign.id, couponId: item.couponId, userId: currentUser.id, status: CouponClaimStatus.CLAIMED }
          })
        );
      }
      await tx.couponCampaign.update({ where: { id: campaign.id }, data: { claimedCount: { increment: 1 } } });
      return created;
    });

    return ok({
      campaign: {
        id: campaign.id,
        name: campaign.name,
        claimCode: campaign.claimCode
      },
      claims: claims.map(formatDateFields)
    });
  }

  async myCoupons(currentUser: CurrentUser | undefined, query: Record<string, unknown> = {}) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const scope = readOptionalCouponScope(query.scope);
    const items = await this.prisma.couponClaim.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      include: { coupon: true, campaign: true }
    });
    const couponIds = Array.from(new Set(items.map((item) => item.couponId)));
    const [registrationRedemptions, mallRedemptions] = await Promise.all([
      this.prisma.couponRedemption.findMany({
        where: { userId: currentUser.id, couponId: { in: couponIds }, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } },
        select: { couponId: true, status: true, usedAt: true, orderId: true }
      }),
      this.prisma.mallCouponRedemption.findMany({
        where: { userId: currentUser.id, couponId: { in: couponIds }, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } },
        select: { couponId: true, status: true, usedAt: true, mallOrderId: true }
      })
    ]);
    const usageByCoupon = new Map<string, { pending: boolean; used: boolean; usedAt: string | null }>();
    for (const item of [...registrationRedemptions, ...mallRedemptions]) {
      const usage = usageByCoupon.get(item.couponId) ?? { pending: false, used: false, usedAt: null };
      usage.pending = usage.pending || item.status === CouponRedemptionStatus.PENDING;
      usage.used = usage.used || item.status === CouponRedemptionStatus.USED;
      usage.usedAt = usage.usedAt ?? item.usedAt?.toISOString() ?? null;
      usageByCoupon.set(item.couponId, usage);
    }
    const filtered = scope ? items.filter((item) => couponMatchesScope(item.coupon.scope, scope)) : items;
    return ok({
      items: filtered.map((item) => {
        const usage = usageByCoupon.get(item.couponId);
        const expired = Boolean(item.coupon.endAt && item.coupon.endAt < new Date());
        const usable = item.status === CouponClaimStatus.CLAIMED && item.coupon.enabled && !expired && !usage?.pending && !usage?.used;
        return {
          ...formatDateFields(item),
          usedAt: usage?.usedAt ?? item.usedAt?.toISOString() ?? null,
          usable,
          statusText: usage?.used ? "已使用" : usage?.pending ? "待支付占用" : expired ? "已过期" : usable ? "可使用" : "不可用",
          businessType: couponBusinessType(item.coupon.scope),
          scopeText: couponScopeText(item.coupon.scope),
          usePath: couponUsePath(item.coupon),
          coupon: {
            id: item.coupon.id,
            code: item.coupon.code,
            name: item.coupon.name,
            type: item.coupon.type,
            scope: item.coupon.scope,
            discountAmountCent: item.coupon.discountAmountCent,
            discountPercent: item.coupon.discountPercent,
            minAmountCent: item.coupon.minAmountCent,
            minQuantity: item.coupon.minQuantity,
            conferenceId: item.coupon.conferenceId,
            allowedSkuIds: Array.isArray(item.coupon.allowedSkuIds) ? item.coupon.allowedSkuIds.filter((value): value is string => typeof value === "string") : [],
            enabled: item.coupon.enabled,
            startAt: item.coupon.startAt?.toISOString() ?? null,
            endAt: item.coupon.endAt?.toISOString() ?? null
          },
          campaign: {
            id: item.campaign.id,
            name: item.campaign.name
          }
        };
      })
    });
  }

  async couponCampaignPublic(id: string) {
    const campaign = await this.prisma.couponCampaign.findUnique({
      where: { id },
      include: { coupons: { include: { coupon: true } } }
    });
    if (!campaign || !campaign.enabled) throw new NotFoundException("优惠活动不存在或已停用");
    const now = new Date();
    const started = !campaign.startAt || campaign.startAt <= now;
    const ended = Boolean(campaign.endAt && campaign.endAt < now);
    const stockExhausted = campaign.totalLimit !== null && campaign.claimedCount >= campaign.totalLimit;
    return ok({
      id: campaign.id,
      name: campaign.name,
      claimCode: campaign.claimCode,
      qrScene: campaign.qrScene,
      enabled: campaign.enabled,
      startAt: campaign.startAt?.toISOString() ?? null,
      endAt: campaign.endAt?.toISOString() ?? null,
      totalLimit: campaign.totalLimit,
      claimedCount: campaign.claimedCount,
      claimable: started && !ended && !stockExhausted,
      statusText: !started ? "优惠活动尚未开始" : ended ? "优惠活动已结束" : stockExhausted ? "优惠活动已领完" : "可领取",
      coupons: campaign.coupons.map((item) => ({
        id: item.coupon.id,
        name: item.coupon.name,
        type: item.coupon.type,
        scope: item.coupon.scope,
        scopeText: couponScopeText(item.coupon.scope),
        discountAmountCent: item.coupon.discountAmountCent,
        discountPercent: item.coupon.discountPercent,
        minAmountCent: item.coupon.minAmountCent,
        endAt: item.coupon.endAt?.toISOString() ?? null
      }))
    });
  }

  async askAi(conferenceId: string, input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const question = readRequiredString(readObject(input), "question");
    const config = await this.getAiRuntimeConfig();
    const runtime = resolveAiRuntime(config);
    if (!runtime.enabled) {
      const answer = "会议助手未启用，请联系会务人员。";
      await this.writeAiLog({ conferenceId, userId: currentUser.id, question, answer, provider: runtime.provider, model: runtime.model, fallback: true, errorReason: "AI_DISABLED", loggingEnabled: runtime.questionLogEnabled });
      return ok({ answer, sources: [], provider: runtime.provider, model: runtime.model, status: "DISABLED", fallback: true, hit: false });
    }
    if (runtime.requiresExternalKey && !runtime.keyConfigured) {
      const answer = "AI provider 未配置，会议助手当前无法回答，请联系会务人员。";
      await this.writeAiLog({ conferenceId, userId: currentUser.id, question, answer, provider: runtime.provider, model: runtime.model, fallback: true, errorReason: "PROVIDER_KEY_MISSING", loggingEnabled: runtime.questionLogEnabled });
      return ok({ answer, sources: [], provider: runtime.provider, model: runtime.model, status: "PROVIDER_NOT_CONFIGURED", fallback: true, hit: false });
    }
    const kb = await this.prisma.knowledgeBase.findUnique({
      where: { conferenceId },
      include: { documents: { where: { status: "ACTIVE" }, include: { chunks: true } }, autoRules: true }
    });
    if (!kb) {
      const answer = "当前会议暂未配置知识库，请以会议详情页信息为准。";
      await this.writeAiLog({ conferenceId, userId: currentUser.id, question, answer, provider: runtime.provider, model: runtime.model, fallback: true, errorReason: "KNOWLEDGE_BASE_MISSING", loggingEnabled: runtime.questionLogEnabled });
      return ok({ answer, sources: [], provider: runtime.provider, model: runtime.model, status: "NO_KNOWLEDGE_BASE", fallback: true, hit: false });
    }
    if (!kb.enabled) {
      const answer = "当前会议知识库未启用，请以会议详情页信息为准。";
      await this.writeAiLog({ conferenceId, userId: currentUser.id, question, answer, knowledgeBaseId: kb.id, provider: runtime.provider, model: runtime.model, fallback: true, errorReason: "KNOWLEDGE_BASE_DISABLED", loggingEnabled: runtime.questionLogEnabled && kb.loggingEnabled });
      return ok({ answer, sources: [], provider: runtime.provider, model: runtime.model, status: "NO_KNOWLEDGE_BASE", fallback: true, hit: false });
    }
    const autoRule = kb.autoRules.filter((rule) => rule.enabled).sort((a, b) => b.priority - a.priority).find((rule) => question.includes(rule.keyword));
    const chunks = kb.documents.flatMap((document) =>
      document.chunks.map((chunk) => ({ id: chunk.id, chunkIndex: chunk.chunkIndex, documentId: document.id, documentTitle: document.title, content: chunk.content, score: scoreQuestion(question, chunk.content) }))
    );
    const matched = autoRule ? [] : chunks.filter((chunk) => chunk.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
    const sources = runtime.citationsEnabled && kb.citationsEnabled ? matched.map(formatAiSource) : [];
    const fallbackText = kb.fallbackText || "当前会议资料中未找到相关信息，请联系会务人员确认。";
    const answer = autoRule?.answer ?? (matched[0] ? `根据当前会议资料：${matched.map((item) => item.content).join(" ")}`.slice(0, runtime.maxOutputTokens) : fallbackText);
    const fallback = !autoRule && matched.length === 0;
    const primary = matched[0];
    await this.writeAiLog({
      conferenceId,
      userId: currentUser.id,
      question,
      answer,
      knowledgeBaseId: kb.id,
      matchedDocumentId: primary?.documentId,
      matchedChunkId: primary?.id,
      matchedJson: matched,
      referencesJson: sources,
      hit: Boolean(autoRule || primary),
      fallback,
      provider: runtime.provider,
      model: runtime.model,
      errorReason: fallback ? "NO_MATCHED_CHUNK" : undefined,
      loggingEnabled: runtime.questionLogEnabled && kb.loggingEnabled
    });
    return ok({ answer, sources, provider: runtime.provider, model: runtime.model, status: fallback ? "FALLBACK" : "ANSWERED", fallback, hit: !fallback });
  }

  async aiSuggestions(conferenceId: string) {
    const config = await this.getAiRuntimeConfig();
    if (!resolveAiRuntime(config).enabled) return ok({ items: [], status: "DISABLED", message: "会议助手未启用" });
    const manual = await this.prisma.aiSuggestion.findMany({ where: { conferenceId, enabled: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 8 });
    if (manual.length > 0) return ok({ items: manual.map((item) => item.question), status: "OK" });
    const kb = await this.prisma.knowledgeBase.findUnique({ where: { conferenceId }, include: { documents: { where: { status: "ACTIVE" }, take: 3 } } });
    if (!kb?.enabled) return ok({ items: [], status: "NO_KNOWLEDGE_BASE", message: "当前会议暂未配置知识库" });
    const base = ["会议时间地点是什么？", "如何查看报名凭证？", "现场签到需要什么？"];
    return ok({ items: kb.documents.length ? kb.documents.map((doc) => `${doc.title} 有哪些重点？`) : base, status: "OK" });
  }

  async createInvoice(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    if (!isEnabled("INVOICE_ENABLED")) return ok({ skippedReason: "INVOICE_ENABLED=false" });
    const body = readObject(input);
    const sourceType = normalizeFinanceSourceType(body.sourceType);
    const orderNo = readRequiredString(body, "orderNo");
    const order =
      sourceType === "MALL"
        ? await this.prisma.mallOrder.findFirst({ where: { orderNo, userId: currentUser.id }, include: { refunds: true } })
        : await this.prisma.order.findFirst({ where: { orderNo, userId: currentUser.id }, include: { refunds: true } });
    if (!order || (sourceType === "MALL" ? !["PAID", "SHIPPED", "COMPLETED", "REFUNDING", "REFUNDED"].includes(order.status) : order.status !== "PAID")) {
      throw new ConflictException("仅已支付订单可申请发票");
    }
    const paidAmountCent = order.paidAmountCent ?? order.payableAmountCent;
    const existing = await this.prisma.invoiceApplication.findMany({
      where: {
        userId: currentUser.id,
        orderNo,
        sourceType,
        status: { in: [InvoiceStatus.REQUESTED, InvoiceStatus.APPROVED, InvoiceStatus.ISSUED] }
      }
    });
    const issuedOrPendingAmountCent = existing.reduce((sum, item) => sum + item.amountCent, 0);
    if (issuedOrPendingAmountCent >= paidAmountCent) throw new ConflictException("该订单已存在发票申请或已完成开票");
    const profileData = readInvoiceProfileData(body);
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoiceApplication.create({
        data: {
          invoiceNo: generateCode("INV"),
          sourceType,
          orderNo,
          orderId: sourceType === "REGISTRATION" ? order.id : null,
          userId: currentUser.id,
          title: profileData.title,
          taxNo: profileData.taxNo,
          invoiceType: profileData.invoiceType,
          email: profileData.email,
          phone: profileData.phone,
          address: profileData.address,
          bankName: profileData.bankName,
          bankAccount: profileData.bankAccount,
          amountCent: paidAmountCent - issuedOrPendingAmountCent,
          remark: readNullableString(body.remark),
          status: InvoiceStatus.REQUESTED
        }
      });
      if (readBooleanDefault(body.saveAsDefault, true)) await upsertDefaultInvoiceProfile(tx, currentUser.id, profileData);
      return created;
    });
    return ok(formatDateFields(item));
  }

  async myInvoiceProfile(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const item = await this.prisma.invoiceProfile.findFirst({
      where: { userId: currentUser.id, isDefault: true },
      orderBy: { updatedAt: "desc" }
    });
    return ok({ item: item ? formatDateFields(item) : null });
  }

  async saveInvoiceProfile(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const item = await this.prisma.$transaction((tx) => upsertDefaultInvoiceProfile(tx, currentUser.id, readInvoiceProfileData(readObject(input))));
    return ok(formatDateFields(item));
  }

  async myInvoices(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.invoiceApplication.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: "desc" } });
    return ok({ items: items.map(formatDateFields) });
  }

  async myInvoiceableOrders(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const [registrationOrders, mallOrders, invoices] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: { userId: currentUser.id, status: "PAID" },
        orderBy: { paidAt: "desc" },
        take: 100,
        include: { conference: { select: { title: true } } }
      }),
      this.prisma.mallOrder.findMany({
        where: { userId: currentUser.id, status: { in: ["PAID", "SHIPPED", "COMPLETED", "REFUNDING", "REFUNDED"] } },
        orderBy: { paidAt: "desc" },
        take: 100,
        include: { items: { take: 2 } }
      }),
      this.prisma.invoiceApplication.findMany({
        where: { userId: currentUser.id, status: { in: [InvoiceStatus.REQUESTED, InvoiceStatus.APPROVED, InvoiceStatus.ISSUED] } }
      })
    ]);
    const invoiceAmountByKey = new Map<string, number>();
    for (const item of invoices) {
      const key = `${item.sourceType}:${item.orderNo}`;
      invoiceAmountByKey.set(key, (invoiceAmountByKey.get(key) ?? 0) + item.amountCent);
    }
    const items = [
      ...registrationOrders.map((order) => formatInvoiceableOrder({
        sourceType: "REGISTRATION",
        orderNo: order.orderNo,
        title: order.conference.title,
        paidAmountCent: order.paidAmountCent ?? order.payableAmountCent,
        paidAt: order.paidAt,
        status: order.status,
        invoiceAppliedAmountCent: invoiceAmountByKey.get(`REGISTRATION:${order.orderNo}`) ?? 0
      })),
      ...mallOrders.map((order) => formatInvoiceableOrder({
        sourceType: "MALL",
        orderNo: order.orderNo,
        title: order.items.map((item) => item.productTitle).join("、") || "商城订单",
        paidAmountCent: order.paidAmountCent ?? order.payableAmountCent,
        paidAt: order.paidAt,
        status: order.status,
        invoiceAppliedAmountCent: invoiceAmountByKey.get(`MALL:${order.orderNo}`) ?? 0
      }))
    ].filter((item) => item.availableAmountCent > 0);
    items.sort((a, b) => Date.parse(b.paidAt || "1970-01-01") - Date.parse(a.paidAt || "1970-01-01"));
    return ok({ items });
  }

  async myRefunds(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const [registrationRefunds, mallRefunds] = await this.prisma.$transaction([
      this.prisma.refund.findMany({
        where: { userId: currentUser.id },
        orderBy: { createdAt: "desc" },
        take: 100
      }),
      this.prisma.mallRefund.findMany({
        where: { order: { userId: currentUser.id } },
        orderBy: { createdAt: "desc" },
        take: 100,
        include: { order: { select: { orderNo: true } }, afterSale: true }
      })
    ]);
    const items: Array<Record<string, unknown>> = [
      ...registrationRefunds.map((item) => ({ ...formatDateFields(item), sourceType: "REGISTRATION", orderNo: item.orderNo, refundNotice: item.failedReason ?? publicRefundNotice(String(item.status)) })),
      ...mallRefunds.map((item) => ({ ...formatDateFields(item), sourceType: "MALL", orderNo: item.order.orderNo, afterSaleStatus: item.afterSale?.status ?? null, refundNotice: item.failedReason ?? publicRefundNotice(String(item.status)) }))
    ];
    items.sort((a, b) => Date.parse(String(b.createdAt)) - Date.parse(String(a.createdAt)));
    return ok({ items });
  }

  async uploadAfterSaleAttachment(file: { buffer: Buffer; originalname?: string; mimetype?: string; size: number } | undefined, publicOrigin: string) {
    if (!file) throw new BadRequestException("售后凭证图片不能为空");
    const extension = AFTERSALE_IMAGE_TYPES[file.mimetype || ""];
    if (!extension) throw new BadRequestException("售后凭证仅支持 JPG/PNG/WebP 图片");
    if (file.size > 2 * 1024 * 1024) throw new BadRequestException("售后凭证图片单张不能超过 2MB");
    mkdirSync(AFTERSALE_UPLOAD_DIR, { recursive: true });
    const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
    writeFileSync(join(AFTERSALE_UPLOAD_DIR, fileName), file.buffer, { flag: "wx" });
    return ok({ url: `${publicOrigin.replace(/\/$/, "")}/uploads/aftersales/${fileName}` });
  }

  async myMallOrders(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.mallOrder.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true, shipments: true, afterSales: { include: { refunds: true } }, payments: true, refunds: true }
    });
    const paymentConfig = await this.getMallPaymentConfig();
    return ok({
      items: items.map((item) => formatMallOrder(item, paymentConfig))
    });
  }

  async myMallOrder(id: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const item = await this.prisma.mallOrder.findFirst({
      where: { id, userId: currentUser.id },
      include: { items: true, shipments: true, afterSales: { include: { refunds: true } }, payments: true, refunds: true }
    });
    if (!item) throw new NotFoundException("商城订单不存在");
    return ok(formatMallOrder(item, await this.getMallPaymentConfig()));
  }

  async createMallAfterSale(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const body = readObject(input);
    const orderId = readRequiredString(body, "orderId");
    const type = readMallAfterSaleType(body.type);
    const reason = readRequiredString(body, "reason");
    const attachments = readAttachmentUrls(body.attachments ?? body.attachmentUrls);
    const order = await this.prisma.mallOrder.findFirst({
      where: { id: orderId, userId: currentUser.id },
      include: { afterSales: true }
    });
    if (!order) throw new NotFoundException("商城订单不存在");
    if (!["PAID", "SHIPPED", "COMPLETED"].includes(order.status)) throw new ConflictException("仅已支付、已发货或已完成商城订单可申请售后");
    if (order.afterSales.some((item) => !["REJECTED", "CANCELLED", "COMPLETED"].includes(item.status))) throw new ConflictException("该订单已有处理中售后申请");
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mallAfterSale.create({
        data: {
          orderId,
          type,
          status: "REQUESTED",
          reason,
          note: readNullableString(body.note),
          attachmentsJson: attachments
        }
      });
      await tx.mallOrder.update({ where: { id: orderId }, data: { status: "REFUNDING" } });
      return created;
    });
    return ok({
      ...formatDateFields(item),
      refundNotice: ["REFUND", "RETURN_REFUND"].includes(type) ? "真实退款暂未开放，提交后需后台审批并走后续退款流程。" : null
    });
  }

  private getAiRuntimeConfig() {
    return this.prisma.aiConfig.upsert({
      where: { name: "default" },
      update: {},
      create: { name: "default", enabled: isEnabled("AI_KB_ENABLED"), provider: process.env.AI_PROVIDER || "LOCAL_FALLBACK", model: process.env.AI_MODEL || "local-keyword" }
    });
  }

  private async getMallPaymentConfig(): Promise<MallPaymentRuntimeConfig | null> {
    return this.prisma.mallPaymentConfig?.findUnique({ where: { name: "default" } }) ?? null;
  }

  private async writeAiLog(input: {
    conferenceId: string;
    userId?: string;
    question: string;
    answer: string;
    knowledgeBaseId?: string;
    matchedDocumentId?: string;
    matchedChunkId?: string;
    matchedJson?: unknown;
    referencesJson?: unknown;
    hit?: boolean;
    fallback?: boolean;
    provider: string;
    model: string;
    errorReason?: string;
    loggingEnabled: boolean;
  }) {
    if (!input.loggingEnabled) return;
    await this.prisma.aiQuestionLog.create({
      data: {
        conferenceId: input.conferenceId,
        userId: input.userId,
        question: input.question,
        answer: input.answer,
        knowledgeBaseId: input.knowledgeBaseId,
        matchedDocumentId: input.matchedDocumentId,
        matchedChunkId: input.matchedChunkId,
        matchedJson: (input.matchedJson ?? []) as Prisma.InputJsonValue,
        referencesJson: (input.referencesJson ?? []) as Prisma.InputJsonValue,
        hit: input.hit ?? false,
        fallback: input.fallback ?? false,
        provider: input.provider,
        model: input.model,
        errorReason: input.errorReason
      }
    });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function isEnabled(name: string): boolean {
  return process.env[name] === "true";
}

function inferProjectRoot(cwd: string): string {
  if (cwd.endsWith("/services/api")) return resolve(cwd, "../..");
  return cwd;
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求体格式不正确");
  return value as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readBooleanDefault(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readInvoiceProfileData(body: Record<string, unknown>) {
  return {
    title: readRequiredString(body, "title"),
    taxNo: readNullableString(body.taxNo),
    invoiceType: readOptionalString(body.invoiceType) ?? "GENERAL",
    email: readNullableString(body.email),
    phone: readNullableString(body.phone),
    address: readNullableString(body.address),
    bankName: readNullableString(body.bankName),
    bankAccount: readNullableString(body.bankAccount)
  };
}

async function upsertDefaultInvoiceProfile(tx: Prisma.TransactionClient, userId: string, data: ReturnType<typeof readInvoiceProfileData>) {
  const current = await tx.invoiceProfile.findFirst({ where: { userId, isDefault: true }, orderBy: { updatedAt: "desc" } });
  if (current) return tx.invoiceProfile.update({ where: { id: current.id }, data: { ...data, isDefault: true } });
  return tx.invoiceProfile.create({ data: { userId, ...data, isDefault: true } });
}

function readAttachmentUrls(value: unknown): string[] {
  if (typeof value === "undefined" || value === null || value === "") return [];
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\n|,/) : null;
  if (!list) throw new BadRequestException("售后凭证图片格式不正确");
  const urls = list.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  if (urls.length > 6) throw new BadRequestException("售后凭证图片最多上传 6 张");
  for (const url of urls) {
    if (!/^https?:\/\//.test(url) && !url.startsWith("/uploads/")) throw new BadRequestException("售后凭证图片必须是有效图片 URL");
  }
  return urls;
}

function normalizeFinanceSourceType(value: unknown): "REGISTRATION" | "MALL" {
  const sourceType = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "REGISTRATION";
  if (sourceType === "REGISTRATION" || sourceType === "MALL") return sourceType;
  throw new BadRequestException("sourceType 必须是 REGISTRATION 或 MALL");
}

function readMallAfterSaleType(value: unknown): string {
  const type = typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "REFUND";
  if (!["REFUND", "RETURN_REFUND", "EXCHANGE"].includes(type)) throw new BadRequestException("售后类型必须是 REFUND / RETURN_REFUND / EXCHANGE");
  return type;
}

function scoreQuestion(question: string, content: string): number {
  const tokens = tokenize(question);
  return tokens.reduce((score, token) => score + (content.includes(token) ? Math.min(token.length, 8) : 0), 0);
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase();
  const words = normalized.split(/[\s,，。！？；;:：?？、/\\-]+/).filter((word) => word.length >= 2);
  const chars = Array.from(normalized).filter((char) => /[\u4e00-\u9fa5]/.test(char));
  const bigrams = chars.slice(0, -1).map((char, index) => `${char}${chars[index + 1]}`);
  return Array.from(new Set([...words, ...bigrams]));
}

function resolveAiRuntime(config: {
  enabled: boolean;
  provider: string;
  baseUrl?: string | null;
  model: string;
  apiKeyEnc?: string | null;
  maxOutputTokens: number;
  fallbackEnabled: boolean;
  citationsEnabled: boolean;
  questionLogEnabled: boolean;
}) {
  const provider = (process.env.AI_PROVIDER || config.provider || "LOCAL_FALLBACK").toUpperCase();
  const model = process.env.AI_MODEL || config.model || "local-keyword";
  const apiKey = process.env.AI_API_KEY || decryptSecret(config.apiKeyEnc);
  const externalProvider = !["LOCAL_FALLBACK", "MOCK"].includes(provider);
  return {
    enabled: config.enabled || isEnabled("AI_KB_ENABLED"),
    provider: externalProvider ? provider : "LOCAL_FALLBACK",
    model: externalProvider ? model : "local-keyword",
    requiresExternalKey: externalProvider,
    keyConfigured: Boolean(apiKey),
    source: process.env.AI_PROVIDER ? "ENV" : externalProvider ? "DB" : "LOCAL_FALLBACK",
    baseUrl: process.env.AI_BASE_URL || config.baseUrl || null,
    maxOutputTokens: Math.max(120, config.maxOutputTokens || 800),
    fallbackEnabled: config.fallbackEnabled,
    citationsEnabled: config.citationsEnabled,
    questionLogEnabled: config.questionLogEnabled
  };
}

function formatAiSource(source: { id: string; documentId: string; documentTitle: string; chunkIndex: number; content: string; score: number }) {
  return {
    documentId: source.documentId,
    chunkId: source.id,
    documentTitle: source.documentTitle,
    chunkIndex: source.chunkIndex,
    summary: source.content.slice(0, 180),
    excerpt: source.content.slice(0, 180),
    score: source.score
  };
}

function generateCode(prefix: string): string {
  return `${prefix}${Date.now()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function formatDateFields(item: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = { ...item };
  for (const key of Object.keys(output)) {
    const value = output[key];
    if (value instanceof Date) output[key] = value.toISOString();
  }
  return output;
}

function readOptionalCouponScope(value: unknown): CouponScope | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const normalized = value.trim().toUpperCase();
  return Object.values(CouponScope).includes(normalized as CouponScope) ? (normalized as CouponScope) : null;
}

function couponMatchesScope(couponScope: CouponScope, requestedScope: CouponScope): boolean {
  return couponScope === requestedScope || couponScope === CouponScope.BOTH;
}

function couponBusinessType(scope: CouponScope): "CONFERENCE" | "MALL" | "BOTH" {
  if (scope === CouponScope.MALL) return "MALL";
  if (scope === CouponScope.BOTH) return "BOTH";
  return "CONFERENCE";
}

function couponScopeText(scope: CouponScope): string {
  if (scope === CouponScope.MALL) return "商品优惠券";
  if (scope === CouponScope.BOTH) return "会议/商品通用券";
  return "会议优惠券";
}

function couponUsePath(coupon: { scope: CouponScope; conferenceId: string | null }): string {
  if (coupon.scope === CouponScope.MALL) return "/pages/mall/index";
  if (coupon.conferenceId) return `/pages/conference/detail?id=${encodeURIComponent(coupon.conferenceId)}`;
  return "/pages/index/index";
}

function publicRefundNotice(status: string): string {
  if (status === "REQUESTED") return "退款申请已提交，等待后台审核。";
  if (status === "PROCESSING") return "退款处理中，微信退款以回调确认到账；未配置微信退款时需线下处理。";
  if (status === "SUCCESS") return "退款已完成。";
  if (status === "REJECTED") return "退款申请已驳回。";
  if (status === "FAILED") return "退款处理失败，请联系会务人员。";
  return "";
}

function formatMallOrder(item: {
  items: Array<Record<string, unknown>>;
  shipments: Array<Record<string, unknown>>;
  afterSales: Array<Record<string, unknown>>;
} & Record<string, unknown>, paymentConfig?: MallPaymentRuntimeConfig | null) {
  const runtime = resolveMallPaymentRuntime(paymentConfig);
  return {
    ...formatDateFields(item),
    items: item.items.map(formatDateFields),
    shipments: item.shipments.map(formatDateFields),
    afterSales: item.afterSales.map((afterSale) => ({
      ...formatDateFields(afterSale),
      refunds: Array.isArray(afterSale.refunds) ? afterSale.refunds.map(formatDateFields) : []
    })),
    payments: Array.isArray(item.payments) ? item.payments.map(formatDateFields) : [],
    refunds: Array.isArray(item.refunds) ? item.refunds.map(formatDateFields) : [],
    paymentMode: runtime.mode,
    paymentConfigSource: runtime.source,
    paymentEnabled: item.status === "PENDING_PAYMENT" && runtime.paymentEnabled,
    paymentUnavailableReason: runtime.unavailableReason,
    paymentNotice: buildMallPaymentNotice(String(item.status), runtime)
  };
}

function buildMallPaymentNotice(status: string, runtime: ReturnType<typeof resolveMallPaymentRuntime>): string | null {
  if (status !== "PENDING_PAYMENT") return null;
  if (runtime.wechatEnabled) return "商城订单可发起微信支付，支付金额以服务端订单应付金额为准。";
  if (runtime.mockEnabled) return "当前为 mock 支付模式，可使用测试支付完成商城订单。";
  return "商城支付未启用，订单保持待支付状态，不会伪造支付成功。";
}

function formatInvoiceableOrder(input: {
  sourceType: "REGISTRATION" | "MALL";
  orderNo: string;
  title: string;
  paidAmountCent: number;
  paidAt: Date | null;
  status: string;
  invoiceAppliedAmountCent: number;
}) {
  return {
    ...input,
    paidAt: input.paidAt?.toISOString() ?? null,
    availableAmountCent: Math.max(0, input.paidAmountCent - input.invoiceAppliedAmountCent),
    sourceText: input.sourceType === "MALL" ? "商城订单" : "报名订单"
  };
}
