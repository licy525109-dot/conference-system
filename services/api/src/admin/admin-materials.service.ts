import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

export interface UploadedMaterialFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size: number;
}

const MATERIAL_UPLOAD_DIR = join(process.cwd(), "uploads", "materials");
const MAX_MATERIAL_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MATERIAL_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["video/mp4", ".mp4"],
  ["font/ttf", ".ttf"],
  ["font/otf", ".otf"],
  ["font/woff", ".woff"],
  ["font/woff2", ".woff2"],
  ["application/x-font-ttf", ".ttf"],
  ["application/x-font-otf", ".otf"],
  ["application/font-woff", ".woff"],
  ["application/font-woff2", ".woff2"],
  ["application/vnd.ms-fontobject", ".eot"]
]);

@Injectable()
export class AdminMaterialsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories() {
    const items = await this.prisma.materialCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: categorySelect
    });
    return ok({ items: items.map(formatCategory) });
  }

  async createCategory(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const name = readRequiredString(body, "name");
    const code = readRequiredString(body, "code");
    const category = await catchUniqueConstraint(
      this.prisma.materialCategory.create({
        data: {
          name,
          code,
          description: readOptionalString(body, "description"),
          sortOrder: readOptionalInt(body, "sortOrder") ?? 0,
          enabled: readOptionalBoolean(body, "enabled") ?? true
        },
        select: categorySelect
      }),
      "素材分类编码已存在"
    );
    await this.writeAudit(admin, AuditAction.CREATE, "MaterialCategory", category.id, "Create material category", {
      code
    });
    return ok(formatCategory(category));
  }

  async listAssets(query: Record<string, unknown>) {
    const categoryId = readOptionalString(query, "categoryId");
    const usage = readOptionalString(query, "usage");
    const keyword = readOptionalString(query, "keyword");
    const enabled = readOptionalBoolean(query, "enabled") ?? true;
    const where: Prisma.MaterialAssetWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(usage ? { usage } : {}),
      enabled,
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword, mode: "insensitive" } },
              { usage: { contains: keyword, mode: "insensitive" } },
              { remark: { contains: keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.materialAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: readOptionalInt(query, "pageSize") ?? 50,
        skip: ((readOptionalInt(query, "page") ?? 1) - 1) * (readOptionalInt(query, "pageSize") ?? 50),
        select: assetSelect
      }),
      this.prisma.materialAsset.count({ where })
    ]);

    return ok({
      items: items.map(formatAsset),
      total,
      page: readOptionalInt(query, "page") ?? 1,
      pageSize: readOptionalInt(query, "pageSize") ?? 50
    });
  }

  async createAsset(input: unknown, file: UploadedMaterialFile | undefined, publicOrigin: string, admin: CurrentAdmin) {
    const body = readObject(input);
    const uploaded = file ? saveMaterialFile(file, publicOrigin) : null;
    const url = uploaded?.url ?? readRequiredString(body, "url");
    const name = readOptionalString(body, "name") ?? uploaded?.name ?? "未命名素材";
    const asset = await this.prisma.materialAsset.create({
      data: {
        categoryId: readOptionalString(body, "categoryId"),
        name,
        usage: readRequiredString(body, "usage"),
        fileType: uploaded?.fileType ?? readOptionalString(body, "fileType") ?? inferFileType(url),
        url,
        sizeBytes: uploaded?.sizeBytes ?? readOptionalInt(body, "sizeBytes"),
        width: readOptionalInt(body, "width"),
        height: readOptionalInt(body, "height"),
        enabled: readOptionalBoolean(body, "enabled") ?? true,
        remark: readOptionalString(body, "remark"),
        createdBy: admin.id,
        updatedBy: admin.id
      },
      select: assetSelect
    });
    await this.writeAudit(admin, AuditAction.CREATE, "MaterialAsset", asset.id, "Create material asset", {
      usage: asset.usage
    });
    return ok(formatAsset(asset));
  }

  async updateAsset(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    await this.ensureAsset(id);
    const asset = await this.prisma.materialAsset.update({
      where: { id },
      data: {
        ...(typeof body.categoryId !== "undefined" ? { categoryId: readNullableString(body.categoryId) } : {}),
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.usage !== "undefined" ? { usage: readRequiredString(body, "usage") } : {}),
        ...(typeof body.fileType !== "undefined" ? { fileType: readRequiredString(body, "fileType") } : {}),
        ...(typeof body.url !== "undefined" ? { url: readRequiredString(body, "url") } : {}),
        ...(typeof body.sizeBytes !== "undefined" ? { sizeBytes: readOptionalInt(body, "sizeBytes") } : {}),
        ...(typeof body.width !== "undefined" ? { width: readOptionalInt(body, "width") } : {}),
        ...(typeof body.height !== "undefined" ? { height: readOptionalInt(body, "height") } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.remark !== "undefined" ? { remark: readNullableString(body.remark) } : {}),
        updatedBy: admin.id
      },
      select: assetSelect
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "MaterialAsset", asset.id, "Update material asset", {
      usage: asset.usage
    });
    return ok(formatAsset(asset));
  }

  async disableAsset(id: string, admin: CurrentAdmin) {
    await this.ensureAsset(id);
    const references = await this.countAssetReferences(id);
    const asset = await this.prisma.materialAsset.update({
      where: { id },
      data: {
        enabled: false,
        updatedBy: admin.id
      },
      select: assetSelect
    });
    await this.writeAudit(admin, AuditAction.DELETE, "MaterialAsset", asset.id, "Disable material asset", {
      usage: asset.usage,
      references
    });
    return ok(formatAsset(asset));
  }

  private async countAssetReferences(id: string) {
    const [productCovers, productImages] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { coverMaterialId: id } }),
      this.prisma.productImage.count({ where: { materialId: id } })
    ]);
    return { productCovers, productImages, total: productCovers + productImages };
  }

  private async ensureAsset(id: string): Promise<void> {
    const asset = await this.prisma.materialAsset.findUnique({ where: { id }, select: { id: true } });
    if (!asset) {
      throw new NotFoundException("Material asset not found");
    }
  }

  private async writeAudit(
    admin: CurrentAdmin,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summary: string,
    metadataJson?: Prisma.InputJsonObject
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadataJson
      }
    });
  }
}

