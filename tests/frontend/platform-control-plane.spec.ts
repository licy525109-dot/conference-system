import { expect, test, type Page, type Route } from "@playwright/test";

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await installFixtures(page);
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "platform-visual-token"));
});

test("platform control plane distinguishes configuration from production readiness", async ({ page }) => {
  await page.goto("http://localhost:5174/#/platform");

  await expect(page.getByRole("heading", { name: "SaaS 平台控制台" })).toBeVisible();
  await expect(page.locator(".platform-metrics article")).toHaveCount(4);
  await expect(page.getByText("控制面已启用，核心业务数据面尚未强制租户隔离")).toBeVisible();
  await expect(page.getByText("已配置待验证", { exact: true })).toHaveCount(2);
  await expect(page.getByText("仅基础控制面", { exact: true })).toBeVisible();
  await expect(page.getByText("生产就绪", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "租户与工作区" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "套餐与订阅" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "插件注册表" })).toBeVisible();
  await expect(page).toHaveScreenshot("platform-control-plane.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
});

async function installFixtures(page: Page): Promise<void> {
  await page.route("http://localhost:3001/api/admin/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/api/admin/auth/me") {
      return ok(route, {
        admin: {
          id: "platform-admin",
          username: "platform-admin",
          displayName: "平台管理员",
          permissions: ["platform:view", "platform:write"]
        }
      });
    }
    if (path === "/api/admin/platform/overview") {
      return ok(route, {
        metrics: { tenants: 2, workspaces: 3, activeSubscriptions: 2, activeApiKeys: 1 },
        usage30d: [{ metric: "api.requests", unit: "COUNT", quantity: 1280 }],
        providers: [
          provider("wechat-subscribe", "微信订阅消息", "CONFIGURED", ["真机订阅授权和发送回执"]),
          provider("sms", "短信", "CONFIGURED", ["供应商模板审核"]),
          provider("tenant-isolation", "租户数据面隔离", "FOUNDATION_ONLY", ["核心业务表 tenant_id", "请求租户上下文"])
        ],
        isolation: {
          controlPlane: "READY",
          dataPlane: "FOUNDATION_ONLY",
          summary: "租户控制面已建立；会议、订单、支付等现有业务表仍保持单租户数据面。"
        }
      });
    }
    if (path === "/api/admin/platform/tenants") return ok(route, { items: [tenant()] });
    if (path === "/api/admin/platform/plans") return ok(route, { items: [plan()] });
    if (path === "/api/admin/platform/plugins") return ok(route, { items: [] });
    return ok(route, {});
  });
}

function provider(id: string, name: string, status: string, missing: string[]) {
  return {
    id,
    name,
    status,
    configured: status === "CONFIGURED",
    verified: false,
    productionReady: false,
    missing,
    summary: status === "FOUNDATION_ONLY" ? "控制面已建立，数据面隔离尚未启用。" : "配置存在，仍需生产灰度验证。"
  };
}

function plan() {
  return {
    id: "plan-business",
    code: "BUSINESS",
    name: "商业版",
    description: "会议、商城和会员",
    monthlyPriceCent: 29900,
    annualPriceCent: 299000,
    limitsJson: { workspaces: 3, admins: 20 },
    featuresJson: { cms: true, conference: true, mall: true },
    enabled: true
  };
}

function tenant() {
  return {
    id: "tenant-guanchao",
    slug: "guanchao",
    name: "观潮会集",
    status: "ACTIVE",
    contactName: "运营负责人",
    contactEmail: null,
    contactPhone: null,
    organizations: [{ id: "org-guanchao", code: "default", name: "观潮会集组织" }],
    workspaces: [{ id: "workspace-guanchao", slug: "default", name: "主工作区", status: "ACTIVE" }],
    subscriptions: [{ id: "subscription-guanchao", status: "TRIAL", billingCycle: "MONTHLY", renewsAt: null, plan: plan() }],
    apiKeys: [{ id: "key-one", tenantId: "tenant-guanchao", name: "只读接入", keyPrefix: "gcs_live_preview", scopesJson: ["conference:read"], status: "ACTIVE", expiresAt: null, lastUsedAt: null, createdAt: "2026-07-11T00:00:00.000Z" }],
    webhooks: [],
    featureFlags: [],
    pluginInstalls: [],
    _count: { members: 1, usageEvents: 8 }
  };
}

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "OK", message: "ok", data }) });
}
