import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { defaultJudgingConfig } from "../../packages/shared/src/judging";

test("an event editor previews the real guest page on both devices and saves to the original QR link", async ({
  page,
  context
}) => {
  let config = defaultJudgingConfig(),
    revision = 1,
    saves = 0;
  const id = "design-stage",
    entryCode = "common",
    title = "绘本舞蹈赛课 · 扫码评分体验场";
  const info = () => ({
    id,
    title,
    revision,
    phase: "LIVE",
    rehearsal: true,
    entryCode,
    config,
    gates: {},
    editions: [],
    staffIds: [],
    confirmerId: null
  });
  const token = randomUUID();
  await context.addInitScript((value) => {
    if (location.port === "5174") localStorage.setItem("conference_admin_token", value);
  }, token);
  const guestRequests: string[] = [];
  await context.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
      if (path === "/api/admin/auth/me")
        return ok({
          admin: {
            username: "design-test",
            conferenceScopeMode: "ASSIGNED",
            permissions: ["judging:view", "judging:config"]
          }
        });
      if (path === "/api/admin/judging") return ok([info()]);
      if (path === "/api/admin/judging/" + id) return ok(info());
      if (path === "/api/admin/judging/" + id + "/actions") {
        const b = route.request().postDataJSON();
        expect(b.action).toBe("appearance");
        expect(b.revision).toBe(revision);
        config = { ...config, look: b.look };
        revision++;
        saves++;
        return ok(info());
      }
      if (path.startsWith("/api/judging/")) {
        guestRequests.push(path);
        if (path === "/api/judging/" + id + "/entry/" + entryCode)
          return ok({ title, look: config.look, rehearsal: true });
        return route.abort();
      }
      return ok({});
    }
  );
  await page.setViewportSize({ width: 1440, height: 960 });
  const admin = "http://localhost:5174/#/judging?event=" + id;
  await page.goto(admin);
  await page.getByRole("button", { name: "设计评分入口" }).click();
  const preview = page.frameLocator('iframe[title="扫码首页实时预览"]');
  await expect(preview.getByText(config.look.heading, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "上传", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "横幅海报" }).click();
  await page.getByRole("button", { name: "纸艺暖棕" }).click();
  await page.getByRole("textbox", { name: "页面标题" }).fill("舞动绘本");
  await page.getByRole("textbox", { name: "进入按钮文字" }).fill("打开我的评分表");
  await expect(preview.getByText("舞动绘本", { exact: true })).toBeVisible();
  await expect(preview.getByText("打开我的评分表", { exact: true })).toBeVisible();
  await page.getByLabel("预览状态").selectOption("choices");
  await expect(preview.getByText("编号 J03", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "电脑", exact: true }).click();
  await expect(preview.locator(".je-poster")).toBeVisible();
  expect(await preview.locator("body").evaluate(() => innerWidth)).toBeGreaterThan(740);
  expect(guestRequests).toEqual([]);
  await page.getByRole("button", { name: "保存页面设计" }).click();
  await expect(page.getByRole("button", { name: "保存页面设计" })).toBeDisabled();
  expect(saves).toBe(1);
  await page.goto(admin + "&tab=look");
  await page.reload();
  await expect(preview.getByText("舞动绘本", { exact: true })).toBeVisible();
  const guest = await context.newPage();
  await guest.setViewportSize({ width: 320, height: 568 });
  await guest.goto("/#/pages/judging/entry?event=" + id + "&entry=" + entryCode);
  const enter = guest.getByText("打开我的评分表", { exact: true });
  await expect(enter).toBeVisible();
  const button = await enter.boundingBox();
  expect(button!.y + button!.height).toBeLessThanOrEqual(568);
  const art = guest.locator(".je-art");
  const asset = await art.evaluate(
    (el) => getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)?.[1]
  );
  expect(asset).toBeTruthy();
  expect((await guest.request.get(new URL(asset!, guest.url()).href)).ok()).toBe(true);
  expect(await guest.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  await guest.setViewportSize({ width: 1440, height: 900 });
  expect((await enter.boundingBox())!.width).toBeLessThan(800);
  await page.getByRole("button", { name: "简洁文字" }).click();
  await expect(preview.locator(".je-art")).toHaveCount(0);
  await guest.reload();
  await expect(guest.locator(".je-art")).toBeVisible();
  expect(saves).toBe(1);
  await page.getByRole("button", { name: "评分表与回执" }).click();
  const trial = page.getByRole("spinbutton", { name: "综合评价得分" });
  const submit = page.getByRole("button", { name: config.look.submit, exact: true });
  await expect(submit).toBeDisabled();
  await trial.fill("0");
  await expect(submit).toBeEnabled();
  await trial.fill("");
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "此项未观察" }).click();
  await expect(page.getByText("请至少填写一项分数后再提交")).toBeVisible();
  await expect(submit).toBeDisabled();
  await page.getByRole("button", { name: "已选未观察 · 重新评分" }).click();
  await trial.fill("0");
  await submit.click();
  await expect(page.getByText("试填回执 · 已提交")).toBeVisible();
});
