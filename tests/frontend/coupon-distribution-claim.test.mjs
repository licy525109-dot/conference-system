import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../../apps/user/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const read = path => readFileSync(new URL(`../../apps/user/src/${path}`, import.meta.url), "utf8");
const filename = "pages/coupon/claim.vue";
const { descriptor } = parse(read(filename));
const token = "a".repeat(41) + "_-";
const verifiedUser = { phone: "13800001234", phoneVerifiedAt: "2026-09-22T01:00:00Z", realName: "Test User" };
const claimed = { id: "distribution-id", status: "CLAIMED", alreadyClaimed: false, couponId: "coupon-id" };
const preview = (status = "PENDING") => ({
  coupon: { name: "受邀参会优惠券", type: "AMOUNT", discountAmountCent: 15025, discountPercent: null, conferenceTitle: "会议名称", endAt: "2027-09-30T12:00:00Z" },
  targetPhoneMasked: "138****1234", expiresAt: "2027-09-25T12:00:00Z", status
});

function compile(source) {
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
}
function load(source, dependencies, globals = {}) {
  const exports = {};
  runInNewContext(compile(source), {
    exports, Error, Date, ...globals,
    require(id) {
      if (id in dependencies) return dependencies[id];
      throw new Error(`Unexpected dependency: ${id}`);
    }
  });
  return exports;
}
class ApiRequestError extends Error {
  constructor(statusCode) {
    super(`private ${token} 13800001234 PRIVATE_COUPON_CODE`);
    this.statusCode = statusCode;
    this.responseMessage = this.message;
    this.responseData = { couponCode: "PRIVATE_COUPON_CODE", phone: "13800001234" };
  }
}

function setup(options = {}) {
  const calls = [];
  const navigations = [];
  const shares = [];
  const hooks = {};
  const config = { user: verifiedUser, ...options };
  const distributions = load(read("services/coupon-distributions.ts"), {
    "./request": { ApiRequestError, request: async (path, input) => {
      calls.push({ action: "request", path, input });
      if (path.endsWith("/preview")) return config.preview ? config.preview() : preview();
      if (path.endsWith("/claim")) return config.claim ? config.claim() : claimed;
      throw new Error("Unexpected endpoint");
    } }
  });
  const auth = {
    ensureLogin: async () => { calls.push({ action: "login" }); if (config.login) await config.login(); return "session"; },
    ensureAuthenticatedUser: async input => { calls.push({ action: "profile", input }); return config.user; }
  };
  const uni = {
    hideShareMenu: input => shares.push(input),
    navigateTo: input => { navigations.push(input.url); input.success?.(); }
  };
  const promptUtils = load(read("utils/wechatProfilePrompt.ts"), {});
  const identity = load(read("utils/registration-identity.ts"), { "./wechatProfilePrompt": promptUtils });
  const profile = load(read("services/registration-profile.ts"), {
    "./auth": auth, "../utils/registration-identity": identity
  }, { uni, getCurrentPages: () => [{ route: "pages/coupon/claim" }] });
  let script = descriptor.scriptSetup.content;
  if (config.platform === "h5") script = script.replace(/\s*\/\/ #ifdef MP-WEIXIN[\s\S]*?\/\/ #endif/g, "");
  const { state } = load(`${script}\nexport const state = { token, claimCode, mode, preview, previewState, loading, success, alreadyClaimed, feedback, title, message, canClaim, maskedPhone, discountText, usageConditions, conditionsIncomplete, doClaim, loadPreview, goMyCoupons };`, {
    vue,
    "@dcloudio/uni-app": { onLoad: fn => { hooks.load = fn; }, onShow: fn => { hooks.show = fn; }, onUnload: fn => { hooks.unload = fn; } },
    "@/services/auth": auth,
    "@/services/registration-profile": profile,
    "@/services/coupon-distributions": distributions,
    "@/services/operations": { claimCoupon: async code => {
      calls.push({ action: "legacy", code });
      if (config.legacy) return config.legacy();
      return { campaign: { name: "活动优惠券" }, claims: [{ id: "legacy-claim" }] };
    } },
    "@/utils/money": load(read("utils/money.ts"), {})
  }, { uni });
  hooks.load(config.query ?? { token });
  hooks.show();
  return { ...state, calls, navigations, shares, hooks, config, distributions };
}

const settle = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const requests = (state, suffix) => state.calls.filter(call => call.path?.endsWith(suffix));

test("wallet and claim preview describe reduction basis points consistently without changing fixed amounts", () => {
  const wallet = parse(read("pages/coupon/my.vue")).descriptor;
  const { discountText } = load(`${wallet.scriptSetup.content}\nexport { discountText };`, {
    vue: { ...vue, onMounted: () => {} },
    "@/services/operations": { getMyCoupons: async () => ({ items: [] }) },
    "@/utils/money": load(read("utils/money.ts"), {})
  });
  assert.equal(discountText({ coupon: { type: "AMOUNT", discountAmountCent: 15025 } }), "立减 ¥150.25");
  for (const [discountPercent, expected] of [[8500, "减免 85%"], [1500, "减免 15%"], [250, "减免 2.5%"]]) {
    assert.equal(discountText({ coupon: { type: "PERCENT", discountPercent } }), expected);
  }
});

test("template compiles; no phone input, share button, token logging or coupon code disclosure", () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename, id: "coupon-claim" }).errors, []);
  assert.doesNotMatch(descriptor.template.content, /<input|open-type="share"|coupon\.code|\{\{\s*token/);
  assert.doesNotMatch(descriptor.scriptSetup.content + read("services/coupon-distributions.ts"), /console\.|setStorageSync|setClipboardData/);
  assert.match(descriptor.styles[0].content, /font-size: 16px/);
  assert.match(descriptor.styles[0].content, /min-height: 48px/);
  assert.match(descriptor.styles[0].content, /overflow-wrap: anywhere/);
  assert.match(read("pages/account/profile.vue"), /<WechatProfilePrompt\s*\/>/);
});

