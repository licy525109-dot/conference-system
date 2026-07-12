import { expect, test, type Page, type Route } from "@playwright/test";
import { buildCmsCompositionDsl } from "../../packages/shared/src/cms-compositions";

test.use({ viewport: { width: 1440, height: 1000 } });

test.beforeEach(async ({ page }) => {
  await installAdminFixtures(page);
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "visual-admin-token"));
});

test("admin editor uses the same configurable module composition", async ({ page }) => {
  await page.goto("http://localhost:5174/#/pages/editor?pageId=page-home");

  await expect(page.locator(".cms-workbench")).toBeVisible();
  const runtime = page.frameLocator(".cms-runtime-preview__frame");
  await expect(runtime.locator(".cms-hero-banner").first()).toBeVisible();
  await expect(runtime.locator(".cms-login-card")).toContainText("潮起东方");
  await expect(runtime.locator(".cms-entry-module__grid").first()).toBeVisible();
  await expect(runtime.locator("body")).not.toContainText(/hero-banner|quick-icon-grid|stats-grid/);
  await expect(page.locator(".component-category-rail")).toBeHidden();
  await expect(page.getByRole("combobox", { name: "组件分类" })).toBeVisible();

  const left = await page.locator(".cms-sidebar--left").boundingBox();
  const preview = await page.locator(".phone-shell").boundingBox();
  const right = await page.locator(".cms-sidebar--right").boundingBox();
  expect(left && preview && right).toBeTruthy();
  expect(Math.abs(preview!.width - 375)).toBeLessThanOrEqual(2);
  expect(Math.abs(preview!.height - 812)).toBeLessThanOrEqual(2);
  expect(left!.x + left!.width).toBeLessThan(preview!.x);
  expect(preview!.x + preview!.width).toBeLessThan(right!.x + 2);
  const leftOverflow = await page.locator(".cms-sidebar--left").evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(leftOverflow.scrollWidth).toBeLessThanOrEqual(leftOverflow.clientWidth + 1);

  await page.getByText("访客", { exact: true }).click();
  await expect(runtime.locator(".cms-login-card")).toContainText("立即登录");
  await page.getByText("已登录", { exact: true }).click();
  await expect(runtime.locator(".cms-login-card")).toContainText("黄金会员");

  const entryBlock = runtime.locator(".cms-block").filter({ has: runtime.locator(".cms-entry-module") }).first();
  await entryBlock.locator(".cms-editor-preview-hit-area").click();
  await expect(runtime.locator(".cms-block.is-editor-selected")).toContainText("年度排期");
  await expect(page.locator(".cms-sidebar--right").getByText("入口配置", { exact: true })).toBeVisible();
  await expect(page).toHaveScreenshot("admin-cms-editor.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test("page structure templates expand into independently editable modules", async ({ page }) => {
  await page.goto("http://localhost:5174/#/pages/editor?pageId=page-home");

  await page.getByLabel("更多操作").click();
  await page.getByText("应用页面结构模板", { exact: true }).click();
  await expect(page.getByRole("dialog", { name: "页面结构模板" })).toBeVisible();
  await page.getByRole("button", { name: /观潮首页结构/ }).click();
  await page.getByRole("button", { name: "继续应用" }).click();

  await expect(page.locator(".layer-item")).toHaveCount(8);
  const runtime = page.frameLocator(".cms-runtime-preview__frame");
  await expect(runtime.locator(".cms-hero-banner")).toBeVisible();
  await expect(runtime.locator(".cms-login-card")).toBeVisible();
  await expect(runtime.locator(".cms-entry-module")).toHaveCount(2);
  await expect(page.locator(".layer-list")).not.toContainText("旧版整页模板");
});

async function installAdminFixtures(page: Page): Promise<void> {
  const dsl = buildCmsCompositionDsl("home", "home");
  const editorComponents = dsl.meta.editorComponents as Array<{ id: string; type: string; enabled: boolean; sortOrder: number; config: Record<string, unknown> }>;
  const now = "2026-07-11T00:00:00.000Z";
  const version = {
    id: "version-home",
    templateId: "page-home",
    versionNo: 3,
    status: "DRAFT",
    title: "观潮会集首页",
    dsl,
    themeJson: { pageMeta: { pageTitle: "观潮会集", shareTitle: "观潮会集" } },
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    template: { id: "page-home", pageKey: "home", title: "观潮会集首页" }
  };
  const pageTemplate = {
    id: "page-home",
    pageKey: "home",
    title: "观潮会集首页",
    description: "可配置组件组合",
    pageType: "HOME",
    bindingType: null,
    conferenceId: null,
    productId: null,
    enabled: true,
    sortOrder: 0,
    publishedVersionId: "version-home",
    versions: [{ id: "version-home", versionNo: 3, status: "DRAFT", title: "观潮会集首页", nodeCount: editorComponents.length, publishedAt: null, createdAt: now, updatedAt: now }],
    createdAt: now,
    updatedAt: now
  };
  const presets = uniqueByType(editorComponents).map((item, index) => ({
    id: `preset-${item.type}`,
    type: item.type,
    name: componentName(item.type),
    group: componentGroup(item.type),
    description: "跨端一致组件",
    schemaJson: {},
    defaultConfigJson: item.config,
    enabled: true,
    system: true,
    sortOrder: index,
    createdAt: now,
    updatedAt: now
  }));

  await page.route("http://localhost:3001/api/admin/**", async (route) => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname);
    if (path === "/api/admin/auth/me") return ok(route, { admin: { id: "admin-visual", username: "admin", displayName: "系统管理员", permissions: ["page:view", "page:write", "theme:view", "material:view"] } });
    if (path === "/api/admin/component-presets") return ok(route, { items: presets });
    if (path === "/api/admin/pages") return ok(route, { items: [pageTemplate] });
    if (path === "/api/admin/page-library-templates") return ok(route, { items: [] });
    if (path === "/api/admin/page-versions/version-home") return ok(route, version);
    if (path === "/api/admin/conferences") return ok(route, { items: conferences(), total: 2, page: 1, pageSize: 100 });
    if (path === "/api/admin/tabbar") return ok(route, { enabled: false, items: [], createdAt: now, updatedAt: now });
    if (path === "/api/admin/coupon-campaigns") return ok(route, { items: [], total: 0, page: 1, pageSize: 100 });
    if (path === "/api/admin/mall/categories/options") return ok(route, { items: [] });
    if (path === "/api/admin/mall/products/options") return ok(route, { items: [] });
    if (path === "/api/admin/theme") return ok(route, { scope: "global", themePresetId: "guanchao-premium", config: theme(), publishedAt: null, createdAt: now, updatedAt: now });
    return ok(route, {});
  });
}

