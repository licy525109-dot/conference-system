import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
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

const UPLOADS_ROOT = resolve(process.env.UPLOADS_DIR || join(inferProjectRoot(process.cwd()), "uploads"));
const MATERIAL_UPLOAD_DIR = join(UPLOADS_ROOT, "materials");
const MB = 1024 * 1024;
const MAX_IMAGE_SIZE_BYTES = 2 * MB;
const MAX_VIDEO_SIZE_BYTES = 20 * MB;
const MAX_FILE_SIZE_BYTES = 20 * MB;
const MAX_FONT_SIZE_BYTES = 5 * MB;
const ALLOWED_MATERIAL_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
  ["image/svg+xml", ".svg"],
  ["video/mp4", ".mp4"],
  ["application/pdf", ".pdf"],
  ["text/plain", ".txt"],
  ["text/markdown", ".md"],
  ["application/msword", ".doc"],
  ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".docx"],
  ["application/vnd.ms-excel", ".xls"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"],
  ["application/vnd.ms-powerpoint", ".ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pptx"],
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
const ALLOWED_EXTENSION_TYPES = new Map<string, string[]>([
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".webp", ["image/webp"]],
  [".gif", ["image/gif"]],
  [".svg", ["image/svg+xml"]],
  [".mp4", ["video/mp4"]],
  [".pdf", ["application/pdf"]],
  [".txt", ["text/plain"]],
  [".md", ["text/markdown", "text/plain"]],
  [".doc", ["application/msword"]],
  [".docx", ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]],
  [".xls", ["application/vnd.ms-excel"]],
  [".xlsx", ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]],
  [".ppt", ["application/vnd.ms-powerpoint"]],
  [".pptx", ["application/vnd.openxmlformats-officedocument.presentationml.presentation"]],
  [".ttf", ["font/ttf", "application/x-font-ttf"]],
  [".otf", ["font/otf", "application/x-font-otf"]],
  [".woff", ["font/woff", "application/font-woff"]],
  [".woff2", ["font/woff2", "application/font-woff2"]],
  [".eot", ["application/vnd.ms-fontobject"]]
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
      items: items.map((item) => ({ ...formatAsset(item), uploadCheck: buildMaterialUrlCheck(item.url) })),
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
    const uploadCheck = await diagnoseMaterialUrl(url);
    return ok({ ...formatAsset(asset), uploadCheck });
  }

  async diagnoseAsset(id: string) {
    const asset = await this.prisma.materialAsset.findUnique({ where: { id }, select: assetSelect });
    if (!asset) throw new NotFoundException("Material asset not found");
    return ok({ ...formatAsset(asset), uploadCheck: await diagnoseMaterialUrl(asset.url) });
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

  async hardDeleteAsset(id: string, admin: CurrentAdmin) {
    const asset = await this.prisma.materialAsset.findUnique({ where: { id }, select: assetSelect });
    if (!asset) throw new NotFoundException("Material asset not found");
    const references = await this.listAssetReferences(asset);
    if (references.total > 0) {
      throw new BadRequestException(`素材仍被引用，不能彻底删除：${references.items.map((item) => item.label).slice(0, 8).join("；")}`);
    }
    const fileResult = deleteLocalMaterialFile(asset.url);
    await this.prisma.materialAsset.delete({ where: { id } });
    await this.writeAudit(admin, AuditAction.DELETE, "MaterialAsset", id, "Hard delete material asset", {
      usage: asset.usage,
      url: asset.url,
      references,
      file: fileResult
    });
    return ok({ id, deleted: true, references, file: fileResult });
  }

  private async countAssetReferences(id: string) {
    const [productCovers, productImages] = await this.prisma.$transaction([
      this.prisma.product.count({ where: { coverMaterialId: id } }),
      this.prisma.productImage.count({ where: { materialId: id } })
    ]);
    return { productCovers, productImages, total: productCovers + productImages };
  }

  private async listAssetReferences(asset: { id: string; url: string }) {
    const [productsByMaterial, productImagesByMaterial, productsByUrl, productImagesByUrl, conferences, pageVersions, themes, tabbarItems, memberBenefits, wecomGroups] =
      await this.prisma.$transaction([
        this.prisma.product.findMany({ where: { coverMaterialId: asset.id }, select: { id: true, title: true } }),
        this.prisma.productImage.findMany({ where: { materialId: asset.id }, select: { id: true, product: { select: { title: true } } } }),
        this.prisma.product.findMany({ where: { coverImageUrl: asset.url }, select: { id: true, title: true } }),
        this.prisma.productImage.findMany({ where: { url: asset.url }, select: { id: true, product: { select: { title: true } } } }),
        this.prisma.conference.findMany({ where: { coverImageUrl: asset.url }, select: { id: true, title: true } }),
        this.prisma.pageVersion.findMany({ select: { id: true, title: true, status: true, components: true, themeJson: true, template: { select: { title: true, pageKey: true } } } }),
        this.prisma.activeThemeConfig.findMany({ select: { id: true, scope: true, configJson: true } }),
        this.prisma.tabBarItem.findMany({ where: { OR: [{ iconUrl: asset.url }, { selectedIconUrl: asset.url }] }, select: { id: true, title: true, pageKey: true } }),
        this.prisma.memberBenefit.findMany({ where: { iconUrl: asset.url }, select: { id: true, title: true } }),
        this.prisma.wecomCustomerGroup.findMany({ where: { groupQrUrl: asset.url }, select: { id: true, name: true } })
      ]);
    const items = [
      ...productsByMaterial.map((item) => referenceItem("商品封面", item.id, item.title)),
      ...productImagesByMaterial.map((item) => referenceItem("商品详情图", item.id, item.product?.title)),
      ...productsByUrl.map((item) => referenceItem("商品封面 URL", item.id, item.title)),
      ...productImagesByUrl.map((item) => referenceItem("商品详情图 URL", item.id, item.product?.title)),
      ...conferences.map((item) => referenceItem("会议封面", item.id, item.title)),
      ...pageVersions.filter((item) => jsonMentionsMaterial(item.components, asset) || jsonMentionsMaterial(item.themeJson, asset)).map((item) => referenceItem("CMS 页面版本", item.id, `${item.template?.title || item.title} / ${item.status}`)),
      ...themes.filter((item) => jsonMentionsMaterial(item.configJson, asset)).map((item) => referenceItem("主题配置", item.id, item.scope)),
      ...tabbarItems.map((item) => referenceItem("底部导航图标", item.id, `${item.title} / ${item.pageKey}`)),
      ...memberBenefits.map((item) => referenceItem("会员权益图标", item.id, item.title)),
      ...wecomGroups.map((item) => referenceItem("企微群二维码", item.id, item.name))
    ];
    return { items, total: items.length };
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
  const maxSize = maxMaterialSize(file);
  if (file.size > maxSize.bytes) {
    throw new BadRequestException(`${maxSize.label}文件过大，不能超过 ${maxSize.text}`);
  }

  const extension = readAllowedExtension(file);
  mkdirSync(MATERIAL_UPLOAD_DIR, { recursive: true });
  const fileName = `${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
  const filePath = join(MATERIAL_UPLOAD_DIR, fileName);
  writeFileSync(filePath, file.buffer, { flag: "wx" });
  const publicBase = normalizePublicOrigin(publicOrigin);
  const url = `${publicBase}/uploads/materials/${fileName}`;
  return {
    name: stripExtension(file.originalname) || fileName,
    url,
    fileType: file.mimetype ?? inferFileType(fileName),
    sizeBytes: file.size,
    check: {
      url,
      localPath: filePath,
      localExists: existsSync(filePath),
      staticUrl: `${publicBase}/uploads/`,
      accessHint: "如果素材 URL 404，请确认 Nginx /uploads/ 指向项目 uploads 目录，且不要使用 /api/uploads 作为素材公网地址。"
    }
  };
}

function buildMaterialUrlCheck(url: string) {
  const localPath = resolveLocalMaterialPath(url);
  const hasApiUploads = url.includes("/api/uploads");
  return {
    url,
    localPath,
    localExists: Boolean(localPath && existsSync(localPath)),
    staticUrl: url.includes("/uploads/materials/") ? url.split("/uploads/materials/")[0] + "/uploads/" : null,
    publicStatus: null as number | null,
    publicReachable: null as boolean | null,
    publicMime: null as string | null,
    checkedAt: null as string | null,
    accessHint: hasApiUploads
      ? "素材 URL 不应包含 /api/uploads，请改用公网 /uploads/materials/ 路径。"
      : localPath
        ? "本地文件检测已完成；点击诊断可检查公网 URL 是否返回 200/206 以及 MIME 是否正确。"
        : "外部 URL 素材请确认源站允许访问。"
  };
}

async function diagnoseMaterialUrl(url: string) {
  const base = buildMaterialUrlCheck(url);
  const checkedAt = new Date().toISOString();
  if (url.includes("/api/uploads")) {
    return {
      ...base,
      checkedAt,
      publicReachable: false,
      accessHint: "素材 URL 错误：不能使用 /api/uploads。请确保返回 https://guanchaohuiji.com/uploads/materials/xxx。"
    };
  }
  try {
    const response = await fetchWithTimeout(url, { method: "HEAD", headers: { Range: "bytes=0-1" } }, 3000);
    const status = response.status;
    const mime = response.headers.get("content-type");
    const reachable = status === 200 || status === 206 || status === 301 || status === 302 || status === 403;
    return {
      ...base,
      checkedAt,
      publicStatus: status,
      publicReachable: reachable,
      publicMime: mime,
      accessHint: reachable
        ? status === 403
          ? "公网 /uploads/ 返回 403 表示目录存在但禁止目录浏览；具体素材 URL 如返回 200/206 即可使用。"
          : "公网 URL 可访问。视频素材应返回 video/mp4 或可被浏览器识别的 MIME。"
        : `公网 URL 不可访问 (${status})，请检查 Nginx /uploads/ 是否映射到 ${UPLOADS_ROOT}。`
    };
  } catch (error) {
    return {
      ...base,
      checkedAt,
      publicReachable: false,
      accessHint: `公网 URL 检查失败：${error instanceof Error ? error.message : "网络异常"}。请检查 Nginx /uploads/ 静态目录映射。`
    };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalizePublicOrigin(value: string) {
  return value.trim().replace(/\/+$/, "").replace(/\/api$/, "");
}

function deleteLocalMaterialFile(url: string) {
  const filePath = resolveLocalMaterialPath(url);
  if (!filePath) return { local: false, deleted: false, missing: false, message: "外部 URL 或非素材上传路径，不删除服务器文件" };
  if (!existsSync(filePath)) return { local: true, deleted: false, missing: true, path: filePath, message: "服务器文件不存在，已删除数据库记录" };
  unlinkSync(filePath);
  return { local: true, deleted: true, missing: false, path: filePath, message: "服务器文件已删除" };
}

function resolveLocalMaterialPath(url: string): string | null {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const marker = "/uploads/materials/";
  const index = pathname.indexOf(marker);
  if (index < 0) return null;
  const fileName = decodeURIComponent(pathname.slice(index + marker.length)).replace(/^\/+/, "");
  if (!fileName || fileName.includes("..")) return null;
  const filePath = resolve(MATERIAL_UPLOAD_DIR, fileName);
  const root = resolve(MATERIAL_UPLOAD_DIR);
  return filePath.startsWith(`${root}/`) ? filePath : null;
}

function inferProjectRoot(cwd: string): string {
  const normalized = resolve(cwd);
  return normalized.endsWith("/services/api") ? resolve(normalized, "../..") : normalized;
}

function jsonMentionsMaterial(value: unknown, asset: { id: string; url: string }): boolean {
  const text = JSON.stringify(value ?? "");
  return text.includes(asset.id) || text.includes(asset.url);
}

function referenceItem(type: string, id: string, name?: string | null) {
  return { type, id, label: `${type}${name ? `：${name}` : ""}` };
}

function readAllowedExtension(file: UploadedMaterialFile): string {
  const extension = extname(file.originalname ?? "").toLowerCase();
  if (extension && !ALLOWED_EXTENSION_TYPES.has(extension)) {
    throw new BadRequestException("格式不支持。仅支持 jpg/png/webp/gif/svg/mp4/pdf/doc/docx/xls/xlsx/ppt/pptx/txt/md/ttf/otf/woff/woff2 素材，不能上传可执行文件");
  }
  if (file.mimetype && !ALLOWED_MATERIAL_TYPES.has(file.mimetype)) {
    throw new BadRequestException(`格式不支持：${file.mimetype}。请上传图片、MP4、PDF、Office、TXT/MD 或字体文件`);
  }
  if (file.mimetype && extension) {
    const compatibleTypes = ALLOWED_EXTENSION_TYPES.get(extension) ?? [];
    if (!compatibleTypes.includes(file.mimetype)) {
      throw new BadRequestException("文件扩展名与 MIME 类型不一致，请确认素材格式后重新上传");
    }
  }
  if (extension) {
    return extension;
  }
  if (file.mimetype && ALLOWED_MATERIAL_TYPES.has(file.mimetype)) {
    return ALLOWED_MATERIAL_TYPES.get(file.mimetype)!;
  }
  throw new BadRequestException("格式不支持。仅支持 jpg/png/webp/gif/svg/mp4/pdf/doc/docx/xls/xlsx/ppt/pptx/txt/md/ttf/otf/woff/woff2 素材");
}

function inferFileType(url: string): string {
  const extension = extname(url).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".txt") return "text/plain";
  if (extension === ".md") return "text/markdown";
  if (extension === ".doc") return "application/msword";
  if (extension === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (extension === ".xls") return "application/vnd.ms-excel";
  if (extension === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (extension === ".ppt") return "application/vnd.ms-powerpoint";
  if (extension === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
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

function maxMaterialSize(file: UploadedMaterialFile): { bytes: number; text: string; label: string } {
  const extension = extname(file.originalname ?? "").toLowerCase();
  const type = file.mimetype ?? "";
  if (type.startsWith("video/") || extension === ".mp4") return { bytes: MAX_VIDEO_SIZE_BYTES, text: "20MB", label: "视频素材" };
  if (type.startsWith("font/") || [".ttf", ".otf", ".woff", ".woff2", ".eot"].includes(extension)) return { bytes: MAX_FONT_SIZE_BYTES, text: "5MB", label: "字体素材" };
  if (type.startsWith("image/") || [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"].includes(extension)) return { bytes: MAX_IMAGE_SIZE_BYTES, text: "2MB", label: "图片素材" };
  return { bytes: MAX_FILE_SIZE_BYTES, text: "20MB", label: "文件素材" };
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