test("preview is anonymous POST with token only in the body, and never logs in or claims on load/show", async () => {
  const state = setup();
  await settle();
  state.hooks.show();
  assert.equal(state.calls.length, 1);
  const { path, input } = state.calls[0];
  assert.equal(path, "/coupon-distributions/preview");
  assert.equal(input.method, "POST");
  assert.equal(input.auth, false);
  assert.deepEqual(Object.keys(input.data), ["token"]);
  assert.equal(input.data.token, token);
  assert.equal(path.includes(token), false);
  assert.equal(state.success.value, false);
  assert.equal(state.maskedPhone.value, "138****1234");
  assert.equal(state.discountText.value, "立减 ¥150.25");
  assert.ok(state.shares.length >= 2);
  assert.deepEqual(Array.from(state.shares[0].menus), ["shareAppMessage", "shareTimeline"]);
});

test("missing, blank and malformed tokens fail closed, including when a legacy claimCode is present", async () => {
  for (const bad of [undefined, null, "", "short", "a".repeat(42), "a".repeat(44), "a".repeat(42) + "/", " " + token, [token]]) {
    const state = setup({ query: { token: bad, claimCode: "legacy-code" } });
    await state.doClaim();
    assert.equal(state.token.value, "");
    assert.equal(state.claimCode.value, "");
    assert.equal(state.canClaim.value, false);
    assert.equal(state.calls.length, 0);
    assert.equal(state.title.value, "领取链接不可用");
  }
  const missing = setup({ query: {} });
  await missing.doClaim();
  assert.equal(missing.calls.length, 0);
});

test("claim requires an explicit tap, fresh verified profile, and authenticated token-only POST", async () => {
  const state = setup({ query: { token, claimCode: "ignored-legacy" } });
  await settle();
  await state.doClaim();
  assert.deepEqual(state.calls.map(call => call.action), ["request", "login", "profile", "request"]);
  assert.equal(state.calls[2].input.force, true);
  const { path, input } = requests(state, "/claim")[0];
  assert.equal(path, "/coupon-distributions/claim");
  assert.equal(input.method, "POST");
  assert.notEqual(input.auth, false);
  assert.deepEqual(Object.keys(input.data), ["token"]);
  assert.equal(input.data.token, token);
  assert.equal(state.success.value, true);
  assert.equal(state.title.value, "领取成功");
  state.goMyCoupons();
  assert.deepEqual(state.navigations, ["/pages/coupon/my"]);
  await state.doClaim();
  assert.equal(requests(state, "/claim").length, 1);
});