function conferences() {
  return [
    { id: "conference-one", title: "全国研学生态创始人行业论坛", slug: "conference-one", status: "PUBLISHED", coverImageUrl: "/static/fixed-templates/heroes/hero_registration_bg.png", summary: "聚焦行业趋势与增长机会", location: "上海 · 虹桥", startsAt: "2026-08-18T09:30:00.000Z", endsAt: "2026-08-18T17:30:00.000Z", registrationStartsAt: null, registrationEndsAt: null, sortOrder: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", counts: { orders: 1, registrations: 128 } },
    { id: "conference-two", title: "城市沙龙｜杭州站", slug: "conference-two", status: "PUBLISHED", coverImageUrl: "/static/fixed-templates/heroes/hero_schedule_bg.png", summary: "链接本地优质企业家", location: "杭州", startsAt: "2026-09-12T14:00:00.000Z", endsAt: "2026-09-12T17:00:00.000Z", registrationStartsAt: null, registrationEndsAt: null, sortOrder: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", counts: { orders: 1, registrations: 52 } }
  ];
}

function theme() {
  return { visualPreset: "guanchao-premium", primaryColor: "#10233d", secondaryColor: "#2f7868", accentColor: "#a97e38", backgroundColor: "#f5f7f5", cardBackground: "#ffffff", radius: 8, buttonStyle: "solid", shadow: "soft", titleFontSize: 42, bannerStyle: "clean", backgroundMode: "solid", backgroundApplyTo: "body", themeApplyMode: "all", themeApplyPageKeys: [] };
}

function componentName(type: string): string {
  return ({ "hero-banner": "顶部主视觉", notice: "运营公告", "login-card": "登录欢迎卡", "quick-icon-grid": "图标入口宫格", "promotion-bar": "运营导引条", "stats-grid": "数据概览", "dual-track-tags": "双赛道标签" } as Record<string, string>)[type] || type;
}

function componentGroup(type: string): string {
  return ["hero-banner", "notice", "login-card", "quick-icon-grid", "promotion-bar", "stats-grid", "dual-track-tags"].includes(type) ? "基础展示" : "业务组件";
}

function uniqueByType<T extends { type: string }>(items: T[]): T[] {
  return Array.from(new Map(items.map((item) => [item.type, item])).values());
}

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "OK", message: "ok", data }) });
}
