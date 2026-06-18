import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  CouponRedemptionStatus,
  CouponType,
  DiscountType,
  ConferenceStatus,
  FormFieldType,
  OrderStatus,
  Prisma,
  RegistrationSkuStatus
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface RegistrationQuoteResponse {
  conferenceId: string;
  skuId: string;
  skuName: string;
  quantity: number;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  items?: RegistrationQuoteItem[];
  discounts?: PriceDiscount[];
  messages?: string[];
  memberPricing?: MemberPricingSummary;
}

export interface RegistrationOrderResponse extends RegistrationQuoteResponse {
  orderNo: string;
  status: "PENDING";
  expiredAt: string;
}

export interface RegistrationQuoteItem {
  skuId: string;
  skuName: string;
  quantity: number;
  unitPriceCent: number;
  subtotalCent: number;
  memberUnitPriceCent?: number;
  memberSubtotalCent?: number;
  memberDiscountAmountCent?: number;
}

export interface MemberPricingSummary {
  levelId: string;
  levelCode: string;
  levelName: string;
  discountAmountCent: number;
  items: MemberPricingItemSummary[];
}

export interface MemberPricingItemSummary {
  skuId: string;
  skuName: string;
  quantity: number;
  originalUnitPriceCent: number;
  memberUnitPriceCent: number;
  discountAmountCent: number;
}

type RegistrationFormData = Record<string, Prisma.InputJsonValue>;

