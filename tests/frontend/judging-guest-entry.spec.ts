import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  defaultJudgingConfig,
  roleLabels,
  type GuestSeat,
  type MobileTask,
  type ScoreReceipt,
  type ScoringView
} from "../../packages/shared/src/judging";

test("one H5 link opens the named judge's ballot and distinguishes two guests with the same name", async ({
  page
}) => {
  const config = defaultJudgingConfig();
  config.guidance = { instructions: "请核对本场授课教师。", rules: "按照本场表格中的范围填写。" };
  config.rubrics.observer_school = {
    ...config.rubrics.observer,
    title: "教研观察评分表",
    feedbackPrompt: "你印象最深的是什么？"
  };
  const lecturerField = config.rubrics.lecturer.fields[0];
  config.rubrics.lecturer.fields = [
    { ...lecturerField, id: "delivery", label: "课堂呈现", max: 20 },
    { ...lecturerField, id: "design", label: "教学设计", max: 20 }
  ];
  const seats: GuestSeat[] = [
    { id: "J01", name: "陈晨", org: "云舞", role: "lecturer" },
    { id: "J02", name: "林小雨", org: "星河", role: "experience" },
    { id: "J03", name: "林小雨", org: "明月", role: "observer_school", roleLabel: "教研观察员" }
  ];
  const tickets = new Map<string, GuestSeat>(),
    receipts = new Map<string, ScoreReceipt>();
  const unrelated: string[] = [];
  let submissions = 0;
  const path = "/api/judging/test/entry/common";
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
      if (url.pathname === path)
        return ok({ title: "联排", rehearsal: true, look: config.look, guidance: config.guidance });
      if (url.pathname === path + "/identify") {
        const { name, number } = req.postDataJSON();
        const matches = seats.filter((j) => j.name === name);
        if (matches.length > 1 && !number)
          return ok({ kind: "choose", choices: matches.map((j) => ({ id: j.id, org: j.org })) });
        const seat = matches.find((j) => !number || j.id === number);
        if (!seat) return route.fulfill({ status: 404, json: { message: "名单中未找到这个姓名" } });
        const ticket = randomUUID();
        tickets.set(ticket, seat);
        return ok({ kind: "ready", ticket });
      }
      const seat = tickets.get((await req.allHeaders()).authorization?.replace(/^Bearer /, "") || "");
      if (seat && url.pathname === path + "/desk") {
        const view: ScoringView = {
          title: "联排",
          rehearsal: true,
          look: config.look,
          guidance: config.guidance,
          teacher: { name: "许星禾", org: "绘本教室", topic: "节奏课堂", photo: "", poster: "" },
          session: { id: "C1", room: "第一教室", round: 1, time: "10:00", kind: "class" },
          form: config.rubrics[seat.role],
          formVersion: 1,
          open: true,
          max: seat.role === "lecturer" ? 40 : 30,
          role: seat.role,
          receipt: receipts.get(seat.id) || null,
          tasks: []
        };
        return ok({ judge: seat, page: view });
      }
      if (seat && url.pathname === path + "/sessions/C1/submit") {
        submissions++;
        expect(req.postDataJSON()).toEqual({
          formVersion: 1,
          answers: { score: 25, $feedback: "课堂反馈测试" }
        });
        const receipt: ScoreReceipt = {
          id: randomUUID(),
          teacher: "许星禾",
          at: new Date().toISOString(),
          session: "第一教室",
          status: "received"
        };
        receipts.set(seat.id, receipt);
        return ok(receipt);
      }
      unrelated.push(url.pathname);
      return route.abort();
    }
  );
  await page.goto("/#/pages/judging/entry?event=test&entry=common");
  await page.getByRole("button", { name: "评审说明与评分规则" }).click();
  await expect(page.getByText(config.guidance.instructions, { exact: true })).toBeVisible();
  await expect(page.getByText(config.guidance.rules, { exact: true })).toBeVisible();
  expect(tickets.size).toBe(0);
  const input = page.getByRole("textbox");
  await input.fill("未登记");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("名单中未找到这个姓名", { exact: true })).toBeVisible();
  await input.fill("陈晨");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("陈晨 · " + roleLabels.lecturer, { exact: true })).toBeVisible();
  await expect(page.getByText(config.guidance.rules, { exact: true })).toBeVisible();
  await expect(page.getByText("许星禾", { exact: true })).toBeVisible();
  const submit = page.locator(".judging-score-submit");
  await page.getByRole("spinbutton").first().fill("12.5");
  await expect(page.getByText("请填写「教学设计」的分数")).toBeVisible();
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await submit.dispatchEvent("click");
  expect(submissions).toBe(0);
  await page.getByText("切换姓名", { exact: true }).click();
  await input.fill("林小雨");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("编号 J02", { exact: true })).toBeVisible();
  await expect(page.getByText("编号 J03", { exact: true })).toBeVisible();
  await page.locator("uni-button").filter({ hasText: "明月" }).click();
  await expect(page.getByText("林小雨 · 教研观察员", { exact: true })).toBeVisible();
  await expect(page.getByText("教研观察评分表", { exact: false })).toBeVisible();
  const score = page.getByRole("spinbutton");
  const box = page.locator(".judging-score-box");
  await expect(box).toHaveCSS("border-top-width", "2px");
  expect((await box.boundingBox())!.width).toBeGreaterThan(260);
  expect((await score.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  expect(await score.evaluate((el) => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(20);
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await expect(page.getByText("请填写「综合评价」的分数")).toBeVisible();
  await score.fill("0");
  await expect(submit).not.toHaveAttribute("disabled", /.*/);
  await score.fill("");
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await submit.dispatchEvent("click");
  await score.fill("31");
  await expect(page.getByText(/分数范围是/)).toBeVisible();
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await score.fill("12.1");
  await expect(page.getByText(/计分步长是/)).toBeVisible();
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await page.getByText("此项未观察", { exact: true }).click();
  await expect(page.getByText("请至少填写一项分数后再提交")).toBeVisible();
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await submit.dispatchEvent("click");
  await page.getByText("已选未观察 · 重新评分", { exact: true }).click();
  expect(submissions).toBe(0);
  await page.locator(".judging-feedback-input").getByRole("textbox").fill("课堂反馈测试");
  await expect(submit).toHaveAttribute("disabled", /.*/);
  await score.fill("25");
  await page.getByText(config.look.submit, { exact: true }).click();
  await expect(page.getByText(config.look.receipt, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(config.look.receipt, { exact: true })).toBeVisible();
  await page.getByText("切换姓名", { exact: true }).click();
  await input.fill("林小雨");
  await page.getByText("进入评分", { exact: true }).click();
  await page.locator("uni-button").filter({ hasText: "星河" }).click();
  await expect(page.getByText("林小雨 · " + roleLabels.experience, { exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton")).toBeVisible();
  expect([...receipts.keys()]).toEqual(["J03"]);
  expect(submissions).toBe(1);
  expect(unrelated).toEqual([]);
});

test("a TED expert can pick three contestants in any order even when progress display is off", async ({
  page
}) => {
  const c = defaultJudgingConfig();
  c.look.showProgress = false;
  const root = "/api/judging/ted/entry/shared";
  const seats: MobileTask[] = ["顾老师", "陆老师", "何老师"].map((teacher, i) => ({
    sessionId: "T" + (i + 1),
    teacher,
    time: "",
    room: "TED 主会场",
    round: i + 1,
    role: "expert",
    status: "评分中"
  }));
  const receipts = new Map<string, ScoreReceipt>();
  const ticket = randomUUID();
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const req = route.request(),
        url = new URL(req.url());
      const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
      if (url.pathname === root)
        return ok({ title: "绘本赛课", look: c.look, guidance: c.guidance, rehearsal: false });
      if (url.pathname === root + "/identify") return ok({ kind: "ready", ticket });
      expect((await req.allHeaders()).authorization).toBe("Bearer " + ticket);
      if (url.pathname === root + "/desk") {
        const current = seats.find((s) => s.sessionId === url.searchParams.get("session")) ?? seats[0];
        const ballot: ScoringView = {
          title: "绘本赛课",
          rehearsal: false,
          look: c.look,
          guidance: c.guidance,
          teacher: { name: current.teacher, topic: "绘本分享", org: "", photo: "", poster: "" },
          session: { id: current.sessionId, kind: "ted", room: current.room, round: current.round, time: "" },
          role: "expert",
          form: c.rubrics.expert,
          formVersion: 1,
          max: 30,
          open: true,
          tasks: seats,
          receipt: receipts.get(current.sessionId) ?? null
        };
        return ok({ judge: { id: "E1", role: "expert", name: "专家一", org: "教研组" }, page: ballot });
      }
      const seat = seats.find((s) => url.pathname === root + "/sessions/" + s.sessionId + "/submit");
      if (!seat) return route.abort();
      expect(req.postDataJSON().answers.score).toBe(20 + seat.round);
      const receipt: ScoreReceipt = {
        id: randomUUID(),
        teacher: seat.teacher,
        at: new Date().toISOString(),
        session: seat.room,
        status: "received"
      };
      receipts.set(seat.sessionId, receipt);
      return ok(receipt);
    }
  );
  await page.goto("/#/pages/judging/entry?event=ted&entry=shared");
  await page.getByRole("textbox").fill("专家一");
  await page.getByText("进入评分", { exact: true }).click();
  await page.getByRole("spinbutton").fill("8");
  for (const i of [2, 0, 1]) {
    const seat = seats[i];
    await page.getByRole("button", { name: "选择评分选手" }).click();
    await page.getByRole("button", { name: seat.teacher + " · " + seat.room + " · " + seat.round }).click();
    await expect(page.getByText(seat.teacher, { exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveValue("");
    await page.getByRole("spinbutton").fill(String(20 + seat.round));
    await page.getByText(c.look.submit, { exact: true }).click();
    await expect(page.getByText(c.look.receipt, { exact: true })).toBeVisible();
  }
  expect([...receipts.keys()]).toEqual(["T3", "T1", "T2"]);
});