test("typed phone without server verification cannot claim; profile return preserves token and requires a new tap", async () => {
  for (const platform of ["mp-weixin", "h5"]) {
    const state = setup({ platform, user: { ...verifiedUser, phoneVerifiedAt: null } });
    await settle();
    await state.doClaim();
    assert.deepEqual(state.navigations, ["/pages/account/profile"]);
    assert.equal(requests(state, "/claim").length, 0);
    assert.equal(state.success.value, false);
    assert.equal(state.token.value, token);
    state.config.user = { ...verifiedUser };
    state.hooks.show();
    await settle();
    assert.equal(requests(state, "/claim").length, 0);
    await state.doClaim();
    assert.equal(state.success.value, true);
    assert.equal(requests(state, "/claim")[0].input.data.token, token);
    if (platform === "h5") assert.equal(state.shares.length, 0);
  }
});

test("cancelling incomplete profile leaves a retryable claim and never creates local success", async () => {
  const state = setup({ user: { ...verifiedUser, realName: "" } });
  await settle();
  await state.doClaim();
  state.hooks.show();
  assert.equal(state.loading.value, false);
  assert.equal(state.canClaim.value, true);
  assert.equal(state.success.value, false);
  assert.match(state.feedback.value, /返回后再次点击领取/);
  assert.equal(requests(state, "/claim").length, 0);
});

test("revoked and expired previews cannot trigger login or claims", async () => {
  for (const status of ["REVOKED", "EXPIRED"]) {
    const state = setup({ preview: () => preview(status) });
    await settle();
    await state.doClaim();
    assert.equal(state.canClaim.value, false);
    assert.equal(state.success.value, false);
    assert.equal(state.calls.length, 1);
    assert.match(state.title.value, /已过期|已撤销/);
  }
});

test("public CLAIMED is not current-user success; an authenticated idempotent response is", async () => {
  const state = setup({ preview: () => preview("CLAIMED"), claim: () => ({ ...claimed, alreadyClaimed: true }) });
  await settle();
  assert.equal(state.success.value, false);
  assert.equal(state.title.value, "此邀请已领取");
  assert.equal(state.canClaim.value, true);
  await state.doClaim();
  assert.equal(state.success.value, true);
  assert.equal(state.title.value, "你已领取此优惠券");
});

