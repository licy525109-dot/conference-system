import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extname } from "node:path";
import { open } from "node:fs/promises";
import { PrismaService } from "../prisma.service";
import {
  AdminMaterialsService,
  type UploadedMaterialFile,
  type StoredMaterialFile,
} from "../admin/admin-materials.service";
import type { CurrentAdmin } from "../admin/current-admin";
import { invitationOrigin } from "./invitation-policy";

export const INVITATION_ASSET_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};
export function validateInvitationAsset(
  file?: UploadedMaterialFile,
): UploadedMaterialFile {
  if (!file) throw new BadRequestException("请选择素材文件");
  const extension = extname(file.originalname || "").toLowerCase();
  const mime = INVITATION_ASSET_TYPES[extension];
  if (!mime) throw new BadRequestException("不支持此素材格式");
  const limit = mime.startsWith("image/")
    ? 2
    : mime.startsWith("font/")
      ? null
      : 20;
  if (
    !file.size ||
    file.size !== file.buffer.length
  )
    throw new BadRequestException("素材文件为空或不完整");
  if (limit !== null && file.size > limit * 1024 * 1024)
    throw new BadRequestException(`素材大小应在 0 到 ${limit}MB 之间`);
  const b = file.buffer,
    head = b.subarray(0, 4).toString("ascii");
  const valid =
    mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : mime === "image/jpeg"
        ? b[0] === 255 && b[1] === 216 && b[2] === 255
        : mime === "image/webp"
          ? head === "RIFF" && b.subarray(8, 12).toString() === "WEBP"
          : mime === "video/mp4"
            ? b.subarray(4, 8).toString() === "ftyp"
            : mime === "audio/mpeg"
              ? b.subarray(0, 3).toString() === "ID3" ||
                (b[0] === 255 && (b[1] & 224) === 224)
              : mime === "audio/wav"
                ? head === "RIFF" && b.subarray(8, 12).toString() === "WAVE"
                : mime === "audio/ogg"
                  ? head === "OggS"
                  : mime === "font/woff2"
                    ? head === "wOF2"
                    : mime === "font/woff"
                      ? head === "wOFF"
                      : mime === "font/otf"
                        ? head === "OTTO"
                        : b.subarray(0, 4).equals(Buffer.from([0, 1, 0, 0])) ||
                          head === "true";
  if (!valid) throw new BadRequestException("文件内容与格式不一致");
  return { ...file, mimetype: mime };
}

export async function validateInvitationFont(file?: StoredMaterialFile) {
  if (!file) throw new BadRequestException("请选择字体文件");
  const mime = INVITATION_ASSET_TYPES[extname(file.originalname || "").toLowerCase()];
  if (!mime?.startsWith("font/")) throw new BadRequestException("不支持此字体格式");
  const handle = await open(file.path, "r");
  try {
    const stats = await handle.stat();
    if (!stats.isFile() || !file.size || file.size !== stats.size)
      throw new BadRequestException("字体文件为空或不完整");
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length) throw new BadRequestException("文件内容与格式不一致");
    validateInvitationAsset({ ...file, buffer: header, size: header.length });
    return { ...file, mimetype: mime };
  } finally {
    await handle.close();
  }
}

export function invitationAssetScope(
  campaignId: string,
  admin: CurrentAdmin,
): Prisma.MaterialAssetWhereInput {
  return admin.permissions?.includes("material:view") ||
    admin.permissions?.includes("*")
    ? {}
    : {
        OR: [
          { createdBy: admin.id },
          { usage: `conference_invitation:${campaignId}` },
        ],
      };
}

@Injectable()
export class InvitationAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly materials: AdminMaterialsService,
  ) {}

  async list(
    campaignId: string,
    query: Record<string, string>,
    admin: CurrentAdmin,
  ) {
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(query.page) || 1)),
    );
    const prefix = ["image", "video", "audio", "font"].includes(query.kind)
      ? query.kind
      : "image";
    const mimeTypes = Object.values(INVITATION_ASSET_TYPES).filter((type) =>
      type.startsWith(`${prefix}/`),
    );
    const scope: Prisma.MaterialAssetWhereInput = {
      ...invitationAssetScope(campaignId, admin),
      enabled: true,
      fileType: { in: mimeTypes },
    };
    const where: Prisma.MaterialAssetWhereInput = {
      ...scope,
      ...(query.category === "__none"
        ? { categoryId: null }
        : query.category ? { category: { code: query.category } } : {}),
      ...(query.keyword ? { name: { contains: query.keyword.slice(0, 100), mode: "insensitive" } } : {}),
    };
    const [items, total, categories] = await this.prisma.$transaction([
      this.prisma.materialAsset.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: 24,
        skip: (page - 1) * 24,
        select: {
          id: true,
          name: true,
          url: true,
          fileType: true,
          sizeBytes: true,
          width: true,
          height: true,
        },
      }),
      this.prisma.materialAsset.count({ where }),
      this.prisma.materialCategory.findMany({
        where: { assets: { some: scope } },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { code: true, name: true },
      }),
    ]);
    return {
      code: "OK",
      message: "ok",
      data: {
        items: items.map((item) => ({ ...item, url: localUrl(item.url) })),
        categories,
        total,
        page,
        pageSize: 24,
      },
    };
  }

  async upload(
    campaignId: string,
    file: UploadedMaterialFile | undefined,
    admin: CurrentAdmin,
    purpose?: string,
  ) {
    const validated = validateInvitationAsset(file);
    const isLogo = purpose === "organization_logo";
    if (isLogo && !validated.mimetype?.startsWith("image/")) throw new BadRequestException("单位 Logo 需要图片文件");
    const category = isLogo ? await this.prisma.materialCategory.upsert({
      where: { code: "logo" }, update: {}, create: { code: "logo", name: "单位与品牌 Logo" }, select: { id: true },
    }) : null;
    const result = await this.materials.createAsset(
      { usage: `conference_invitation:${campaignId}`, categoryId: category?.id },
      validated,
      invitationOrigin(),
      admin,
    );
    return {
      ...result,
      data: { ...result.data, url: localUrl(result.data.url) },
    };
  }

  async uploadFont(campaignId: string, file: StoredMaterialFile | undefined, admin: CurrentAdmin) {
    const validated = await validateInvitationFont(file);
    const result = await this.materials.createAsset(
      { usage: `conference_invitation:${campaignId}` },
      validated,
      invitationOrigin(),
      admin,
    );
    return { ...result, data: { ...result.data, url: localUrl(result.data.url) } };
  }
}
function localUrl(url: string) {
  try {
    const parsed = new URL(url);
    return parsed.origin === new URL(invitationOrigin()).origin &&
      parsed.pathname.startsWith("/uploads/")
      ? parsed.pathname
      : url;
  } catch {
    return url;
  }
}
