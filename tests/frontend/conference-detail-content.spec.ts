import { expect, test, type Page, type Route } from "@playwright/test";

const conferenceId = "conference-detail-visual";
const coverImage = "/static/fixed-templates/heroes/hero_registration_bg.png";
const detailImage = "/static/fixed-templates/products/product_gift_box.png";
const now = "2026-08-31T10:00:00.000Z";

test("conference detail renders configurable content and keeps fixed actions clear of the tabbar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installUserFixtures(page);
  await page.goto(`/#/pages/conference/detail?id=${conferenceId}`);

  await expect(page.locator(".conference-summary")).toContainText("观潮会集 · 第五届行业闭门会");
  await expect(page.locator(".detail-content")).toContainText("费用包含");
  await expect(page.locator(".detail-content")).toContainText("会期资料包");
  await expect(page.locator(".detail-content .content-image")).toBeVisible();
  await expect(page.locator(".long-image .image")).toBeVisible();
  await expect(page.locator(".custom-tabbar")).toBeVisible();
  await expect(page.locator(".bar.with-tabbar")).toBeVisible();

  const actionBar = await page.locator(".bar.with-tabbar").boundingBox();
  const tabbar = await page.locator(".custom-tabbar").boundingBox();
  expect(actionBar && tabbar).toBeTruthy();
  expect(actionBar!.y + actionBar!.height).toBeLessThanOrEqual(tabbar!.y + 1);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
  await page.waitForTimeout(180);
  await expect(page).toHaveScreenshot("conference-detail-content.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
});

test("admin detail editor reloads the full conference contract instead of the lightweight list item", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const detailRequests: string[] = [];
  const savedBodies: Array<Record<string, unknown>> = [];
  await installAdminFixtures(page, detailRequests, savedBodies);
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "conference-detail-admin"));
  await page.goto(`http://localhost:5174/#/conferences/config?id=${conferenceId}`);

  await page.getByRole("tab", { name: "详情内容" }).click();
  await expect(page.locator(".detail-composer")).toBeVisible();
  await expect(page.locator(".content-block")).toHaveCount(3);
  await expect(page.locator(".detail-image-panel--secondary")).toContainText("已配置");
  expect(detailRequests).toContain(`/api/admin/conferences/${conferenceId}`);

  await page.locator(".insert-toolbar").getByRole("button", { name: "列表" }).click();
  await expect(page.locator(".content-block")).toHaveCount(4);
  await expect(page.locator(".detail-composer .phone-preview")).toContainText("第一项内容");
  await page.getByRole("button", { name: "保存详情内容" }).click();
  await expect.poll(() => savedBodies.length).toBe(1);
  const savedContent = savedBodies[0]?.contentJson as Record<string, unknown>;
  const savedDetailContent = savedContent.detailContent as { blocks?: unknown[] };
  expect(savedDetailContent.blocks).toHaveLength(4);
  expect(savedContent.detailLongImage).toBeTruthy();
  await expect(page).toHaveScreenshot("admin-conference-detail-editor.png", { fullPage: true, maxDiffPixelRatio: 0.02 });
});

async function installUserFixtures(page: Page): Promise<void> {
  await page.route("http://localhost:3001/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/app/theme") return ok(route, { scope: "conference-detail", config: theme(), publishedAt: null, updatedAt: now });
    if (path === "/api/app/tabbar") return ok(route, tabbar());
    if (path === `/api/conferences/${conferenceId}`) return ok(route, publicConference());
    return ok(route, {});
  });
}

async function installAdminFixtures(
  page: Page,
  detailRequests: string[],
  savedBodies: Array<Record<string, unknown>>
): Promise<void> {
  await page.route("http://localhost:3001/api/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/admin/auth/me") {
      return ok(route, {
        admin: {
          id: "conference-detail-admin",
          username: "admin",
          displayName: "系统管理员",
          permissions: ["conference:view", "conference:write", "material:view", "material:write"]
        }
      });
    }
    if (path === "/api/admin/conferences") {
      return ok(route, { items: [adminConferenceListItem()], total: 1, page: 1, pageSize: 100 });
    }
    if (path === `/api/admin/conferences/${conferenceId}` && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      savedBodies.push(body);
      return ok(route, { ...adminConferenceDetail(), contentJson: body.contentJson });
    }
    if (path === `/api/admin/conferences/${conferenceId}`) {
      detailRequests.push(path);
      return ok(route, adminConferenceDetail());
    }
    if (path === `/api/admin/conferences/${conferenceId}/skus`) return ok(route, { items: [] });
    if (path === `/api/admin/conferences/${conferenceId}/form-fields`) return ok(route, { items: [] });
    if (path === "/api/admin/coupon-campaigns") return ok(route, { items: [], total: 0, page: 1, pageSize: 20 });
    if (path === "/api/admin/promotion-rules") return ok(route, { items: [], total: 0, page: 1, pageSize: 20 });
    return ok(route, {});
  });
}

