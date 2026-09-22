import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { after, before, test } from "node:test";
import { chromium } from "@playwright/test";

// Run against an isolated H5 dev server. Every API request is intercepted; no live claims are made.
const baseURL = process.env.COUPON_CLAIM_H5_URL || "http://127.0.0.1:5196";
const token = "t".repeat(43);
const output = new URL("../../output/playwright/coupon-claim/", import.meta.url).pathname;
let browser;
before(async () => { await mkdir(output, { recursive: true }); browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

async function setup(t, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, locale: "zh-CN", timezoneId: "Asia/Shanghai" });
  t.after(() => context.close());
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const calls = [];
  const errors = [];
  const external = [];
  const state = { status: "PENDING", previewFailure: false, forbidden: false, verified: true, alreadyClaimed: false, coupon: {} };
  const user = () => ({ id: "test-user", openid: "test-openid", realName: "测试用户", phone: "13800001234", phoneVerifiedAt: state.verified ? "2026-09-22T01:00:00Z" : null });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.text().includes(token)) errors.push("Private token reached console"); });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/")) {
      const request = route.request();
      assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "API must stay local");
      assert.equal(url.href.includes(token), false, "Private token must not be part of an API URL");
      calls.push({ path: url.pathname, method: request.method(), headers: request.headers(), body: request.postDataJSON() });
      const ok = data => route.fulfill({ status: 200, contentType: "application/json", json: { code: "OK", data } });
      if (url.pathname === "/api/coupon-distributions/preview") {
        if (state.previewFailure) return route.fulfill({ status: 503, json: { code: "UNAVAILABLE", message: "private preview error" } });
        return ok({ coupon: {
          name: "受邀参会专属优惠券", type: "AMOUNT", discountAmountCent: 15025, discountPercent: null,
          conferenceTitle: "全国儿童自然教育交流大会暨行业发展论坛", endAt: "2027-09-30T12:00:00Z", ...state.coupon
        }, targetPhoneMasked: "138****1234", expiresAt: "2027-09-25T12:00:00Z", status: state.status });
      }
      if (url.pathname === "/api/auth/wechat/login") return ok({ token: "test-session", user: user() });
      if (url.pathname === "/api/auth/me") return ok({ user: user() });
      if (url.pathname === "/api/coupon-distributions/claim") {
        if (state.forbidden) return route.fulfill({ status: 403, json: { code: "FORBIDDEN", message: "PRIVATE_COUPON_CODE 13800001234" } });
        return ok({ id: "distribution-id", couponId: "coupon-id", status: "CLAIMED", alreadyClaimed: state.alreadyClaimed });
      }
      if (url.pathname === "/api/coupons/claim") return ok({ campaign: { name: "旧活动优惠券" }, claims: [{ id: "legacy-claim" }] });
      if (url.pathname === "/api/my/coupons") return ok({ items: [] });
      errors.push(`Unexpected API path: ${url.pathname}`);
      return route.fulfill({ status: 404, json: { code: "NOT_FOUND" } });
    }
    if (url.origin === new URL(baseURL).origin) return route.continue();
    external.push(url.origin);
    return route.abort();
  });
  return { page, calls, state, errors, external, open: (query = `token=${token}`) => page.goto(`${baseURL}/#/pages/coupon/claim?${query}`) };
}

