import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";

const require = createRequire(new URL("../../apps/admin/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate } = require("vue/compiler-sfc");
const root = new URL("../../apps/admin/src/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

function load(source, dependencies = {}) {
  const exports = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports, require: (name) => {
      assert.ok(name in dependencies, `Unexpected dependency ${name}`);
      return dependencies[name];
    }
  });
  return exports;
}
const { tableRowNumber } = load(read("utils/table-index.ts"));
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? files(new URL(`${entry.name}/`, directory)) : entry.name.endsWith(".vue") ? [new URL(entry.name, directory)] : []);
}
function nodes(node, tag) {
  return [...(node.tag === tag ? [node] : []), ...(node.children ?? []).flatMap(child => nodes(child, tag))];
}
const bound = (node, name) => node.props.find(prop => prop.type === 7 && prop.arg?.content === name)?.exp?.content;
const attr = (node, name) => node.props.find(prop => prop.type === 6 && prop.name === name)?.value?.content;

test("row numbers start at one, continue across page sizes and tolerate invalid pagination", () => {
  assert.equal(tableRowNumber(0), 1);
  assert.equal(tableRowNumber(19), 20);
  assert.equal(tableRowNumber(0, 2, 20), 21);
  assert.equal(tableRowNumber(0, 2, 50), 51);
  assert.equal(tableRowNumber(4, 3, 100), 205);
  assert.equal(tableRowNumber(0, 0, 0), 1);
  assert.equal(tableRowNumber(0, NaN, Infinity), 1);
  assert.equal(tableRowNumber(0, 1.5, 10), 1);
});

test("every admin data table has exactly one first-position serial column and a local import", () => {
  let count = 0;
  for (const file of files(root)) {
    const source = readFileSync(file, "utf8");
    const { descriptor, errors } = parse(source);
    assert.deepEqual(errors, [], file.pathname);
    const tables = nodes(descriptor.template?.ast ?? {}, "el-table");
    if (!tables.length) continue;
    assert.match(descriptor.scriptSetup.content, /import AdminTableIndex from /, file.pathname);
    assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: file.pathname, id: "admin-index-qa" }).errors, [], file.pathname);
    for (const table of tables) {
      const columns = table.children.filter(node => node.type === 1);
      assert.equal(columns[0].tag, "AdminTableIndex", `${file.pathname}: ${bound(table, "data")}`);
      assert.equal(columns.filter(node => node.tag === "AdminTableIndex").length, 1);
      assert.equal(columns.filter(node => attr(node, "type") === "index").length, 0);
      count += 1;
    }
  }
  assert.ok(count >= 89, `Only ${count} tables checked`);
});

test("serial column delegates to Element Plus index and uses reactive page props", () => {
  const { descriptor } = parse(read("components/AdminTableIndex.vue"));
  const column = nodes(descriptor.template.ast, "el-table-column")[0];
  assert.equal(attr(column, "type"), "index");
  assert.equal(attr(column, "label"), "序号");
  assert.equal(attr(column, "fixed"), "left");
  assert.equal(attr(column, "width"), "72");
  assert.match(descriptor.scriptSetup.content, /tableRowNumber\(index, props.page, props.pageSize\)/);
});

test("all paginated data tables bind their own page and page size, including dialogs", () => {
  const cases = [
    ["components/CouponDistributionDialog.vue", "records", "page", "20"],
    ["pages/members/users.vue", "users", "userPage", "50"],
    ["pages/orders/index.vue", "displayedItems", "page", "pageSize"],
    ["pages/registrations/index.vue", "displayedItems", "page", "pageSize"],
    ["pages/guest-schedules/index.vue", "items", "page", "pageSize"],
    ["pages/system/audit-logs.vue", "items", "page", "pageSize"],
    ["pages/cms/page-manager.vue", "pagedPages", "currentPage", "pageSize"],
    ["pages/mall/orders.vue", "orders", "page", "pageSize"],
    ["pages/mall/products.vue", "products", "page", "pageSize"],
    ...["categories", "skus", "shipments", "afterSales"].map(data => ["pages/mall/workflows.vue", data, "page", "pageSize"]),
    ...[["knowledgeBases", "knowledge"], ["documents", "document"], ["logs", "log"]].map(([data, name]) => ["pages/ai/index.vue", data, `pager.${name}Page`, "pageSize"]),
    ...[["payments", "payment"], ["refunds", "refund"], ["invoices", "invoice"], ["bills", "bill"], ["reconciliationResults", "reconciliation"]].map(([data, name]) => ["pages/finance/index.vue", data, `${name}Filters.page`, `${name}Filters.pageSize`])
  ];
  for (const [file, data, page, size] of cases) {
    const tables = nodes(parse(read(file)).descriptor.template.ast, "el-table").filter(table => bound(table, "data") === data);
    assert.ok(tables.length, `${file}: ${data}`);
    for (const table of tables) {
      const column = table.children.find(node => node.tag === "AdminTableIndex");
      assert.equal(bound(column, "page"), page, `${file}: ${data}`);
      assert.equal(bound(column, "page-size"), size, `${file}: ${data}`);
    }
  }
});