test("invalid-link failures are generic and contain neither private identity nor coupon code nor token", async () => {
  for (const status of [400, 403, 404, 410]) {
    const state = setup({ preview: () => { throw new ApiRequestError(status); } });
    await settle();
    assert.equal(state.previewState.value, "invalid");
    assert.equal(state.preview.value, null);
    assert.doesNotMatch(state.title.value + state.message.value + state.feedback.value, /private|13800001234|PRIVATE_COUPON_CODE/);
    assert.equal(state.message.value.includes(token), false);
    await assert.rejects(state.distributions.previewCouponDistribution(token), error => {
      assert.equal(error.kind, "INVALID_LINK");
      assert.equal(error.message.includes(token), false);
      assert.equal(error.responseData, undefined);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("preview network errors can retry without authenticating", async () => {
  const state = setup({ preview: () => { throw new ApiRequestError(503); } });
  await settle();
  assert.equal(state.previewState.value, "error");
  assert.equal(state.canClaim.value, false);
  state.config.preview = () => preview();
  await state.loadPreview();
  assert.equal(state.previewState.value, "ready");
  assert.equal(state.canClaim.value, true);
  assert.equal(state.calls.length, 2);
});

test("server rejects wrong verified phone safely and retry remains available", async () => {
  const state = setup({ user: { ...verifiedUser, phone: "13900009999" }, claim: () => { throw new ApiRequestError(403); } });
  await settle();
  await state.doClaim();
  assert.equal(state.success.value, false);
  assert.equal(state.canClaim.value, true);
  assert.equal(state.loading.value, false);
  assert.match(state.feedback.value, /已验证的手机号与受邀手机号一致/);
  assert.doesNotMatch(state.feedback.value, /13800001234|13900009999|PRIVATE_COUPON_CODE/);
  assert.equal(state.feedback.value.includes(token), false);
  state.config.claim = () => claimed;
  state.config.user = verifiedUser;
  await state.doClaim();
  assert.equal(state.success.value, true);
});

test("lost claim response stays unconfirmed and retry can resolve as already claimed", async () => {
  const state = setup({ claim: () => { throw new ApiRequestError(); } });
  await settle();
  await state.doClaim();
  assert.equal(state.success.value, false);
  assert.match(state.feedback.value, /结果暂未确认/);
  state.config.claim = () => ({ ...claimed, alreadyClaimed: true });
  await state.doClaim();
  assert.equal(state.success.value, true);
  assert.equal(state.alreadyClaimed.value, true);
});

test("login failure does not lose token or leak raw diagnostics and can retry", async () => {
  const state = setup({ login: () => { throw new ApiRequestError(401); } });
  await settle();
  await state.doClaim();
  assert.equal(state.success.value, false);
  assert.equal(state.token.value, token);
  assert.equal(requests(state, "/claim").length, 0);
  assert.equal(state.feedback.value.includes(token), false);
  state.config.login = async () => {};
  await state.doClaim();
  assert.equal(state.success.value, true);
});

test("in-flight preview cannot claim; repeated taps issue one claim only", async () => {
  const pendingPreview = deferred();
  const pendingClaim = deferred();
  const state = setup({ preview: () => pendingPreview.promise, claim: () => pendingClaim.promise });
  await state.doClaim();
  assert.equal(state.calls.length, 1);
  pendingPreview.resolve(preview());
  await settle();
  const first = state.doClaim();
  await state.doClaim();
  await settle();
  assert.equal(requests(state, "/claim").length, 1);
  assert.equal(state.success.value, false);
  pendingClaim.resolve(claimed);
  await first;
  assert.equal(state.success.value, true);
});

test("malformed or non-CLAIMED success envelopes never produce fake success", async () => {
  for (const result of [undefined, {}, { ...claimed, status: "PENDING" }, { ...claimed, couponId: null }, { ...claimed, alreadyClaimed: undefined }]) {
    const state = setup({ claim: () => result });
    await settle();
    await state.doClaim();
    assert.equal(state.success.value, false);
    assert.equal(state.canClaim.value, true);
    assert.match(state.feedback.value, /结果暂未确认/);
  }
});

test("unknown preview status fails closed and unmasked phone is never displayed", async () => {
  const invalid = setup({ preview: () => preview("UNKNOWN") });
  await settle();
  assert.equal(invalid.canClaim.value, false);
  const unmasked = setup({ preview: () => ({ ...preview(), targetPhoneMasked: "13800001234" }) });
  await settle();
  assert.equal(unmasked.maskedPhone.value, "已隐藏");
});

test("percentage is an amount reduction, not the percentage payable", async () => {
  for (const [basisPoints, label] of [[8500, "减免 85%"], [8555, "减免 85.55%"], [10000, "减免 100%"]]) {
    const data = preview();
    Object.assign(data.coupon, { type: "PERCENT", discountAmountCent: null, discountPercent: basisPoints });
    const state = setup({ preview: () => data });
    await settle();
    assert.equal(state.discountText.value, label);
    assert.doesNotMatch(state.discountText.value, /折|付款|优惠比例/);
  }
});

test("all supplied usage conditions are visible before login or claim", async () => {
  const data = preview();
  Object.assign(data.coupon, { minAmountCent: 30025, minQuantity: 2, startAt: "2027-09-01T12:00:00Z", maxDiscountCent: 20050, scope: "CONFERENCE", allowedSkuNames: ["标准参会票", "双日论坛通票"] });
  const state = setup({ preview: () => data });
  await settle();
  const conditions = Array.from(state.usageConditions.value);
  assert.ok(conditions.includes("适用范围：会议报名"));
  assert.ok(conditions.includes("金额门槛：适用票种满 ¥300.25"));
  assert.ok(conditions.includes("数量门槛：适用票种满 2 张"));
  assert.match(conditions.find(text => text.startsWith("使用开始：")), /2027/);
  assert.ok(conditions.includes("减免上限：最多 ¥200.50"));
  assert.ok(conditions.includes("适用票种：标准参会票、双日论坛通票"));
  assert.equal(state.conditionsIncomplete.value, false);
  assert.equal(state.calls.length, 1);
  assert.equal(state.success.value, false);
  assert.ok(descriptor.template.content.indexOf("使用条件") < descriptor.template.content.indexOf('@click="doClaim"'));
});

test("optional missing conditions are unknown, never labelled unrestricted", async () => {
  const state = setup();
  await settle();
  assert.deepEqual(Array.from(state.usageConditions.value), []);
  assert.equal(state.conditionsIncomplete.value, true);
  assert.equal(state.canClaim.value, true);
  assert.match(descriptor.template.content, /部分使用条件暂未提供，请在领取前向发券方确认/);
  const partial = preview();
  Object.assign(partial.coupon, { minAmountCent: 12000, scope: "MALL" });
  state.config.preview = () => partial;
  await state.loadPreview();
  assert.equal(state.conditionsIncomplete.value, true);
  assert.ok(state.usageConditions.value.includes("金额门槛：适用商品规格满 ¥120.00"));
  assert.doesNotMatch(state.usageConditions.value.join("\n"), /无最低|不限定|未设置/);
});

test("explicit null restrictions and an empty SKU list differ from absent fields", async () => {
  const data = preview();
  Object.assign(data.coupon, { minAmountCent: null, minQuantity: null, startAt: null, maxDiscountCent: null, scope: "BOTH", allowedSkuNames: [] });
  const state = setup({ preview: () => data });
  await settle();
  assert.deepEqual(Array.from(state.usageConditions.value), ["适用范围：会议报名及商城商品", "金额门槛：无最低金额要求", "数量门槛：无最低数量要求", "使用开始：无起始时间限制", "减免上限：未设置金额上限", "适用票种/商品规格：不限定规格"]);
  assert.equal(state.conditionsIncomplete.value, false);
});

test("unavailable SKU placeholders remain restrictions, not unrestricted eligibility", async () => {
  for (const names of [["指定规格（已不可用）"], ["标准参会票", "指定规格（已不可用）"]]) {
    const data = preview();
    Object.assign(data.coupon, { scope: "CONFERENCE", allowedSkuNames: names });
    const state = setup({ preview: () => data });
    await settle();
    assert.ok(state.usageConditions.value.includes(`适用票种：${names.join("、")}`));
    assert.doesNotMatch(state.usageConditions.value.join("\n"), /不限定规格/);
    assert.equal(state.calls.length, 1);
    assert.equal(state.success.value, false);
  }
});

test("zero reduction cap remains zero and scope controls quantity and SKU labels", async () => {
  const data = preview();
  Object.assign(data.coupon, { minAmountCent: 0, minQuantity: 3, startAt: null, maxDiscountCent: 0, scope: "MALL", allowedSkuNames: ["标准套装"] });
  const state = setup({ preview: () => data });
  await settle();
  assert.ok(state.usageConditions.value.includes("金额门槛：无最低金额要求"));
  assert.ok(state.usageConditions.value.includes("数量门槛：适用商品规格满 3 件"));
  assert.ok(state.usageConditions.value.includes("减免上限：最多 ¥0.00"));
  assert.ok(state.usageConditions.value.includes("适用商品规格：标准套装"));
  assert.equal(state.conditionsIncomplete.value, false);
});

test("unloading prevents late preview or login responses from changing state or issuing claims", async () => {
  const pendingPreview = deferred();
  const state = setup({ preview: () => pendingPreview.promise });
  state.hooks.unload();
  pendingPreview.resolve(preview());
  await settle();
  assert.equal(state.preview.value, null);
  const login = deferred();
  const second = setup({ login: () => login.promise });
  await settle();
  const task = second.doClaim();
  second.hooks.unload();
  login.resolve();
  await task;
  assert.equal(requests(second, "/claim").length, 0);
  assert.equal(second.success.value, false);
});

test("new route cannot be overwritten by an old preview response", async () => {
  const old = deferred();
  const state = setup({ preview: () => old.promise });
  state.config.preview = () => preview("REVOKED");
  state.hooks.load({ token: "b".repeat(43) });
  await settle();
  old.resolve(preview());
  await settle();
  assert.equal(state.preview.value.status, "REVOKED");
  assert.equal(state.canClaim.value, false);
});

test("legacy claimCode path remains explicit, successful and independent of targeted profile rules", async () => {
  const state = setup({ query: { claimCode: "legacy-code" } });
  assert.equal(state.calls.length, 0);
  assert.equal(state.shares.length, 0);
  assert.equal(state.mode.value, "legacy");
  await state.doClaim();
  assert.deepEqual(state.calls, [{ action: "legacy", code: "legacy-code" }]);
  assert.equal(state.success.value, true);
  assert.match(state.message.value, /活动优惠券/);
});

test("legacy failure stays retryable without exposing request diagnostics", async () => {
  const state = setup({ query: { claimCode: "legacy-code" }, legacy: () => { throw new ApiRequestError(500); } });
  await state.doClaim();
  assert.equal(state.success.value, false);
  assert.equal(state.canClaim.value, true);
  assert.doesNotMatch(state.feedback.value, /private|PRIVATE_COUPON_CODE/);
  state.config.legacy = () => ({ campaign: { name: "活动优惠券" } });
  await state.doClaim();
  assert.equal(state.success.value, true);
});
