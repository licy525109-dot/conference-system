import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../apps/admin/package.json", import.meta.url));
const vue = require("vue"), ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const filename = new URL("../../apps/admin/src/components/conference/FormFieldImportDialog.vue", import.meta.url);
const { descriptor, errors } = parse(readFileSync(filename, "utf8"));
assert.deepEqual(errors, []);
const names = "conferences, sourceId, sourceFields, selectedIds, selectedFields, loading, saving, searching, searchError, error, allSelected, duplicateCount, close, toggleAll, toggleField, searchConferences, loadSourceFields, submit";
const compiled = ts.transpileModule(`${descriptor.scriptSetup.content}\nexport const state = { ${names} };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const field = (id, extra = {}) => ({ id, fieldKey: id, label: id, type: "TEXT", enabled: true, required: false, ...extra });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
function setup(t, api = {}, permissions = ["conference:view", "conference:write"]) {
  const props = vue.reactive({ modelValue: false, conferenceId: "target", fields: [] });
  const calls = [], emitted = [], messages = [];
  const exports = {};
  let unmount;
  const scope = vue.effectScope();
  const mocks = new Proxy(api, { get(target, key) { return async (...args) => {
    calls.push({ key, args });
    if (target[key]) return target[key](...args);
    if (key === "listConferences") return { items: [{ id: "target" }, { id: "source" }] };
    if (key === "listFormFields") return { items: [field("company"), field("phone")] };
    if (key === "importFormFields") return { items: [field("new")], copiedCount: 1, skippedFieldKeys: [] };
    throw new Error(`Unexpected API: ${String(key)}`);
  }; } });
  scope.run(() => runInNewContext(compiled, {
    exports, Error, defineProps: () => props, defineEmits: () => (...args) => emitted.push(args),
    require(id) {
      if (id === "vue") return { ...vue, onBeforeUnmount: fn => { unmount = fn; } };
      if (id === "element-plus") return { ElMessage: { success: text => messages.push(text) } };
      if (id.endsWith("/services/admin")) return mocks;
      if (id.endsWith("/stores/admin-session")) return { useAdminSession: () => ({ hasPermission: value => permissions.includes(value) }) };
      if (id.endsWith(".vue") || id === "@element-plus/icons-vue") return {};
      throw new Error(`Unexpected import: ${id}`);
    }
  }));
  t.after(() => { unmount(); scope.stop(); });
  props.modelValue = true;
  return { ...exports.state, props, calls, emitted, messages, unmount };
}
async function select(state, id = "source") {
  state.sourceId.value = id;
  await state.loadSourceFields();
}

test("dialog compiles with selectable rows, persistent labels, counts and busy close protection", () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: filename.pathname, id: "field-import" }).errors, []);
  assert.match(descriptor.template.content, /label="来源会议"/);
  assert.match(descriptor.template.content, /:close-on-press-escape="!saving"/);
  assert.match(descriptor.template.content, /<AdminTableIndex/);
});

test("excludes target meeting and defaults to enabled non-conflicting fields", async t => {
  const state = setup(t, { listFormFields: () => ({ items: [field("company"), field("phone"), field("old", { enabled: false })] }) });
  state.props.fields = [field("existing", { fieldKey: "phone", enabled: false })];
  await select(state);
  assert.deepEqual(plain(state.conferences.value), [{ id: "source" }]);
  assert.deepEqual(plain(state.selectedIds.value), ["company"]);
  assert.equal(state.duplicateCount.value, 1);
  state.toggleField("phone", true);
  assert.deepEqual(plain(state.selectedIds.value), ["company"]);
  state.toggleAll(true);
  assert.deepEqual(plain(state.selectedIds.value), ["company", "old"]);
  assert.equal(state.allSelected.value, true);
  state.toggleAll(false);
  assert.equal(state.selectedFields.value.length, 0);
});

for (const rejectOld of [false, true]) test(`source switch ignores stale ${rejectOld ? "error" : "success"}`, async t => {
  const pending = deferred();
  const state = setup(t, { listFormFields: id => id === "first" ? pending.promise : { items: [field("latest")] } });
  const first = select(state, "first");
  await select(state, "second");
  if (rejectOld) pending.reject(new Error("old error"));
  else pending.resolve({ items: [field("stale")] });
  await first;
  assert.deepEqual(plain(state.selectedIds.value), ["latest"]);
  assert.equal(state.error.value, "");
  assert.equal(state.loading.value, false);
});

test("source load error clears previous selection and permits retry", async t => {
  let fail = false;
  const state = setup(t, { listFormFields: async () => { if (fail) throw new Error("internal"); return { items: [field("a")] }; } });
  await select(state);
  fail = true;
  await select(state, "other");
  assert.equal(state.selectedFields.value.length, 0);
  assert.equal(state.sourceFields.value.length, 0);
  assert.match(state.error.value, /加载失败/);
  fail = false;
  await state.loadSourceFields();
  assert.equal(state.selectedFields.value.length, 1);
});

test("search responses cannot restore obsolete meeting choices", async t => {
  const old = deferred();
  const state = setup(t, { listConferences: ({ keyword }) => keyword === "old" ? old.promise : { items: [{ id: "new" }] } });
  const first = state.searchConferences("old");
  await state.searchConferences("new");
  old.resolve({ items: [{ id: "old" }] });
  await first;
  assert.deepEqual(plain(state.conferences.value), [{ id: "new" }]);
});

test("submits only IDs, prevents repeated save and blocks selection/close while busy", async t => {
  const pending = deferred();
  const state = setup(t, { importFormFields: () => pending.promise });
  await select(state);
  state.toggleField("phone", false);
  const first = state.submit();
  await state.submit();
  state.toggleAll(false);
  state.close();
  assert.equal(state.emitted.length, 0);
  assert.deepEqual(plain(state.selectedIds.value), ["company"]);
  const calls = state.calls.filter(item => item.key === "importFormFields");
  assert.equal(calls.length, 1);
  assert.deepEqual(plain(calls[0].args), ["target", { sourceConferenceId: "source", fieldIds: ["company"] }]);
  pending.resolve({ items: [field("copied")], copiedCount: 1, skippedFieldKeys: ["phone"] });
  await first;
  assert.deepEqual(plain(state.emitted), [["imported", "target", [field("copied")]], ["update:modelValue", false]]);
  assert.match(state.messages[0], /已引用 1 项字段.*1 项已存在/);
});

test("failed import retains selection and can retry", async t => {
  let fail = true;
  const state = setup(t, { importFormFields: async () => { if (fail) throw new Error("Retry import"); return { items: [], copiedCount: 0, skippedFieldKeys: ["company", "phone"] }; } });
  await select(state);
  await state.submit();
  assert.equal(state.error.value, "Retry import");
  assert.equal(state.selectedFields.value.length, 2);
  assert.equal(state.saving.value, false);
  fail = false;
  await state.submit();
  assert.equal(state.emitted[0][0], "imported");
});

for (const action of ["close", "target", "unmount"]) test(`${action} invalidates pending import result`, async t => {
  const pending = deferred();
  const state = setup(t, { importFormFields: () => pending.promise });
  await select(state);
  const task = state.submit();
  if (action === "close") state.props.modelValue = false;
  if (action === "target") state.props.conferenceId = "new-target";
  if (action === "unmount") state.unmount();
  pending.resolve({ items: [field("old-target-field")], copiedCount: 1, skippedFieldKeys: [] });
  await task;
  assert.equal(state.emitted.length, 0);
  assert.equal(state.messages.length, 0);
});

test("read-only role cannot search or submit, and empty selections do not submit", async t => {
  const readOnly = setup(t, {}, ["conference:view"]);
  await select(readOnly);
  await readOnly.submit();
  assert.equal(readOnly.calls.length, 0);
  const state = setup(t);
  await select(state);
  state.toggleAll(false);
  await state.submit();
  assert.equal(state.calls.some(item => item.key === "importFormFields"), false);
});
