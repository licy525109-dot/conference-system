import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CouponClaimStatus, InvoiceStatus, Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

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

  async askAi(conferenceId: string, input: unknown, currentUser: CurrentUser | undefined) {
    if (!isEnabled("AI_KB_ENABLED")) {
      return ok({ answer: "会议助手暂未启用，请联系会务人员。", sources: [], provider: "disabled" });
    }
    const question = readRequiredString(readObject(input), "question");
    const kb = await this.prisma.knowledgeBase.findFirst({ where: { conferenceId, enabled: true }, include: { documents: { include: { chunks: true } }, autoRules: true } });
    if (!kb) {
      return ok({ answer: "当前会议暂未配置知识库，请以会议详情页信息为准。", sources: [], provider: "mock" });
    }
    const autoRule = kb.autoRules.filter((rule) => rule.enabled).sort((a, b) => b.priority - a.priority).find((rule) => question.includes(rule.keyword));
    const chunks = kb.documents.flatMap((document) => document.chunks.map((chunk) => ({ documentTitle: document.title, content: chunk.content })));
    const matched = autoRule ? [] : chunks.filter((chunk) => scoreQuestion(question, chunk.content) > 0).slice(0, 3);
    const answer = autoRule?.answer ?? (matched[0] ? `根据会议资料：${matched.map((item) => item.content).join(" ")}`.slice(0, 800) : "这个问题我暂时没有在当前会议资料中找到答案，请联系会务人员确认。");
    await this.prisma.aiQuestionLog.create({
      data: {
        conferenceId,
        userId: currentUser?.id,
        question,
        answer,
        matchedJson: matched as Prisma.InputJsonArray,
        provider: process.env.AI_PROVIDER || "mock"
      }
    });
    return ok({ answer, sources: matched, provider: process.env.AI_PROVIDER || "mock" });
  }

  async aiSuggestions(conferenceId: string) {
    const kb = await this.prisma.knowledgeBase.findFirst({ where: { conferenceId, enabled: true }, include: { documents: true } });
    const base = ["会议时间地点是什么？", "如何查看报名凭证？", "现场签到需要什么？"];
    return ok({ items: kb?.documents.slice(0, 3).map((doc) => `${doc.title} 有哪些重点？`) ?? base });
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
      include: { items: true, shipments: true, afterSales: true }
    });
    return ok({
      items: items.map((item) => ({
        ...formatDateFields(item),
        items: item.items.map(formatDateFields),
        shipments: item.shipments.map(formatDateFields),
        afterSales: item.afterSales.map(formatDateFields)
      }))
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

function scoreQuestion(question: string, content: string): number {
  return question.split(/\s+|，|。|\?|？/).filter((word) => word.length >= 2 && content.includes(word)).length;
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
