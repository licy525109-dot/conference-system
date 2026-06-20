import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminCmsService } from "../admin/admin-cms.service";
import { CurrentAdmin } from "../admin/current-admin";
import { CmsService } from "./cms.service";
import { ENABLED_COMPONENT_TYPES } from "./cms-defaults";
import { buildCmsPublishCheck, getCmsComponentSupport } from "./cms-component-support";

const admin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "系统管理员",
  permissions: ["page:view", "page:write"]
};

describe("CmsService public fallbacks", () => {
  it("returns default theme and tabbar when no active config exists", async () => {
    const service = new CmsService(createPublicPrismaMock({ activeTheme: null, tabbar: null }));

    const theme = await service.getTheme();
    const tabbar = await service.getTabbar();

    assert.equal(theme.code, "OK");
    assert.equal(theme.data.config.visualPreset, "business-blue");
    assert.equal(theme.data.config.primaryColor, "#315d7d");
    assert.equal(tabbar.data.enabled, true);
    assert.equal(tabbar.data.items[0]?.pageKey, "home");
  });

  it("returns the published page version", async () => {
    const service = new CmsService(createPublicPrismaMock({ activeTheme: null, tabbar: null }));

    const response = await service.getPublishedPage("home");
    const firstComponent = response.data.version.components[0] as { type?: string } | undefined;

    assert.equal(response.data.pageKey, "home");
    assert.equal(response.data.version.versionNo, 2);
    assert.equal(firstComponent?.type, "hero");
  });

  it("matches specific conference pages by business page type", async () => {
    const service = new CmsService(
      createScopedPublishedPagePrismaMock([
        scopedTemplate("detail-specific", "custom:conference-c1", "CONFERENCE_DETAIL_PAGE", "SPECIFIC_CONFERENCE", "conference-1", "version-detail"),
        scopedTemplate("form-specific", "custom:registration-c1", "REGISTRATION_FORM_PAGE", "SPECIFIC_CONFERENCE", "conference-1", "version-form"),
        scopedTemplate("form-generic", "registration-form", "REGISTRATION_FORM", null, null, "version-form-generic")
      ])
    );

    const form = await service.getPublishedPage("registration-form", { conferenceId: "conference-1" });
    const detail = await service.getPublishedPage("conference-detail", { conferenceId: "conference-1" });

    assert.equal(form.data.id, "form-specific");
    assert.equal(form.data.pageType, "REGISTRATION_FORM_PAGE");
    assert.equal(detail.data.id, "detail-specific");
    assert.equal(detail.data.pageType, "CONFERENCE_DETAIL_PAGE");
  });

  it("falls back to a published generic template when the built-in page has no published version", async () => {
    const service = new CmsService(
      createScopedPublishedPagePrismaMock([
        scopedTemplate("detail-draft", "conference-detail", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_TEMPLATE", null, null),
        scopedTemplate("detail-template", "custom:conference-detail-template", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_TEMPLATE", null, "version-template")
      ])
    );

    const response = await service.getPublishedPage("conference-detail");

    assert.equal(response.data.id, "detail-template");
    assert.equal(response.data.bindingType, "CONFERENCE_TEMPLATE");
  });
});

describe("AdminCmsService validation", () => {
  it("does not expose unsupported or planned presets as addable components", () => {
    const blocked = Array.from(ENABLED_COMPONENT_TYPES).filter((type) => {
      const status = getCmsComponentSupport(type).status;
      return status === "unsupported" || status === "planned";
    });

    assert.deepEqual(blocked, []);
  });

  it("rejects dangerous HTML in draft component config", async () => {
    const service = new AdminCmsService(createAdminValidationPrismaMock("DRAFT"));

    await assert.rejects(
      () =>
        service.updatePageVersion(
          "version-1",
          {
            components: [
              {
                id: "html-1",
                type: "safe-html",
                enabled: true,
                config: { html: '<img src="x" onerror="alert(1)" />' }
              }
            ]
          },
          admin
        ),
      BadRequestException
    );
  });

  it("publishes enabled CMS components that have user-side rendering", async () => {
    const service = new AdminCmsService(createAdminValidationPrismaMock("DRAFT", [
      {
        id: "member-1",
        type: "membership-benefits",
        enabled: true,
        config: { title: "会员权益" }
      }
    ]));

    const response = await service.publishPageVersion("version-1", {}, admin);

    assert.equal(response.code, "OK");
    assert.equal(response.data.status, "DRAFT");
    assert.equal(response.data.publishCheck?.blockingCount, 0);
  });

  it("blocks publishing unknown or unsupported components with a report", async () => {
    const service = new AdminCmsService(createAdminValidationPrismaMock("DRAFT", [
      {
        id: "legacy-1",
        type: "legacy-unsupported",
        enabled: true,
        config: {}
      }
    ]));

    await assert.rejects(() => service.publishPageVersion("version-1", {}, admin), BadRequestException);
  });

  it("reports blocking components when unknown widgets remain in historical page data", () => {
    const report = buildCmsPublishCheck([
      { id: "hero-1", type: "hero", enabled: true, config: {} },
      { id: "unknown-1", type: "unknown-widget", enabled: true, config: {} }
    ]);

    assert.equal(report.supportedCount, 1);
    assert.equal(report.blockingCount, 1);
    assert.equal(report.blockingComponents[0]?.type, "unknown-widget");
  });
});

function createPublicPrismaMock(input: { activeTheme: unknown; tabbar: unknown }) {
  const now = new Date("2026-06-13T08:00:00.000Z");
  const mock = {
    pageTemplate: {
      findFirst: async () => ({
        id: "page-1",
        pageKey: "home",
        title: "首页",
        description: null,
        pageType: "HOME",
        bindingType: null,
        conferenceId: null,
        productId: null,
        publishedVersionId: "version-2"
      })
    },
    pageVersion: {
      findFirst: async () => ({
        id: "version-2",
        versionNo: 2,
        title: "首页",
        components: [{ id: "hero-1", type: "hero", enabled: true, sortOrder: 0, config: { title: "首页" } }],
        themeJson: null,
        publishedAt: now,
        updatedAt: now
      })
    },
    activeThemeConfig: {
      findUnique: async () => input.activeTheme
    },
    tabBarConfig: {
      findUnique: async () => input.tabbar
    }
  };
  return mock as typeof mock & PrismaService;
}

function scopedTemplate(
  id: string,
  pageKey: string,
  pageType: string,
  bindingType: string | null,
  conferenceId: string | null,
  publishedVersionId: string | null
) {
  return {
    id,
    pageKey,
    title: id,
    description: null,
    pageType,
    bindingType,
    conferenceId,
    productId: null,
    enabled: true,
    publishedVersionId,
    sortOrder: 0,
    updatedAt: new Date("2026-06-18T00:00:00.000Z")
  };
}

function createScopedPublishedPagePrismaMock(templates: ReturnType<typeof scopedTemplate>[]) {
  const now = new Date("2026-06-18T00:00:00.000Z");
  const mock = {
    pageTemplate: {
      findFirst: async (input: { where: Record<string, unknown>; orderBy?: unknown }) => templates.find((template) => templateMatches(template, input.where)) ?? null
    },
    pageVersion: {
      findFirst: async (input: { where: { id?: string; templateId?: string; status?: string } }) => {
        const template = templates.find((item) => item.id === input.where.templateId && item.publishedVersionId === input.where.id);
        if (!template || !template.publishedVersionId) return null;
        return {
          id: template.publishedVersionId,
          versionNo: 1,
          title: template.title,
          components: [{ id: `${template.id}-title`, type: "title", enabled: true, sortOrder: 0, config: { text: template.title } }],
          themeJson: null,
          publishedAt: now,
          updatedAt: now
        };
      }
    },
    activeThemeConfig: {
      findUnique: async () => null
    },
    tabBarConfig: {
      findUnique: async () => null
    }
  };
  return mock as typeof mock & PrismaService;
}

function templateMatches(template: ReturnType<typeof scopedTemplate>, where: Record<string, unknown>): boolean {
  if (where.pageKey && template.pageKey !== where.pageKey) return false;
  if (where.pageType && template.pageType !== where.pageType) return false;
  if (where.bindingType && template.bindingType !== where.bindingType) return false;
  if (where.conferenceId && template.conferenceId !== where.conferenceId) return false;
  if (typeof where.enabled === "boolean" && template.enabled !== where.enabled) return false;
  const publishedVersionId = where.publishedVersionId as { not?: null } | undefined;
  if (publishedVersionId?.not === null && !template.publishedVersionId) return false;
  return true;
}

function createAdminValidationPrismaMock(status: string, components: unknown[] = []) {
  const mock = {
    pageVersion: {
      findUnique: async () => ({
        id: "version-1",
        templateId: "page-1",
        status,
        title: "首页",
        components,
        themeJson: null
      }),
      findFirst: async () => ({ versionNo: 3 }),
      update: async () => {
        return { id: "version-1" };
      },
      updateMany: async () => ({ count: 0 }),
      create: async (input: { data: { status: string; versionNo: number } }) => ({
        id: input.data.status === "PUBLISHED" ? "version-published" : "version-next-draft",
        templateId: "page-1",
        versionNo: input.data.versionNo,
        status: input.data.status,
        title: "首页",
        components,
        themeJson: null,
        createdBy: admin.id,
        publishedAt: input.data.status === "PUBLISHED" ? new Date("2026-06-17T00:00:00.000Z") : null,
        createdAt: new Date("2026-06-17T00:00:00.000Z"),
        updatedAt: new Date("2026-06-17T00:00:00.000Z")
      })
    },
    pageTemplate: {
      update: async () => ({ id: "page-1" })
    },
    pagePublishLog: {
      create: async () => ({ id: "log-1" })
    },
    auditLog: {
      create: async () => ({ id: "audit-1" })
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback(mock)
  };
  return mock as typeof mock & PrismaService;
}
