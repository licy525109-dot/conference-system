import { Injectable, NotFoundException } from "@nestjs/common";
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
