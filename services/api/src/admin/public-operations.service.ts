import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CouponClaimStatus, InvoiceStatus, Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { isMallMockPaymentEnabled, isMallWechatPaymentEnabled } from "../mall/mall-payment.config";

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

  async myCoupons(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.couponClaim.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      include: { coupon: true, campaign: true }
    });
    return ok({
      items: items.map((item) => ({
        ...formatDateFields(item),
        coupon: {
          id: item.coupon.id,
          code: item.coupon.code,
          name: item.coupon.name,
          type: item.coupon.type,
          discountAmountCent: item.coupon.discountAmountCent,
          discountPercent: item.coupon.discountPercent,
          minAmountCent: item.coupon.minAmountCent,
          endAt: item.coupon.endAt?.toISOString() ?? null
        },
        campaign: {
          id: item.campaign.id,
          name: item.campaign.name
        }
      }))
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
    const order = await this.prisma.order.findFirst({ where: { orderNo: readRequiredString(body, "orderNo"), userId: currentUser.id } });
    if (!order || order.status !== "PAID") throw new ConflictException("仅已支付订单可申请发票");
    const item = await this.prisma.invoiceApplication.create({
      data: {
        invoiceNo: generateCode("INV"),
        orderNo: order.orderNo,
        orderId: order.id,
        userId: currentUser.id,
        title: readRequiredString(body, "title"),
        taxNo: readNullableString(body.taxNo),
        email: readNullableString(body.email),
        amountCent: order.paidAmountCent ?? order.payableAmountCent,
        status: InvoiceStatus.REQUESTED
      }
    });
    return ok(formatDateFields(item));
  }

  async myInvoices(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.invoiceApplication.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: "desc" } });
    return ok({ items: items.map(formatDateFields) });
  }

  async myRefunds(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.refund.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return ok({ items: items.map(formatDateFields) });
  }

  async myMallOrders(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.mallOrder.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { items: true, shipments: true, afterSales: { include: { refunds: true } }, payments: true, refunds: true }
    });
    return ok({
      items: items.map(formatMallOrder)
    });
  }

  async myMallOrder(id: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const item = await this.prisma.mallOrder.findFirst({
      where: { id, userId: currentUser.id },
      include: { items: true, shipments: true, afterSales: { include: { refunds: true } }, payments: true, refunds: true }
    });
    if (!item) throw new NotFoundException("商城订单不存在");
    return ok(formatMallOrder(item));
  }

  async createMallAfterSale(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const body = readObject(input);
    const orderId = readRequiredString(body, "orderId");
    const type = readMallAfterSaleType(body.type);
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
          reason: readNullableString(body.reason),
          note: readNullableString(body.note)
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
  model: string;
  maxOutputTokens: number;
  fallbackEnabled: boolean;
  citationsEnabled: boolean;
  questionLogEnabled: boolean;
}) {
  const provider = (process.env.AI_PROVIDER || config.provider || "LOCAL_FALLBACK").toUpperCase();
  const model = process.env.AI_MODEL || config.model || "local-keyword";
  const externalProvider = !["LOCAL_FALLBACK", "MOCK"].includes(provider);
  return {
    enabled: config.enabled || isEnabled("AI_KB_ENABLED"),
    provider: externalProvider ? provider : "LOCAL_FALLBACK",
    model: externalProvider ? model : "local-keyword",
    requiresExternalKey: externalProvider,
    keyConfigured: Boolean(process.env.AI_API_KEY),
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

function formatMallOrder(item: {
  items: Array<Record<string, unknown>>;
  shipments: Array<Record<string, unknown>>;
  afterSales: Array<Record<string, unknown>>;
} & Record<string, unknown>) {
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
    paymentEnabled: item.status === "PENDING_PAYMENT" && (isMallWechatPaymentEnabled() || isMallMockPaymentEnabled()),
    paymentNotice: buildMallPaymentNotice(String(item.status))
  };
}

function buildMallPaymentNotice(status: string): string | null {
  if (status !== "PENDING_PAYMENT") return null;
  if (isMallWechatPaymentEnabled()) return "商城订单可发起微信支付，支付金额以服务端订单应付金额为准。";
  if (isMallMockPaymentEnabled()) return "当前为 mock 支付模式，可使用测试支付完成商城订单。";
  return "商城支付未启用，订单保持待支付状态，不会伪造支付成功。";
}