const FORBIDDEN_AMOUNT_FIELDS = [
  "originAmountCent",
  "discountAmountCent",
  "payableAmountCent",
  "totalAmountCent",
  "paidAmountCent"
] as const;
const ORDER_EXPIRES_IN_MS = 15 * 60 * 1000;
const MAX_ORDER_NO_ATTEMPTS = 5;
const EXPIRED_WECHAT_LOGIN_MESSAGE = "登录状态已过期，请重新进入小程序后下单。";

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: unknown, currentUser?: CurrentUser): Promise<ApiResponse<RegistrationQuoteResponse>> {
    const request = parseBaseRegistrationRequest(input);
    const conference = await this.ensurePublishedConference(request.conferenceId);
    enforceTicketLimit(conference, request.totalQuantity);
    const pricedItems = await this.getPricedItems(request.conferenceId, request.items);
    const pricing = await this.calculatePricing({
      conferenceId: request.conferenceId,
      items: pricedItems,
      couponCode: readOptionalCouponCode(input),
      userId: currentUser?.id ?? null
    });
    const firstItem = pricedItems[0];
    if (!firstItem) {
      throw new BadRequestException("items must not be empty");
    }

    const response: RegistrationQuoteResponse = {
      conferenceId: request.conferenceId,
      skuId: firstItem.skuId,
      skuName: firstItem.skuName,
      quantity: request.totalQuantity,
      originAmountCent: pricing.originAmountCent,
      discountAmountCent: pricing.discountAmountCent,
      payableAmountCent: pricing.payableAmountCent
    };

    if (request.usesItemsShape) {
      response.items = pricing.items;
      response.discounts = pricing.discounts;
      response.messages = pricing.messages;
    }
    if (pricing.memberPricing) {
      response.memberPricing = pricing.memberPricing;
    }

    return ok(response);
  }

  async createOrder(input: unknown, currentUser: CurrentUser | undefined): Promise<ApiResponse<RegistrationOrderResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }
    ensureOrderUserCanCreateOrder(currentUser);

    const request = parseBaseRegistrationRequest(input);
    const conference = await this.ensurePublishedConference(request.conferenceId);
    enforceTicketLimit(conference, request.totalQuantity);
    if (!conference.groupRegistrationEnabled && request.totalQuantity > 1) {
      throw new ConflictException("Group registration is disabled");
    }

    const pricedItems = await this.getPricedItems(request.conferenceId, request.items);
    const fields = await this.getEnabledFormFields(request.conferenceId);
    const attendees = validateAttendees(fields, request, currentUser);
    ensureAttendeesMatchItems(request.items, attendees);
    const primaryAttendee = attendees[0];
    const primaryItem = pricedItems[0];
    if (!primaryAttendee || !primaryItem) {
      throw new BadRequestException("items and attendees must not be empty");
    }

    const attendeeName = primaryAttendee.name;
    const phone = primaryAttendee.phone;
    const pricing = await this.calculatePricing({
      conferenceId: request.conferenceId,
      items: pricedItems,
      couponCode: readOptionalCouponCode(input),
      userId: currentUser.id
    });
    const expiredAt = new Date(this.getCurrentTime().getTime() + ORDER_EXPIRES_IN_MS);
    const snapshotItems = pricing.items.map((item) => ({ ...item })) as Prisma.InputJsonArray;
    const snapshotAttendees = attendees.map((attendee) => ({ ...attendee })) as Prisma.InputJsonArray;
    const snapshot = {
      conferenceId: request.conferenceId,
      skuId: primaryItem.skuId,
      skuName: primaryItem.skuName,
      attendeeName,
      phone,
      formData: primaryAttendee.formData,
      pricing: serializePricingSnapshot(pricing),
      memberPricing: pricing.memberPricing ? serializeMemberPricingSnapshot(pricing.memberPricing) : null,
      ...(request.usesItemsShape ? { items: snapshotItems, attendees: snapshotAttendees } : {})
    } satisfies Prisma.InputJsonObject;

    const order = await this.createPendingOrderWithRetry({
      userId: currentUser.id,
      conferenceId: request.conferenceId,
      skuId: primaryItem.skuId,
      items: pricing.items,
      attendeeName,
      phone,
      expiredAt,
      submittedFormJson: request.usesItemsShape ? { attendees: snapshotAttendees } : primaryAttendee.formData,
      registrationSnapshotJson: snapshot,
      originAmountCent: pricing.originAmountCent,
      discountAmountCent: pricing.discountAmountCent,
      payableAmountCent: pricing.payableAmountCent,
      discounts: pricing.discounts,
      couponId: pricing.couponId
    });

    const response: RegistrationOrderResponse = {
      orderNo: order.orderNo,
      status: "PENDING",
      conferenceId: request.conferenceId,
      skuId: primaryItem.skuId,
      skuName: primaryItem.skuName,
      quantity: request.totalQuantity,
      originAmountCent: pricing.originAmountCent,
      discountAmountCent: pricing.discountAmountCent,
      payableAmountCent: pricing.payableAmountCent,
      expiredAt: order.expiredAt.toISOString()
    };

    if (request.usesItemsShape) {
      response.items = pricing.items;
      response.discounts = pricing.discounts;
      response.messages = pricing.messages;
    }
    if (pricing.memberPricing) {
      response.memberPricing = pricing.memberPricing;
    }

    return ok(response);
  }

  protected getCurrentTime(): Date {
    return new Date();
  }

  protected generateOrderNo(): string {
    const date = this.getCurrentTime().toISOString().slice(0, 10).replaceAll("-", "");
    const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "0");
    return `REG${date}${randomPart}`;
  }

  private async ensurePublishedConference(conferenceId: string): Promise<PublishedConferenceConfig> {
    const conference = await this.prisma.conference.findFirst({
      where: {
        id: conferenceId,
        status: ConferenceStatus.PUBLISHED
      },
      select: {
        id: true,
        groupRegistrationEnabled: true,
        maxTicketsPerOrder: true
      }
    });

    if (!conference) {
      throw new NotFoundException("Conference not found");
    }

    return conference;
  }

  private async getPricedItems(conferenceId: string, items: RegistrationRequestItem[]): Promise<PricedRegistrationItem[]> {
    const pricedItems: PricedRegistrationItem[] = [];
    for (const item of items) {
      const sku = await this.getOrderableSku(conferenceId, item.skuId, item.quantity);
      pricedItems.push({
        skuId: sku.id,
        skuName: sku.name,
        quantity: item.quantity,
        unitPriceCent: sku.priceCent,
        subtotalCent: sku.priceCent * item.quantity
      });
    }

    return pricedItems;
  }

  private async getOrderableSku(conferenceId: string, skuId: string, quantity: number) {
    const sku = await this.prisma.registrationSku.findFirst({
      where: {
        id: skuId,
        conferenceId
      },
      select: {
        id: true,
        name: true,
        priceCent: true,
        stock: true,
        soldCount: true,
        status: true,
        saleStartAt: true,
        saleEndAt: true
      }
    });

    if (!sku) {
      throw new NotFoundException("Registration SKU not found");
    }

    if (sku.status !== RegistrationSkuStatus.ACTIVE) {
      throw new ConflictException("Registration SKU is not active");
    }

    if (sku.stock - sku.soldCount < quantity) {
      throw new ConflictException("Registration SKU is out of stock");
    }

    const currentTime = this.getCurrentTime();
    if (sku.saleStartAt && sku.saleStartAt > currentTime) {
      throw new ConflictException("Registration SKU sale has not started");
    }

    if (sku.saleEndAt && sku.saleEndAt < currentTime) {
      throw new ConflictException("Registration SKU sale has ended");
    }

    return sku;
  }

  private async getEnabledFormFields(conferenceId: string): Promise<FormFieldConfig[]> {
    const formDefinition = await this.prisma.formDefinition.findFirst({
      where: {
        conferenceId,
        conference: {
          status: ConferenceStatus.PUBLISHED
        }
      },
      select: {
        fields: {
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            label: true,
            fieldKey: true,
            type: true,
            required: true,
            optionsJson: true
          }
        }
      }
    });

    if (!formDefinition) {
      throw new BadRequestException("Registration form is not configured");
    }

    return formDefinition.fields;
  }

  private async calculatePricing(input: {
    conferenceId: string;
    items: PricedRegistrationItem[];
    couponCode: string | null;
    userId: string | null;
  }): Promise<PriceCalculation> {
    const originAmountCent = calculateAmount(input.items).originAmountCent;
    const memberPricing = await this.applyMemberPricing(input.userId, input.conferenceId, input.items);
    const pricedItems = memberPricing?.items ?? input.items;
    const discountBaseAmountCent = calculateEffectiveAmount(pricedItems);
    const totalQuantity = input.items.reduce((sum, item) => sum + item.quantity, 0);
    const promotion = await this.findBestPromotion(input.conferenceId, pricedItems, discountBaseAmountCent, totalQuantity);
    const coupon = input.couponCode
      ? await this.findApplicableCoupon(input.couponCode, input.conferenceId, pricedItems, discountBaseAmountCent, totalQuantity, input.userId)
      : null;
    const canStack = Boolean(promotion && coupon && promotion.stackableWithCoupon && coupon.stackableWithPromotion);
    const discounts: PriceDiscount[] = [];
    const messages: string[] = [];
    if (memberPricing?.discount) {
      discounts.push(memberPricing.discount);
    }

    if (promotion && (!coupon || canStack || promotion.discount.amountCent >= coupon.discount.amountCent)) {
      discounts.push(promotion.discount);
    }
    if (coupon && (!promotion || canStack || coupon.discount.amountCent > promotion.discount.amountCent)) {
      discounts.push(coupon.discount);
    }
    if (promotion && coupon && !canStack) {
      messages.push("优惠券与满减不可叠加，已自动选择本单更优优惠");
    }

    const discountAmountCent = Math.min(
      originAmountCent,
      discounts.reduce((sum, discount) => sum + discount.amountCent, 0)
    );

    return {
      originAmountCent,
      discountAmountCent,
      payableAmountCent: Math.max(0, originAmountCent - discountAmountCent),
      memberBaseAmountCent: discountBaseAmountCent,
      items: pricedItems,
      discounts,
      messages,
      memberPricing: memberPricing?.summary ?? null,
      couponId: discounts.some((discount) => discount.couponId === coupon?.id) ? coupon?.id ?? null : null
    };
  }

  private async applyMemberPricing(
    userId: string | null,
    conferenceId: string,
    items: PricedRegistrationItem[]
  ): Promise<AppliedMemberPricing | null> {
    if (!userId) {
      return null;
    }
    const prismaAny = this.prisma as PrismaService & {
      userMembership?: {
        findMany(args: unknown): Promise<UserMembershipRecord[]>;
      };
      membershipPriceRule?: {
        findMany(args: unknown): Promise<MembershipPriceRuleRecord[]>;
      };
    };
    if (!prismaAny.userMembership?.findMany || !prismaAny.membershipPriceRule?.findMany) {
      return null;
    }

    const now = this.getCurrentTime();
    const memberships = await prismaAny.userMembership.findMany({
      where: {
        userId,
        status: "ACTIVE",
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
        level: { enabled: true, pricingEnabled: true }
      },
      include: { level: true }
    });
    const membership = memberships
      .filter((item) => item.level.enabled && item.level.pricingEnabled && item.startsAt <= now && (!item.endsAt || item.endsAt >= now))
      .sort((left, right) => right.level.rank - left.level.rank || right.createdAt.getTime() - left.createdAt.getTime())[0];
    if (!membership) {
      return null;
    }

    const rules = (
      await prismaAny.membershipPriceRule.findMany({
        where: {
          levelId: membership.levelId,
          enabled: true,
          OR: [{ conferenceId }, { conferenceId: null }]
        }
      })
    ).filter((rule) => isMemberRuleApplicable(rule, now, conferenceId));

    const pricedItems = items.map((item) => applyBestMemberRuleToItem(item, rules));
    const itemSummaries: MemberPricingItemSummary[] = pricedItems
      .filter((item) => (item.memberDiscountAmountCent ?? 0) > 0 && typeof item.memberUnitPriceCent === "number")
      .map((item) => ({
        skuId: item.skuId,
        skuName: item.skuName,
        quantity: item.quantity,
        originalUnitPriceCent: item.unitPriceCent,
        memberUnitPriceCent: item.memberUnitPriceCent ?? item.unitPriceCent,
        discountAmountCent: item.memberDiscountAmountCent ?? 0
      }));
    const discountAmountCent = itemSummaries.reduce((sum, item) => sum + item.discountAmountCent, 0);
    if (discountAmountCent <= 0) {
      return null;
    }

    const summary: MemberPricingSummary = {
      levelId: membership.level.id,
      levelCode: membership.level.code,
      levelName: membership.level.name,
      discountAmountCent,
      items: itemSummaries
    };
    return {
      items: pricedItems,
      summary,
      discount: {
        type: DiscountType.MEMBER_PRICE,
        title: `${membership.level.name}会员价`,
        amountCent: discountAmountCent,
        snapshot: serializeMemberPricingSnapshot(summary)
      }
    };
  }

  private async findBestPromotion(
    conferenceId: string,
    items: PricedRegistrationItem[],
    discountBaseAmountCent: number,
    totalQuantity: number
  ): Promise<AppliedPromotion | null> {
    const prismaAny = this.prisma as PrismaService & {
      promotionRule?: {
        findMany(args: unknown): Promise<PromotionRuleRecord[]>;
      };
    };
    if (!prismaAny.promotionRule?.findMany) {
      return null;
    }

    const now = this.getCurrentTime();
    const rules = await prismaAny.promotionRule.findMany({
      where: {
        enabled: true,
        type: DiscountType.FULL_REDUCTION,
        OR: [{ conferenceId }, { conferenceId: null }]
      }
    });

    const applicable = rules
      .filter((rule) => isWithinWindow(rule, now))
      .filter((rule) => promotionMatches(rule, items, discountBaseAmountCent, totalQuantity))
      .map((rule) => ({
        rule,
        discount: {
          type: DiscountType.FULL_REDUCTION,
          title: rule.name,
          amountCent: Math.min(rule.discountAmountCent, discountBaseAmountCent),
          promotionRuleId: rule.id,
          snapshot: serializePromotionSnapshot(rule)
        } satisfies PriceDiscount
      }))
      .sort((left, right) => right.discount.amountCent - left.discount.amountCent);

    const best = applicable[0];
    return best ? { ...best.rule, discount: best.discount } : null;
  }

  private async findApplicableCoupon(
    code: string,
    conferenceId: string,
    items: PricedRegistrationItem[],
    discountBaseAmountCent: number,
    totalQuantity: number,
    userId: string | null
  ): Promise<AppliedCoupon | null> {
    const prismaAny = this.prisma as PrismaService & {
      coupon?: {
        findUnique(args: unknown): Promise<CouponRecord | null>;
      };
      couponRedemption?: {
        count(args: unknown): Promise<number>;
      };
    };
    if (!prismaAny.coupon?.findUnique) {
      return null;
    }

    const coupon = await prismaAny.coupon.findUnique({ where: { code } });
    if (!coupon) {
      throw new BadRequestException("优惠券不存在");
    }
    validateCoupon(coupon, this.getCurrentTime(), conferenceId, items, discountBaseAmountCent, totalQuantity);

    if (prismaAny.couponRedemption?.count) {
      if (typeof coupon.totalLimit === "number") {
        const totalUsed = await prismaAny.couponRedemption.count({
          where: { couponId: coupon.id, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
        });
        if (totalUsed >= coupon.totalLimit) {
          throw new BadRequestException("优惠券已被领完或使用完");
        }
      }
      if (userId && typeof coupon.perUserLimit === "number") {
        const userUsed = await prismaAny.couponRedemption.count({
          where: { couponId: coupon.id, userId, status: { in: [CouponRedemptionStatus.PENDING, CouponRedemptionStatus.USED] } }
        });
        if (userUsed >= coupon.perUserLimit) {
          throw new BadRequestException("你已使用过该优惠券");
        }
      }
    }

    const scopedAmountCent = filterAllowedItems(items, coupon.allowedSkuIds).reduce((sum, item) => sum + effectiveSubtotalCent(item), 0);
    const amountCent = calculateCouponAmount(coupon, scopedAmountCent);
    return {
      ...coupon,
      discount: {
        type: DiscountType.COUPON,
        title: `优惠券 ${coupon.code}`,
        amountCent,
        couponId: coupon.id,
        snapshot: serializeCouponSnapshot(coupon)
      }
    };
  }

  private async createPendingOrderWithRetry(input: CreatePendingOrderInput) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ORDER_NO_ATTEMPTS; attempt += 1) {
      try {
        const orderNo = this.generateOrderNo();
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNo,
              userId: input.userId,
              conferenceId: input.conferenceId,
              skuId: input.skuId,
              originAmountCent: input.originAmountCent,
              discountAmountCent: input.discountAmountCent,
              payableAmountCent: input.payableAmountCent,
              status: OrderStatus.PENDING,
              submittedFormJson: input.submittedFormJson,
              registrationSnapshotJson: input.registrationSnapshotJson,
              attendeeName: input.attendeeName,
              phone: input.phone,
              expiredAt: input.expiredAt
            },
            select: {
              id: true,
              orderNo: true,
              expiredAt: true
            }
          });

          for (const item of input.items) {
            await tx.orderItem.create({
              data: {
                orderId: order.id,
                skuId: item.skuId,
                skuName: item.skuName,
                unitPriceCent: item.unitPriceCent,
                quantity: item.quantity,
                totalAmountCent: item.subtotalCent
              }
            });
          }

          for (const discount of input.discounts) {
            await tx.orderDiscount.create({
              data: {
                orderId: order.id,
                type: discount.type,
                title: discount.title,
                amountCent: discount.amountCent,
                couponId: discount.couponId,
                promotionRuleId: discount.promotionRuleId,
                snapshotJson: discount.snapshot
              }
            });
          }

          if (input.couponId) {
            await tx.couponRedemption.create({
              data: {
                couponId: input.couponId,
                userId: input.userId,
                orderId: order.id
              }
            });
          }

          return {
            orderNo: order.orderNo,
            expiredAt: order.expiredAt ?? input.expiredAt
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        lastError = error;
      }
    }

    throw new ConflictException("Unable to generate unique order number", { cause: lastError });
  }
}