function contentJson() {
  return {
    detailContent: {
      version: 1,
      blocks: [
        { id: "heading", type: "heading", enabled: true, sort: 10, title: "费用包含", tone: "accent" },
        { id: "list", type: "list", enabled: true, sort: 20, items: ["参会费与会期资料包", "会期交流活动", "主办方指定服务"] },
        { id: "image", type: "image", enabled: true, sort: 30, imageUrl: detailImage, caption: "会议详情示意", imageMode: "widthFix" }
      ]
    },
    detailLongImage: {
      version: 1,
      sourceUrl: detailImage,
      displayUrls: [detailImage],
      segments: [{ url: detailImage, width: 750, height: 750 }],
      width: 750,
      height: 750,
      sizeBytes: 180000,
      updatedAt: now
    }
  };
}

function publicConference() {
  return {
    id: conferenceId,
    title: "观潮会集 · 第五届行业闭门会",
    slug: "conference-detail-visual",
    coverImageUrl: coverImage,
    summary: "链接行业创始人，共同讨论增长与长期价值。",
    location: "广东江门",
    startsAt: "2026-09-20T09:30:00.000Z",
    endsAt: "2026-09-20T18:00:00.000Z",
    registrationStartsAt: "2026-08-01T00:00:00.000Z",
    registrationEndsAt: "2026-09-18T23:59:59.000Z",
    contentJson: contentJson(),
    skus: [{ id: "sku-visual", name: "标准席位", description: null, priceCent: 268000, stock: 100, soldCount: 18 }]
  };
}

function adminConferenceListItem() {
  return {
    id: conferenceId,
    title: "观潮会集 · 第五届行业闭门会",
    subtitle: "列表接口故意不返回详情内容",
    slug: "conference-detail-visual",
    coverImage,
    location: "广东江门",
    startAt: "2026-09-20T09:30:00.000Z",
    endAt: "2026-09-20T18:00:00.000Z",
    status: "PUBLISHED",
    sortOrder: 0,
    counts: { skus: 1, orders: 0, registrations: 0 }
  };
}

function adminConferenceDetail() {
  return {
    ...adminConferenceListItem(),
    subtitle: "链接行业创始人，共同讨论增长与长期价值。",
    registrationStartsAt: "2026-08-01T00:00:00.000Z",
    registrationEndsAt: "2026-09-18T23:59:59.000Z",
    checkInEnabled: false,
    checkInStartsAt: null,
    checkInEndsAt: null,
    checkInMethods: ["QR_SCAN", "ADMIN_MANUAL"],
    checkInFieldBindings: {},
    groupRegistrationEnabled: true,
    maxTicketsPerOrder: 5,
    contentJson: contentJson(),
    styleJson: null
  };
}

function theme() {
  return {
    visualPreset: "guanchao-premium",
    primaryColor: "#10233d",
    secondaryColor: "#2f7868",
    accentColor: "#a97e38",
    backgroundColor: "#f5f7f5",
    cardBackground: "#ffffff",
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
}

function tabbar() {
  return {
    enabled: true,
    updatedAt: now,
    items: [
      { id: "home", title: "首页", pageKey: "home", path: "/pages/index/index", iconUrl: null, selectedIconUrl: null, visible: true, sortOrder: 0, requireLogin: false, badgeText: null },
      { id: "registration", title: "我的报名", pageKey: "my-registrations", path: "/pages/registrations/my", iconUrl: null, selectedIconUrl: null, visible: true, sortOrder: 10, requireLogin: true, badgeText: null }
    ]
  };
}

async function ok(route: Route, data: unknown): Promise<void> {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: "OK", message: "ok", data })
  });
}