async function readable(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const bounds = await page.locator(".claim-content").evaluate(element => {
    const rect = element.getBoundingClientRect();
    const boxes = Array.from(element.querySelectorAll("uni-button, .title, .coupon, .recipient, .feedback, .usage-condition, .conditions-notice")).map(node => {
      const box = node.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, height: box.height };
    });
    return { width: window.innerWidth, left: rect.left, right: rect.right, boxes, overflow: document.documentElement.scrollWidth > window.innerWidth };
  });
  assert.equal(bounds.overflow, false);
  assert.ok(bounds.left >= 0 && bounds.right <= bounds.width);
  for (const box of bounds.boxes) assert.ok(box.left >= 0 && box.right <= bounds.width && box.width > 0 && box.height > 0);
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`targeted preview and successful explicit claim render at ${viewport.width}px`, async t => {
    const state = await setup(t, viewport);
    await state.open();
    await state.page.getByText("领取专属优惠券", { exact: true }).waitFor();
    assert.equal(state.calls.length, 1);
    assert.equal(state.calls[0].method, "POST");
    assert.equal(state.calls[0].headers.authorization, undefined);
    assert.deepEqual(state.calls[0].body, { token });
    await readable(state.page);
    await state.page.screenshot({ path: `${output}pending-${viewport.width}.png`, fullPage: true, animations: "disabled" });
    assert.equal(await state.page.getByRole("button", { name: "领取优惠券", exact: true }).count(), 1);
    await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
    await state.page.getByText("领取成功", { exact: true }).waitFor();
    const claim = state.calls.find(call => call.path.endsWith("/coupon-distributions/claim"));
    assert.equal(claim.headers.authorization, "Bearer test-session");
    assert.deepEqual(claim.body, { token });
    await readable(state.page);
    await state.page.screenshot({ path: `${output}success-${viewport.width}.png`, fullPage: true, animations: "disabled" });
    await state.page.getByRole("button", { name: "我的优惠券 / 去使用", exact: true }).click();
    await state.page.waitForURL(/pages\/coupon\/my/);
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.external, []);
  });
}

for (const viewport of [{ width: 320, height: 740 }, { width: 390, height: 844 }, { width: 1280, height: 900 }]) {
  test(`reduction percentage and complete conditions are available before claim at ${viewport.width}px`, async t => {
    const state = await setup(t, viewport);
    state.state.coupon = {
      type: "PERCENT", discountPercent: 8500, discountAmountCent: null,
      scope: "CONFERENCE", minAmountCent: 30025, minQuantity: 2,
      startAt: "2027-09-01T12:00:00Z", maxDiscountCent: 20050,
      allowedSkuNames: ["标准参会票", "双日论坛通票（含专题工作坊与行业交流活动）"]
    };
    await state.open();
    await state.page.getByText("减免 85%", { exact: true }).waitFor();
    const card = state.page.locator(".coupon");
    const text = await card.innerText();
    for (const condition of ["使用条件", "适用范围：会议报名", "金额门槛：适用票种满 ¥300.25", "数量门槛：适用票种满 2 张", "使用开始：2027/9/1 20:00:00", "减免上限：最多 ¥200.50", "适用票种：标准参会票、双日论坛通票（含专题工作坊与行业交流活动）"]) {
      assert.ok(text.includes(condition), condition);
    }
    assert.doesNotMatch(text, /8\.5\s*折|优惠比例|部分使用条件暂未提供/);
    assert.equal(state.calls.length, 1);
    await readable(state.page);
    await state.page.screenshot({ path: `${output}conditions-${viewport.width}.png`, fullPage: true, animations: "disabled" });
    await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
    await state.page.getByText("领取成功", { exact: true }).waitFor();
    assert.deepEqual(state.errors, []);
    assert.deepEqual(state.external, []);
  });
}

test("older previews explain missing conditions without inventing unrestricted eligibility", async t => {
  const state = await setup(t);
  await state.open();
  await state.page.getByText("部分使用条件暂未提供，请在领取前向发券方确认。", { exact: true }).waitFor();
  assert.doesNotMatch(await state.page.locator(".coupon").innerText(), /无最低|不限定|未设置/);
  assert.equal(state.calls.length, 1);
  await readable(state.page);
  await state.page.screenshot({ path: `${output}conditions-missing-390.png`, fullPage: true, animations: "disabled" });
});

test("unavailable SKU placeholder is visible before claim and never says unrestricted", async t => {
  const state = await setup(t);
  state.state.coupon = {
    scope: "CONFERENCE", minAmountCent: null, minQuantity: null,
    startAt: null, maxDiscountCent: null, allowedSkuNames: ["指定规格（已不可用）"]
  };
  await state.open();
  await state.page.getByText("适用票种：指定规格（已不可用）", { exact: true }).waitFor();
  assert.doesNotMatch(await state.page.locator(".coupon").innerText(), /不限定规格/);
  assert.equal(state.calls.length, 1);
  await readable(state.page);
  await state.page.screenshot({ path: `${output}conditions-unavailable-sku-390.png`, fullPage: true, animations: "disabled" });
  assert.deepEqual(state.errors, []);
  assert.deepEqual(state.external, []);
});

