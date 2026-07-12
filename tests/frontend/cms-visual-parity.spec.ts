import { expect, test, type Page, type Route } from "@playwright/test";
import { buildCmsCompositionDsl } from "../../packages/shared/src/cms-compositions";

const theme = {
  visualPreset: "guanchao-premium",
  primaryColor: "#10233d",
  secondaryColor: "#2f7868",
  accentColor: "#a97e38",
  backgroundColor: "#f5f7f5",
  cardBackground: "#fbfcfb",
  radius: 8,
  buttonStyle: "solid",
  shadow: "soft",
  titleFontSize: 42,
  bannerStyle: "clean",
  backgroundMode: "solid",
  backgroundApplyTo: "body",
  themeApplyMode: "all",
  themeApplyPageKeys: []
};

const conferences = [
  {
    id: "conference-one",
    title: "观潮 · 全国研学生态创始人行业论坛",
    slug: "conference-one",
    coverImageUrl: "/static/fixed-templates/heroes/hero_registration_bg.png",
    summary: "聚焦行业趋势与增长机会",
    location: "上海 · 虹桥",
    startsAt: "2026-08-18T09:30:00.000Z",
    endsAt: "2026-08-18T17:30:00.000Z",
    registrationStartsAt: "2026-06-01T00:00:00.000Z",
    registrationEndsAt: "2026-08-10T23:59:59.000Z",
    registrationCount: 128
  },
  {
    id: "conference-two",
    title: "观潮 · 城市沙龙｜杭州站",
    slug: "conference-two",
    coverImageUrl: "/static/fixed-templates/heroes/hero_schedule_bg.png",
    summary: "链接本地优质企业家与创始人",
    location: "杭州",
    startsAt: "2026-09-12T14:00:00.000Z",
    endsAt: "2026-09-12T17:00:00.000Z",
    registrationStartsAt: "2026-06-01T00:00:00.000Z",
    registrationEndsAt: "2026-09-05T23:59:59.000Z",
    registrationCount: 52
  }
];

const products = [
  product("product-notebook", "观潮会集商务笔记本", "/static/fixed-templates/products/product_notebook.png", 6800, "办公用品"),
  product("product-mug", "品牌马克杯", "/static/fixed-templates/products/product_mug.png", 5800, "文创周边"),
  product("product-gift", "会议伴手礼礼盒", "/static/fixed-templates/products/product_gift_box.png", 16800, "伴手礼"),
  product("product-pen", "金属签字笔", "/static/fixed-templates/products/product_pen.png", 8800, "办公用品")
];

test.beforeEach(async ({ page }) => {
  await installApiFixtures(page);
});

test("guest and logged-in module states keep the configurable visual contract", async ({ page }) => {
  await page.goto("/#/pages/index/index");

  await expect(page.locator(".cms-hero-banner").first()).toBeVisible();
  await expect(page.locator(".cms-login-card")).toContainText("立即登录");
  await expect(page.locator(".cms-entry-module__grid").first()).toHaveCSS("display", "grid");
  await expect(page.locator(".cms-entry-tile")).toHaveCount(14);
  await expect(page.locator("body")).not.toContainText(/hero-banner|quick-icon-grid|stats-grid|mall-product-grid/);
  await stabilizeScreenshot(page);
  await expect(page).toHaveScreenshot("cms-modules-guest.png", { fullPage: true });

  await page.locator(".cms-login-card").getByText("立即登录", { exact: true }).click();
  await expect(page.locator(".cms-login-card")).toContainText("欢迎回来，潮起东方");
  await expect(page.locator(".cms-login-card")).toContainText("黄金会员");
  await expect(page.locator(".cms-stats-module").filter({ hasText: "我的报名" })).toContainText("6");
  await expect(page.locator(".cms-mall-product-card")).toHaveCount(4);
  await expect(page.locator(".cms-mall-product-card__image")).toHaveCount(4);
  await expect(page.locator(".cms-mall-product-card__image").first()).toBeVisible();
  await page.waitForTimeout(2_200);
  await stabilizeScreenshot(page);
  await expect(page).toHaveScreenshot("cms-modules-member.png", { fullPage: true });
});

test("schedule composition keeps month filters and conference cards aligned", async ({ page }) => {
  await page.goto("/#/pages/custom/index?pageKey=about-paiqi");

  await expect(page.locator(".cms-hero-banner")).toContainText("年度排期");
  await expect(page.locator(".cms-conference-schedule__month")).toHaveCount(2);
  await expect(page.locator(".cms-conference-schedule__card")).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText(/conference-schedule|组件暂不可用/);
  await stabilizeScreenshot(page);
  await expect(page).toHaveScreenshot("cms-schedule.png", { fullPage: true });
});

