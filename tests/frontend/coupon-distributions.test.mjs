import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdirSync } from "node:fs";
import { chromium, expect } from "@playwright/test";

const baseURL = process.env.ADMIN_COUPON_PREVIEW_URL || "http://127.0.0.1:5194";
assert.ok(["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Tests must use a local preview");
const now = new Date().toISOString();
const future = new Date(Date.now() + 86400000).toISOString();
const coupon = {
  id: "coupon-test", name: "定向测试券", code: "DIRECTED", conferenceId: "conference-test", type: "AMOUNT",
  scope: "CONFERENCE", discountAmountCent: 1000, minAmountCent: null, minQuantity: null,
  enabled: true, allowedSkuIds: [], perUserLimit: 1, createdAt: now, updatedAt: now
};
const user = { id: "user-test", realName: "接收测试用户", nickname: "测试昵称", phone: "13812345678", memberships: [], createdAt: now, lastActiveAt: now };
const summary = (overrides = {}) => ({
  id: "distribution-test", couponId: coupon.id, coupon, targetUserId: null, targetUser: null,
  targetPhoneMasked: "138****5678", status: "PENDING", expiresAt: future, claimedAt: null,
  createdAt: now, remark: "测试备注", claimUserId: null, claimUser: null, ...overrides
});
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function setup(t, { permissions = ["*"], createFailures = 0, createErrors = [], links = [], records = [], revokeError, couponOverride = {} } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN", serviceWorkers: "block" });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const calls = { creates: [], links: [], revokes: [], lists: [], userSearches: [], errors: [] };
  page.on("pageerror", (error) => calls.errors.push(error.message));
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const ok = (data) => route.fulfill({ json: { code: "OK", data } });
    const businessFailure = (error) => route.fulfill({ status: error.status || 409, json: { code: "FAILED", ...error } });
    const fail = () => route.fulfill({ status: 500, json: { code: "FAILED", message: "PRIVATE 13812345678 internal failure" } });
    if (path.includes("/api/")) {
      if (path.endsWith("/admin/auth/me")) return ok({ admin: { id: "admin-test", username: "test", displayName: "本地测试", permissions } });
      if (path.endsWith("/admin/theme")) return ok({ config: { adminBrandTitle: "观潮会集" } });
      if (path.endsWith("/admin/coupons")) return ok({ items: [{ ...coupon, ...couponOverride }], total: 1, page: 1, pageSize: 50 });
      if (path.endsWith("/admin/users")) {
        calls.userSearches.push(url.searchParams.get("keyword"));
        return ok({ items: [user], total: 1, page: 1, pageSize: 50 });
      }
      if (path.endsWith("/admin/coupon-distributions")) {
        if (request.method() === "POST") {
          const payload = request.postDataJSON();
          calls.creates.push(payload);
          if (createErrors[calls.creates.length - 1]) return businessFailure(createErrors[calls.creates.length - 1]);
          if (calls.creates.length <= createFailures) return fail();
          return ok(summary(payload.targetUserId ? { status: "CLAIMED", targetUserId: user.id, targetUser: user, targetPhoneMasked: null, claimUserId: user.id, claimUser: user, claimedAt: now } : {}));
        }
        calls.lists.push(Object.fromEntries(url.searchParams));
        return ok({ items: records, total: 21, page: Number(url.searchParams.get("page")), pageSize: 20 });
      }
      if (path.endsWith("/link")) {
        calls.links.push({ path, body: request.postDataJSON() });
        const response = links[calls.links.length - 1];
        if (!response) return fail();
        if (response.error) return businessFailure(response.error);
        return ok(response);
      }
      if (path.endsWith("/revoke")) {
        calls.revokes.push({ path, body: request.postDataJSON() });
        if (revokeError) return businessFailure(revokeError);
        const record = records.find((item) => path.includes(`/${item.id}/`));
        if (record) record.status = "REVOKED";
        return ok(summary({ ...record, status: "REVOKED" }));
      }
      return ok({ items: [], total: 0 });
    }
    if (url.origin === new URL(baseURL).origin) return route.continue();
    return route.abort();
  });
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "local-coupon-test-only"));
  const dialog = page.getByRole("dialog", { name: "优惠券定向发放", exact: true });
  const openCoupon = async () => {
    await page.goto(`${baseURL}/#/coupons`);
    await page.getByRole("button", { name: "定向发放", exact: true }).click();
    await expect(dialog).toBeVisible();
  };
  const confirm = async (retry = false) => {
    await dialog.getByRole("button", { name: retry ? "重试同一发放" : "确认发放", exact: true }).click();
    const confirmation = page.getByRole("dialog", { name: "确认定向发放", exact: true });
    await expect(confirmation).toContainText("定向测试券（DIRECTED）");
    await expect(confirmation).toContainText("需先领取才能使用");
    await expect(confirmation).toContainText("未关联任何公开活动");
    await expect(confirmation).toContainText("每人限用 1 次");
    const latestModeIsPhone = await dialog.getByRole("spinbutton", { name: "领取有效期（小时）" }).count();
    if (!latestModeIsPhone) await expect(confirmation).not.toContainText("领取有效期");
    await confirmation.getByRole("button", { name: "确认发放", exact: true }).click();
  };
  t.after(() => assert.deepEqual(calls.errors, []));
  return { page, dialog, calls, openCoupon, confirm };
}