function ensureOrderUserCanCreateOrder(currentUser: CurrentUser): void {
  if (!isRealWechatIdentityRequired()) {
    return;
  }

  if (!currentUser.openid || currentUser.openid.startsWith("mock_")) {
    throw new ForbiddenException(EXPIRED_WECHAT_LOGIN_MESSAGE);
  }
}

function isRealWechatIdentityRequired(): boolean {
  return process.env.WECHAT_LOGIN_MODE === "real" || process.env.WECHAT_PAY_MODE === "real";
}

function parseBaseRegistrationRequest(input: unknown): BaseRegistrationRequest {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  const forbiddenAmountField = FORBIDDEN_AMOUNT_FIELDS.find((field) => Object.hasOwn(input, field));
  if (forbiddenAmountField) {
    throw new BadRequestException(`Request must not include ${forbiddenAmountField}`);
  }

  const conferenceId = readRequiredString(input, "conferenceId");
  const items = readRegistrationItems(input);
  const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);

  if (totalQuantity <= 0) {
    throw new BadRequestException("items must not be empty");
  }

  return {
    conferenceId,
    items,
    totalQuantity,
    usesItemsShape: Array.isArray(input.items),
    rawInput: input
  };
}

function readRegistrationItems(input: Record<string, unknown>): RegistrationRequestItem[] {
  if (Array.isArray(input.items)) {
    const seen = new Set<string>();
    return input.items.map((item) => {
      if (!isRecord(item)) {
        throw new BadRequestException("items must contain JSON objects");
      }

      const skuId = readRequiredString(item, "skuId");
      const quantity = readPositiveInt(item.quantity, "quantity");
      if (seen.has(skuId)) {
        throw new BadRequestException("duplicate skuId is not allowed");
      }
      seen.add(skuId);
      return { skuId, quantity };
    });
  }

  const skuId = readRequiredString(input, "skuId");
  const quantity = readPositiveInt(input.quantity, "quantity");
  return [{ skuId, quantity }];
}

