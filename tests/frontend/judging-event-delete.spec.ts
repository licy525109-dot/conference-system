import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { defaultJudgingConfig } from "../../packages/shared/src/judging";

test("an operator confirms the selected event, keeps its neighbor and can delete the last event", async ({
  context,
  page
}) => {
  const live = { id: "live", title: "绘本舞蹈总决赛 · 正式场", phase: "LIVE", rehearsal: false };
  const trial = { id: "trial", title: "绘本舞蹈总决赛 · 锁版对照（模拟）", phase: "LOCKED", rehearsal: true };
  let events = [live, trial];
  let scope = "ASSIGNED";
  const deleted: string[] = [];
  await context.addInitScript((value) => localStorage.setItem("conference_admin_token", value), randomUUID());
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
    if (path === "/api/admin/auth/me") {
      return ok({
        admin: { username: "ops", conferenceScopeMode: scope, permissions: ["judging:view", "judging:config"] }
      });
    }
    if (path === "/api/admin/judging") return ok(events);
    const match = path.match(/^\/api\/admin\/judging\/([^/]+)(\/actions)?$/);
    if (!match) return ok({});
    const item = events.find((e) => e.id === match[1]);
    if (!item) return route.fulfill({ status: 404, json: { message: "赛事不存在" } });
    if (match[2]) {
      expect(route.request().postDataJSON()).toEqual({ action: "delete", revision: 3 });
      deleted.push(item.id);
      events = events.filter((e) => e.id !== item.id);
      return ok({ ...item, phase: "DELETED", revision: 4 });
    }
    return ok({
      ...item,
      revision: 3,
      edition: 1,
      config: defaultJudgingConfig(),
      staffIds: [],
      gates: {},
      editions: []
    });
  });

  await page.goto("http://localhost:5174/#/judging?event=live");
  const remove = page.locator(".j-header").getByRole("button", { name: "删除赛事" });
  const dialog = page.getByRole("dialog", { name: "确认删除赛事" });
  await expect(page.getByRole("heading", { name: live.title })).toBeVisible();
  await expect(remove).toHaveCount(0);
  scope = "ALL";
  await page.reload();
  await page.locator(".j-header").getByText(live.title, { exact: true }).click();
  await page.getByRole("option", { name: "内部 · " + trial.title }).click();
  await expect(page.getByRole("heading", { name: trial.title })).toBeVisible();
  await remove.click();
  await expect(dialog).toContainText(trial.title);
  await expect(dialog).toContainText("仅内部使用 · 已锁定");
  await dialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("heading", { name: trial.title })).toBeVisible();
  expect(deleted).toEqual([]);
  await remove.click();
  await dialog.getByRole("button", { name: "删除赛事" }).click();
  await expect(page.getByRole("heading", { name: live.title })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: live.title })).toBeVisible();
  expect(deleted).toEqual([trial.id]);
  await remove.click();
  await expect(dialog).toContainText(live.title);
  await expect(dialog).toContainText("（现场评分）");
  await dialog.getByRole("button", { name: "删除赛事" }).click();
  await expect(page.getByRole("button", { name: "创建第一场赛事" })).toBeVisible();
  await expect(page).toHaveURL(/#\/judging$/);
  await expect(remove).toHaveCount(0);
  expect(deleted).toEqual([trial.id, live.id]);
});