async function stabilizeScreenshot(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.querySelectorAll<HTMLElement>("uni-page").forEach((element) => {
      element.scrollTop = 0;
    });
  });
  await page.waitForTimeout(180);
}

async function installApiFixtures(page: Page): Promise<void> {
  const homeDsl = combinedHomeDsl();
  const scheduleDsl = buildCmsCompositionDsl("schedule", "custom:about-paiqi");

  await page.route("http://localhost:3001/api/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const decodedPath = decodeURIComponent(path);

    if (path === "/api/app/theme") return ok(route, { scope: "global", themePresetId: "guanchao-premium", config: theme, publishedAt: null, updatedAt: null });
    if (path === "/api/app/tabbar") return ok(route, { enabled: false, items: [], updatedAt: null });
    if (path === "/api/conferences") return ok(route, { items: conferences });
    if (path === "/api/mall/products") return ok(route, { items: products, total: products.length, page: 1, pageSize: 20 });
    if (path === "/api/pages/home/published") return ok(route, publishedPage("home", "观潮会集", homeDsl));
    if (decodedPath === "/api/pages/custom:about-paiqi/published") return ok(route, publishedPage("custom:about-paiqi", "年度排期", scheduleDsl));
    if (path === "/api/auth/wechat/login") return ok(route, { token: "visual-test-token", user: testUser() }, 201);
    if (path === "/api/auth/me") return ok(route, { user: testUser() });
    if (path === "/api/member/center") return ok(route, memberCenter());
    if (path === "/api/registrations/my") return ok(route, { items: Array.from({ length: 6 }, (_, index) => ({ id: `registration-${index}`, status: "CONFIRMED" })) });
    if (path === "/api/my/mall-orders") return ok(route, { items: Array.from({ length: 3 }, (_, index) => ({ id: `order-${index}` })) });
    if (path === "/api/my/coupons") return ok(route, { items: Array.from({ length: 4 }, (_, index) => ({ id: `coupon-${index}` })) });
    if (path.startsWith("/api/conferences/")) return ok(route, { ...conferences[0], contentJson: {}, skus: [] });

    return ok(route, {});
  });
}

function combinedHomeDsl() {
  const parts = [
    buildCmsCompositionDsl("home", "home"),
    buildCmsCompositionDsl("member-center", "home"),
    buildCmsCompositionDsl("mall", "home")
  ];
  const nodes = parts.flatMap((part) => part.dsl.nodes);
  const editorComponents = parts.flatMap((part) => part.meta.editorComponents as Array<Record<string, unknown>>);
  return {
    schemaVersion: "p9" as const,
    page: "home",
    dsl: { nodes },
    meta: { source: "visual-test", editor: "operator-visual", editorComponents }
  };
}

function product(id: string, title: string, coverImageUrl: string, priceCent: number, categoryName: string) {
  return {
    id,
    title,
    subtitle: "观潮会集品牌周边",
    productType: "PHYSICAL",
    descriptionJson: null,
    coverImageUrl,
    category: { id: `category-${categoryName}`, name: categoryName, code: categoryName },
    skus: [{ id: `${id}-sku`, name: "默认规格", priceCent, stock: 100, lockedStock: 0, soldCount: 0, availableStock: 100, specsJson: null }],
    images: [],
    detailImageUrls: [],
    availableStock: 100
  };
}

function testUser() {
  return {
    id: "user-visual-test",
    openid: "mock_visual-test",
    nickname: "潮起东方",
    wechatNickname: "潮起东方",
    wechatAvatarUrl: "",
    phone: "138****8888"
  };
}

function memberCenter() {
  return {
    levels: [],
    membership: {
      id: "membership-visual-test",
      status: "ACTIVE",
      startsAt: "2026-01-01T00:00:00.000Z",
      endsAt: "2027-01-01T00:00:00.000Z",
      level: { id: "level-gold", code: "GOLD", name: "黄金会员", description: null, rank: 2, priceCent: 0, discountPercent: 90 }
    },
    grants: [],
    purchase: { enabled: false, message: "后台授予" }
  };
}

function publishedPage(pageKey: string, title: string, dsl: unknown) {
  return {
    id: `page-${pageKey}`,
    pageKey,
    title,
    description: null,
    pageType: "CUSTOM",
    version: {
      id: `version-${pageKey}`,
      versionNo: 1,
      title,
      dsl,
      themeJson: {},
      publishedAt: "2026-07-11T00:00:00.000Z",
      updatedAt: "2026-07-11T00:00:00.000Z"
    }
  };
}

async function ok(route: Route, data: unknown, status = 200): Promise<void> {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify({ code: "OK", message: "ok", data })
  });
}