function calculateAmount(items: PricedRegistrationItem[]) {
  const originAmountCent = items.reduce((sum, item) => sum + item.subtotalCent, 0);
  return {
    originAmountCent
  } as const;
}

function calculateEffectiveAmount(items: PricedRegistrationItem[]): number {
  return items.reduce((sum, item) => sum + effectiveSubtotalCent(item), 0);
}

function effectiveSubtotalCent(item: PricedRegistrationItem): number {
  return item.memberSubtotalCent ?? item.subtotalCent;
}

function readOptionalCouponCode(input: unknown): string | null {
  if (!isRecord(input) || typeof input.couponCode !== "string") {
    return null;
  }
  const code = input.couponCode.trim();
  return code.length > 0 ? code : null;
}

function isWithinWindow(record: { startAt: Date | null; endAt: Date | null }, now: Date): boolean {
  return (!record.startAt || record.startAt <= now) && (!record.endAt || record.endAt >= now);
}

function promotionMatches(
  rule: PromotionRuleRecord,
  items: PricedRegistrationItem[],
  discountBaseAmountCent: number,
  totalQuantity: number
): boolean {
  const scopedItems = filterAllowedItems(items, rule.allowedSkuIds);
  const scopedQuantity = scopedItems.reduce((sum, item) => sum + item.quantity, 0);
  const scopedAmount = scopedItems.reduce((sum, item) => sum + effectiveSubtotalCent(item), 0);
  if (scopedItems.length === 0) {
    return false;
  }
  if (typeof rule.minQuantity === "number" && scopedQuantity < rule.minQuantity) {
    return false;
  }
  if (typeof rule.minAmountCent === "number" && scopedAmount < rule.minAmountCent) {
    return false;
  }
  return totalQuantity > 0 && discountBaseAmountCent > 0;
}

