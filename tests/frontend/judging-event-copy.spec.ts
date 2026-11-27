import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { defaultJudgingConfig } from "../../packages/shared/src/judging";

test("a scoped operator can choose a source and the data to carry into a new event", async ({
  context,
  page
}) => {
  const sources = [
    { id: "spring", title: "春季赛", phase: "LOCKED", rehearsal: false },
    { id: "summer", title: "夏季赛", phase: "LIVE", rehearsal: false }
  ];
  const created = { id: "autumn", title: "秋季赛", phase: "SETUP", rehearsal: false };
  let attempts = 0;
  let requestId = "";
  const original = defaultJudgingConfig(2, 3);
  original.rooms[0].name = "夏季绘本教室";
  await context.addInitScript((v) => localStorage.setItem("conference_admin_token", v), randomUUID());
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
    if (path.endsWith("/auth/me"))
      return ok({
        admin: {
          username: "运营",
          conferenceScopeMode: "ASSIGNED",
          permissions: ["judging:view", "judging:config"]
        }
      });
    if (path === "/api/admin/judging") {
      if (route.request().method() === "GET") return ok(attempts ? [created, ...sources] : sources);
      const body = route.request().postDataJSON();
      expect(body.title).toBe("秋季赛");
      expect(body.copy).toEqual({ sourceId: "summer", teachers: false, judges: true, handover: false });
      expect(body).not.toHaveProperty("roomCount");
      if (attempts) expect(body.requestId).toBe(requestId);
      requestId = body.requestId;
      attempts++;
      return ok(created);
    }
    const event = [created, ...sources].find((s) => path === "/api/admin/judging/" + s.id);
    if (event) {
      if (event.id === created.id && attempts === 1)
        return route.fulfill({ status: 503, json: { message: "载入新赛事失败，请重试" } });
      return ok({
        ...event,
        edition: 1,
        revision: 1,
        config: original,
        gates: {},
        editions: [],
        staffIds: []
      });
    }
    return ok({});
  });
  await page.goto("http://localhost:5174/#/judging?event=spring");
  await page.getByRole("button", { name: "新建赛事" }).click();
  const form = page.getByRole("dialog", { name: "新建赛事" });
  await form.getByText("复制已有赛事", { exact: true }).click();
  const name = form.getByRole("textbox", { name: "赛事名称" });
  await expect(name).toHaveValue("春季赛（副本）");
  await form.getByText("春季赛", { exact: true }).click();
  await page.getByRole("option", { name: "夏季赛" }).click();
  await expect(name).toHaveValue("夏季赛（副本）");
  await name.fill("秋季赛");
  await form.getByText("初复赛成绩、晋级名次与优秀奖名单", { exact: true }).click();
  await form.getByText("选手名单与排场", { exact: true }).click();
  await expect(form.getByRole("checkbox", { name: "初复赛成绩、晋级名次与优秀奖名单" })).toBeDisabled();
  await expect(form.getByRole("checkbox", { name: "初复赛成绩、晋级名次与优秀奖名单" })).not.toBeChecked();
  await expect(form.getByRole("checkbox", { name: "评委名单与教室分工" })).toBeChecked();
  await form.getByRole("button", { name: "复制并创建" }).click();
  await expect(page.getByText("载入新赛事失败，请重试")).toBeVisible();
  await form.getByRole("button", { name: "复制并创建" }).click();
  await expect(form).toBeHidden();
  await expect(page.getByRole("heading", { name: "秋季赛" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "名单与排场" })).toHaveAttribute("aria-selected", "true");
  expect(attempts).toBe(2);
});
