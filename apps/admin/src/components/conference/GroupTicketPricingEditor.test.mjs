import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const plain = value => JSON.parse(JSON.stringify(value));
const shared = {};
const compile = source => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
runInNewContext(compile(readFileSync(new URL("../../../../../packages/shared/src/group-ticket-pricing.ts", import.meta.url), "utf8")), { exports: shared, Error });

function source(path) {
  const filename = new URL(path, import.meta.url);
  const { descriptor, errors } = parse(readFileSync(filename, "utf8"));
  assert.deepEqual(errors, []);
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: filename.pathname, id: "pricing-test" }).errors, []);
  return descriptor;
}

const editor = source("./GroupTicketPricingEditor.vue");
const config = source("../../pages/conferences/config.vue");
const rules = () => ({ version: 1, minQuantity: 3, minPayableAmountCent: 10001, tiers: [{ minQuantity: 5, unitPriceCent: 8001 }, { minQuantity: 10, unitPriceCent: 7000 }] });
const packageRules = () => ({ version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 8000, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10001 }, { quantity: 5, totalAmountCent: 15000 }] });

function setupEditor(t, overrides = {}) {
  const props = vue.reactive({ priceCent: 10001, modelValue: null, groupRegistrationEnabled: true, maxTicketsPerOrder: null, ...overrides });
  const exports = {};
  const scope = vue.effectScope();
  scope.run(() => runInNewContext(compile(`${editor.scriptSetup.content}\nexport const state = { draft, errors, validate, changeMode, changeGroupMode, addTier, removeTier, addPackage, removePackage, yuanToCents };`), {
    exports, Error, defineProps: () => props, defineEmits: () => () => {}, defineExpose: () => {},
    require(id) {
      if (id === "vue") return vue;
      if (id === "@conference/shared") return shared;
      if (id === "@element-plus/icons-vue") return {};
      throw new Error(`Unexpected import: ${id}`);
    }
  }));
  t.after(() => scope.stop());
  return { props, ...exports.state };
}

test("currency conversion uses exact decimal digits and rejects rounding, overflow and malformed amounts", t => {
  const { yuanToCents } = setupEditor(t);
  for (const [yuan, cents] of [["0", 0], ["0.29", 29], ["1.01", 101], ["100.1", 10010], ["21474836.47", 2147483647]]) assert.equal(yuanToCents(yuan), cents);
  for (const value of ["", "1.005", "-1", "1e2", "NaN", "Infinity", "1,000", "21474836.48", "99999999999999999999999999999999"]) assert.equal(yuanToCents(value), null, value);
  assert.equal(yuanToCents("", true), 0);
});

test("normal tickets can be free and group tickets require a positive base price", t => {
  const state = setupEditor(t, { priceCent: 0 });
  assert.deepEqual(plain(state.validate()), { priceCent: 0, groupPricingJson: null });
  state.draft.mode = "group";
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.price, /大于 0/);
  state.draft.priceYuan = "0.01";
  assert.equal(state.validate().priceCent, 1);
});

test("existing rules round-trip without mutating source and normal mode clears all group rules", t => {
  const original = rules();
  const state = setupEditor(t, { modelValue: original });
  assert.deepEqual(plain(state.validate().groupPricingJson), original);
  state.draft.tiers[0].priceYuan = "79.99";
  assert.equal(original.tiers[0].unitPriceCent, 8001);
  state.draft.mode = "normal";
  state.changeMode();
  assert.equal(state.validate().groupPricingJson, null);
  assert.equal(state.draft.tiers.length, 0);
  state.draft.mode = "group";
  assert.deepEqual(plain(state.validate().groupPricingJson), { version: 1, minQuantity: 2, minPayableAmountCent: 0, tiers: [] });
});

test("minimum quantity rejects empty, fractional and out-of-range values", t => {
  const state = setupEditor(t, { modelValue: rules() });
  for (const min of [undefined, 1, 2.5, 1001]) {
    state.draft.minQuantity = min;
    assert.equal(state.validate(), null);
    assert.ok(state.errors.value.minQuantity);
  }
  state.draft.tiers = [];
  for (const min of [2, 1000]) {
    state.draft.minQuantity = min;
    assert.ok(state.validate());
  }
});

test("tier thresholds must be ascending, unique, in range and not below the minimum", t => {
  const state = setupEditor(t, { modelValue: rules() });
  for (const min of [undefined, 2, 5, 4.5, 1001]) {
    state.draft.tiers[1].minQuantity = min;
    assert.equal(state.validate(), null);
    assert.ok(state.errors.value.tiers[1].quantity);
  }
  state.draft.tiers[1].minQuantity = 1000;
  assert.ok(state.validate());
});

