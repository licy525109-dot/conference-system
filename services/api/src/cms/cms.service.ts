import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { DEFAULT_TABBAR_ITEMS, DEFAULT_THEME_CONFIG } from "./cms-defaults";

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedPage(pageKey: string) {
    const template = await this.prisma.pageTemplate.findUnique({
      where: { pageKey },
      select: {
        id: true,
        pageKey: true,
        title: true,
        description: true,
        pageType: true,
        publishedVersionId: true
      }
    });
    if (!template?.publishedVersionId) {
      throw new NotFoundException("Published page not found");
    }

    const version = await this.prisma.pageVersion.findFirst({
      where: {
        id: template.publishedVersionId,
        templateId: template.id,
        status: "PUBLISHED"
      },
      select: {
        id: true,
        versionNo: true,
        title: true,
        components: true,
        themeJson: true,
        publishedAt: true,
        updatedAt: true
      }
    });
    if (!version) {
      throw new NotFoundException("Published page not found");
    }

    return ok({
      id: template.id,
      pageKey: template.pageKey,
      title: template.title,
      description: template.description,
      pageType: template.pageType,
      version: {
        id: version.id,
        versionNo: version.versionNo,
        title: version.title,
        components: normalizeJsonArray(version.components),
        themeJson: normalizeJsonObject(version.themeJson),
        publishedAt: version.publishedAt?.toISOString() ?? null,
        updatedAt: version.updatedAt.toISOString()
      }
    });
  }

  async getTheme() {
    const active = await this.prisma.activeThemeConfig.findUnique({
      where: { scope: "global" },
      select: {
        id: true,
        scope: true,
        themePresetId: true,
        configJson: true,
        publishedAt: true,
        updatedAt: true
      }
    });

    return ok({
      scope: "global",
      themePresetId: active?.themePresetId ?? null,
      config: normalizeJsonObject(active?.configJson) ?? DEFAULT_THEME_CONFIG,
      publishedAt: active?.publishedAt?.toISOString() ?? null,
      updatedAt: active?.updatedAt.toISOString() ?? null
    });
  }

  async getTabbar() {
    const config = await this.prisma.tabBarConfig.findUnique({
      where: { scope: "global" },
      select: {
        enabled: true,
        items: {
          where: { visible: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            iconUrl: true,
            selectedIconUrl: true,
            pageKey: true,
            path: true,
            visible: true,
            sortOrder: true,
            requireLogin: true,
            badgeText: true
          }
        },
        updatedAt: true
      }
    });

    if (!config) {
      return ok({
        enabled: true,
        items: DEFAULT_TABBAR_ITEMS.map((item, index) => ({ id: `default-${index}`, ...item, iconUrl: null, selectedIconUrl: null, badgeText: null })),
        updatedAt: null
      });
    }

    return ok({
      enabled: config.enabled,
      items: config.items,
      updatedAt: config.updatedAt.toISOString()
    });
  }
}

export function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok" as const,
    data
  };
}

function normalizeJsonArray(value: Prisma.JsonValue): Prisma.JsonArray {
  return Array.isArray(value) ? value : [];
}

function normalizeJsonObject(value: Prisma.JsonValue | null | undefined): Prisma.JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
