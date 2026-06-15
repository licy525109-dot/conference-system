import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminCmsService } from "../admin/admin-cms.service";
import { CurrentAdmin } from "../admin/current-admin";
import { CmsService } from "./cms.service";

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
    assert.equal(theme.data.config.primaryColor, "#2452a8");
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
});

describe("AdminCmsService validation", () => {
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

  it("rejects enabled reserved components when publishing", async () => {
    const service = new AdminCmsService(createAdminValidationPrismaMock("DRAFT", [
      {
        id: "member-1",
        type: "membership-benefits",
        enabled: true,
        config: { title: "会员权益" }
      }
    ]));

    await assert.rejects(() => service.publishPageVersion("version-1", admin), BadRequestException);
  });
});

function createPublicPrismaMock(input: { activeTheme: unknown; tabbar: unknown }) {
  const now = new Date("2026-06-13T08:00:00.000Z");
  const mock = {
    pageTemplate: {
      findUnique: async () => ({
        id: "page-1",
        pageKey: "home",
        title: "首页",
        description: null,
        pageType: "HOME",
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

function createAdminValidationPrismaMock(status: string, components: unknown[] = []) {
  const mock = {
    pageVersion: {
      findUnique: async () => ({
        id: "version-1",
        templateId: "page-1",
        status,
        title: "首页",
        components
      }),
      update: async () => {
        throw new Error("update should not be reached");
      },
      updateMany: async () => ({ count: 0 })
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
