import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { createServer } from "vite";

const require = createRequire(import.meta.url);
const { chromium, expect } = require("@playwright/test");
const root = fileURLToPath(new URL("../../../../../", import.meta.url));
const output = `${root}output/playwright/group-ticket-pricing`;

test("admin group pricing edits, validation, save recovery and desktop/mobile layout", { timeout: 300000 }, async t => {
  process.env.VITE_API_BASE_URL = "http://127.0.0.1:3998/api";
  const server = await createServer({ root: `${root}apps/admin`, server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
  await server.listen();
  t.after(() => server.close());
  const browser = await chromium.launch();
  t.after(() => browser.close());
  const address = server.httpServer.address();
  const url = `http://127.0.0.1:${address.port}`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const page = await context.newPage();
  const errors = [], writes = [];
  let failSave = false, delaySave = false, releaseSave;
  page.on("pageerror", error => errors.push(error.message));
  const conference = {
    id: "group-ui-fixture", title: "团体票本地测试", slug: "group-ui-fixture", subtitle: "", status: "DRAFT",
    startAt: "2027-01-01T01:00:00Z", endAt: "2027-01-01T10:00:00Z", checkInEnabled: false,
    checkInMethods: [], checkInFieldBindings: {}, groupRegistrationEnabled: true, maxTicketsPerOrder: 100,
    contentJson: {}, styleJson: null
  };
  let sku = {
    id: "sku-group", conferenceId: conference.id, name: "标准团体票", description: "", priceCent: 10001,
    stock: 200, lockedStock: 0, soldCount: 0, status: "ACTIVE",
    groupPricingJson: { version: 1, minQuantity: 3, minPayableAmountCent: 0, tiers: [{ minQuantity: 5, unitPriceCent: 8001 }] }
  };
  await context.addInitScript(() => localStorage.setItem("conference_admin_token", "synthetic-group-ui-only"));
  await page.route("**/*", async route => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    if (requestUrl.origin === url) return route.continue();
    if (requestUrl.origin !== "http://127.0.0.1:3998") return route.abort();
    const path = requestUrl.pathname;
    const ok = data => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ code: "OK", data }) });
    if (path === "/api/admin/auth/me") return ok({ admin: { id: "local-ui", username: "local-ui", displayName: "本地验收", permissions: ["conference:view", "conference:write"] } });
    if (request.method() === "GET") {
      if (path === "/api/admin/conferences") return ok({ items: [conference], total: 1 });
      if (path === `/api/admin/conferences/${conference.id}`) return ok(conference);
      if (path.endsWith("/skus")) return ok({ items: [sku] });
      return ok({ items: [], total: 0 });
    }
    writes.push({ path, body: request.postDataJSON() });
    if (path === `/api/admin/skus/${sku.id}` || path === `/api/admin/conferences/${conference.id}/skus`) {
      if (delaySave) await new Promise(resolve => { releaseSave = resolve; });
      if (failSave) return route.fulfill({ status: 400, contentType: "application/json", body: JSON.stringify({ code: "ERROR", message: "模拟保存失败，请重试" }) });
      sku = { ...sku, ...request.postDataJSON() };
      return ok(sku);
    }
    return route.abort();
  });
  await mkdir(output, { recursive: true });
  async function openEditor() {
    await page.goto(`${url}/#/conferences/config?id=${conference.id}`);
    await page.reload();
    await page.getByRole("tab", { name: "票种配置" }).click();
    await page.getByRole("button", { name: "编辑", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "编辑票种" })).toBeVisible();
  }
  await openEditor();
  const dialog = page.getByRole("dialog", { name: "编辑票种" });
  await expect(dialog.getByLabel("基础单价（元/人）", { exact: true })).toHaveValue("100.01");
  await expect(dialog.getByLabel("第 1 档人均价（元/人）", { exact: true })).toHaveValue("80.01");
  await dialog.getByRole("button", { name: "添加阶梯" }).click();
  await dialog.getByLabel("第 2 档人数", { exact: true }).fill("5");
  await dialog.getByLabel("第 2 档人均价（元/人）", { exact: true }).fill("90");
  await dialog.getByLabel("订单最低实付（元）", { exact: true }).fill("1.005");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toContainText("阶梯人数须递增且不能重复");
  await expect(dialog).toContainText("不能高于基础单价或上一档人均价");
  assert.equal(writes.length, 0);
  await page.screenshot({ path: `${output}/desktop-validation.png`, fullPage: true });
  await page.setViewportSize({ width: 320, height: 844 });
  await dialog.getByLabel("第 2 档人均价（元/人）", { exact: true }).scrollIntoViewIfNeeded();
  assert.equal(await dialog.evaluate(element => element.scrollWidth > element.clientWidth + 1), false);
  await page.screenshot({ path: `${output}/mobile-validation-320.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.getByLabel("第 2 档人数", { exact: true }).fill("10");
  await dialog.getByLabel("第 2 档人均价（元/人）", { exact: true }).fill("70.29");
  await dialog.getByLabel("订单最低实付（元）", { exact: true }).fill("200.01");
  await page.screenshot({ path: `${output}/desktop-editor.png`, fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await dialog.getByLabel("第 2 档人均价（元/人）", { exact: true }).scrollIntoViewIfNeeded();
    const layout = await dialog.evaluate(element => {
      const rect = element.getBoundingClientRect();
      const fields = [...element.querySelectorAll(".el-form-item")].map(field => {
        const label = field.querySelector(".el-form-item__label")?.getBoundingClientRect();
        const input = field.querySelector(".el-input")?.getBoundingClientRect();
        return !label || !input || label.bottom <= input.top + 1;
      });
      return { left: rect.left, right: rect.right, width: window.innerWidth, overflow: element.scrollWidth > element.clientWidth + 1, fields };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width, JSON.stringify(layout));
    assert.equal(layout.overflow, false);
    assert.ok(layout.fields.every(Boolean), "form labels must not overlap inputs");
    await page.screenshot({ path: `${output}/mobile-${width}.png`, fullPage: true });
    await dialog.getByLabel("基础单价（元/人）", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/mobile-${width}-top.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  failSave = true;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toContainText("模拟保存失败，请重试");
  await expect(dialog.getByLabel("第 2 档人均价（元/人）", { exact: true })).toHaveValue("70.29");
  failSave = false;
  delaySave = true;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => writes.length).toBe(2);
  await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  releaseSave();
  delaySave = false;
  await expect(dialog).toBeHidden();
  assert.deepEqual(writes[1].body.groupPricingJson, { version: 1, minQuantity: 3, minPayableAmountCent: 20001, tiers: [{ minQuantity: 5, unitPriceCent: 8001 }, { minQuantity: 10, unitPriceCent: 7029 }] });
  assert.equal(writes[1].body.priceCent, 10001);
  await expect(page.getByRole("tabpanel", { name: "票种配置" })).toContainText("团体 · 3 人起");
  console.log("Per-person pricing, validation and busy-save checks passed");

  await openEditor();
  await dialog.getByText("普通票", { exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "普通票", exact: true })).toBeChecked();
  await expect(dialog.getByLabel("最低人数", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  assert.equal(writes.at(-1).body.groupPricingJson, null);
  await openEditor();
  await dialog.getByText("团体票", { exact: true }).click();
  await expect(dialog.getByLabel("最低人数", { exact: true })).toHaveValue("2");
  await expect(dialog.locator(".pricing-tier")).toHaveCount(0);

  const groupMode = dialog.getByRole("radiogroup", { name: "团体计价", exact: true });
  await groupMode.getByText("固定人数套餐", { exact: true }).click();
  await expect(dialog.getByLabel("基础单价（元/人）", { exact: true })).toHaveCount(0);
  await expect(dialog.getByLabel("最低人数", { exact: true })).toHaveCount(0);
  await expect(dialog).toContainText("仅可选择已配置的人数");
  await dialog.getByLabel("第 1 档固定人数", { exact: true }).fill("3");
  await dialog.getByLabel("第 1 档整团总价（元）", { exact: true }).fill("100.01");
  await dialog.getByRole("button", { name: "添加套餐", exact: true }).click();
  await dialog.getByLabel("第 2 档固定人数", { exact: true }).fill("3");
  await dialog.getByLabel("第 2 档整团总价（元）", { exact: true }).fill("0.02");
  await dialog.getByLabel("订单最低实付（元）", { exact: true }).fill("100.02");
  const beforeInvalidPackage = writes.length;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toContainText("套餐人数须递增且不能重复");
  await expect(dialog).toContainText("整团总价须保证每人至少 0.01 元");
  await expect(dialog).toContainText("套餐总额不能低于订单最低实付");
  assert.equal(writes.length, beforeInvalidPackage);
  await page.setViewportSize({ width: 320, height: 844 });
  await dialog.getByLabel("第 2 档整团总价（元）", { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/package-validation-320.png`, fullPage: true });
  await dialog.getByRole("button", { name: "删除第 2 档套餐", exact: true }).click();
  await expect(dialog.locator(".pricing-package")).toHaveCount(1);
  await dialog.getByRole("button", { name: "添加套餐", exact: true }).click();
  await dialog.getByLabel("第 2 档固定人数", { exact: true }).fill("5");
  await dialog.getByLabel("第 2 档整团总价（元）", { exact: true }).fill("150.01");
  await dialog.getByLabel("订单最低实付（元）", { exact: true }).fill("80");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width > 1000 ? 1000 : 844 });
    await groupMode.scrollIntoViewIfNeeded();
    const layout = await dialog.locator(".el-dialog").evaluate(element => {
      const rect = element.getBoundingClientRect();
      const overlap = [...element.querySelectorAll(".el-form-item")].some(field => {
        const label = field.querySelector(".el-form-item__label")?.getBoundingClientRect();
        const input = field.querySelector(".el-input")?.getBoundingClientRect();
        return label && input && label.bottom > input.top + 1;
      });
      return { left: rect.left, right: rect.right, width: window.innerWidth, overflow: element.scrollWidth > element.clientWidth + 1, overlap };
    });
    assert.ok(layout.left >= 0 && layout.right <= layout.width, JSON.stringify(layout));
    assert.equal(layout.overflow, false);
    assert.equal(layout.overlap, false);
    await page.screenshot({ path: `${output}/package-${width}.png`, fullPage: true });
  }
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  const savedPackage = { version: 1, mode: "PACKAGE", minQuantity: 3, minPayableAmountCent: 8000, tiers: [], packages: [{ quantity: 3, totalAmountCent: 10001 }, { quantity: 5, totalAmountCent: 15001 }] };
  assert.deepEqual(writes.at(-1).body.groupPricingJson, savedPackage);
  assert.equal(writes.at(-1).body.priceCent, 3333);
  console.log("Package totals, reference cents and responsive layout checks passed");
  await expect(page.getByRole("tabpanel", { name: "票种配置" })).toContainText("套餐 · 2 档");
  await expect(page.getByRole("tabpanel", { name: "票种配置" })).toContainText("3 人团 ¥100.01");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "新增票种", exact: true }).click();
  const newDialog = page.getByRole("dialog", { name: "新增票种", exact: true });
  await expect(newDialog.getByRole("radio", { name: "普通票", exact: true })).toBeChecked();
  await expect(newDialog.getByLabel("价格（元）", { exact: true })).toHaveValue("0.00");
  await newDialog.getByText("团体票", { exact: true }).click();
  await expect(newDialog.getByRole("radio", { name: "按人计价", exact: true })).toBeChecked();
  await expect(newDialog.locator(".pricing-tier")).toHaveCount(0);
  await newDialog.getByRole("button", { name: "取消", exact: true }).click();
  await openEditor();
  await expect(groupMode.getByRole("radio", { name: "固定人数套餐", exact: true })).toBeChecked();
  await expect(dialog.getByLabel("第 1 档整团总价（元）", { exact: true })).toHaveValue("100.01");
  await groupMode.getByText("按人计价", { exact: true }).click();
  await expect(dialog.getByLabel("基础单价（元/人）", { exact: true })).toHaveValue("");
  await expect(dialog.getByLabel("订单最低实付（元）", { exact: true })).toHaveValue("80.00");
  await expect(dialog.locator(".pricing-package")).toHaveCount(0);
  await dialog.getByLabel("基础单价（元/人）", { exact: true }).fill("120.01");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  assert.equal(Object.hasOwn(writes.at(-1).body.groupPricingJson, "mode"), false);
  assert.equal(Object.hasOwn(writes.at(-1).body.groupPricingJson, "packages"), false);
  await openEditor();
  await groupMode.getByText("固定人数套餐", { exact: true }).click();
  await dialog.getByLabel("第 1 档固定人数", { exact: true }).fill("3");
  await dialog.getByLabel("第 1 档整团总价（元）", { exact: true }).fill("100.01");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  await openEditor();
  await dialog.getByText("普通票", { exact: true }).click();
  await expect(dialog.getByLabel("价格（元）", { exact: true })).toHaveValue("");
  await dialog.getByLabel("价格（元）", { exact: true }).fill("99");
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  await expect(dialog).toBeHidden();
  assert.equal(writes.at(-1).body.groupPricingJson, null);
  assert.equal(writes.at(-1).body.priceCent, 9900);
  console.log("Package, per-person, ordinary and new-editor reset checks passed");

  conference.maxTicketsPerOrder = 4;
  sku = { ...sku, priceCent: 3333, groupPricingJson: savedPackage };
  await openEditor();
  await expect(dialog).toContainText("无法选购全部套餐");
  await expect(dialog).toContainText("套餐人数超过会议单单最大票数");
  const beforeCapFailure = writes.length;
  await dialog.getByRole("button", { name: "保存", exact: true }).click();
  assert.equal(writes.length, beforeCapFailure);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  conference.maxTicketsPerOrder = 5;
  await openEditor();
  await expect(dialog.getByText("无法选购全部套餐", { exact: false })).toHaveCount(0);
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  sku = { ...sku, priceCent: 9900, groupPricingJson: null };

  for (const setting of [{ enabled: false, cap: 100 }, { enabled: true, cap: 1 }, { enabled: true, cap: 0 }]) {
    conference.groupRegistrationEnabled = setting.enabled;
    conference.maxTicketsPerOrder = setting.cap;
    await openEditor();
    await dialog.getByText("团体票", { exact: true }).click();
    await expect(dialog).toContainText(setting.enabled ? "低于最低人数" : "尚未开启团体报名");
    const count = writes.length;
    await dialog.getByRole("button", { name: "保存", exact: true }).click();
    assert.equal(writes.length, count);
    await dialog.getByRole("button", { name: "取消编辑并前往基础信息", exact: true }).click();
    await expect(page.getByRole("tab", { name: "基础信息" })).toHaveAttribute("aria-selected", "true");
  }
  assert.ok(writes.every(write => /\/skus(?:\/|$)/.test(write.path)), "conference and discount settings must never be written");
  assert.deepEqual(errors, []);
  console.log(`Screenshots: ${output}`);
});