test("user action locks identity, masks phone, confirms coupon and immediately owns the grant", async (t) => {
  const { page, dialog, calls, confirm } = await setup(t);
  await page.goto(`${baseURL}/#/users`);
  await page.getByRole("button", { name: "发券", exact: true }).click();
  await expect(dialog).toContainText(`用户 ID：${user.id}`);
  await expect(dialog).toContainText("138****5678");
  await expect(dialog).not.toContainText(user.phone);
  await expect(dialog.getByRole("radio", { name: "手机号邀请" })).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "优惠券", exact: true }).fill("定向");
  await page.getByRole("option", { name: "定向测试券 · DIRECTED" }).click();
  await expect(dialog.getByRole("spinbutton", { name: "领取有效期（小时）" })).toHaveCount(0);
  await expect(dialog).toContainText("未关联任何公开活动");
  await expect(dialog).toContainText("每人限用 1 次");
  await expect(dialog).toContainText("总量可以不限");
  await expect(dialog.getByRole("textbox", { name: "备注", exact: true })).toHaveAttribute("maxlength", "200");
  await confirm();
  await expect(dialog).toContainText("优惠券已归入接收账号");
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].targetUserId, user.id);
  assert.equal(calls.creates[0].targetPhone, undefined);
  assert.equal(calls.creates[0].expiresInHours, undefined);
  assert.match(calls.creates[0].idempotencyKey, /^[0-9a-f-]{36}$/);
  assert.equal(calls.links.length, 0);
  await expect(dialog.getByRole("tabpanel", { name: "定向发放", exact: true })).not.toContainText("领取截止时间");
  await dialog.getByRole("tab", { name: "发放记录" }).click();
  await expect.poll(() => calls.lists.length).toBeGreaterThan(0);
  assert.equal(calls.lists.at(-1).userId, user.id);
});

