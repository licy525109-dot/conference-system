import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { defaultJudgingConfig, type JudgingConfig } from "../../packages/shared/src/judging";

test("an operator creates a schedule, imports teachers and adjusts one classroom's rounds", async ({
  page,
  context
}) => {
  let config: JudgingConfig | undefined;
  let revision = 1;
  const summary = () => ({
    id: "schedule",
    title: "两室赛课",
    rehearsal: false,
    phase: "SETUP",
    edition: 1,
    revision
  });
  await context.addInitScript((v) => localStorage.setItem("conference_admin_token", v), randomUUID());
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
    if (path.endsWith("/auth/me"))
      return ok({
        admin: {
          username: "ops",
          conferenceScopeMode: "ALL",
          permissions: ["judging:view", "judging:config"]
        }
      });
    if (path === "/api/admin/judging") {
      if (route.request().method() === "GET") return ok(config ? [summary()] : []);
      const input = route.request().postDataJSON();
      expect(input).toEqual({ title: "两室赛课", roomCount: 2, roundsPerRoom: 1 });
      config = defaultJudgingConfig(input.roomCount, input.roundsPerRoom);
      return ok(summary());
    }
    if (path.endsWith("/preview-config")) return ok({ warnings: [], readiness: "" });
    if (path.endsWith("/actions")) {
      const body = route.request().postDataJSON();
      expect(body.action).toBe("config");
      expect(body.revision).toBe(revision);
      config = body.config;
      revision++;
      return ok(summary());
    }
    if (path.endsWith("/schedule"))
      return ok({ ...summary(), config, gates: {}, editions: [], staffIds: [] });
    return ok({});
  });
  await page.goto("http://localhost:5174/#/judging");
  await page.getByRole("button", { name: "创建第一场赛事" }).click();
  const form = page.getByRole("dialog", { name: "新建赛事" });
  await expect(form.getByRole("radio")).toHaveCount(0);
  await form.getByRole("textbox", { name: "赛事名称" }).fill("两室赛课");
  await form.getByRole("spinbutton", { name: "教室数量" }).fill("2");
  await form.getByRole("spinbutton", { name: "教室数量" }).press("Tab");
  await form.getByRole("button", { name: "创建", exact: true }).click();
  const sections = page.getByRole("radiogroup", { name: "名单与排场" });
  await expect(sections.getByRole("radio", { name: /教室与轮次/ })).toBeChecked();
  await sections.getByText(/^选手/).click();
  const teachers = [
    "教师编号,姓名,机构编号,机构名称,课程题目,TED题目",
    ...Array.from({ length: 5 }, (_, i) => `T${i},选手${i},S,机构,课堂${i},演讲${i}`)
  ];
  await page
    .locator('input[type="file"][accept*=".csv"]')
    .setInputFiles({ name: "选手.csv", mimeType: "text/csv", buffer: Buffer.from(teachers.join("\n")) });
  await page.getByRole("button", { name: "应用预览到草稿" }).click();
  await sections.getByText(/^场次/).click();
  await page.getByRole("button", { name: "按选手顺序排场" }).click();
  await expect(page.getByText("当前可排 2 位，名单有 5 位选手，请增加教室或课堂轮数")).toBeVisible();
  await sections.getByText(/^教室与轮次/).click();
  const rounds = page.getByRole("spinbutton", { name: "2 号教室课堂轮数" });
  await rounds.fill("5");
  await rounds.press("Tab");
  await sections.getByText(/^场次/).click();
  await page.getByRole("button", { name: "按选手顺序排场" }).click();
  await page.getByRole("button", { name: "保存赛前配置" }).click();
  await expect.poll(() => revision).toBe(2);
  expect(config!.sessions.filter((s) => s.kind === "class").map((s) => [s.room, s.round])).toEqual([
    ["R1", 1],
    ["R2", 1],
    ["R2", 2],
    ["R2", 3],
    ["R2", 4]
  ]);
  expect(config!.sessions.filter((s) => s.kind === "ted")).toHaveLength(5);
  await page.reload();
  await expect(page.getByRole("spinbutton", { name: "2 号教室课堂轮数" })).toHaveValue("5");
});
