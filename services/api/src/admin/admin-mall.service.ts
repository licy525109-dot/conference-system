import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "OFFLINE"] as const;
const SKU_STATUSES = ["ACTIVE", "INACTIVE"] as const;
const ORDER_STATUSES = ["PENDING_PAYMENT", "PAID", "SHIPPED", "COMPLETED", "CLOSED", "REFUNDING", "REFUNDED"] as const;
const SHIPMENT_STATUSES = ["PENDING", "SHIPPED", "COMPLETED", "CANCELLED"] as const;
const AFTER_SALE_TYPES = ["REFUND", "RETURN_REFUND", "EXCHANGE"] as const;
const AFTER_SALE_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "PROCESSING", "COMPLETED", "CANCELLED"] as const;

@Injectable()
export class AdminMallService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(query: Record<string, unknown> = {}) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query, "keyword");
    const enabled = readOptionalBooleanString(query.enabled);
    const where: Prisma.ProductCategoryWhereInput = {
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(keyword ? { OR: [{ name: { contains: keyword, mode: "insensitive" } }, { code: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productCategory.findMany({ where, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], skip, take: pageSize }),
      this.prisma.productCategory.count({ where })
    ]);
    return ok({ items: items.map(formatCategory), total, page, pageSize });
  }

  async categoryOptions(query: Record<string, unknown> = {}) {
    const keyword = readOptionalString(query, "keyword");
    const items = await this.prisma.productCategory.findMany({
      where: { enabled: true, ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 50
    });
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

  async updateCategory(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const category = await this.prisma.productCategory.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.code !== "undefined" ? { code: readRequiredString(body, "code") } : {}),
        ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readRequiredInt(body, "sortOrder") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "ProductCategory", id, "Update product category", { code: category.code });
    return ok(formatCategory(category));
  }

  async listProducts(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query, "keyword");
    const status = readStatus(readOptionalString(query, "status"), PRODUCT_STATUSES, "商品状态");
    const categoryId = readOptionalString(query, "categoryId");
    const where: Prisma.ProductWhereInput = {
      ...(status ? { status } : {}),
      ...(categoryId ? { categoryId } : {}),
      ...(keyword ? { OR: [{ title: { contains: keyword, mode: "insensitive" } }, { subtitle: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip,
        take: pageSize,
        include: { category: true, skus: { orderBy: { createdAt: "asc" } }, images: { orderBy: { sortOrder: "asc" } } }
      }),
      this.prisma.product.count({ where })
    ]);
    return ok({ items: items.map(formatProduct), total, page, pageSize });
  }

  async productOptions(query: Record<string, unknown> = {}) {
    const keyword = readOptionalString(query, "keyword");
    const items = await this.prisma.product.findMany({
      where: { ...(keyword ? { title: { contains: keyword, mode: "insensitive" } } : {}) },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      take: 50,
      include: { category: true, skus: true, images: true }
    });
    return ok({ items: items.map(formatProduct) });
  }

  async getProduct(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { category: true, skus: { orderBy: { createdAt: "asc" } }, images: { orderBy: { sortOrder: "asc" } } }
    });
    if (!product) throw new NotFoundException("Product not found");
    return ok(formatProduct(product));
  }

  async createProduct(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const detailImageUrls = readOptionalStringArray(body.detailImageUrls);
    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          categoryId: readNullableString(body.categoryId),
          title: readRequiredString(body, "title"),
          subtitle: readNullableString(body.subtitle),
          descriptionJson: readNullableObject(body.descriptionJson),
          coverImageUrl: readNullableString(body.coverImageUrl),
          status: readStatus(readOptionalString(body, "status") ?? "DRAFT", PRODUCT_STATUSES, "商品状态") ?? "DRAFT",
          sortOrder: readOptionalInt(body, "sortOrder") ?? 0
        }
      });
      await replaceProductImages(tx, created.id, detailImageUrls);
      return tx.product.findUniqueOrThrow({ where: { id: created.id }, include: { category: true, skus: true, images: { orderBy: { sortOrder: "asc" } } } });
    });
    await this.writeAudit(admin, AuditAction.CREATE, "Product", product.id, "Create product", { title: product.title });
    return ok(formatProduct(product));
  }

  async updateProduct(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const detailImageUrls = typeof body.detailImageUrls === "undefined" ? undefined : readOptionalStringArray(body.detailImageUrls);
    const product = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          ...(typeof body.categoryId !== "undefined" ? { categoryId: readNullableString(body.categoryId) } : {}),
          ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
          ...(typeof body.subtitle !== "undefined" ? { subtitle: readNullableString(body.subtitle) } : {}),
          ...(typeof body.descriptionJson !== "undefined" ? { descriptionJson: readNullableObject(body.descriptionJson) } : {}),
          ...(typeof body.coverImageUrl !== "undefined" ? { coverImageUrl: readNullableString(body.coverImageUrl) } : {}),
          ...(typeof body.status !== "undefined" ? { status: readStatus(readRequiredString(body, "status"), PRODUCT_STATUSES, "商品状态") } : {}),
          ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readRequiredInt(body, "sortOrder") } : {})
        }
      });
      if (detailImageUrls) await replaceProductImages(tx, id, detailImageUrls);
      return tx.product.findUniqueOrThrow({ where: { id }, include: { category: true, skus: true, images: { orderBy: { sortOrder: "asc" } } } });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "Product", id, "Update product", { title: product.title, status: product.status });
    return ok(formatProduct(product));
  }

  async createSku(productId: string, input: unknown, admin: CurrentAdmin) {
    return this.createSkuWithProductId(productId, input, admin);
  }

  async createSkuFromBody(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    return this.createSkuWithProductId(readRequiredString(body, "productId"), body, admin);
  }

  async updateSku(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const sku = await this.prisma.productSku.update({
      where: { id },
      data: {
        ...(typeof body.productId !== "undefined" ? { productId: readRequiredString(body, "productId") } : {}),
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.priceCent !== "undefined" ? { priceCent: readRequiredInt(body, "priceCent") } : {}),
        ...(typeof body.stock !== "undefined" ? { stock: readRequiredInt(body, "stock") } : {}),
        ...(typeof body.status !== "undefined" ? { status: readStatus(readRequiredString(body, "status"), SKU_STATUSES, "SKU 状态") } : {}),
        ...(typeof body.specsJson !== "undefined" ? { specsJson: readNullableObject(body.specsJson) } : {})
      },
      include: { product: { select: { title: true } } }
    });
    if (sku.stock < sku.lockedStock + sku.soldCount) throw new ConflictException("库存不能小于已锁定和已售数量");
    await this.writeAudit(admin, AuditAction.UPDATE, "ProductSku", id, "Update product SKU", { productId: sku.productId, status: sku.status });
    return ok(formatSkuWithProduct(sku));
  }

  async listSkus(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const productId = readOptionalString(query, "productId");
    const status = readStatus(readOptionalString(query, "status"), SKU_STATUSES, "SKU 状态");
    const keyword = readOptionalString(query, "keyword");
    const where: Prisma.ProductSkuWhereInput = {
      ...(productId ? { productId } : {}),
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ name: { contains: keyword, mode: "insensitive" } }, { product: { title: { contains: keyword, mode: "insensitive" } } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.productSku.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { product: { select: { title: true } } } }),
      this.prisma.productSku.count({ where })
    ]);
    return ok({ items: items.map(formatSkuWithProduct), total, page, pageSize });
  }

  async inventoryLogs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const skuId = readOptionalString(query, "skuId");
    const items = await this.prisma.mallInventoryLog.findMany({
      where: { ...(skuId ? { skuId } : {}) },
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
      include: { sku: { select: { name: true, product: { select: { title: true } } } }, order: { select: { orderNo: true } } }
    });
    return ok({ items: items.map(formatInventoryLog), total: await this.prisma.mallInventoryLog.count({ where: { ...(skuId ? { skuId } : {}) } }), page, pageSize });
  }

  async listOrders(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = readOptionalString(query, "keyword");
    const status = readStatus(readOptionalString(query, "status"), ORDER_STATUSES, "商城订单状态");
    const where: Prisma.MallOrderWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: "insensitive" } }, { receiverName: { contains: keyword, mode: "insensitive" } }, { receiverPhone: { contains: keyword, mode: "insensitive" } }] } : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mallOrder.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: pageSize, include: mallOrderInclude }),
      this.prisma.mallOrder.count({ where })
    ]);
    return ok({ items: items.map(formatOrder), total, page, pageSize });
  }

  async orderOptions(query: Record<string, unknown> = {}) {
    const keyword = readOptionalString(query, "keyword");
    const items = await this.prisma.mallOrder.findMany({
      where: {
        ...(keyword ? { OR: [{ orderNo: { contains: keyword, mode: "insensitive" } }, { receiverName: { contains: keyword, mode: "insensitive" } }, { receiverPhone: { contains: keyword, mode: "insensitive" } }] } : {})
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: mallOrderInclude
    });
    return ok({ items: items.map(formatOrder) });
  }

  async getOrder(id: string) {
    const order = await this.prisma.mallOrder.findUnique({ where: { id }, include: mallOrderInclude });
    if (!order) throw new NotFoundException("Mall order not found");
    return ok(formatOrder(order));
  }

  async closeOrder(id: string, admin: CurrentAdmin) {
    const order = await this.prisma.mallOrder.findUnique({ where: { id }, include: { items: true } });
    if (!order) throw new NotFoundException("Mall order not found");
    if (order.status === "CLOSED") return ok(formatOrder(await this.getOrderEntity(id)));
    if (order.status !== "PENDING_PAYMENT") throw new ConflictException("仅待支付商城订单可关闭");
    await this.prisma.$transaction(async (tx) => {
      for (const item of order.items) await releaseLockedStock(tx, item.skuId, item.quantity, order.id, "ORDER_CLOSE", "关闭待支付商城订单释放库存");
      await tx.mallOrder.update({ where: { id }, data: { status: "CLOSED" } });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallOrder", id, "Close mall order", { orderNo: order.orderNo });
    return ok(formatOrder(await this.getOrderEntity(id)));
  }

  async shipOrder(id: string, input: unknown, admin: CurrentAdmin) {
    return this.createShipment({ ...readObject(input), orderId: id }, admin);
  }

  async verifyOrder(id: string, admin: CurrentAdmin) {
    const shipment = await this.prisma.mallShipment.findFirst({ where: { orderId: id, status: "SHIPPED" }, orderBy: { shippedAt: "desc" } });
    if (!shipment) throw new ConflictException("订单暂无可完成的发货记录");
    await this.updateShipment(shipment.id, { status: "COMPLETED" }, admin);
    return ok(formatOrder(await this.getOrderEntity(id)));
  }

  async listShipments(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const status = readStatus(readOptionalString(query, "status"), SHIPMENT_STATUSES, "发货状态");
    const orderId = readOptionalString(query, "orderId");
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mallShipment.findMany({
        where: { ...(status ? { status } : {}), ...(orderId ? { orderId } : {}) },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      }),
      this.prisma.mallShipment.count({ where: { ...(status ? { status } : {}), ...(orderId ? { orderId } : {}) } })
    ]);
    return ok({ items: items.map(formatShipment), total, page, pageSize });
  }

  async createShipment(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const orderId = readRequiredString(body, "orderId");
    const order = await this.prisma.mallOrder.findUnique({ where: { id: orderId }, include: { shipments: true } });
    if (!order) throw new NotFoundException("Mall order not found");
    if (order.status !== "PAID") throw new ConflictException("仅已支付商城订单可发货；真实支付暂未开放时不会伪造支付成功");
    if (order.shipments.some((item) => item.status === "SHIPPED")) throw new ConflictException("该订单已有进行中的发货记录");
    const shipment = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mallShipment.create({
        data: {
          orderId,
          company: readNullableString(body.company),
          trackingNo: readNullableString(body.trackingNo),
          pickupCode: readNullableString(body.pickupCode),
          remark: readNullableString(body.remark),
          status: "SHIPPED",
          shippedAt: new Date()
        },
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      });
      await tx.mallOrder.update({ where: { id: orderId }, data: { status: "SHIPPED" } });
      return created;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallOrder", orderId, "Ship mall order", { shipmentId: shipment.id });
    return ok(formatShipment(shipment));
  }

  async updateShipment(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const status = typeof body.status === "undefined" ? undefined : readStatus(readRequiredString(body, "status"), SHIPMENT_STATUSES, "发货状态");
    const current = await this.prisma.mallShipment.findUnique({ where: { id }, include: { order: true } });
    if (!current) throw new NotFoundException("Mall shipment not found");
    if (status === "COMPLETED" && current.status !== "SHIPPED") throw new ConflictException("仅已发货记录可完成");
    if (status === "SHIPPED" && current.status === "SHIPPED") throw new ConflictException("发货记录已处于发货中，不能重复发货");
    const shipment = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mallShipment.update({
        where: { id },
        data: {
          ...(typeof body.company !== "undefined" ? { company: readNullableString(body.company) } : {}),
          ...(typeof body.trackingNo !== "undefined" ? { trackingNo: readNullableString(body.trackingNo) } : {}),
          ...(typeof body.pickupCode !== "undefined" ? { pickupCode: readNullableString(body.pickupCode) } : {}),
          ...(typeof body.remark !== "undefined" ? { remark: readNullableString(body.remark) } : {}),
          ...(status ? { status, completedAt: status === "COMPLETED" ? new Date() : undefined } : {})
        },
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      });
      if (status === "COMPLETED") await tx.mallOrder.update({ where: { id: current.orderId }, data: { status: "COMPLETED" } });
      return updated;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallShipment", id, "Update mall shipment", { orderId: current.orderId, status: shipment.status });
    return ok(formatShipment(shipment));
  }

  async listAfterSales(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const status = readStatus(readOptionalString(query, "status"), AFTER_SALE_STATUSES, "售后状态");
    const orderId = readOptionalString(query, "orderId");
    const [items, total] = await this.prisma.$transaction([
      this.prisma.mallAfterSale.findMany({
        where: { ...(status ? { status } : {}), ...(orderId ? { orderId } : {}) },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      }),
      this.prisma.mallAfterSale.count({ where: { ...(status ? { status } : {}), ...(orderId ? { orderId } : {}) } })
    ]);
    return ok({ items: items.map(formatAfterSale), total, page, pageSize });
  }

  async createAfterSale(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const orderId = readRequiredString(body, "orderId");
    const order = await this.prisma.mallOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException("Mall order not found");
    if (!["PAID", "SHIPPED", "COMPLETED"].includes(order.status)) throw new ConflictException("仅已支付、已发货或已完成订单可创建售后");
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.mallAfterSale.create({
        data: {
          orderId,
          type: readStatus(readRequiredString(body, "type"), AFTER_SALE_TYPES, "售后类型") ?? "REFUND",
          status: "REQUESTED",
          reason: readNullableString(body.reason),
          note: readNullableString(body.note)
        },
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      });
      await tx.mallOrder.update({ where: { id: orderId }, data: { status: "REFUNDING" } });
      return created;
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MallAfterSale", item.id, "Create mall after-sale", { orderId, type: item.type });
    return ok(formatAfterSale(item));
  }

  async updateAfterSale(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const status = typeof body.status === "undefined" ? undefined : readStatus(readRequiredString(body, "status"), AFTER_SALE_STATUSES, "售后状态");
    const current = await this.prisma.mallAfterSale.findUnique({ where: { id }, include: { order: true } });
    if (!current) throw new NotFoundException("Mall after-sale not found");
    if (status && !canMoveAfterSale(current.status, status)) throw new ConflictException("当前售后状态不可流转");
    const item = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.mallAfterSale.update({
        where: { id },
        data: {
          ...(status ? { status, handledAt: ["APPROVED", "REJECTED", "COMPLETED", "CANCELLED"].includes(status) ? new Date() : undefined } : {}),
          ...(typeof body.reason !== "undefined" ? { reason: readNullableString(body.reason) } : {}),
          ...(typeof body.note !== "undefined" ? { note: readNullableString(body.note) } : {})
        },
        include: { order: { select: { orderNo: true, receiverName: true, receiverPhone: true } } }
      });
      if (status === "REJECTED" || status === "CANCELLED") await tx.mallOrder.update({ where: { id: current.orderId }, data: { status: current.order.status === "REFUNDING" ? "PAID" : current.order.status } });
      if (status === "APPROVED" || status === "PROCESSING" || status === "COMPLETED") await tx.mallOrder.update({ where: { id: current.orderId }, data: { status: "REFUNDING" } });
      return updated;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MallAfterSale", id, "Update mall after-sale", { orderId: current.orderId, status: item.status });
    return ok(formatAfterSale(item));
  }

  async exportOrders() {
    const items = await this.prisma.mallOrder.findMany({ orderBy: { createdAt: "desc" }, take: 5000, include: mallOrderInclude });
    return ok({ items: items.map(formatOrder), truncated: items.length >= 5000 });
  }

  private async createSkuWithProductId(productId: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found");
    const sku = await this.prisma.productSku.create({
      data: {
        productId,
        name: readRequiredString(body, "name"),
        priceCent: readRequiredInt(body, "priceCent"),
        stock: readRequiredInt(body, "stock"),
        lockedStock: readOptionalInt(body, "lockedStock") ?? 0,
        status: readStatus(readOptionalString(body, "status") ?? "ACTIVE", SKU_STATUSES, "SKU 状态") ?? "ACTIVE",
        specsJson: readNullableObject(body.specsJson)
      },
      include: { product: { select: { title: true } } }
    });
    if (sku.stock < sku.lockedStock + sku.soldCount) throw new ConflictException("库存不能小于已锁定和已售数量");
    await this.writeAudit(admin, AuditAction.CREATE, "ProductSku", sku.id, "Create product SKU", { productId });
    return ok(formatSkuWithProduct(sku));
  }

  private async getOrderEntity(id: string) {
    return this.prisma.mallOrder.findUniqueOrThrow({ where: { id }, include: mallOrderInclude });
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadataJson?: Prisma.InputJsonObject) {
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson } });
  }
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

