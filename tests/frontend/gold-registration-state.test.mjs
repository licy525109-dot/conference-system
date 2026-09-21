import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../apps/admin/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const filename = new URL("../../apps/admin/src/pages/registrations/index.vue", import.meta.url);
const source = readFileSync(filename, "utf8");
const { descriptor, errors } = parse(source);
assert.deepEqual(errors, []);

// Exercise the page's actual setup code with real Vue reactivity and isolated API doubles.
// These are state/contract checks, not a substitute for the main agent's browser QA.
const exposed = [
  "items", "displayedItems", "detail", "selectedId", "detailLoading", "detailError", "detailTab",
  "remark", "remarkSaving", "checkingInId", "loading", "listError", "total", "page",
  "keyword", "conferenceId", "registrationStatus", "checkInStatus", "appliedFilters",
  "complimentaryForm", "complimentarySkus", "skuLoading", "users", "usersLoading",
  "formFields", "openDetail", "closeDetail", "load", "saveRemark", "checkIn",
  "removeRegistration", "exportExcel", "loadComplimentarySkus", "loadUsersForSelection",
  "openComplimentary", "saveComplimentary", "progressText", "checkInTone", "sourceText",
  "accountName", "canCleanupTestData", "cleanCurrentConferenceTestData", "selectRow"
];
const compiled = ts.transpileModule(`${descriptor.scriptSetup.content}\nexport const state = { ${exposed.join(", ")} };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function setup(t, api = {}, permissions = ["*"], box = {}) {
  const calls = [];
  const messages = [];
  let unmount;
  const exports = {};
  const scope = vue.effectScope();
  const apiMock = new Proxy(api, {
    get(target, key) {
      return async (...args) => {
        calls.push({ key, args });
        if (target[key]) return target[key](...args);
        if (key === "listRegistrations") return { items: [], total: 0 };
        if (key === "listConferences" || key === "listUsers") return { items: [] };
        throw new Error(`Unexpected API call: ${String(key)}`);
      };
    }
  });
  scope.run(() => runInNewContext(compiled, {
    exports,
    Error,
    require(id) {
      if (id === "vue") return { ...vue, onMounted() {}, onBeforeUnmount(fn) { unmount = fn; } };
      if (id === "element-plus") return {
        ElMessage: Object.fromEntries(["success", "warning", "error", "info"].map(tone => [tone, text => messages.push({ tone, text })])),
        ElMessageBox: { confirm: async () => {}, ...box }
      };
      if (id.endsWith("/services/admin")) return apiMock;
      if (id.endsWith("/stores/admin-session")) return { useAdminSession: () => ({ hasPermission: permission => permissions.includes("*") || permissions.includes(permission) }) };
      if (id.endsWith("/router")) return { navigateTo: (...args) => calls.push({ key: "navigateTo", args }) };
      if (id === "@element-plus/icons-vue" || id.endsWith(".vue")) return {};
      throw new Error(`Unexpected import: ${id}`);
    }
  }));
  t.after(() => { unmount(); scope.stop(); });
  return { ...exports.state, calls, messages, unmount };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function registration(id, overrides = {}) {
  return {
    id, registrationNo: `registration-${id}`, attendeeName: `attendee-${id}`, phone: "test-phone",
    conferenceTitle: "Test conference", skuName: "Test ticket", status: "CONFIRMED",
    source: "PAYMENT", complimentary: false, user: { id: `account-${id}`, nickname: `submitter-${id}` },
    orderNo: `order-${id}`, paidAmountCent: 12000, attendeeCount: 1, adminRemark: null,
    checkInProgress: { total: 1, checkedIn: 0, pending: 1, notRequired: 0 },
    attendees: [{ id: `attendee-${id}`, name: `attendee-${id}`, checkInStatus: "PENDING" }],
    formDataJson: { name: `attendee-${id}` },
    order: { orderNo: `order-${id}`, status: "PAID", paidAmountCent: 12000, payments: [] },
    ...overrides
  };
}

test("template compiles: inline details follow table, attendee leads, real links and conditional tabs remain", () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: filename.pathname, id: "gold-registration" }).errors, []);
  const template = descriptor.template.content;
  assert.ok(template.indexOf('label="实际参会人"') < template.indexOf('label="提交账号 / 邀请关联账号"'));
  assert.ok(template.indexOf('id="registration-inline-detail"') > template.indexOf("</el-table>"));
  assert.match(template, /<button class="attendee-button"[^>]+:aria-expanded/);
  assert.doesNotMatch(template, /v-model="detailVisible"|status="PAID"|本人报名|他人代报/);
  assert.match(template, /v-if="detail\.order\.payments\.length"/);
  assert.match(template, /v-if="formFields\.length"/);
  assert.match(template, /navigateTo\('\/registrations\/detail'/);
  assert.match(template, /navigateTo\('\/orders', \{ orderNo: detail\.order\.orderNo \}\)/);
  assert.match(template, /hasPermission\('member:view'\)/);
  assert.match(template, /hasPermission\('checkin:write'\)/);
  assert.match(template, /hasPermission\('registration:write'\)/);
  assert.match(template, /:status="detail\.order\.status"/);
  assert.match(template, /label="受邀 · 免支付"/);
  assert.equal(descriptor.styles.length, 1);
  assert.equal(descriptor.styles[0].scoped, true);
});

test("readable local typography keeps main and inline tables width-bounded", () => {
  const css = descriptor.styles[0].content;
  const rules = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `Missing scoped rule: ${selector}`);
    return match[1];
  };
  assert.match(rules(".registration-page.admin-page"), /font-size: 16px/);
  assert.match(rules(".attendee-button"), /font-size: 16px/);
  assert.match(rules(".cell-secondary"), /font-size: 14px/);
  assert.match(rules(".inline-detail"), /font-size: 16px/);
  assert.match(rules(".inline-detail"), /max-width: 100%/);
  assert.match(rules(".registration-table"), /overflow-x: auto/);
  assert.match(rules(".registration-table"), /max-width: 100%/);
  assert.match(rules(".inline-detail :deep(.el-table)"), /max-width: 100%/);
  assert.match(rules(".inline-detail :deep(.el-table)"), /font-size: 16px/);
  assert.match(rules(".detail-tabs :deep(.el-tab-pane)"), /min-width: 0/);
});

test("newest selection wins over stale success and keeps inline navigation", async t => {
  const old = deferred();
  const state = setup(t, { getRegistration: id => id === "a" ? old.promise : registration(id) });
  const first = state.openDetail("a");
  assert.equal(state.detailLoading.value, true);
  await state.openDetail("b");
  state.remark.value = "unsaved draft";
  old.resolve(registration("a"));
  await first;
  await state.openDetail("b");
  assert.equal(state.detail.value.id, "b");
  assert.equal(state.remark.value, "unsaved draft");
  assert.equal(state.detailLoading.value, false);
  assert.equal(state.calls.filter(call => call.key === "navigateTo").length, 0);
});

test("stale failure cannot replace current detail; current error is retryable", async t => {
  const old = deferred();
  let fail = true;
  const state = setup(t, { getRegistration: id => id === "a" ? old.promise : fail ? Promise.reject(new Error("detail unavailable")) : registration(id) });
  const first = state.openDetail("a");
  await state.openDetail("b");
  assert.equal(state.detailError.value, "detail unavailable");
  assert.equal(state.detail.value, null);
  fail = false;
  await state.openDetail("b");
  old.reject(new Error("stale error"));
  await first;
  assert.equal(state.detail.value.id, "b");
  assert.equal(state.detailError.value, "");
});

test("closing or unmounting invalidates in-flight details", async t => {
  const pending = deferred();
  const state = setup(t, { getRegistration: () => pending.promise });
  const task = state.openDetail("a");
  state.closeDetail();
  state.unmount();
  pending.resolve(registration("a"));
  await task;
  assert.equal(state.selectedId.value, "");
  assert.equal(state.detail.value, null);
  assert.equal(state.detailLoading.value, false);
});

test("newest list query wins, preserves actual total, and does not show stale rows on error", async t => {
  const old = deferred();
  const state = setup(t, { listRegistrations: ({ keyword }) => keyword === "a" ? old.promise : keyword === "error" ? Promise.reject(new Error("list unavailable")) : { items: [registration("b")], total: 41 } });
  state.keyword.value = "a";
  const first = state.load();
  state.keyword.value = "b";
  await state.load();
  old.reject(new Error("old query"));
  await first;
  assert.equal(state.items.value[0].id, "b");
  assert.equal(state.total.value, 41);
  assert.equal(state.loading.value, false);
  assert.equal(state.listError.value, "");
  state.keyword.value = "error";
  await state.load();
  assert.equal(state.items.value.length, 0);
  assert.equal(state.listError.value, "list unavailable");
});

test("deleting last page results reloads valid page", async t => {
  const state = setup(t, { listRegistrations: ({ page }) => ({ items: page === 1 ? [registration("a")] : [], total: 1 }) });
  state.page.value = 2;
  await state.load();
  assert.equal(state.page.value, 1);
  assert.equal(state.items.value[0].id, "a");
  assert.equal(state.loading.value, false);
});

test("remark response stays with originating registration after selection changes", async t => {
  const save = deferred();
  const state = setup(t, {
    getRegistration: id => registration(id), updateRegistrationRemark: () => save.promise,
    listRegistrations: () => ({ items: [registration("a"), registration("b")], total: 2 })
  });
  await state.openDetail("a");
  state.remark.value = "note for a";
  const task = state.saveRemark();
  await state.openDetail("b");
  save.resolve(registration("a", { adminRemark: "note for a" }));
  await task;
  assert.equal(state.detail.value.id, "b");
  assert.equal(state.remark.value, "");
  assert.equal(state.remarkSaving.value, false);
  assert.equal(state.calls.find(call => call.key === "updateRegistrationRemark").args[0], "a");
});

test("failed remark saves retain editable draft and clear busy state", async t => {
  const state = setup(t, { getRegistration: id => registration(id), updateRegistrationRemark: () => Promise.reject(new Error("save failed")) });
  await state.openDetail("a");
  state.remark.value = "keep this draft";
  await state.saveRemark();
  assert.equal(state.remark.value, "keep this draft");
  assert.equal(state.remarkSaving.value, false);
  assert.equal(state.messages.at(-1).text, "save failed");
});

test("manual check-in stays attached to confirmed attendee across a selection change", async t => {
  const pending = deferred();
  const state = setup(t, {
    getRegistration: id => registration(id), manualCheckin: () => pending.promise,
    listRegistrations: () => ({ items: [registration("a"), registration("b")], total: 2 })
  });
  await state.openDetail("a");
  const task = state.checkIn("attendee-a");
  await Promise.resolve();
  await state.openDetail("b");
  pending.resolve({});
  await task;
  assert.equal(state.calls.find(call => call.key === "manualCheckin").args[0].attendeeId, "attendee-a");
  assert.equal(state.detail.value.id, "b");
  assert.equal(state.checkingInId.value, "");
});

test("write permissions, refund state, and cleanup dual permissions are enforced", async t => {
  const readOnly = setup(t, { getRegistration: id => registration(id) }, ["registration:view"]);
  await readOnly.openDetail("a");
  await readOnly.saveRemark();
  await readOnly.checkIn("attendee-a");
  await readOnly.removeRegistration(registration("a"));
  await readOnly.openComplimentary();
  await readOnly.saveComplimentary();
  await readOnly.loadUsersForSelection();
  await readOnly.cleanCurrentConferenceTestData();
  assert.equal(readOnly.calls.length, 1);
  assert.equal(readOnly.canCleanupTestData.value, false);
  const refunded = setup(t, { getRegistration: id => registration(id, { status: "REFUNDED" }) });
  await refunded.openDetail("a");
  await refunded.checkIn("attendee-a");
  assert.equal(refunded.calls.length, 1);
});

test("delete confirmation cancellation does not issue a destructive API call", async t => {
  const state = setup(t, {}, ["*"], { confirm: async () => { throw "cancel"; } });
  await state.removeRegistration(registration("a"));
  assert.equal(state.calls.length, 0);
  assert.equal(state.messages.length, 0);
});

test("check-in filtering matches any actual attendee and clears hidden selection", async t => {
  const mixed = registration("mixed", { checkInProgress: { total: 3, checkedIn: 1, pending: 1, notRequired: 1 } });
  const empty = registration("empty", { checkInProgress: { total: 0, checkedIn: 0, pending: 0, notRequired: 0 } });
  const state = setup(t, { getRegistration: id => registration(id) });
  state.items.value = [mixed, empty];
  await state.openDetail("empty");
  for (const status of ["CHECKED_IN", "PENDING", "NOT_REQUIRED"]) {
    state.checkInStatus.value = status;
    await vue.nextTick();
    assert.equal(state.displayedItems.value.length, 1);
    assert.equal(state.displayedItems.value[0].id, "mixed");
  }
  assert.equal(state.selectedId.value, "");
  assert.equal(state.progressText(registration("x", { status: "REFUNDED" })), "已退款");
  assert.equal(state.progressText(registration("x", { status: "CANCELLED" })), "已取消");
  assert.equal(state.checkInTone(registration("x", { status: "REFUNDED" })), "neutral");
});

test("export uses applied query plus check-in filter, never an unsupported paid filter", async t => {
  const state = setup(t, { exportRegistrationsExcel: () => {} });
  state.appliedFilters.value = { keyword: "applied", conferenceId: "conference-a", status: "REFUNDED" };
  state.keyword.value = "not submitted";
  state.checkInStatus.value = "NOT_REQUIRED";
  await state.exportExcel();
  const params = state.calls[0].args[0];
  assert.equal(params.keyword, "applied");
  assert.equal(params.conferenceId, "conference-a");
  assert.equal(params.status, "REFUNDED");
  assert.equal(params.checkInStatus, "NOT_REQUIRED");
  assert.equal("paymentStatus" in params, false);
});

test("complimentary SKU requests cannot select a ticket from the previous conference", async t => {
  const first = deferred();
  const state = setup(t, { listSkus: id => id === "a" ? first.promise : { items: [{ id: "sku-b" }] } });
  state.complimentaryForm.conferenceId = "a";
  const task = state.loadComplimentarySkus();
  state.complimentaryForm.conferenceId = "b";
  await state.loadComplimentarySkus();
  first.resolve({ items: [{ id: "sku-a" }] });
  await task;
  assert.equal(state.complimentaryForm.skuId, "sku-b");
  assert.equal(state.skuLoading.value, false);
});

test("form labels come from real snapshot; attendee is never used as account fallback", async t => {
  const state = setup(t);
  state.detail.value = registration("a", {
    formDataJson: { company: "Example", dietary: ["one", "two"] },
    order: { registrationSnapshotJson: { fields: [{ key: "company", label: "单位" }] } }
  });
  assert.equal(state.formFields.value[0].label, "单位");
  assert.equal(state.formFields.value[1].value, "one、two");
  assert.equal(state.accountName(registration("a", { user: null })), "未关联账号");
  assert.equal(state.accountName(registration("a")), "submitter-a");
  assert.equal(state.sourceText(registration("a", { complimentary: true })), "主办方邀请");
});