function validateCoupon(
  coupon: CouponRecord,
  now: Date,
  conferenceId: string,
  items: PricedRegistrationItem[],
  discountBaseAmountCent: number,
  totalQuantity: number
): void {
  if (!coupon.enabled) {
    throw new BadRequestException("优惠券不可用");
  }
  if (coupon.startAt && coupon.startAt > now) {
    throw new BadRequestException("优惠券尚未开始");
  }
  if (coupon.endAt && coupon.endAt < now) {
    throw new BadRequestException("优惠券已过期");
  }
  if (coupon.conferenceId && coupon.conferenceId !== conferenceId) {
    throw new BadRequestException("优惠券不适用于当前会议");
  }
  if (filterAllowedItems(items, coupon.allowedSkuIds).length === 0) {
    throw new BadRequestException("优惠券不适用于当前票种");
  }
  if (typeof coupon.minAmountCent === "number" && discountBaseAmountCent < coupon.minAmountCent) {
    throw new BadRequestException("未达到优惠券使用金额");
  }
  if (typeof coupon.minQuantity === "number" && totalQuantity < coupon.minQuantity) {
    throw new BadRequestException("未达到优惠券使用张数");
  }
}

function calculateCouponAmount(coupon: CouponRecord, originAmountCent: number): number {
  if (coupon.type === CouponType.AMOUNT) {
    return Math.min(originAmountCent, coupon.discountAmountCent ?? 0);
  }

  const rawAmount = Math.floor((originAmountCent * (coupon.discountPercent ?? 0)) / 10000);
  return Math.min(originAmountCent, coupon.maxDiscountCent ?? rawAmount, rawAmount);
}