test("phone invitation validates input, retries the identical POST, and retries link only after failure/path-only response", async (t) => {
  const { page, dialog, calls, openCoupon, confirm } = await setup(t, {
    createFailures: 1,
    links: [null, { url: "/pages/coupon/claim?id=test", path: "/pages/coupon/claim?id=test", expiresAt: future }, { url: "https://wxaurl.cn/local-test-only", path: "/pages/coupon/claim?id=test", expiresAt: future }]
  });
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await expect(dialog.getByRole("spinbutton", { name: "领取有效期（小时）" })).toHaveValue("24");
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill("12812345678");
  await dialog.getByRole("button", { name: "确认发放", exact: true }).click();
  await expect(dialog).toContainText("请输入有效的 11 位中国大陆手机号");
  assert.equal(calls.creates.length, 0);
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
  await dialog.getByRole("textbox", { name: "备注", exact: true }).fill("定向邀请备注");
  await confirm();
  await expect(dialog).toContainText("未能确认发放结果");
  await expect(dialog).not.toContainText("PRIVATE");
  await expect(dialog.getByRole("textbox", { name: "中国大陆手机号" })).toBeDisabled();
  await confirm(true);
  await expect(dialog).toContainText("发放记录已保留");
  assert.equal(calls.creates.length, 2);
  assert.deepEqual(calls.creates[0], calls.creates[1]);
  assert.equal(calls.creates[0].targetUserId, undefined);
  assert.equal(calls.creates[0].targetPhone, user.phone);
  assert.equal(calls.creates[0].remark, "定向邀请备注");
  assert.equal(calls.creates[0].expiresInHours, 24);
  await expect(dialog).not.toContainText(user.phone);
  await expect(dialog.getByRole("button", { name: "确认发放", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "重试生成链接", exact: true }).click();
  await expect.poll(() => calls.links.length).toBe(2);
  await expect(dialog.getByRole("textbox", { name: "微信领取链接地址" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "重试生成链接", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "微信领取链接地址" })).toHaveValue("https://wxaurl.cn/local-test-only");
  assert.equal(calls.creates.length, 2);
  assert.equal(calls.links.length, 3);
  assert.ok(calls.links.every((call) => call.path.endsWith("/distribution-test/link") && Object.keys(call.body).length === 0));
  const output = new URL("../../output/playwright/", import.meta.url);
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: new URL("coupon-distribution-desktop.png", output).pathname });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => dialog.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(390);
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: new URL("coupon-distribution-mobile.png", output).pathname });
});

test("coupon page chooses existing user, blocks double confirmation, and preserves key after closing a failed attempt", async (t) => {
  const { page, dialog, calls, openCoupon, confirm } = await setup(t, { createFailures: 1 });
  await openCoupon();
  const chooseUser = async () => {
    await dialog.getByRole("combobox", { name: "接收用户", exact: true }).fill("接收");
    await page.getByRole("option", { name: /接收测试用户/ }).click();
  };
  await chooseUser();
  await expect.poll(() => calls.userSearches.length).toBeGreaterThan(0);
  await dialog.getByRole("button", { name: "确认发放", exact: true }).evaluate((button) => { button.click(); button.click(); });
  await expect(page.getByRole("dialog", { name: "确认定向发放", exact: true })).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "确认定向发放", exact: true })).toContainText(user.id);
  await page.getByRole("dialog", { name: "确认定向发放", exact: true }).getByRole("button", { name: "确认发放", exact: true }).click();
  await expect(dialog).toContainText("未能确认发放结果");
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "定向发放", exact: true }).click();
  await chooseUser();
  await confirm();
  await expect(dialog).toContainText("优惠券已归入接收账号");
  assert.equal(calls.creates.length, 2);
  assert.deepEqual(calls.creates[0], calls.creates[1]);
});

test("history filters and paginates; only unexpired pending records can be revoked", async (t) => {
  const records = [summary(), summary({ id: "claimed", status: "CLAIMED", targetUserId: user.id, targetUser: user, targetPhoneMasked: null }), summary({ id: "expired", status: "EXPIRED" }), summary({ id: "revoked", status: "REVOKED" }), summary({ id: "stale", expiresAt: "2020-01-01T00:00:00.000Z" })];
  const { page, dialog, calls } = await setup(t, { records });
  await page.goto(`${baseURL}/#/coupons`);
  await page.getByRole("row").filter({ hasText: "定向测试券" }).getByRole("button", { name: "发放记录" }).click();
  await expect(dialog.getByRole("button", { name: "撤销", exact: true })).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "领取链接", exact: true })).toHaveCount(1);
  await expect(dialog).not.toContainText(user.phone);
  await expect(dialog).toContainText("直接到账，无需领取");
  assert.equal(calls.lists.at(-1).couponId, coupon.id);
  assert.equal(calls.lists.at(-1).pageSize, "20");
  await dialog.locator(".el-table__expand-icon").first().click();
  await expect(dialog.locator(".record-details")).toContainText("测试备注");
  await expect(dialog.locator(".record-details")).toContainText("发放时间");
  await dialog.locator(".el-pager li").filter({ hasText: /^2$/ }).click();
  await expect.poll(() => calls.lists.at(-1).page).toBe("2");
  await dialog.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("dialog", { name: "撤销邀请", exact: true }).getByRole("button", { name: "确认撤销", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "撤销", exact: true })).toHaveCount(0);
  assert.equal(calls.revokes.length, 1);
  assert.deepEqual(calls.revokes[0].body, {});
  assert.equal(calls.creates.length, 0);
});