const mallOrderInclude = {
  user: true,
  items: true,
  shipments: { orderBy: { createdAt: "desc" } },
  afterSales: { orderBy: { createdAt: "desc" } }
} satisfies Prisma.MallOrderInclude;

type MallOrderWithInclude = Prisma.MallOrderGetPayload<{ include: typeof mallOrderInclude }>;

function formatCategory(item: Prisma.ProductCategoryGetPayload<Record<string, never>>) {
  return { ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() };
}

function formatProduct(item: Prisma.ProductGetPayload<{ include: { category: true; skus: true; images: true } }>) {
  return {
    ...item,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    skus: item.skus.map(formatSku),
    images: item.images.map((image) => ({ ...image, createdAt: image.createdAt.toISOString() })),
    detailImageUrls: item.images.map((image) => image.url)
  };
}

function formatSku(item: Prisma.ProductSkuGetPayload<Record<string, never>>) {
  return {
    ...item,
    availableStock: Math.max(0, item.stock - item.lockedStock - item.soldCount),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatSkuWithProduct(item: Prisma.ProductSkuGetPayload<{ include: { product: { select: { title: true } } } }>) {
  return { ...formatSku(item), productTitle: item.product.title };
}

function formatOrder(item: MallOrderWithInclude) {
  return {
    ...item,
    paidAt: item.paidAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    user: item.user ? { id: item.user.id, nickname: item.user.nickname, wechatNickname: item.user.wechatNickname, phone: item.user.phone } : null,
    items: item.items.map((orderItem) => ({ ...orderItem, createdAt: orderItem.createdAt.toISOString() })),
    shipments: item.shipments.map(formatShipmentBare),
    afterSales: item.afterSales.map(formatAfterSaleBare),
    paymentNotice: "商城真实支付暂未开放，待支付订单不会伪造支付成功。"
  };
}

function formatShipment(item: Prisma.MallShipmentGetPayload<{ include: { order: { select: { orderNo: true; receiverName: true; receiverPhone: true } } } }>) {
  return {
    ...formatShipmentBare(item),
    orderNo: item.order.orderNo,
    receiverName: item.order.receiverName,
    receiverPhone: item.order.receiverPhone
  };
}

function formatShipmentBare(item: Prisma.MallShipmentGetPayload<Record<string, never>>) {
  return {
    ...item,
    shippedAt: item.shippedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatAfterSale(item: Prisma.MallAfterSaleGetPayload<{ include: { order: { select: { orderNo: true; receiverName: true; receiverPhone: true } } } }>) {
  return {
    ...formatAfterSaleBare(item),
    orderNo: item.order.orderNo,
    receiverName: item.order.receiverName,
    receiverPhone: item.order.receiverPhone,
    refundNotice: ["REFUND", "RETURN_REFUND"].includes(item.type) ? "真实退款暂未开放，审核通过后仍需线下或后续退款流程处理。" : null
  };
}

function formatAfterSaleBare(item: Prisma.MallAfterSaleGetPayload<Record<string, never>>) {
  return {
    ...item,
    handledAt: item.handledAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

function formatInventoryLog(item: Prisma.MallInventoryLogGetPayload<Record<string, never>> & {
  sku: { name: string; product: { title: string } };
  order: { orderNo: string } | null;
}) {
  return {
    ...item,
    skuName: item.sku.name,
    productTitle: item.sku.product.title,
    orderNo: item.order?.orderNo ?? null,
    createdAt: item.createdAt.toISOString()
  };
}

async function replaceProductImages(tx: Prisma.TransactionClient, productId: string, urls: string[] | undefined) {
  if (!urls) return;
  await tx.productImage.deleteMany({ where: { productId } });
  if (urls.length > 0) {
    await tx.productImage.createMany({
      data: urls.map((url, sortOrder) => ({ productId, url, sortOrder }))
    });
  }
}

async function releaseLockedStock(tx: Prisma.TransactionClient, skuId: string, quantity: number, orderId: string, action: string, remark: string) {
  const sku = await tx.productSku.findUnique({ where: { id: skuId } });
  if (!sku) throw new NotFoundException("Product SKU not found");
  const releaseQuantity = Math.min(quantity, sku.lockedStock);
  if (releaseQuantity <= 0) return;
  await tx.productSku.update({ where: { id: skuId }, data: { lockedStock: { decrement: releaseQuantity } } });
  await tx.mallInventoryLog.create({
    data: {
      skuId,
      orderId,
      action,
      quantity: releaseQuantity,
      beforeLockedStock: sku.lockedStock,
      afterLockedStock: sku.lockedStock - releaseQuantity,
      beforeSoldCount: sku.soldCount,
      afterSoldCount: sku.soldCount,
      remark
    }
  });
}

function canMoveAfterSale(current: string, next: string): boolean {
  if (current === next) return true;
  if (["COMPLETED", "CANCELLED", "REJECTED"].includes(current)) return false;
  if (current === "REQUESTED") return ["APPROVED", "REJECTED", "CANCELLED"].includes(next);
  if (current === "APPROVED") return ["PROCESSING", "COMPLETED", "CANCELLED"].includes(next);
  if (current === "PROCESSING") return ["COMPLETED", "CANCELLED"].includes(next);
  return false;
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

function readBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") throw new BadRequestException(`${key} 必须是布尔值`);
  return value;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalBooleanString(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string" || !value) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
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

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (typeof value === "undefined") return undefined;
  if (value === null || value === "") return [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
  if (typeof value === "string") return value.split(/\n|,/).map((item) => item.trim()).filter(Boolean);
  throw new BadRequestException("图片列表格式不正确");
}

function readStatus<T extends readonly string[]>(value: string | undefined, allowed: T, label: string): T[number] | undefined {
  if (!value) return undefined;
  const upper = value.trim().toUpperCase();
  if (!allowed.includes(upper)) throw new BadRequestException(`${label} 必须是 ${allowed.join(" / ")}`);
  return upper as T[number];
}

function readPage(query: Record<string, unknown>) {
  const page = Math.max(1, readOptionalInt(query, "page") ?? 1);
  const pageSize = Math.min(100, Math.max(1, readOptionalInt(query, "pageSize") ?? 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}