function serializePromotionSnapshot(rule: PromotionRuleRecord): Prisma.InputJsonObject {
  return {
    id: rule.id,
    name: rule.name,
    discountAmountCent: rule.discountAmountCent,
    minAmountCent: rule.minAmountCent,
    minQuantity: rule.minQuantity,
    allowedSkuIds: readAllowedSkuIds(rule.allowedSkuIds),
    startAt: rule.startAt?.toISOString() ?? null,
    endAt: rule.endAt?.toISOString() ?? null,
    stackableWithCoupon: rule.stackableWithCoupon
  };
}

function serializeCouponSnapshot(coupon: CouponRecord): Prisma.InputJsonObject {
  return {
    id: coupon.id,
    code: coupon.code,
    name: coupon.name,
    type: coupon.type,
    discountAmountCent: coupon.discountAmountCent,
    discountPercent: coupon.discountPercent,
    maxDiscountCent: coupon.maxDiscountCent,
    minAmountCent: coupon.minAmountCent,
    minQuantity: coupon.minQuantity,
    totalLimit: coupon.totalLimit,
    perUserLimit: coupon.perUserLimit,
    enabled: coupon.enabled,
    startAt: coupon.startAt?.toISOString() ?? null,
    endAt: coupon.endAt?.toISOString() ?? null,
    stackableWithPromotion: coupon.stackableWithPromotion,
    conferenceId: coupon.conferenceId,
    allowedSkuIds: readAllowedSkuIds(coupon.allowedSkuIds)
  };
}

function serializeMemberPricingSnapshot(summary: MemberPricingSummary): Prisma.InputJsonObject {
  return {
    levelId: summary.levelId,
    levelCode: summary.levelCode,
    levelName: summary.levelName,
    discountAmountCent: summary.discountAmountCent,
    items: summary.items.map((item) => ({ ...item }))
  };
}

function serializePricingSnapshot(pricing: PriceCalculation): Prisma.InputJsonObject {
  return {
    originAmountCent: pricing.originAmountCent,
    memberBaseAmountCent: pricing.memberBaseAmountCent,
    discountAmountCent: pricing.discountAmountCent,
    payableAmountCent: pricing.payableAmountCent,
    discounts: pricing.discounts.map((discount) => ({
      type: discount.type,
      title: discount.title,
      amountCent: discount.amountCent,
      couponId: discount.couponId ?? null,
      promotionRuleId: discount.promotionRuleId ?? null,
      snapshot: discount.snapshot ?? null
    }))
  };
}

function isMemberRuleApplicable(rule: MembershipPriceRuleRecord, now: Date, conferenceId: string): boolean {
  if (!rule.enabled || !isWithinWindow(rule, now)) {
    return false;
  }
  return !rule.conferenceId || rule.conferenceId === conferenceId;
}

function applyBestMemberRuleToItem(item: PricedRegistrationItem, rules: MembershipPriceRuleRecord[]): PricedRegistrationItem {
  const candidates = rules
    .filter((rule) => !rule.skuId || rule.skuId === item.skuId)
    .map((rule) => {
      const memberUnitPriceCent = calculateMemberUnitPrice(item.unitPriceCent, rule);
      const discountAmountCent = Math.max(0, item.unitPriceCent - memberUnitPriceCent) * item.quantity;
      return { rule, memberUnitPriceCent, discountAmountCent };
    })
    .filter((candidate) => candidate.discountAmountCent > 0)
    .sort(
      (left, right) =>
        right.discountAmountCent - left.discountAmountCent ||
        Number(Boolean(right.rule.skuId)) - Number(Boolean(left.rule.skuId)) ||
        Number(Boolean(right.rule.conferenceId)) - Number(Boolean(left.rule.conferenceId))
    );
  const best = candidates[0];
  if (!best) {
    return item;
  }
  return {
    ...item,
    memberUnitPriceCent: best.memberUnitPriceCent,
    memberSubtotalCent: best.memberUnitPriceCent * item.quantity,
    memberDiscountAmountCent: best.discountAmountCent
  };
}