test("tier prices are positive cents and non-increasing against base and prior tier", t => {
  const state = setupEditor(t, { modelValue: rules() });
  for (const price of ["0", "-1", "1.001", "80.02", "21474836.48"]) {
    state.draft.tiers[1].priceYuan = price;
    assert.equal(state.validate(), null);
    assert.ok(state.errors.value.tiers[1].price);
  }
  state.draft.tiers[1].priceYuan = "80.01";
  assert.ok(state.validate());
  state.draft.priceYuan = "70";
  assert.equal(state.validate(), null);
  assert.ok(state.errors.value.tiers[0].price);
});

test("floor is optional zero, exact cents and independent of per-person base price", t => {
  const state = setupEditor(t, { modelValue: rules() });
  for (const value of ["", "0"]) {
    state.draft.minPayableYuan = value;
    assert.equal(state.validate().groupPricingJson.minPayableAmountCent, 0);
  }
  state.draft.minPayableYuan = "1500.01";
  assert.equal(state.validate().groupPricingJson.minPayableAmountCent, 150001);
  assert.equal(state.validate().priceCent, 10001);
  for (const value of ["-1", "0.001", "21474836.48"]) {
    state.draft.minPayableYuan = value;
    assert.equal(state.validate(), null);
    assert.ok(state.errors.value.minPayable);
  }
});

test("saved conference settings block incompatible groups without changing settings", t => {
  const state = setupEditor(t, { modelValue: rules(), groupRegistrationEnabled: false });
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.conference, /开启并保存/);
  assert.equal(state.props.groupRegistrationEnabled, false);
  state.props.groupRegistrationEnabled = true;
  state.props.maxTicketsPerOrder = 2;
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.conference, /低于最低人数/);
  state.props.maxTicketsPerOrder = 0;
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.conference, /低于最低人数/);
  for (const max of [3, null]) {
    state.props.maxTicketsPerOrder = max;
    assert.ok(state.validate());
  }
  state.props.groupRegistrationEnabled = false;
  state.draft.mode = "normal";
  state.changeMode();
  assert.ok(state.validate());
});

test("add/remove respects the 20-tier limit and disabled state", t => {
  const state = setupEditor(t, { modelValue: { version: 1, minQuantity: 2, minPayableAmountCent: 0, tiers: [] } });
  for (let i = 0; i < 25; i++) state.addTier();
  assert.equal(state.draft.tiers.length, 20);
  assert.ok(state.validate());
  state.props.disabled = true;
  state.removeTier(0);
  assert.equal(state.draft.tiers.length, 20);
  state.props.disabled = false;
  state.removeTier(0);
  assert.equal(state.draft.tiers.length, 19);
  state.draft.tiers.push(state.draft.tiers.at(-1), state.draft.tiers.at(-1));
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.rules, /20/);
});

test("package rules round-trip exact totals and derive only the reference price from the first package", t => {
  const original = packageRules();
  const state = setupEditor(t, { modelValue: original, priceCent: 3333 });
  assert.equal(state.draft.groupMode, "PACKAGE");
  assert.equal(state.draft.priceYuan, "");
  assert.deepEqual(plain(state.validate()), { priceCent: 3333, groupPricingJson: original });
  state.draft.packages[0].totalYuan = "100.02";
  assert.equal(state.validate().priceCent, 3334);
  assert.equal(state.validate().groupPricingJson.packages[0].totalAmountCent, 10002);
  assert.equal(original.packages[0].totalAmountCent, 10001);
  state.draft.packages[1].totalYuan = "90";
  assert.ok(state.validate(), "package totals are independent, not per-person price tiers");
});

test("package quantities are fixed, ascending and unique with 2..1000 bounds", t => {
  const state = setupEditor(t, { modelValue: packageRules(), priceCent: 3333 });
  for (const quantity of [undefined, 1, 2.5, 3, 1001]) {
    state.draft.packages[1].quantity = quantity;
    assert.equal(state.validate(), null);
    assert.ok(state.errors.value.packages[1].quantity);
  }
  state.draft.packages[1].quantity = 1000;
  assert.ok(state.validate());
  state.removePackage(0);
  assert.equal(state.validate().groupPricingJson.minQuantity, 1000);
  assert.equal(state.validate().priceCent, 15);
});

test("package totals reject excess decimals, less than one cent per attendee, and totals below the order floor", t => {
  const state = setupEditor(t, { modelValue: packageRules(), priceCent: 3333 });
  for (const total of ["", "0", "-1", "0.02", "100.005", "79.99", "21474836.48"]) {
    state.draft.packages[0].totalYuan = total;
    assert.equal(state.validate(), null, total);
    assert.ok(state.errors.value.packages[0].price);
  }
  state.draft.packages[0].totalYuan = "80";
  assert.ok(state.validate(), "equality with the floor is allowed");
  state.draft.minPayableYuan = "150.01";
  assert.equal(state.validate(), null);
  assert.ok(state.errors.value.packages.every(item => item.price));
  state.draft.minPayableYuan = "";
  state.draft.packages[0].totalYuan = "0.03";
  assert.equal(state.validate().priceCent, 1);
  assert.equal(state.validate().groupPricingJson.minPayableAmountCent, 0);
});

