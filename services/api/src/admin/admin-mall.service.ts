import { BadRequestException, Injectable } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminMallService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    const items = await this.prisma.productCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    return ok({ items: items.map(formatCategory) });
  }

  async createCategory(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const category = await this.prisma.productCategory.create({
      data: {
        name: readRequiredString(body, "name"),
        code: readRequiredString(body, "code"),
        description: readNullableString(body.description),
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        sortOrder: readOptionalInt(body, "sortOrder") ?? 0
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "ProductCategory", category.id, "Create product category", { code: category.code });
    return ok(formatCategory(category));
  }

  async listProducts(query: Record<string, unknown>) {
    const page = readOptionalInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const status = readOptionalString(query, "status");
    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ title: { contains: keyword, mode: "insensitive" } }, { subtitle: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: true, skus: true, images: { orderBy: { sortOrder: "asc" } } }
      }),
      this.prisma.product.count({ where })
    ]);
    return ok({ items: items.map(formatProduct), total, page, pageSize });
  }

  async createProduct(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const product = await this.prisma.product.create({
      data: {
        categoryId: readNullableString(body.categoryId),
        title: readRequiredString(body, "title"),
        subtitle: readNullableString(body.subtitle),
        descriptionJson: readNullableObject(body.descriptionJson),
        coverImageUrl: readNullableString(body.coverImageUrl),
        status: readOptionalString(body, "status") ?? "DRAFT",
        sortOrder: readOptionalInt(body, "sortOrder") ?? 0
      },
      include: { category: true, skus: true, images: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "Product", product.id, "Create product", { title: product.title });
    return ok(formatProduct(product));
  }

  async updateProduct(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(typeof body.categoryId !== "undefined" ? { categoryId: readNullableString(body.categoryId) } : {}),
        ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
        ...(typeof body.subtitle !== "undefined" ? { subtitle: readNullableString(body.subtitle) } : {}),
        ...(typeof body.descriptionJson !== "undefined" ? { descriptionJson: readNullableObject(body.descriptionJson) } : {}),
        ...(typeof body.coverImageUrl !== "undefined" ? { coverImageUrl: readNullableString(body.coverImageUrl) } : {}),
        ...(typeof body.status !== "undefined" ? { status: readRequiredString(body, "status") } : {}),
        ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readRequiredInt(body, "sortOrder") } : {})
      },
      include: { category: true, skus: true, images: { orderBy: { sortOrder: "asc" } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "Product", id, "Update product", { title: product.title });
    return ok(formatProduct(product));
  }

  async createSku(productId: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const sku = await this.prisma.productSku.create({
      data: {
        productId,
        name: readRequiredString(body, "name"),
        priceCent: readRequiredInt(body, "priceCent"),
        stock: readRequiredInt(body, "stock"),
        status: readOptionalString(body, "status") ?? "ACTIVE",
        specsJson: readNullableObject(body.specsJson)
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "ProductSku", sku.id, "Create product SKU", { productId });
    return ok(formatSku(sku));
  }

  async listSkus(query: Record<string, unknown>) {
    const productId = readOptionalString(query, "productId");
    const status = readOptionalString(query, "status");
    const items = await this.prisma.productSku.findMany({
      where: { ...(productId ? { productId } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: { product: { select: { title: true } } }
    });
    return ok({ items: items.map(formatSkuWithProduct) });
  }

  async listOrders(query: Record<string, unknown>) {
    const page = readOptionalInt(query, "page") ?? 1;
    const pageSize = Math.min(readOptionalInt(query, "pageSize") ?? 20, 100);
    const keyword = readOptionalString(query, "keyword");
    const status = readOptionalString(query, "status");
    const where: Prisma.MallOrderWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: "insensitive" } }, { receiverName: { contains: keyword, mode: "insensitive" } }, { receiverPhone: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mallOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize, include: { user: true, items: true } }),
      this.prisma.mallOrder.count({ where })
    ]);
    return ok({ items: items.map(formatOrder), total, page, pageSize });
  }

  async shipOrder(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const shipment = await this.prisma.mallShipment.create({
      data: {
        orderId: id,
        company: readNullableString(body.company),
        trackingNo: readNullableString(body.trackingNo),
        status: "SHIPPED",
        shippedAt: new Date()
      }
    });
    await this.prisma.mallOrder.update({ where: { id }, data: { status: "SHIPPED" } });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallOrder", id, "Ship mall order");
    return ok({ ...shipment, shippedAt: shipment.shippedAt?.toISOString() ?? null, createdAt: shipment.createdAt.toISOString(), updatedAt: shipment.updatedAt.toISOString() });
  }

  async verifyOrder(id: string, admin: CurrentAdmin) {
    const order = await this.prisma.mallOrder.update({ where: { id }, data: { status: "COMPLETED" }, include: { user: true, items: true } });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallOrder", id, "Verify mall order");
    return ok(formatOrder(order));
  }

  async listShipments(query: Record<string, unknown>) {
    const status = readOptionalString(query, "status");
    const items = await this.prisma.mallShipment.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
    });
    return ok({ items: items.map(formatShipment) });
  }

  async listAfterSales(query: Record<string, unknown>) {
    const status = readOptionalString(query, "status");
    const items = await this.prisma.mallAfterSale.findMany({
      where: { ...(status ? { status } : {}) },
      orderBy: { createdAt: "desc" },
      include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
    });
    return ok({ items: items.map(formatAfterSale) });
  }

  async exportOrders() {
    const items = await this.prisma.mallOrder.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: { user: true, items: true } });
    return ok({ items: items.map(formatOrder), truncated: items.length >= 5000 });
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

function formatCategory(item: Prisma.ProductCategoryGetPayload<Record<string, never>>) {
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

function formatProduct(item: Prisma.ProductGetPayload<{ include: { category: true; skus: true; images: true } }>) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    skus: item.skus.map(formatSku),
    images: item.images.map((image) => ({ ...image, createdAt: image.createdAt.toISOString() }))
  };
}

function formatSku(item: Prisma.ProductSkuGetPayload<Record<string, never>>) {
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

function formatSkuWithProduct(item: Prisma.ProductSkuGetPayload<{ include: { product: { select: { title: true } } } }>) {
  return { ...formatSku(item), productTitle: item.product.title };
}

function formatOrder(item: Prisma.MallOrderGetPayload<{ include: { user: true; items: true } }>) {
  return {
    ...item,
    paidAt: item.paidAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: item.user ? { id: item.user.id, nickname: item.user.nickname, wechatNickname: item.user.wechatNickname, phone: item.user.phone } : null
  };
}

function formatShipment(item: Prisma.MallShipmentGetPayload<{ include: { order: { select: { orderNo: true; receiverName: true; receiverPhone: true } } } }>) {
  return {
    ...item,
    shippedAt: item.shippedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    orderNo: item.order.orderNo,
    receiverName: item.order.receiverName,
    receiverPhone: item.order.receiverPhone
  };
}

function formatAfterSale(item: Prisma.MallAfterSaleGetPayload<{ include: { order: { select: { orderNo: true; receiverName: true; receiverPhone: true } } } }>) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    orderNo: item.order.orderNo,
    receiverName: item.order.receiverName,
    receiverPhone: item.order.receiverPhone
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

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredInt(body: Record<string, unknown>, key: string): number {
  const value = readOptionalInt(body, key);
  if (typeof value !== "number" || value < 0) throw new BadRequestException(`${key} 必须是非负整数`);
  return value;
}

function readNullableObject(value: unknown): Prisma.InputJsonObject | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("JSON 字段必须是对象");
  return value as Prisma.InputJsonObject;
}