function calculateMemberUnitPrice(originalUnitPriceCent: number, rule: MembershipPriceRuleRecord): number {
  if (typeof rule.fixedPriceCent === "number") {
    return clampCent(rule.fixedPriceCent, originalUnitPriceCent);
  }
  if (typeof rule.discountPercent === "number") {
    return clampCent(Math.floor((originalUnitPriceCent * rule.discountPercent) / 10000), originalUnitPriceCent);
  }
  if (typeof rule.discountCent === "number") {
    return clampCent(originalUnitPriceCent - rule.discountCent, originalUnitPriceCent);
  }
  return originalUnitPriceCent;
}

function clampCent(value: number, maxCent: number): number {
  return Math.max(0, Math.min(maxCent, value));
}

function filterAllowedItems(items: PricedRegistrationItem[], allowedSkuIds: Prisma.JsonValue | null): PricedRegistrationItem[] {
  const allowed = readAllowedSkuIds(allowedSkuIds);
  if (allowed.length === 0) {
    return items;
  }
  return items.filter((item) => allowed.includes(item.skuId));
}

function readAllowedSkuIds(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function validateAttendees(
  fields: FormFieldConfig[],
  request: BaseRegistrationRequest,
  currentUser: CurrentUser
): RegistrationAttendeeInput[] {
  const rawAttendees = readRawAttendees(request);
  return rawAttendees.map((attendee, index) => {
    const formData = validateFormData(fields, attendee.formData);
    return {
      skuId: attendee.skuId,
      name: readOptionalFormString(formData, "name") ?? (index === 0 ? currentUser.nickname : null) ?? "未填写",
      phone: readOptionalFormString(formData, "phone") ?? "",
      company: readOptionalStringField(formData, "company"),
      title: readOptionalStringField(formData, "title") ?? readOptionalStringField(formData, "position"),
      formData
    };
  });
}

function readRawAttendees(request: BaseRegistrationRequest): RawRegistrationAttendee[] {
  const input = request.rawInput;
  if (Array.isArray(input.attendees)) {
    return input.attendees.map((attendee) => {
      if (!isRecord(attendee)) {
        throw new BadRequestException("attendees must contain JSON objects");
      }

      const skuId = readRequiredString(attendee, "skuId");
      const formData = isRecord(attendee.formData) ? attendee.formData : omitKey(attendee, "skuId");
      return { skuId, formData };
    });
  }

  const formData = input.formData;
  if (!isRecord(formData)) {
    throw new BadRequestException("formData must be a JSON object");
  }

  return [
    {
      skuId: request.items[0]?.skuId ?? "",
      formData
    }
  ];
}

function ensureAttendeesMatchItems(items: RegistrationRequestItem[], attendees: RegistrationAttendeeInput[]): void {
  const expected = new Map(items.map((item) => [item.skuId, item.quantity]));
  const actual = new Map<string, number>();
  for (const attendee of attendees) {
    if (!expected.has(attendee.skuId)) {
      throw new BadRequestException("attendee skuId must match selected items");
    }
    actual.set(attendee.skuId, (actual.get(attendee.skuId) ?? 0) + 1);
  }

  for (const item of items) {
    if ((actual.get(item.skuId) ?? 0) !== item.quantity) {
      throw new BadRequestException("attendee count must match item quantity");
    }
  }
}

function enforceTicketLimit(conference: PublishedConferenceConfig, totalQuantity: number): void {
  if (conference.maxTicketsPerOrder !== null && conference.maxTicketsPerOrder < totalQuantity) {
    throw new ConflictException("Ticket quantity exceeds maxTicketsPerOrder");
  }
}

function readPositiveInt(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) {
    throw new BadRequestException(`${field} must be a positive integer`);
  }

  return Number(value);
}

function omitKey(input: Record<string, unknown>, key: string): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [entryKey, value] of Object.entries(input)) {
    if (entryKey !== key) {
      output[entryKey] = value;
    }
  }
  return output;
}

function validateFormData(fields: FormFieldConfig[], formData: Record<string, unknown>): RegistrationFormData {
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const unknownField = Object.keys(formData).find((key) => !fieldByKey.has(key));
  if (unknownField) {
    throw new BadRequestException(`Unknown form field: ${unknownField}`);
  }

  const validatedFormData: RegistrationFormData = {};
  for (const field of fields) {
    const value = formData[field.fieldKey];
    if (field.required && isEmptyValue(value)) {
      throw new BadRequestException(`${field.label} is required`);
    }

    if (isEmptyValue(value)) {
      continue;
    }

    validatedFormData[field.fieldKey] = validateFieldValue(field, value);
  }

  return validatedFormData;
}

function validateFieldValue(field: FormFieldConfig, value: unknown): Prisma.InputJsonValue {
  switch (field.type) {
    case FormFieldType.PHONE:
      return validateStringField(field, value, /^1[3-9]\d{9}$/, "phone format is invalid");
    case FormFieldType.EMAIL:
      return validateStringField(field, value, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email format is invalid");
    case FormFieldType.SELECT:
    case FormFieldType.RADIO: {
      const text = validateStringField(field, value);
      ensureValueInOptions(field, text);
      return text;
    }
    case FormFieldType.CHECKBOX: {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new BadRequestException(`${field.label} must be an array of strings`);
      }

      for (const item of value) {
        ensureValueInOptions(field, item);
      }

      return value;
    }
    case FormFieldType.TEXT:
    case FormFieldType.TEXTAREA:
    case FormFieldType.DATE:
      return validateStringField(field, value);
    default:
      throw new BadRequestException(`${field.label} type is not supported`);
  }
}