test("H5 unverified profile returns to the same invitation without automatically claiming", async t => {
  const state = await setup(t);
  state.state.verified = false;
  await state.open();
  await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
  await state.page.getByText("请在微信小程序中授权验证手机号。网页版不能验证微信手机号。").waitFor();
  await state.page.locator("uni-button").filter({ hasText: "暂不完善，返回上一页" }).click();
  await state.page.getByText("请先完成本人手机号验证和资料确认，返回后再次点击领取。").waitFor();
  assert.equal(state.calls.filter(call => call.path.endsWith("/coupon-distributions/claim")).length, 0);
  assert.equal(new URL(state.page.url()).hash.includes(token), true);
  state.state.verified = true;
  await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
  await state.page.getByText("领取成功", { exact: true }).waitFor();
  assert.deepEqual(state.errors, []);
});

test("revoked, expired and malformed invitation pages stay safe", async t => {
  for (const [status, title] of [["REVOKED", "领取邀请已撤销"], ["EXPIRED", "领取邀请已过期"]]) {
    const state = await setup(t);
    state.state.status = status;
    await state.open();
    await state.page.getByText(title, { exact: true }).waitFor();
    assert.equal(await state.page.getByRole("button", { name: "领取优惠券", exact: true }).count(), 0);
    assert.equal(state.calls.length, 1);
    await readable(state.page);
    await state.page.screenshot({ path: `${output}${status.toLowerCase()}-390.png`, fullPage: true, animations: "disabled" });
  }
  const invalid = await setup(t);
  await invalid.open("token=invalid&claimCode=legacy-code");
  await invalid.page.getByText("领取链接不可用", { exact: true }).waitFor();
  assert.equal(invalid.calls.length, 0);
});

test("preview and claim failures remain retryable and do not expose raw errors", async t => {
  const state = await setup(t);
  state.state.previewFailure = true;
  await state.open();
  await state.page.getByText("暂时无法读取", { exact: true }).waitFor();
  state.state.previewFailure = false;
  await state.page.getByRole("button", { name: "重新加载", exact: true }).click();
  await state.page.getByText("领取专属优惠券", { exact: true }).waitFor();
  state.state.forbidden = true;
  await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
  await state.page.getByText("领取未完成，请确认当前账号已验证的手机号与受邀手机号一致，或联系发券方核对。").waitFor();
  assert.doesNotMatch(await state.page.locator(".claim-content").innerText(), /PRIVATE_COUPON_CODE|13800001234/);
  await readable(state.page);
  const couponPaint = await state.page.locator(".coupon").evaluate(element => {
    const style = getComputedStyle(element);
    return { text: element.textContent, opacity: style.opacity, visibility: style.visibility, display: style.display };
  });
  assert.match(couponPaint.text, /受邀参会专属优惠券/);
  assert.equal(couponPaint.opacity, "1");
  assert.equal(couponPaint.visibility, "visible");
  assert.notEqual(couponPaint.display, "none");
  await state.page.screenshot({ path: `${output}retry-390.png`, fullPage: true, animations: "disabled" });
  state.state.forbidden = false;
  state.state.alreadyClaimed = true;
  await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
  await state.page.getByText("你已领取此优惠券", { exact: true }).waitFor();
  assert.deepEqual(state.errors, []);
});

test("legacy claimCode still reaches the existing claim endpoint", async t => {
  const state = await setup(t);
  await state.open("claimCode=legacy-test");
  await state.page.getByText("优惠券领取", { exact: true }).waitFor();
  assert.equal(state.calls.length, 0);
  await state.page.getByRole("button", { name: "领取优惠券", exact: true }).click();
  await state.page.getByText("领取成功", { exact: true }).waitFor();
  assert.deepEqual(state.calls.find(call => call.path === "/api/coupons/claim").body, { claimCode: "legacy-test" });
  assert.equal(state.calls.some(call => call.path.includes("coupon-distributions")), false);
  assert.deepEqual(state.errors, []);
});
