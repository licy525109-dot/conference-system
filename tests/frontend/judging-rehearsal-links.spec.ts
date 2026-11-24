import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { defaultJudgingConfig, type ScoringView } from "../../packages/shared/src/judging";

test("opening a second rehearsal link in the same tab replaces the seat and its receipt", async ({
  page
}) => {
  const config = defaultJudgingConfig();
  const common = {
    title: "模拟赛事",
    rehearsal: true,
    teacher: { name: "模拟老师", org: "", photo: "", poster: "", topic: "绘本课堂" },
    look: config.look,
    formVersion: 1,
    tasks: [],
    max: 30
  };
  const classroom: ScoringView = {
    ...common,
    rehearsalSeat: "模拟观察席",
    session: { id: "class", room: "教室", round: 1, time: "", kind: "class" },
    role: "observer",
    form: config.rubrics.observer,
    open: false,
    receipt: {
      id: "sample",
      teacher: "模拟老师",
      session: "教室",
      at: "2026-01-01T08:00:00Z",
      status: "received"
    }
  };
  const ted: ScoringView = {
    ...common,
    rehearsalSeat: "模拟专家席",
    session: { id: "ted", room: "会场", round: 1, time: "", kind: "ted" },
    role: "expert",
    form: config.rubrics.expert,
    open: true,
    receipt: null
  };
  await page.route("**/api/admin/auth/login", (route) =>
    route.fulfill({
      json: {
        code: "OK",
        data: { token: randomUUID(), admin: { permissions: ["judging:view", "judging:floor"] } }
      }
    })
  );
  for (const [path, view] of [
    ["class/rehearsal/observer", classroom],
    ["ted/rehearsal/expert", ted]
  ] as const) {
    await page.route("**/api/admin/judging/sample/sessions/" + path, (route) =>
      route.fulfill({ json: { code: "OK", data: view } })
    );
  }
  await page.goto("/#/pages/judging/score?event=sample&session=class&practice=observer");
  const login = page.getByRole("textbox");
  await login.nth(0).fill("sample");
  await login.nth(1).fill(randomUUID());
  await page.getByText("进入模拟评分", { exact: true }).click();
  await expect(page.getByText("模拟席位 · 模拟观察席", { exact: true })).toBeVisible();
  await expect(page.getByText(config.look.receipt, { exact: true })).toBeVisible();

  await page.goto("/#/pages/judging/score?event=sample&session=ted&practice=expert");
  await expect(page.getByText("模拟席位 · 模拟专家席", { exact: true })).toBeVisible();
  await expect(page.getByText(config.look.receipt, { exact: true })).toHaveCount(0);
  await expect(page.getByText(config.look.submit, { exact: true })).toBeVisible();
});