const categorySelect = {
  id: true,
  name: true,
  code: true,
  description: true,
  sortOrder: true,
  enabled: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.MaterialCategorySelect;

const assetSelect = {
  id: true,
  categoryId: true,
  name: true,
  usage: true,
  fileType: true,
  url: true,
  sizeBytes: true,
  width: true,
  height: true,
  enabled: true,
  remark: true,
  createdBy: true,
  updatedBy: true,
  createdAt: true,
  updatedAt: true,
  category: {
    select: {
      id: true,
      name: true,
      code: true
    }
  }
} satisfies Prisma.MaterialAssetSelect;

function formatCategory(category: Prisma.MaterialCategoryGetPayload<{ select: typeof categorySelect }>) {
  return {
    ...category,
    createdAt: category.createdAt.toISOString(),
    updatedAt: category.updatedAt.toISOString()
  };
}

function formatAsset(asset: Prisma.MaterialAssetGetPayload<{ select: typeof assetSelect }>) {
  return {
    ...asset,
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString()
  };
}

function saveMaterialFile(file: UploadedMaterialFile, publicOrigin: string) {
  if (file.size > MAX_MATERIAL_SIZE_BYTES) {
    throw new BadRequestException("素材文件不能超过 10MB");
  }

  const extension = readAllowedExtension(file);
  mkdirSync(MATERIAL_UPLOAD_DIR, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  const filePath = join(MATERIAL_UPLOAD_DIR, fileName);
  writeFileSync(filePath, file.buffer, { flag: "wx" });
  return {
    name: stripExtension(file.originalname) || fileName,
    url: `${publicOrigin.replace(/\/$/, "")}/uploads/materials/${fileName}`,
    fileType: file.mimetype ?? inferFileType(fileName),
    sizeBytes: file.size
  };
}

function readAllowedExtension(file: UploadedMaterialFile): string {
  if (file.mimetype && ALLOWED_MATERIAL_TYPES.has(file.mimetype)) {
    return ALLOWED_MATERIAL_TYPES.get(file.mimetype)!;
  }
  const extension = extname(file.originalname ?? "").toLowerCase();
  if ([...ALLOWED_MATERIAL_TYPES.values()].includes(extension)) {
    return extension;
  }
  throw new BadRequestException("仅支持 jpg/png/webp/gif/svg/mp4/ttf/otf/woff/woff2 素材");
}

function inferFileType(url: string): string {
  const extension = extname(url).toLowerCase();
  if (extension === ".ttf") {
    return "font/ttf";
  }
  if (extension === ".otf") {
    return "font/otf";
  }
  if (extension === ".woff") {
    return "font/woff";
  }
  if (extension === ".woff2") {
    return "font/woff2";
  }
  if (extension === ".mp4") {
    return "video/mp4";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  return "image/jpeg";
}

function stripExtension(value: string | undefined): string | null {
  if (!value) {
    return null;
  }
  const extension = extname(value);
  return extension ? value.slice(0, -extension.length) : value;
}

function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok",
    data
  };
}

async function catchUniqueConstraint<T>(promise: Promise<T>, message: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRecord(error) && error.code === "P2002") {
      throw new BadRequestException(message);
    }
    throw error;
  }
}

function readObject(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }
  return input;
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, field: string): string | null {
  return typeof input[field] === "string" && input[field].trim().length > 0 ? input[field].trim() : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalInt(input: Record<string, unknown>, field: string): number | undefined {
  if (typeof input[field] === "undefined" || input[field] === null || input[field] === "") {
    return undefined;
  }
  const value = Number(input[field]);
  if (!Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return value;
}

function readOptionalBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  if (typeof input[field] === "boolean") {
    return input[field];
  }
  if (input[field] === "true") {
    return true;
  }
  if (input[field] === "false") {
    return false;
  }
  return undefined;
}

function readRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
