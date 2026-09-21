import assert from "node:assert/strict";
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../apps/admin/package.json", import.meta.url));
const vue = require("vue");
const ts = require("typescript");
const { parse, compileTemplate, compileStyle } = require("vue/compiler-sfc");
const filename = new URL("../../apps/admin/src/layouts/AdminLayout.vue", import.meta.url);
const { descriptor, errors } = parse(readFileSync(filename, "utf8"));
assert.deepEqual(errors, []);
const css = readFileSync(new URL("../../apps/admin/src/styles.css", import.meta.url), "utf8");

function evaluate(source, modules, window) {
  const exports = {};
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  runInNewContext(code, { exports, require: id => modules[id], window, document: { activeElement: null, querySelector: () => null } });
  return exports;
}

const { routes } = evaluate(readFileSync(new URL("../../apps/admin/src/router/index.ts", import.meta.url), "utf8"), { vue }, { location: { hash: "#/dashboard" } });
const exposed = "countVisibleGroups, menuGroups, visibleMenuGroups, overflowMenuGroups, visibleGroupCount, isOverflowGroupActive, menuGroupOrder, menuRouteOrder, menuRouteVisibility, menuSettingsVisible, saveMenuOrder, setRouteVisibility";

function setup(t, permissions = ["*"], storage = new Map()) {
  const scope = vue.effectScope();
  const currentRoute = vue.ref(routes.find(route => route.path === "/dashboard"));
  const window = { localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  let state;
  scope.run(() => {
    state = evaluate(`${descriptor.scriptSetup.content}\nexport const state = { ${exposed} };`, {
      vue: { ...vue, onMounted() {}, onBeforeUnmount() {} },
      "@element-plus/icons-vue": {},
      "../router": { routes, currentRoute, navigateTo() {} },
      "../services/admin": {},
      "../stores/admin-session": { useAdminSession: () => ({ admin: vue.ref(null), hasPermission: permission => !permission || permissions.includes("*") || permissions.includes(permission), logout() {} }) }
    }, window).state;
  });
  t.after(() => scope.stop());
  return { ...state, currentRoute, storage };
}

test("single-row navigation and hidden non-focusable measurement compile", () => {
  assert.deepEqual(compileTemplate({ source: descriptor.template.content, filename: filename.pathname, id: "gold-nav" }).errors, []);
  for (const style of descriptor.styles) assert.deepEqual(compileStyle({ source: style.content, filename: filename.pathname, scoped: style.scoped, id: "gold-nav" }).errors, []);
  assert.match(descriptor.template.content, /class="admin-nav-measure" aria-hidden="true" inert/);
  assert.match(descriptor.template.content, /aria-label="更多导航"/);
  assert.match(css, /\.admin-primary-navigation\s*\{[^}]*flex-wrap: nowrap/);
  assert.match(css, /\.admin-topbar\s*\{[^}]*height: 64px;[^}]*max-height: 64px/);
  assert.doesNotMatch(css, /letter-spacing\s*:\s*-/);
});

test("fitting reserves More width only when necessary, including exact fits", t => {
  const { countVisibleGroups: fit } = setup(t);
  assert.equal(fit(300, [100, 100, 100], 80), 3);
  assert.equal(fit(299, [100, 100, 100], 80), 2);
  assert.equal(fit(279, [100, 100, 100], 80), 1);
  assert.equal(fit(90, [100, 100, 100], 80), 0);
  assert.equal(fit(0, [100, 100], 80), 0);
  assert.equal(fit(400, [], 80), 0);
  for (let width = 90; width < 1600; width += 7) {
    const widths = [72, 84, 84, 84, 84, 98, 86, 84, 56, 84, 84, 84, 84];
    const count = fit(width, widths, 82);
    const used = widths.slice(0, count).reduce((a, b) => a + b, 0) + (count < widths.length ? 82 : 0);
    assert.ok(used <= width, `overflow at ${width}px`);
  }
});

test("all permitted groups partition without loss and overflow preserves active state", t => {
  const s = setup(t);
  assert.equal(s.menuGroups.value.length, 13);
  for (let count = 0; count <= 13; count++) {
    s.visibleGroupCount.value = count;
    assert.deepEqual(Array.from([...s.visibleMenuGroups.value, ...s.overflowMenuGroups.value], group => group.name), Array.from(s.menuGroups.value, group => group.name));
  }
  s.visibleGroupCount.value = 8;
  s.currentRoute.value = routes.find(route => route.path === "/system/audit-logs");
  assert.equal(s.isOverflowGroupActive.value, true);
  const limited = setup(t, ["registration:view"]);
  assert.deepEqual(Array.from(limited.menuGroups.value.flatMap(group => group.items), route => route.path).sort(), ["/mobile", "/registrations"]);
  assert.equal(setup(t, []).menuGroups.value.length, 0);
});