test("read-only coupon viewers can read history but have no mutation controls, including the user list", async (t) => {
  const { page, dialog, calls } = await setup(t, { permissions: ["coupon:view", "member:view"], records: [summary()] });
  await page.goto(`${baseURL}/#/coupons`);
  await expect(page.getByRole("button", { name: "发放记录", exact: true }).first()).toBeVisible();
  for (const name of ["定向发放", "新增优惠券", "编辑", "删除"]) await expect(page.getByRole("button", { name, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "发放记录", exact: true }).first().click();
  await expect(dialog).toContainText("138****5678");
  await expect(dialog.getByRole("tab", { name: "定向发放", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "领取链接", exact: true })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "撤销", exact: true })).toHaveCount(0);
  await page.goto(`${baseURL}/#/users`);
  await expect(page.getByRole("button", { name: "查看详情", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "发券", exact: true })).toHaveCount(0);
  assert.equal(calls.creates.length + calls.links.length + calls.revokes.length, 0);
});

test("expiry bounds, safe confirmation cancellation, and responsive invitation form", async (t) => {
  const { page, dialog, calls, openCoupon } = await setup(t);
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
  const expiry = dialog.getByRole("spinbutton", { name: "领取有效期（小时）" });
  await expect(expiry).toHaveAttribute("aria-valuemax", "168");
  await expiry.fill("999");
  await expiry.press("Tab");
  await expect(expiry).toHaveValue("168");
  await dialog.getByRole("button", { name: "确认发放", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "确认定向发放", exact: true });
  await expect(confirmation).toContainText("领取有效期：168 小时");
  await expect(confirmation).toContainText("不改变券的使用有效期");
  await expect(confirmation).toContainText("138****5678");
  await expect(confirmation).not.toContainText(user.phone);
  await confirmation.getByRole("button", { name: "返回检查", exact: true }).click();
  await expect(confirmation).toBeHidden();
  assert.equal(calls.creates.length, 0);
  await expect(dialog.getByRole("button", { name: "确认发放", exact: true })).toBeEnabled();
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill("");
  const output = new URL("../../output/playwright/", import.meta.url);
  mkdirSync(output, { recursive: true });
  await page.screenshot({ path: new URL("coupon-distribution-form-desktop.png", output).pathname, animations: "disabled" });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
  await page.screenshot({ path: new URL("coupon-distribution-form-mobile.png", output).pathname, animations: "disabled" });
});

for (const message of [
  "定向券须设置每人限用 1 次，请先调整优惠券配置",
  "该券已关联公开领券活动，请新建独立的定向优惠券",
  "该接收人已领取过或使用过这张优惠券，请查看已有优惠券及使用记录"
]) {
  test(`approved business rejection is shown verbatim: ${message}`, async (t) => {
    const { dialog, calls, openCoupon, confirm } = await setup(t, { createErrors: [{ message }] });
    await openCoupon();
    await dialog.getByText("手机号邀请", { exact: true }).click();
    await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
    await confirm();
    await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    assert.equal(calls.creates.length, 1);
    assert.equal(calls.links.length, 0);
  });
}