function validateStringField(field: FormFieldConfig, value: unknown, pattern?: RegExp, message?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field.label} must be a non-empty string`);
  }

  if (pattern && !pattern.test(value)) {
    throw new BadRequestException(`${field.label} ${message ?? "format is invalid"}`);
  }

  return value;
}

function ensureValueInOptions(field: FormFieldConfig, value: string): void {
  const allowedValues = getOptionValues(field.optionsJson);
  if (allowedValues.length > 0 && !allowedValues.includes(value)) {
    throw new BadRequestException(`${field.label} value is not allowed`);
  }
}

function getOptionValues(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((option) => {
    if (typeof option === "string") {
      return [option];
    }

    if (isRecord(option) && typeof option.value === "string") {
      return [option.value];
    }

    return [];
  });
}

function readOptionalFormString(formData: RegistrationFormData, field: "name" | "phone"): string | null {
  const value = formData[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function readOptionalStringField(formData: RegistrationFormData, field: string): string | undefined {
  const value = formData[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value;
}

function isEmptyValue(value: unknown): boolean {
  return (
    typeof value === "undefined" ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === "P2002";
}

interface BaseRegistrationRequest {
  conferenceId: string;
  items: RegistrationRequestItem[];
  totalQuantity: number;
  usesItemsShape: boolean;
  rawInput: Record<string, unknown>;
}

interface RegistrationRequestItem {
  skuId: string;
  quantity: number;
}

interface RawRegistrationAttendee {
  skuId: string;
  formData: Record<string, unknown>;
}

interface RegistrationAttendeeInput {
  skuId: string;
  name: string;
  phone: string;
  company?: string;
  title?: string;
  formData: RegistrationFormData;
}

interface PricedRegistrationItem extends RegistrationQuoteItem {
  subtotalCent: number;
  memberUnitPriceCent?: number;
  memberSubtotalCent?: number;
  memberDiscountAmountCent?: number;
}

interface PriceCalculation {
  originAmountCent: number;
  memberBaseAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  items: PricedRegistrationItem[];
  discounts: PriceDiscount[];
  messages: string[];
  memberPricing: MemberPricingSummary | null;
  couponId: string | null;
}

interface PriceDiscount {
  type: DiscountType;
  title: string;
  amountCent: number;
  couponId?: string;
  promotionRuleId?: string;
  snapshot?: Prisma.InputJsonObject;
}

interface PromotionRuleRecord {
  id: string;
  name: string;
  discountAmountCent: number;
  minAmountCent: number | null;
  minQuantity: number | null;
  allowedSkuIds: Prisma.JsonValue | null;
  startAt: Date | null;
  endAt: Date | null;
  stackableWithCoupon: boolean;
}

interface AppliedPromotion extends PromotionRuleRecord {
  discount: PriceDiscount;
}

interface CouponRecord {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountAmountCent: number | null;
  discountPercent: number | null;
  maxDiscountCent: number | null;
  minAmountCent: number | null;
  minQuantity: number | null;
  totalLimit: number | null;
  perUserLimit: number | null;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  stackableWithPromotion: boolean;
  conferenceId: string | null;
  allowedSkuIds: Prisma.JsonValue | null;
}

interface AppliedCoupon extends CouponRecord {
  discount: PriceDiscount;
}

interface AppliedMemberPricing {
  items: PricedRegistrationItem[];
  summary: MemberPricingSummary;
  discount: PriceDiscount;
}

interface MemberLevelRecord {
  id: string;
  code: string;
  name: string;
  rank: number;
  enabled: boolean;
  pricingEnabled: boolean;
}

interface UserMembershipRecord {
  id: string;
  userId: string;
  levelId: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  level: MemberLevelRecord;
}

interface MembershipPriceRuleRecord {
  id: string;
  levelId: string;
  conferenceId: string | null;
  skuId: string | null;
  discountPercent: number | null;
  discountCent: number | null;
  fixedPriceCent: number | null;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
}

interface PublishedConferenceConfig {
  id: string;
  groupRegistrationEnabled: boolean;
  maxTicketsPerOrder: number | null;
}

interface FormFieldConfig {
  label: string;
  fieldKey: string;
  type: FormFieldType;
  required: boolean;
  optionsJson: Prisma.JsonValue | null;
}

interface CreatePendingOrderInput {
  userId: string;
  conferenceId: string;
  skuId: string;
  items: PricedRegistrationItem[];
  attendeeName: string;
  phone: string;
  expiredAt: Date;
  submittedFormJson: Prisma.InputJsonObject;
  registrationSnapshotJson: Prisma.InputJsonObject;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  discounts: PriceDiscount[];
  couponId: string | null;
}