test("saved group order and route visibility survive reload and still partition", t => {
  const s = setup(t);
  s.menuSettingsVisible.value = true;
  s.menuGroupOrder["系统管理"] = 0;
  s.menuGroupOrder["控制台"] = 999;
  s.setRouteVisibility(routes.find(route => route.path === "/conferences"), false);
  s.saveMenuOrder();
  const reload = setup(t, ["*"], s.storage);
  assert.equal(reload.menuGroups.value[0].name, "系统管理");
  assert.equal(reload.menuGroups.value.at(-1).name, "控制台");
  assert.equal(reload.menuGroups.value.flatMap(group => group.items).some(route => route.path === "/conferences"), false);
  reload.visibleGroupCount.value = 4;
  assert.equal(reload.visibleMenuGroups.value.length + reload.overflowMenuGroups.value.length, 13);
});

const previewUrl = process.env.ADMIN_NAV_PREVIEW_URL;
test("runtime: desktop More, 64px header, keyboard resize, persistence and mobile access", { skip: !previewUrl, timeout: 90_000 }, async t => {
  const rootRequire = createRequire(new URL("../../package.json", import.meta.url));
  const { chromium, expect } = rootRequire("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  await page.route("**/api/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    let data = { items: [], total: 0 };
    if (pathname.endsWith("/admin/auth/me")) data = { admin: { id: "nav-test", username: "nav-test", displayName: "导航测试", permissions: ["*"] } };
    if (pathname.endsWith("/admin/theme")) data = { config: { adminBrandTitle: "观潮会集" } };
    await route.fulfill({ json: { code: "OK", data } });
  });
  await page.addInitScript(() => localStorage.setItem("conference_admin_token", "isolated-navigation-test"));
  await page.goto(`${previewUrl}/#/system/audit-logs`);
  const nav = page.locator(".admin-primary-navigation");
  const directLinks = nav.locator(":scope > a");
  const more = page.getByRole("button", { name: "更多导航" });
  await expect.poll(() => directLinks.count()).toBeGreaterThan(0);
  await expect(more).toBeVisible();

  for (const width of [1920, 1440, 1280, 1024, 768]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => page.locator(".admin-topbar").evaluate(el => el.getBoundingClientRect().height)).toBe(64);
    await expect.poll(() => nav.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return Array.from(el.querySelectorAll(":scope > a, :scope > .admin-nav-more")).every(item => {
        const box = item.getBoundingClientRect();
        return box.top === bounds.top && box.bottom <= bounds.bottom + 1 && box.right <= bounds.right + 1;
      });
    })).toBe(true);
    const count = await directLinks.count();
    if (count < 13) {
      await more.click();
      await expect(page.locator(".admin-nav-overflow:visible .el-dropdown-menu__item")).toHaveCount(13 - count);
      await page.keyboard.press("Escape");
    } else await expect(more).toBeHidden();
  }

  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect(directLinks).toHaveCount(13);
  await directLinks.last().focus();
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(more).toBeFocused();
  await more.press("Enter");
  await expect(page.locator(".admin-nav-overflow:visible")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  await page.setViewportSize({ width: 1920, height: 1000 });
  await expect(more).toBeHidden();
  await expect.poll(() => nav.evaluate(el => Array.from(el.querySelectorAll(":scope > a")).includes(document.activeElement))).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(more).toBeVisible();
  await expect(more).toHaveClass(/is-active/);
  const artifacts = new URL("../../output/playwright/", import.meta.url);
  mkdirSync(artifacts, { recursive: true });
  await page.screenshot({ path: new URL("gold-admin-nav-p2-desktop.png", artifacts).pathname });
  await more.click();
  await page.getByRole("menuitem", { name: "系统管理", exact: true }).press("Enter");
  await expect(page.locator(".admin-nav-overflow:visible")).toHaveCount(0);

  await page.getByRole("button", { name: "菜单配置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "菜单顺序配置" });
  await settings.locator(".menu-order-item").filter({ hasText: "系统管理" }).locator("input").fill("0");
  await settings.locator(".menu-order-item").filter({ hasText: "控制台" }).locator("input").fill("999");
  await settings.getByRole("button", { name: "保存", exact: true }).click();
  await page.reload();
  await expect(directLinks.first()).toHaveText("系统管理");
  await expect.poll(() => page.locator(".admin-topbar").evaluate(el => el.getBoundingClientRect().height)).toBe(64);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(nav).toBeHidden();
  await expect(page.locator(".admin-topbar")).toHaveCSS("height", "56px");
  await page.locator(".mobile-navigation .el-select").click();
  await page.getByRole("option", { name: "手机工作台", exact: true }).click();
  await expect(page).toHaveURL(/#\/mobile$/);
  await expect(page.locator(".mobile-workspace")).toBeVisible();
  await page.screenshot({ path: new URL("gold-admin-nav-p2-mobile.png", artifacts).pathname });
  assert.deepEqual(browserErrors, []);
});
