import { chromium, expect, type Route } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCmsCompositionDsl } from "../../../packages/shared/src/cms-compositions";

const base = process.env.USER_QA_URL || "http://127.0.0.1:5186";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(base)) throw new Error("QA is local-only");
const output = resolve("apps/user/output/playwright/guest-experience");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "zh-CN" });
const page = await context.newPage();
const errors: string[] = [];
const requests: string[] = [];
const orders: Record<string, unknown>[] = [];
const carts: Array<{ attendees: Array<{ formData: { name: string }; isSelf: boolean }> }> = [];
let failHome = false;
let slowHome = true;
let ownedCoupon = false;
let user = { id: "qa-user", openid: "mock_qa", nickname: null, wechatNickname: null, wechatAvatarUrl: null, realName: "", phone: null as string | null, phoneVerifiedAt: null as string | null, registrationReady: false };
const conference = {
  id: "qa-conference", title: "用户端验收会议", slug: "qa", status: "PUBLISHED",
  coverImageUrl: "/static/fixed-templates/heroes/hero_registration_bg.png", summary: "本地模拟数据", location: "测试会场",
  startsAt: "2030-01-20T09:00:00Z", endsAt: "2030-01-21T18:00:00Z",
  registrationStartsAt: "2020-01-01T00:00:00Z", registrationEndsAt: "2030-01-19T23:00:00Z",
  skus: [{ id: "qa-sku", name: "参会席位", priceCent: 10000, stock: 50, lockedStock: 0, soldCount: 0, status: "ACTIVE" }]
};
const fields = [
  { id: "name", key: "name", label: "姓名", type: "text", required: true },
  { id: "phone", key: "phone", label: "手机号", type: "phone", required: true },
  { id: "company", key: "company", label: "单位", type: "text", required: false }
];
const coupon = { id: "qa-coupon", status: "UNUSED", usable: true, coupon: { id: "coupon", code: "PRIVATE", name: "已领取优惠", scope: "CONFERENCE", type: "AMOUNT", discountAmountCent: 1000, discountPercent: null, minAmountCent: null, endAt: null, conferenceId: conference.id } };
const ok = (route: Route, data: unknown) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ code: "OK", data }) });
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
page.on("pageerror", error => errors.push(error.message));
await context.route(url => url.pathname.startsWith("/api/"), async route => {
  const path = new URL(route.request().url()).pathname;
  requests.push(path);
  if (path === "/api/cart/registration-items") { carts.push(route.request().postDataJSON()); return ok(route, { id: "cart-qa" }); }
  if (path === "/api/cart") return ok(route, { registrationItems: [], productItems: [] });
  if (path === "/api/auth/wechat/login") return ok(route, { token: "qa-token", user });
  if (path === "/api/auth/me") return ok(route, { user });
  if (path === "/api/auth/me/profile") {
    const body = route.request().postDataJSON();
    user = { ...user, realName: body.realName, registrationReady: Boolean(body.realName && user.phoneVerifiedAt) };
    return ok(route, { user });
  }
  if (path === "/api/app/theme") {
    if (slowHome) await delay(3500);
    return ok(route, { config: { backgroundMode: "solid", backgroundColor: "#f5f7f7" } });
  }
  if (path === "/api/app/tabbar") return ok(route, { enabled: false, items: [] });
  if (path === "/api/pages/home/published") {
    if (failHome) return route.abort();
    if (slowHome) await delay(1200);
    return ok(route, { id: "home", pageKey: "home", title: "验收首页", version: { id: "v1", dsl: buildCmsCompositionDsl("home", "home"), themeJson: {}, versionNo: 1 } });
  }
  if (path.startsWith("/api/pages/")) return ok(route, null);
  if (path === "/api/conferences") {
    if (failHome) return route.abort();
    if (slowHome) await delay(4500);
    return ok(route, { items: [conference] });
  }
  if (path === `/api/conferences/${conference.id}`) return ok(route, conference);
  if (path === `/api/conferences/${conference.id}/form`) return ok(route, { fields });
  if (path === "/api/registration/quote") {
    const body = route.request().postDataJSON();
    const quantity = body.items.reduce((sum: number, item: { quantity: number }) => sum + item.quantity, 0);
    return ok(route, { ...body, originAmountCent: quantity * 10000, discountAmountCent: body.couponCode ? 1000 : 0, payableAmountCent: quantity * 10000 - (body.couponCode ? 1000 : 0) });
  }
  if (path === "/api/registration/orders") {
    orders.push(route.request().postDataJSON());
    return ok(route, { orderNo: "QA-ORDER", status: "PENDING" });
  }
  if (path.endsWith("/payment-status")) return ok(route, { orderNo: "QA-ORDER", status: "PENDING", registrationId: null, paidAt: null });
  if (path === "/api/my/coupons") return ok(route, { items: ownedCoupon ? [coupon] : [] });
  if (path === "/api/guest-identities/profiles") return ok(route, { user, attendees: [{ id: "guest", name: "历史代填嘉宾", phone: "13900139000", registration: { conferenceId: "old", conference: { title: "旧会议" } }, formDataJson: { name: "历史代填嘉宾", phone: "13900139000", company: "不应跨会议复用的自定义答案" } }] });
  if (path === "/api/guest-identities/claim") return ok(route, { claimed: true });
  if (path === "/api/guest-identities/mine") return ok(route, { items: [{ id: "a1", name: "本人嘉宾", phone: user.phone, company: null, title: null, checkInStatus: "PENDING", registration: { id: "r1", registrationNo: "QA-REG", status: "CONFIRMED", conference }, qrPayload: "CONF_REG:r1:QA-REG:signature:0:a1" }] });
  if (path === "/api/member/center") return ok(route, { membership: null, levels: [], grants: [] });
  return ok(route, { items: [], options: [], unreadCount: 0 });
});
// No third-party assets, production endpoints, or real WeChat calls may escape the fixtures.
await context.route(url => !["127.0.0.1", "localhost"].includes(url.hostname), route => route.abort());
try {
  await page.goto(`${base}/#/pages/index/index`);
  await expect(page.locator(".home-skeleton")).toBeVisible();
  await page.screenshot({ path: `${output}/home-skeleton.png` });
  await expect(page.locator(".cms-hero-banner")).toBeVisible();
  expect(requests.some(path => path.startsWith("/api/auth/"))).toBe(false);
  await expect(page.locator(".cms-hero-banner__image img")).toHaveJSProperty("complete", true);
  await page.screenshot({ path: `${output}/home-progressive.png` });
  await delay(4800);
  slowHome = false;
  failHome = true;
  await page.reload();
  await expect(page.locator(".cms-hero-banner")).toBeVisible();
  await expect(page.locator(".refresh-notice")).toBeVisible();
  expect(requests.some(path => path.startsWith("/api/auth/"))).toBe(false);
  console.log("PASS visitor home, skeleton, independent content and cache fallback");
  failHome = false;

  await page.goto(`${base}/#/pages/registration/form?conferenceId=${conference.id}`);
  await expect(page).toHaveURL(/pages\/account\/profile/);
  await expect(page.locator(".profile-page")).toContainText("网页版不能验证微信手机号");
  await page.getByText("暂不完善，返回上一页", { exact: true }).click();
  await expect(page.locator(".profile-required")).toBeVisible();
  await delay(600);
  expect(page.url()).toContain("pages/registration/form");
  await page.getByText("完善资料并继续", { exact: true }).click();
  await expect(page).toHaveURL(/pages\/account\/profile/);
  user = { ...user, phone: "13800138000", phoneVerifiedAt: "2026-09-21T00:00:00Z" };
  await page.getByText("重新核对资料", { exact: true }).click();
  await page.locator(".profile-page input").fill("本人嘉宾");
  await page.getByText("保存本人姓名", { exact: true }).click();
  await expect(page.locator(".registration-brief")).toBeVisible();
  await expect(page.locator(".coupon-row")).toHaveCount(0);
  await page.locator(".qty-button").last().click();
  await expect(page.locator(".attendee-card")).toHaveCount(2);
  const cards = page.locator(".attendee-card");
  await cards.nth(0).locator(".field").filter({ hasText: "姓名" }).locator("input").fill("本人嘉宾");
  await cards.nth(0).locator(".field").filter({ hasText: "手机号" }).locator("input").fill("13800138000");
  await cards.nth(0).getByText("这是我本人参会").click();
  await expect(cards.nth(0)).toContainText("本人参会：资格将关联当前账号");
  await cards.nth(0).locator(".field").filter({ hasText: "手机号" }).locator("input").fill("13900139000");
  await expect(cards.nth(0)).toContainText("代填资料：不会自动绑定为当前账号本人");
  await cards.nth(0).locator(".field").filter({ hasText: "手机号" }).locator("input").fill("13800138000");
  await cards.nth(0).getByText("这是我本人参会").click();
  await cards.nth(1).locator(".field").filter({ hasText: "姓名" }).locator("input").fill("代填嘉宾");
  await cards.nth(1).locator(".field").filter({ hasText: "手机号" }).locator("input").fill("13900139000");
  user = { ...user, phoneVerifiedAt: null, registrationReady: false };
  await page.getByText("提交订单", { exact: true }).click();
  await expect(page).toHaveURL(/pages\/account\/profile/);
  await page.getByText("暂不完善，返回上一页", { exact: true }).click();
  await expect(page.locator(".profile-required")).toBeVisible();
  user = { ...user, phoneVerifiedAt: "2026-09-21T00:00:00Z", registrationReady: true };
  await page.getByText("完善资料并继续", { exact: true }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator(".field").filter({ hasText: "姓名" }).locator("input")).toHaveValue("代填嘉宾");
  await page.screenshot({ path: `${output}/registration-preserved.png`, fullPage: true });
  await page.getByText("提交订单", { exact: true }).click();
  await expect.poll(() => orders.length).toBe(1);
  const attendees = orders[0].attendees as Array<{ isSelf: boolean }>;
  expect(attendees.map(item => item.isSelf)).toEqual([true, false]);
  await expect(page).toHaveURL(/pages\/payment\/result/);
  console.log("PASS profile gate, cancel, preserved two-attendee draft, self-declaration payload and no-coupon UI");

  ownedCoupon = true;
  await page.goto(`${base}/#/pages/registration/form?conferenceId=${conference.id}`);
  await page.reload();
  await expect(page.locator(".coupon-row")).toBeVisible();
  await page.getByText("使用已领取优惠", { exact: true }).click();
  await page.getByText("已领取优惠（减 ¥10.00）", { exact: true }).click();
  await expect(page.locator(".coupon-feedback")).toContainText("本次已优惠 ¥10.00");
  console.log("PASS owned coupon selection and quote discount");

  await page.locator(".attendee-card").first().locator(".field").filter({ hasText: "姓名" }).locator("input").fill("本人嘉宾");
  await page.locator(".attendee-card").first().locator(".field").filter({ hasText: "手机号" }).locator("input").fill("13800138000");
  await page.getByText("这是我本人参会", { exact: true }).click();
  await page.getByText("加入购物车", { exact: true }).click();
  await expect.poll(() => carts.length).toBe(1);
  expect(carts[0].attendees[0]).toEqual({ formData: { name: "本人嘉宾", phone: "13800138000", company: "" }, isSelf: true });
  await expect(page).toHaveURL(/pages\/cart\/index/);
  console.log("PASS cart preserves verified self-declaration with form answers");

  await page.goto(`${base}/#/pages/account/claim?token=qa-private-token`);
  await page.getByText("确认本人领取", { exact: true }).click();
  await expect(page.getByText("领取成功", { exact: true })).toBeVisible();
  await page.getByText("确定", { exact: true }).click();
  await expect(page).toHaveURL(/pages\/account\/attendance/);
  await expect(page.locator(".attendance-item")).toContainText("本人嘉宾");
  await expect(page.locator(".qr-grid")).toBeVisible();
  await expect(page.locator(".qr-cell--dark")).not.toHaveCount(0);
  await expect(page.locator(".attendance-page")).not.toContainText("支付金额");
  await page.screenshot({ path: `${output}/attendance-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: `${output}/attendance-desktop.png`, fullPage: true });
  expect(errors).toEqual([]);
  console.log("PASS claim -> own attendance QR, no financial data, mobile and desktop, no runtime errors");
} catch (error) {
  await page.screenshot({ path: `${output}/failure.png`, fullPage: true });
  console.error(await page.locator("body").innerText());
  console.error({ errors, requests, url: page.url() });
  throw error;
} finally {
  await browser.close();
}
