import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { isMallMockPaymentEnabled, isMallWechatPaymentEnabled, readMallPaymentMode } from "./mall-payment.config";

const FORBIDDEN_AMOUNT_FIELDS = new Set(["originAmountCent", "discountAmountCent", "payableAmountCent", "paidAmountCent", "amountCent", "totalAmountCent", "priceCent"]);

const mallOrderInclude = {
  user: true,
  items: true,
  shipments: { orderBy: { createdAt: "desc" } },
  afterSales: { orderBy: { createdAt: "desc" }, include: { refunds: { orderBy: { createdAt: "desc" } } } },
  payments: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } }
} satisfies Prisma.MallOrderInclude;

@Injectable()
export class MallService {
  constructor(private readonly prisma: PrismaService) {}

  async categories() {
    const items = await this.prisma.productCategory.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return ok({ items: items.map(formatCategory) });
  }

  async products(query: { page?: string; pageSize?: string; categoryId?: string; keyword?: string }) {
    const page = parsePositiveInt(query.page, 1);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
    const where: Prisma.ProductWhereInput = {
      status: "PUBLISHED",
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { title: { contains: query.keyword, mode: "insensitive" } } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true, skus: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }, images: { orderBy: { sortOrder: "asc" } } }
      }),
      this.prisma.product.count({ where })
    ]);
    return ok({ items: items.map(formatProduct).filter((item) => item.availableStock > 0), total, page, pageSize });
  }

  async detail(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: "PUBLISHED" },
      include: { category: true, skus: { where: { status: "ACTIVE" }, orderBy: { createdAt: "asc" } }, images: { orderBy: { sortOrder: "asc" } } }
    });
    if (!product) throw new NotFoundException("Product not found");
    const formatted = formatProduct(product);
    if (formatted.skus.length === 0) throw new ConflictException("商品暂无可售规格");
    return ok(formatted);
  }

  async createOrder(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const body = readObject(input);
    assertNoClientAmount(body);
    const items = readOrderItems(body.items);
    const remark = readNullableString(body.remark);

    const order = await this.prisma.$transaction(async (tx) => {
      const orderItems: Prisma.MallOrderItemCreateWithoutOrderInput[] = [];
      const logInputs: Array<{
        skuId: string;
        quantity: number;
        beforeLockedStock: number;
        afterLockedStock: number;
        beforeSoldCount: number;
        afterSoldCount: number;
      }> = [];
      let requiresReceiver = false;

      for (const item of items) {
        const sku = await tx.productSku.findUnique({ where: { id: item.skuId }, include: { product: true } });
        if (!sku || sku.status !== "ACTIVE" || sku.product.status !== "PUBLISHED") throw new ConflictException("部分商品不可购买");
        requiresReceiver = requiresReceiver || sku.product.productType === "PHYSICAL";
        const availableStock = sku.stock - sku.lockedStock - sku.soldCount;
        if (availableStock < item.quantity) throw new ConflictException(`${sku.name} 库存不足`);
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
        if (locked.count !== 1) throw new ConflictException(`${sku.name} 库存正在变化，请重试`);
        orderItems.push({
          sku: { connect: { id: sku.id } },
          productTitle: sku.product.title,
          skuName: sku.name,
          productType: sku.product.productType,
          unitPriceCent: sku.priceCent,
          quantity: item.quantity,
          totalAmountCent: sku.priceCent * item.quantity
        });
        logInputs.push({
          skuId: sku.id,
          quantity: item.quantity,
          beforeLockedStock: sku.lockedStock,
          afterLockedStock: sku.lockedStock + item.quantity,
          beforeSoldCount: sku.soldCount,
          afterSoldCount: sku.soldCount
        });
      }

      const payableAmountCent = orderItems.reduce((sum, item) => sum + item.totalAmountCent, 0);
      const receiverName = requiresReceiver ? readRequiredString(body, "receiverName") : readNullableString(body.receiverName);
      const receiverPhone = requiresReceiver ? readRequiredString(body, "receiverPhone") : readNullableString(body.receiverPhone);
      const receiverAddress = requiresReceiver ? readRequiredString(body, "receiverAddress") : readNullableString(body.receiverAddress);
      const created = await tx.mallOrder.create({
        data: {
          orderNo: generateOrderNo("SHOP"),
          userId: currentUser.id,
          originAmountCent: payableAmountCent,
          discountAmountCent: 0,
          payableAmountCent,
          paidAmountCent: null,
          status: "PENDING_PAYMENT",
          receiverName,
          receiverPhone,
          receiverAddress,
          fulfillmentType: requiresReceiver ? "SHIPMENT" : "VIRTUAL",
          remark,
          items: { create: orderItems },
          inventoryLogs: {
            create: logInputs.map((item) => ({
              skuId: item.skuId,
              action: "ORDER_LOCK",
              quantity: item.quantity,
              beforeLockedStock: item.beforeLockedStock,
              afterLockedStock: item.afterLockedStock,
              beforeSoldCount: item.beforeSoldCount,
              afterSoldCount: item.afterSoldCount,
              remark: "用户创建商城待支付订单锁定库存"
            }))
          }
        },
        include: mallOrderInclude
      });
      return created;
    });

    return ok(formatOrder(order));
  }

  async myOrders(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.mallOrder.findMany({
      where: { userId: currentUser.id },
      orderBy: { createdAt: "desc" },
      include: mallOrderInclude
    });
    return ok({ items: items.map(formatOrder) });
  }

  async myOrder(id: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const item = await this.prisma.mallOrder.findFirst({ where: { id, userId: currentUser.id }, include: mallOrderInclude });
    if (!item) throw new NotFoundException("商城订单不存在");
    return ok(formatOrder(item));
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function formatCategory(item: { id: string; name: string; code: string; description: string | null; sortOrder: number }) {
  return item;
}

function formatProduct(item: {
  id: string;
  title: string;
  subtitle: string | null;
  productType: string;
  descriptionJson: unknown;
  coverImageUrl: string | null;
  coverMaterialId?: string | null;
  category: { id: string; name: string; code: string } | null;
  skus: Array<{ id: string; name: string; priceCent: number; stock: number; lockedStock: number; soldCount: number; status: string; specsJson: unknown }>;
  images: Array<{ id: string; url: string; materialId?: string | null; alt: string | null; sortOrder: number }>;
}) {
  const skus = item.skus
    .map((sku) => ({
      ...sku,
      availableStock: Math.max(0, sku.stock - sku.lockedStock - sku.soldCount)
    }))
    .filter((sku) => sku.status === "ACTIVE" && sku.availableStock > 0);
  return {
    ...item,
    skus,
    detailImageUrls: item.images.map((image) => image.url),
    availableStock: skus.reduce((sum, sku) => sum + sku.availableStock, 0)
  };
}

function formatOrder(item: Prisma.MallOrderGetPayload<{ include: typeof mallOrderInclude }>) {
  return {
    ...item,
    paidAt: item.paidAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: item.user ? { id: item.user.id, nickname: item.user.nickname, wechatNickname: item.user.wechatNickname, phone: item.user.phone } : null,
    items: item.items.map((orderItem) => ({ ...orderItem, createdAt: orderItem.createdAt.toISOString() })),
    shipments: item.shipments.map((shipment) => ({
      ...shipment,
      shippedAt: shipment.shippedAt?.toISOString() ?? null,
      completedAt: shipment.completedAt?.toISOString() ?? null,
      createdAt: shipment.createdAt.toISOString(),
      updatedAt: shipment.updatedAt.toISOString()
    })),
    afterSales: item.afterSales.map((afterSale) => ({
      ...afterSale,
      handledAt: afterSale.handledAt?.toISOString() ?? null,
      createdAt: afterSale.createdAt.toISOString(),
      updatedAt: afterSale.updatedAt.toISOString(),
      refunds: afterSale.refunds.map(formatRefund)
    })),
    payments: item.payments.map(formatPayment),
    refunds: item.refunds.map(formatRefund),
    paymentMode: readMallPaymentMode(),
    paymentUnavailableReason: paymentUnavailableReason(),
    paymentEnabled: item.status === "PENDING_PAYMENT" && (isMallWechatPaymentEnabled() || isMallMockPaymentEnabled()),
    paymentNotice: buildPaymentNotice(item.status)
  };
}

function buildPaymentNotice(status: string): string | null {
  if (status !== "PENDING_PAYMENT") return null;
  if (isMallWechatPaymentEnabled()) return "商城订单可发起微信支付，支付金额以服务端订单应付金额为准。";
  if (isMallMockPaymentEnabled()) return "当前为 mock 支付模式，可使用测试支付完成商城订单。";
  return "当前商城支付暂未开放；订单已创建，状态为待支付；请联系会务组或等待商城支付开放";
}

function paymentUnavailableReason(): string | null {
  if (isMallWechatPaymentEnabled() || isMallMockPaymentEnabled()) return null;
  if (readMallPaymentMode() === "wechat") return "WECHAT_PAY_MALL_NOTIFY_URL 未配置，商城微信支付不可用。";
  return "MALL_PAYMENT_MODE 未开启商城支付，生产默认保持 disabled。";
}

function formatPayment(item: Prisma.MallPaymentGetPayload<Record<string, never>>) {
  return {
    ...item,
    paidAt: item.paidAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatRefund(item: Prisma.MallRefundGetPayload<Record<string, never>>) {
  return {
    ...item,
    requestedAt: item.requestedAt.toISOString(),
    approvedAt: item.approvedAt?.toISOString() ?? null,
    processedAt: item.processedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
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

function readOrderItems(value: unknown): Array<{ skuId: string; quantity: number }> {
  if (!Array.isArray(value) || value.length === 0) throw new BadRequestException("items 不能为空");
  const bySku = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new BadRequestException("items 格式不正确");
    const body = item as Record<string, unknown>;
    assertNoClientAmount(body);
    const skuId = readRequiredString(body, "skuId");
    const quantity = typeof body.quantity === "number" ? body.quantity : Number.parseInt(String(body.quantity ?? ""), 10);
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 99) throw new BadRequestException("quantity 必须是 1 到 99 的整数");
    bySku.set(skuId, (bySku.get(skuId) ?? 0) + quantity);
  }
  return Array.from(bySku, ([skuId, quantity]) => ({ skuId, quantity }));
}

function assertNoClientAmount(body: Record<string, unknown>) {
  for (const key of Object.keys(body)) {
    if (FORBIDDEN_AMOUNT_FIELDS.has(key)) throw new BadRequestException(`商城订单金额由后端计算，不能提交 ${key}`);
  }
}

function generateOrderNo(prefix: string): string {
  return `${prefix}${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}
