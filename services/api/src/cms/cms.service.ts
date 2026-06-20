import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { DEFAULT_TABBAR_ITEMS, DEFAULT_THEME_CONFIG } from "./cms-defaults";

@Injectable()
export class CmsService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublishedPage(pageKey: string, options: { conferenceId?: string; productId?: string } = {}) {
    const template = await this.findPublishedTemplate(pageKey, options);
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
      bindingType: template.bindingType,
      conferenceId: template.conferenceId,
      productId: template.productId,
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

  private async findPublishedTemplate(pageKey: string, options: { conferenceId?: string; productId?: string }) {
    const select = {
      id: true,
      pageKey: true,
      title: true,
      description: true,
      pageType: true,
      bindingType: true,
      conferenceId: true,
      productId: true,
      publishedVersionId: true
    } satisfies Prisma.PageTemplateSelect;

    const conferenceId = options.conferenceId?.trim();
    const specificConferencePageType = specificConferencePageTypeFor(pageKey);
    if (conferenceId) {
      const specific = await this.prisma.pageTemplate.findFirst({
        where: {
          pageType: specificConferencePageType,
          bindingType: "SPECIFIC_CONFERENCE",
          conferenceId,
          enabled: true,
          publishedVersionId: { not: null }
        },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        select
      });
      if (specific) return specific;
    }

    const productId = options.productId?.trim();
    const specificProductPageType = specificProductPageTypeFor(pageKey);
    if (productId) {
      const specific = await this.prisma.pageTemplate.findFirst({
        where: {
          pageType: specificProductPageType,
          bindingType: "SPECIFIC_PRODUCT",
          productId,
          enabled: true,
          publishedVersionId: { not: null }
        },
        orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
        select
      });
      if (specific) return specific;
    }

    const exact = await this.prisma.pageTemplate.findFirst({
      where: {
        pageKey,
        enabled: true,
        publishedVersionId: { not: null }
      },
      select
    });
    if (exact) return exact;

    const templateBindingType = templateBindingTypeFor(pageKey);
    if (templateBindingType) {
      const template = await this.prisma.pageTemplate.findFirst({
        where: {
          bindingType: templateBindingType,
          enabled: true,
          publishedVersionId: { not: null }
        },
        orderBy: [{ pageKey: "asc" }, { sortOrder: "asc" }, { updatedAt: "desc" }],
        select
      });
      if (template) return template;
    }

    return this.prisma.pageTemplate.findFirst({
      where: {
        pageKey,
        enabled: true
      },
      select
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
      config: {
        ...DEFAULT_THEME_CONFIG,
        ...(normalizeJsonObject(active?.configJson) ?? {})
      },
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

function specificConferencePageTypeFor(pageKey: string): string {
  if (pageKey === "conference-detail") return "CONFERENCE_DETAIL_PAGE";
  if (pageKey === "registration-form") return "REGISTRATION_FORM_PAGE";
  if (pageKey === "registration-success") return "REGISTRATION_CREDENTIAL_PAGE";
  return "__NO_SPECIFIC_CONFERENCE_PAGE__";
}

function specificProductPageTypeFor(pageKey: string): string {
  if (pageKey === "mall-detail") return "PRODUCT_DETAIL_PAGE";
  return "__NO_SPECIFIC_PRODUCT_PAGE__";
}

function templateBindingTypeFor(pageKey: string): string | null {
  if (pageKey === "conference-detail") return "CONFERENCE_TEMPLATE";
  if (pageKey === "mall-detail") return "PRODUCT_TEMPLATE";
  return null;
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