test("duplicate pending rejection routes to history and generates a link without reissuing", async (t) => {
  const message = "该接收人已有待领取邀请，请到发放记录生成链接或撤销原邀请";
  const { dialog, calls, openCoupon, confirm } = await setup(t, {
    createErrors: [{ message }], records: [summary()],
    links: [{ url: "https://wxaurl.cn/local-test-only", path: "/pages/coupon/claim?id=test", expiresAt: future }]
  });
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
  await confirm();
  await expect(dialog.getByText(message, { exact: true })).toBeVisible();
  assert.equal(calls.links.length, 0);
  await dialog.getByRole("button", { name: "查看发放记录", exact: true }).click();
  await dialog.getByRole("button", { name: "领取链接", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "微信领取链接地址" })).toHaveValue("https://wxaurl.cn/local-test-only");
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.links.length, 1);
});

test("approved error plus private detail or request ID fails closed", async (t) => {
  const message = "该接收人已有待领取邀请，请到发放记录生成链接或撤销原邀请";
  const { dialog, calls, openCoupon, confirm } = await setup(t, { createErrors: [
    { message, detail: "PRIVATE 13812345678 token=test-private" },
    { message, requestId: "PRIVATE-REQUEST-ID" }
  ] });
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
  for (const retry of [false, true]) {
    await confirm(retry);
    await expect(dialog).toContainText("未能确认发放结果");
    await expect(dialog).not.toContainText("PRIVATE");
    await expect(dialog.getByText(message, { exact: true })).toHaveCount(0);
  }
  assert.deepEqual(calls.creates[0], calls.creates[1]);
});

test("link and revoke show approved business reasons while preserving the original grant", async (t) => {
  const linkMessage = "邀请链接生成失败（错误码 85079），请先发布包含邀请页面的小程序版本";
  const revokeMessage = "该券已到账，不能撤销领取邀请";
  const { page, dialog, calls } = await setup(t, { records: [summary()], links: [{ error: { message: linkMessage } }], revokeError: { message: revokeMessage } });
  await page.goto(`${baseURL}/#/coupons`);
  await page.getByRole("row").filter({ hasText: "定向测试券" }).getByRole("button", { name: "发放记录" }).click();
  await dialog.getByRole("button", { name: "领取链接", exact: true }).click();
  await expect(dialog).toContainText(linkMessage);
  await expect(dialog).toContainText("发放记录已保留");
  await dialog.getByRole("button", { name: "撤销", exact: true }).click();
  await page.getByRole("dialog", { name: "撤销邀请", exact: true }).getByRole("button", { name: "确认撤销", exact: true }).click();
  await expect(page.getByText(revokeMessage, { exact: true })).toBeVisible();
  assert.equal(calls.creates.length, 0);
});

test("switching to direct issuance discards invitation-only expiry validation and payload", async (t) => {
  const { page, dialog, calls, openCoupon, confirm } = await setup(t);
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await dialog.getByRole("spinbutton", { name: "领取有效期（小时）" }).fill("");
  await dialog.getByText("已有用户", { exact: true }).click();
  await dialog.getByRole("combobox", { name: "接收用户", exact: true }).fill("接收");
  await page.getByRole("option", { name: /接收测试用户/ }).click();
  await confirm();
  await expect(dialog).toContainText("优惠券已归入接收账号");
  assert.equal(calls.creates[0].expiresInHours, undefined);
  assert.equal(calls.creates[0].targetPhone, undefined);
});

test("coupons not restricted to one use are blocked locally", async (t) => {
  const { page, dialog, calls, openCoupon } = await setup(t, { couponOverride: { perUserLimit: null } });
  await openCoupon();
  await dialog.getByText("手机号邀请", { exact: true }).click();
  await dialog.getByRole("textbox", { name: "中国大陆手机号" }).fill(user.phone);
  await dialog.getByRole("button", { name: "确认发放", exact: true }).click();
  await expect(dialog).toContainText("定向发放要求每人限用 1 次，请先调整优惠券配置");
  assert.equal(calls.creates.length, 0);
  await dialog.getByRole("button", { name: "关闭", exact: true }).click();
  await page.goto(`${baseURL}/#/users`);
  await page.getByRole("button", { name: "发券", exact: true }).click();
  await dialog.getByRole("combobox", { name: "优惠券", exact: true }).fill("定向");
  await expect(page.getByRole("option", { name: /须每人限用 1 次/ })).toHaveAttribute("aria-disabled", "true");
});