test("nested detail tables restart from one; selection/expand columns and record cards remain", () => {
  for (const file of ["pages/orders/index.vue", "pages/mall/orders.vue", "pages/registrations/index.vue", "pages/registrations/detail.vue"]) {
    for (const table of nodes(parse(read(file)).descriptor.template.ast, "el-table").filter(table => bound(table, "data").startsWith("detail."))) {
      const column = table.children.find(node => node.tag === "AdminTableIndex");
      assert.equal(bound(column, "page"), undefined);
    }
  }
  for (const [file, type] of [["pages/guest-schedules/index.vue", "selection"], ["components/CouponDistributionDialog.vue", "expand"]]) {
    const table = nodes(parse(read(file)).descriptor.template.ast, "el-table")[0];
    assert.equal(attr(table.children.filter(node => node.type === 1)[1], "type"), type);
  }
  for (const file of ["pages/members/detail.vue", "pages/mobile/index.vue"]) {
    assert.match(read(file), /序号 \{\{ tableRowNumber\(index, page, 20\) \}\}/);
  }
});

function setupOrders(handler) {
  const calls = [];
  const script = parse(read("pages/orders/index.vue")).descriptor.scriptSetup.content;
  const { state } = load(`${script}\nexport const state = { page, pageSize, total, items, displayedItems, onlyExceptions, keyword, loading, listError, load, searchOrders };`, {
    vue: { ...vue, onMounted: () => {} },
    "element-plus": { ElMessage: { error: () => {} }, ElMessageBox: {} },
    "../../router": { routeQuery: vue.ref({}), navigateTo: () => {} },
    "../../stores/admin-session": { useAdminSession: () => ({ hasPermission: () => true }) },
    "../../services/admin": { listOrders: async params => { calls.push({ ...params }); return handler(params); } }
  });
  return { ...state, calls };
}
const result = (id, total = 125) => ({ items: [{ id, payableAmountCent: 318000, paidAmountCent: 318000, status: "PAID", paymentStatus: "SUCCESS" }], total });

test("order paging sends server pagination, preserves amounts, and query/page-size changes restart numbering", async () => {
  const state = setupOrders(({ page }) => result(`page-${page}`));
  await state.load();
  assert.equal(state.calls[0].pageSize, 20);
  assert.equal(state.total.value, 125);
  state.page.value = 2;
  await state.load();
  assert.equal(state.items.value[0].id, "page-2");
  assert.equal(tableRowNumber(0, state.page.value, state.pageSize.value), 21);
  assert.equal(state.items.value[0].paidAmountCent, 318000);
  state.keyword.value = "测试订单";
  state.pageSize.value = 50;
  await state.searchOrders();
  assert.equal(state.calls.at(-1).keyword, "测试订单");
  assert.equal(state.calls.at(-1).page, 1);
  assert.equal(state.calls.at(-1).pageSize, 50);
  state.onlyExceptions.value = true;
  assert.equal(state.displayedItems.value.length, 0);
  assert.equal(state.total.value, 125);
});

test("order count shrink returns to an existing last page and empty data shows no rows", async () => {
  const state = setupOrders(({ page }) => result(`page-${page}`, 21));
  state.page.value = 4;
  await state.load();
  assert.deepEqual(state.calls.map(call => call.page), [4, 2]);
  assert.equal(state.page.value, 2);
  assert.equal(state.items.value[0].id, "page-2");
  assert.equal(state.loading.value, false);
  const empty = setupOrders(() => ({ items: [], total: 0 }));
  empty.page.value = 2;
  await empty.load();
  assert.equal(empty.page.value, 1);
  assert.equal(empty.items.value.length, 0);
});

test("late order responses cannot overwrite the current page; failures are not shown as zero matching orders", async () => {
  const pending = [];
  const state = setupOrders(() => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  const first = state.load();
  state.page.value = 2;
  const second = state.load();
  pending[1].resolve(result("latest"));
  await second;
  pending[0].resolve(result("old"));
  await first;
  assert.equal(state.items.value[0].id, "latest");
  const failed = state.load();
  assert.equal(state.items.value.length, 0);
  pending[2].reject(new Error("offline"));
  await failed;
  assert.equal(state.loading.value, false);
  assert.equal(state.listError.value, "订单加载失败，请重试");
  assert.match(read("pages/orders/index.vue"), /listError \? '加载失败'/);
});