test("conference cap must admit every package, including zero caps", t => {
  const state = setupEditor(t, { modelValue: packageRules(), maxTicketsPerOrder: 4 });
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.conference, /至少 5/);
  assert.ok(state.errors.value.packages[1].quantity);
  for (const cap of [0, 2, 3, 4]) {
    state.props.maxTicketsPerOrder = cap;
    assert.equal(state.validate(), null);
  }
  for (const cap of [5, null]) {
    state.props.maxTicketsPerOrder = cap;
    assert.ok(state.validate());
  }
  state.props.groupRegistrationEnabled = false;
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.conference, /开启并保存/);
});

test("package add/remove enforces one to twenty options and disabled controls", t => {
  const state = setupEditor(t, { modelValue: packageRules() });
  state.removePackage(1);
  state.removePackage(0);
  assert.equal(state.validate(), null);
  assert.match(state.errors.value.rules, /1 至 20/);
  for (let i = 0; i < 25; i++) state.addPackage();
  assert.equal(state.draft.packages.length, 20);
  for (const item of state.draft.packages) item.totalYuan = "100";
  assert.ok(state.validate());
  state.props.disabled = true;
  state.removePackage(0);
  assert.equal(state.draft.packages.length, 20);
  state.draft.packages.push({ key: 99, quantity: 100, totalYuan: "100" });
  assert.equal(state.validate(), null);
});

test("group mode switches clear incompatible pricing but preserve the order floor", t => {
  const state = setupEditor(t, { modelValue: rules() });
  state.draft.groupMode = "PACKAGE";
  state.changeGroupMode();
  assert.equal(state.draft.tiers.length, 0);
  assert.equal(state.draft.priceYuan, "");
  assert.equal(state.draft.minPayableYuan, "100.01");
  assert.equal(state.validate(), null);
  state.draft.packages[0].quantity = 3;
  state.draft.packages[0].totalYuan = "200.03";
  assert.equal(state.validate().priceCent, 6667);
  state.draft.groupMode = "PER_PERSON";
  state.changeGroupMode();
  assert.equal(state.draft.packages.length, 0);
  assert.equal(state.draft.minPayableYuan, "100.01");
  assert.equal(state.validate(), null);
  state.draft.priceYuan = "100.01";
  const result = state.validate().groupPricingJson;
  assert.equal(Object.hasOwn(result, "mode"), false);
  assert.equal(Object.hasOwn(result, "packages"), false);
  assert.deepEqual(plain(result.tiers), []);
});

test("package-to-normal clears group state and requires an explicit ordinary price", t => {
  const state = setupEditor(t, { modelValue: packageRules(), priceCent: 3333 });
  state.draft.mode = "normal";
  state.changeMode();
  assert.equal(state.draft.groupMode, "PER_PERSON");
  assert.equal(state.draft.packages.length, 0);
  assert.equal(state.draft.minPayableYuan, "");
  assert.equal(state.validate(), null);
  state.draft.priceYuan = "100";
  assert.deepEqual(plain(state.validate()), { priceCent: 10000, groupPricingJson: null });
});

test("changing rows resets package, ordinary and per-person drafts without retaining old rules", async t => {
  const state = setupEditor(t, { modelValue: packageRules(), priceCent: 3333 });
  state.props.modelValue = null;
  state.props.priceCent = 0;
  await vue.nextTick();
  assert.equal(state.draft.mode, "normal");
  assert.equal(state.draft.packages.length, 0);
  assert.deepEqual(plain(state.validate()), { priceCent: 0, groupPricingJson: null });
  state.props.modelValue = { ...rules(), mode: "PER_PERSON" };
  state.props.priceCent = 10001;
  await vue.nextTick();
  assert.equal(state.draft.groupMode, "PER_PERSON");
  assert.deepEqual(plain(state.validate().groupPricingJson), rules());
  state.props.modelValue = packageRules();
  state.props.priceCent = 3333;
  await vue.nextTick();
  assert.deepEqual(plain(state.validate().groupPricingJson), packageRules());
});

