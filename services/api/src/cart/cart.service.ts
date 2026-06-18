import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { isMallMockPaymentEnabled, isMallWechatPaymentEnabled } from "../mall/mall-payment.config";
import { PrismaService } from "../prisma.service";
import { RegistrationService } from "../registration/registration.service";

const FORBIDDEN_AMOUNT_FIELDS = new Set(["originAmountCent", "discountAmountCent", "payableAmountCent", "paidAmountCent", "amountCent", "totalAmountCent", "priceCent"]);

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registrationService: RegistrationService
  ) {}

  async list(currentUser: CurrentUser) {
    const [registrationItems, productItems] = await Promise.all([
      this.prisma.registrationCartItem.findMany({
        where: { userId: currentUser.id },
        orderBy: { updatedAt: "desc" },
        include: {
          conference: { select: { id: true, title: true, startsAt: true, location: true, status: true } },
          sku: { select: { id: true, name: true, priceCent: true, stock: true, soldCount: true, status: true } }
        }
      }),
      this.prisma.cartItem.findMany({
        where: { userId: currentUser.id },
        orderBy: { updatedAt: "desc" },
        include: {
          sku: {
            include: {
              product: { select: { id: true, title: true, subtitle: true, coverImageUrl: true, productType: true, status: true } }
            }
          }
        }
      })
    ]);

    return ok({
      registrationItems: registrationItems.map((item) => {
        const { startsAt, ...conference } = item.conference;
        return {
          id: item.id,
          quantity: item.quantity,
          couponCode: item.couponCode,
          attendees: Array.isArray(item.attendeesJson) ? item.attendeesJson : [],
          subtotalCent: item.quantity * item.sku.priceCent,
          conference: { ...conference, startAt: startsAt.toISOString() },
          sku: item.sku,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString()
        };
      }),
      productItems: productItems.map((item) => ({
        id: item.id,
        quantity: item.quantity,
        subtotalCent: item.quantity * item.sku.priceCent,
        sku: {
          id: item.sku.id,
          name: item.sku.name,
          priceCent: item.sku.priceCent,
          stock: item.sku.stock,
          lockedStock: item.sku.lockedStock,
          soldCount: item.sku.soldCount,
          availableStock: Math.max(0, item.sku.stock - item.sku.lockedStock - item.sku.soldCount),
          status: item.sku.status,
          product: item.sku.product
        },
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      }))
    });
  }

  async addRegistrationItem(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const conferenceId = readRequiredString(body, "conferenceId");
    const skuId = readRequiredString(body, "skuId");
    const quantity = readQuantity(body.quantity);
    const attendees = readOptionalArray(body.attendees);
    const couponCode = readOptionalString(body.couponCode);

    const sku = await this.prisma.registrationSku.findFirst({
      where: { id: skuId, conferenceId },
      include: { conference: { select: { status: true } } }
    });
    if (!sku) throw new NotFoundException("报名规格不存在");
    if (sku.status !== "ACTIVE" || sku.conference.status !== "PUBLISHED") throw new ForbiddenException("当前报名规格暂不可加入购物车");
    if (attendees && attendees.length !== quantity) throw new BadRequestException("参会人数量必须等于票数");

    const item = await this.prisma.registrationCartItem.create({
      data: {
        userId: currentUser.id,
        conferenceId,
        skuId,
        quantity,
        couponCode,
        attendeesJson: attendees ? (attendees as Prisma.InputJsonArray) : undefined
      }
    });
    return ok({ id: item.id });
  }

  async updateRegistrationItem(id: string, input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const quantity = typeof body.quantity === "undefined" ? undefined : readQuantity(body.quantity);
    const attendees = readOptionalArray(body.attendees);
    if (quantity && attendees && attendees.length !== quantity) throw new BadRequestException("参会人数量必须等于票数");
    const existing = await this.prisma.registrationCartItem.findFirst({ where: { id, userId: currentUser.id }, select: { id: true } });
    if (!existing) throw new NotFoundException("购物车报名项不存在");
    const item = await this.prisma.registrationCartItem.update({
      where: { id },
      data: {
        ...(quantity ? { quantity } : {}),
        ...(typeof body.couponCode !== "undefined" ? { couponCode: readOptionalString(body.couponCode) } : {}),
        ...(attendees ? { attendeesJson: attendees as Prisma.InputJsonArray } : {})
      }
    });
    return ok({ id: item.id });
  }

  async removeRegistrationItem(id: string, currentUser: CurrentUser) {
    await this.prisma.registrationCartItem.deleteMany({ where: { id, userId: currentUser.id } });
    return ok({ id });
  }

  async addProductItem(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const skuId = readRequiredString(body, "skuId");
    const quantity = readQuantity(body.quantity);
    const sku = await this.prisma.productSku.findUnique({ where: { id: skuId }, include: { product: true } });
    if (!sku || sku.status !== "ACTIVE" || sku.product.status !== "PUBLISHED") throw new NotFoundException("商品规格不存在或未上架");
    const existing = await this.prisma.cartItem.findUnique({ where: { userId_skuId: { userId: currentUser.id, skuId } }, select: { quantity: true } });
    if (sku.stock - sku.lockedStock - sku.soldCount < quantity + (existing?.quantity ?? 0)) throw new BadRequestException("商品库存不足");
    const item = await this.prisma.cartItem.upsert({
      where: { userId_skuId: { userId: currentUser.id, skuId } },
      update: { quantity: { increment: quantity } },
      create: { userId: currentUser.id, skuId, quantity }
    });
    return ok({ id: item.id });
  }

  async updateProductItem(id: string, input: unknown, currentUser: CurrentUser) {
    const quantity = readQuantity(readObject(input).quantity);
    const existing = await this.prisma.cartItem.findFirst({
      where: { id, userId: currentUser.id },
      select: { id: true, sku: { select: { stock: true, lockedStock: true, soldCount: true } } }
    });
    if (!existing) throw new NotFoundException("购物车商品不存在");
    if (existing.sku.stock - existing.sku.lockedStock - existing.sku.soldCount < quantity) throw new BadRequestException("商品库存不足");
    const item = await this.prisma.cartItem.update({ where: { id }, data: { quantity } });
    return ok({ id: item.id });
  }

  async removeProductItem(id: string, currentUser: CurrentUser) {
    await this.prisma.cartItem.deleteMany({ where: { id, userId: currentUser.id } });
    return ok({ id });
  }

  async checkoutRegistration(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    const itemIds = readStringArray(body.itemIds);
    if (itemIds.length === 0) throw new BadRequestException("请选择要结算的报名");
    const items = await this.prisma.registrationCartItem.findMany({
      where: { id: { in: itemIds }, userId: currentUser.id },
      include: { sku: true }
    });
    if (items.length !== itemIds.length) throw new BadRequestException("购物车报名项不存在");
    const conferenceIds = new Set(items.map((item) => item.conferenceId));
    if (conferenceIds.size !== 1) throw new BadRequestException("一次只能结算同一个会议的报名");
    const attendees = items.flatMap((item) => (Array.isArray(item.attendeesJson) ? item.attendeesJson : []).map((attendee) => ({ skuId: item.skuId, formData: attendee })));
    const expectedQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    if (attendees.length !== expectedQuantity) throw new BadRequestException("请先在报名页填写参会人信息后再加入购物车");
    const response = await this.registrationService.createOrder(
      {
        conferenceId: items[0].conferenceId,
        items: items.map((item) => ({ skuId: item.skuId, quantity: item.quantity })),
        couponCode: items.find((item) => item.couponCode)?.couponCode ?? undefined,
        attendees
      },
      currentUser
    );
    await this.prisma.registrationCartItem.deleteMany({ where: { id: { in: itemIds }, userId: currentUser.id } });
    return response;
  }

  async checkoutProducts(input: unknown, currentUser: CurrentUser) {
    const body = readObject(input);
    assertNoClientAmount(body);
    const itemIds = readStringArray(body.itemIds);
    if (itemIds.length === 0) throw new BadRequestException("请选择要结算的商品");
    const items = await this.prisma.cartItem.findMany({
      where: { id: { in: itemIds }, userId: currentUser.id },
      include: { sku: { include: { product: true } } }
    });
    if (items.length !== itemIds.length) throw new BadRequestException("购物车商品不存在");
    const requiresReceiver = items.some((item) => item.sku.product.productType === "PHYSICAL");
    const receiverName = requiresReceiver ? readRequiredString(body, "receiverName") : readOptionalString(body.receiverName);
    const receiverPhone = requiresReceiver ? readRequiredString(body, "receiverPhone") : readOptionalString(body.receiverPhone);
    const receiverAddress = requiresReceiver ? readRequiredString(body, "receiverAddress") : readOptionalString(body.receiverAddress);
    const fulfillmentType = requiresReceiver ? "SHIPMENT" : "VIRTUAL";
    const order = await this.prisma.$transaction(async (tx) => {
      const orderItems: Prisma.MallOrderItemCreateWithoutOrderInput[] = [];
      const logs: Array<{ skuId: string; quantity: number; beforeLockedStock: number; afterLockedStock: number; beforeSoldCount: number; afterSoldCount: number }> = [];
      for (const item of items) {
        const sku = item.sku;
        if (sku.status !== "ACTIVE" || sku.product.status !== "PUBLISHED") throw new BadRequestException("部分商品已下架");
        if (sku.stock - sku.lockedStock - sku.soldCount < item.quantity) throw new BadRequestException(`${sku.name} 库存不足`);
        const locked = await tx.productSku.updateMany({
          where: {
            id: sku.id,
            status: "ACTIVE",
            lockedStock: sku.lockedStock,
            soldCount: sku.soldCount,
            stock: { gte: sku.lockedStock + sku.soldCount + item.quantity }
          },
          data: { lockedStock: { increment: item.quantity } }
        });
        if (locked.count !== 1) throw new BadRequestException(`${sku.name} 库存正在变化，请重试`);
        orderItems.push({
          sku: { connect: { id: item.skuId } },
          productTitle: sku.product.title,
          skuName: sku.name,
          productType: sku.product.productType,
          unitPriceCent: sku.priceCent,
          quantity: item.quantity,
          totalAmountCent: item.quantity * sku.priceCent
        });
        logs.push({
          skuId: item.skuId,
          quantity: item.quantity,
          beforeLockedStock: sku.lockedStock,
          afterLockedStock: sku.lockedStock + item.quantity,
          beforeSoldCount: sku.soldCount,
          afterSoldCount: sku.soldCount
        });
      }
      const originAmountCent = orderItems.reduce((sum, item) => sum + item.totalAmountCent, 0);
      const created = await tx.mallOrder.create({
        data: {
          orderNo: `MALL${Date.now()}${Math.floor(Math.random() * 1000)}`,
          userId: currentUser.id,
          originAmountCent,
          discountAmountCent: 0,
          payableAmountCent: originAmountCent,
          status: "PENDING_PAYMENT",
          receiverName,
          receiverPhone,
          receiverAddress,
          fulfillmentType,
          items: { create: orderItems },
          inventoryLogs: {
            create: logs.map((item) => ({
              skuId: item.skuId,
              action: "CART_CHECKOUT_LOCK",
              quantity: item.quantity,
              beforeLockedStock: item.beforeLockedStock,
              afterLockedStock: item.afterLockedStock,
              beforeSoldCount: item.beforeSoldCount,
              afterSoldCount: item.afterSoldCount,
              remark: "购物车结算创建商城待支付订单锁定库存"
            }))
          }
        }
      });
      await tx.cartItem.deleteMany({ where: { id: { in: itemIds }, userId: currentUser.id } });
      return created;
    });
    return ok({
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      payableAmountCent: order.payableAmountCent,
      paymentEnabled: isMallWechatPaymentEnabled() || isMallMockPaymentEnabled(),
      paymentNotice: buildMallPaymentNotice()
    });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function buildMallPaymentNotice(): string {
  if (isMallWechatPaymentEnabled()) return "订单已创建，请前往我的商城订单完成微信支付。";
  if (isMallMockPaymentEnabled()) return "订单已创建，可前往我的商城订单使用测试支付。";
  return "当前商城支付暂未开放；订单已创建，状态为待支付；请联系会务组或等待商城支付开放";
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new BadRequestException("请求体格式不正确");
  return value as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readQuantity(value: unknown): number {
  const quantity = Number(value);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) throw new BadRequestException("数量必须为 1 到 99");
  return quantity;
}

function readOptionalArray(value: unknown): unknown[] | undefined {
  return typeof value === "undefined" ? undefined : Array.isArray(value) ? value : [];
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : [];
}

function assertNoClientAmount(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_AMOUNT_FIELDS.has(key)) throw new BadRequestException(`商城订单金额由后端计算，不能提交 ${key}`);
  }
}
