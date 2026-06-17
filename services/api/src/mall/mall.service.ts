import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

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
    const where = {
      status: "PUBLISHED",
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.keyword ? { title: { contains: query.keyword, mode: "insensitive" as const } } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true, skus: { where: { status: "ACTIVE" } }, images: { orderBy: { sortOrder: "asc" } } }
      }),
      this.prisma.product.count({ where })
    ]);
    return ok({ items: items.map(formatProduct), total, page, pageSize });
  }

  async detail(id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, status: "PUBLISHED" },
      include: { category: true, skus: { where: { status: "ACTIVE" } }, images: { orderBy: { sortOrder: "asc" } } }
    });
    if (!product) throw new NotFoundException("Product not found");
    return ok(formatProduct(product));
  }

  async createOrder(input: unknown, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    if (!isEnabled("SHOP_ENABLED")) return ok({ skippedReason: "SHOP_ENABLED=false" });
    const body = readObject(input);
    const items = readOrderItems(body.items);
    const receiverName = readRequiredString(body, "receiverName");
    const receiverPhone = readRequiredString(body, "receiverPhone");
    const receiverAddress = readRequiredString(body, "receiverAddress");
    const skus = await this.prisma.productSku.findMany({ where: { id: { in: items.map((item) => item.skuId) }, status: "ACTIVE" }, include: { product: true } });
    if (skus.length !== items.length) throw new ConflictException("部分商品不可购买");
    const skuById = new Map(skus.map((sku) => [sku.id, sku]));
    const orderItems = items.map((item) => {
      const sku = skuById.get(item.skuId)!;
      if (sku.stock - sku.soldCount < item.quantity) throw new ConflictException(`${sku.name} 库存不足`);
      return {
        skuId: sku.id,
        productTitle: sku.product.title,
        skuName: sku.name,
        unitPriceCent: sku.priceCent,
        quantity: item.quantity,
        totalAmountCent: sku.priceCent * item.quantity
      };
    });
    const payableAmountCent = orderItems.reduce((sum, item) => sum + item.totalAmountCent, 0);
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mallOrder.create({
        data: {
          orderNo: generateOrderNo("SHOP"),
          userId: currentUser.id,
          originAmountCent: payableAmountCent,
          payableAmountCent,
          paidAmountCent: payableAmountCent,
          status: "PAID",
          paidAt: new Date(),
          receiverName,
          receiverPhone,
          receiverAddress,
          remark: readNullableString(body.remark),
          items: { create: orderItems }
        },
        include: { user: true, items: true }
      });
      for (const item of orderItems) {
        await tx.productSku.update({ where: { id: item.skuId }, data: { soldCount: { increment: item.quantity } } });
      }
      return created;
    });
    return ok(formatOrder(order));
  }

  async myOrders(currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const items = await this.prisma.mallOrder.findMany({ where: { userId: currentUser.id }, orderBy: { createdAt: "desc" }, include: { user: true, items: true, shipments: true } });
    return ok({ items: items.map(formatOrder) });
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
  descriptionJson: unknown;
  coverImageUrl: string | null;
  category: { id: string; name: string; code: string } | null;
  skus: Array<{ id: string; name: string; priceCent: number; stock: number; soldCount: number; specsJson: unknown }>;
  images: Array<{ id: string; url: string; alt: string | null; sortOrder: number }>;
}) {
  return item;
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
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new BadRequestException("items 格式不正确");
    const body = item as Record<string, unknown>;
    const skuId = readRequiredString(body, "skuId");
    const quantity = typeof body.quantity === "number" ? body.quantity : Number.parseInt(String(body.quantity ?? ""), 10);
    if (!Number.isInteger(quantity) || quantity <= 0) throw new BadRequestException("quantity 必须是正整数");
    return { skuId, quantity };
  });
}

function generateOrderNo(prefix: string): string {
  return `${prefix}${new Date().toISOString().slice(0, 10).replaceAll("-", "")}${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
}

function isEnabled(name: string): boolean {
  return process.env[name] === "true";
}

function formatOrder(item: {
  id: string;
  orderNo: string;
  userId: string | null;
  originAmountCent: number;
  discountAmountCent: number;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: string;
  receiverName: string | null;
  receiverPhone: string | null;
  receiverAddress: string | null;
  remark: string | null;
  paidAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  user?: { id: string; nickname: string | null; wechatNickname: string | null; phone: string | null } | null;
  items: Array<{
    id: string;
    orderId: string;
    skuId: string;
    productTitle: string;
    skuName: string;
    unitPriceCent: number;
    quantity: number;
    totalAmountCent: number;
    createdAt: Date;
  }>;
}) {
  return {
    ...item,
    paidAt: item.paidAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    items: item.items.map((orderItem) => ({ ...orderItem, createdAt: orderItem.createdAt.toISOString() }))
  };
}