function setupConfig(t, api = {}) {
  const exports = {}, calls = [], messages = [];
  const scope = vue.effectScope();
  const mocks = new Proxy(api, { get(target, key) { return async (...args) => {
    calls.push({ key, args });
    if (target[key]) return target[key](...args);
    if (key === "listSkus") return { items: [{ id: "saved" }] };
    if (["createSku", "updateSku"].includes(key)) return {};
    throw new Error(`Unexpected API: ${String(key)}`);
  }; } });
  scope.run(() => runInNewContext(compile(`${config.scriptSetup.content}\nexport const state = { conferenceId, selectedConference, conferenceForm, skuForm, skuDialogVisible, skuPricingEditor, skuSaveError, savingSku, skus, openSku, saveSku, skuPriceText, skuPricingText };`), {
    exports, Error,
    require(id) {
      if (id === "vue") return { ...vue, onMounted: () => {} };
      if (id === "element-plus") return { ElMessage: { success: text => messages.push(text), warning: text => messages.push(text) } };
      if (id.endsWith("/services/admin")) return mocks;
      if (id.endsWith("/stores/admin-session")) return { useAdminSession: () => ({ hasPermission: () => true }) };
      return {};
    }
  }));
  t.after(() => scope.stop());
  const state = exports.state;
  state.conferenceId.value = "conference";
  state.openSku();
  state.skuForm.name = "测试团体票";
  state.skuPricingEditor.value = { validate: () => ({ priceCent: 10001, groupPricingJson: rules() }) };
  return { ...state, calls, messages };
}

test("save blocks duplicate submissions and sends only SKU pricing data", async t => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const state = setupConfig(t, { createSku: () => pending });
  const first = state.saveSku();
  await state.saveSku();
  assert.equal(state.savingSku.value, true);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(plain(state.calls[0]), { key: "createSku", args: ["conference", { name: "测试团体票", description: "", priceCent: 10001, groupPricingJson: rules(), stock: 0, status: "ACTIVE" }] });
  finish({});
  await first;
  assert.equal(state.savingSku.value, false);
  assert.equal(state.skuDialogVisible.value, false);
});

test("invalid pricing never submits; failed save retains input and supports retry", async t => {
  let fail = true;
  const state = setupConfig(t, { createSku: () => { if (fail) throw new Error("保存失败，请重试"); return {}; } });
  const validate = state.skuPricingEditor.value.validate;
  state.skuPricingEditor.value.validate = () => null;
  await state.saveSku();
  assert.equal(state.calls.length, 0);
  state.skuPricingEditor.value.validate = validate;
  await state.saveSku();
  assert.equal(state.skuDialogVisible.value, true);
  assert.equal(state.savingSku.value, false);
  assert.match(state.skuSaveError.value, /保存失败/);
  assert.equal(state.skuForm.name, "测试团体票");
  fail = false;
  await state.saveSku();
  assert.equal(state.skuDialogVisible.value, false);
});

test("normal switch explicitly writes null on edit and does not write conference settings", async t => {
  const state = setupConfig(t);
  state.openSku({ id: "existing", name: "普通票", priceCent: 10001, groupPricingJson: rules(), stock: 50, status: "ACTIVE" });
  state.skuPricingEditor.value = { validate: () => ({ priceCent: 10001, groupPricingJson: null }) };
  await state.saveSku();
  assert.equal(state.calls[0].key, "updateSku");
  assert.equal(state.calls[0].args[1].groupPricingJson, null);
  assert.deepEqual(state.calls.map(call => call.key), ["updateSku", "listSkus"]);
});

test("package save sends exact totals and reference cents; table labels never advertise reference cents as package price", async t => {
  const state = setupConfig(t);
  const pricing = packageRules();
  state.skuPricingEditor.value = { validate: () => ({ priceCent: 3333, groupPricingJson: pricing }) };
  await state.saveSku();
  assert.equal(state.calls[0].args[1].priceCent, 3333);
  assert.deepEqual(plain(state.calls[0].args[1].groupPricingJson), pricing);
  const sku = { priceCent: 3333, groupPricingJson: pricing };
  assert.equal(state.skuPriceText(sku), "3 人团 ¥100.01");
  assert.equal(state.skuPricingText(sku), "套餐 · 2 档");
  state.openSku();
  assert.equal(state.skuForm.groupPricingJson, null);
  assert.equal(state.skuForm.priceCent, 0);
});

test("post-save refresh failure does not present a retryable create or replace another conference", async t => {
  const state = setupConfig(t, { listSkus: () => { throw new Error("offline"); } });
  await state.saveSku();
  assert.equal(state.skuDialogVisible.value, false);
  assert.match(state.messages.at(-1), /已保存.*勿重复创建/);
  assert.equal(state.skuSaveError.value, "");
});

test("templates preserve saved-setting validation, responsive dialog and busy protection", () => {
  assert.match(config.template.content, /:group-registration-enabled="conference\?\.groupRegistrationEnabled/);
  assert.match(config.template.content, /width="min\(620px, calc\(100vw - 24px\)\)"/);
  assert.match(config.template.content, /:close-on-press-escape="!savingSku"/);
  assert.match(config.template.content, /:loading="savingSku"/);
  assert.match(editor.template.content, /整单实付.*拒绝下单，不补差价/);
  assert.match(editor.template.content, /全部人员按该档人均价/);
});
