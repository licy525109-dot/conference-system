import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  defaultJudgingConfig,
  type JudgingPeriod,
  type JudgingSession,
  type PeriodReviews
} from "../../packages/shared/src/judging";

test("operators close, inspect and approve morning and afternoon separately and directly lock the final results", async ({
  page,
  context
}) => {
  const c = defaultJudgingConfig(1, 1);
  c.teachers = [
    {
      id: "T1",
      name: "演示选手甲",
      org: "绘本教室",
      orgId: "O1",
      photo: "",
      poster: "",
      topic: "月亮的脚步",
      speech: "从绘本到舞蹈",
      prior: null,
      qualifierRank: null
    }
  ];
  const classroom: JudgingSession = {
    id: "C1",
    kind: "class",
    teacher: "T1",
    room: "R1",
    round: 1,
    time: "09:00"
  };
  const ted: JudgingSession = { id: "S1", kind: "ted", teacher: "T1", room: "", round: 1, time: "14:00" };
  c.sessions = [classroom, ted];
  c.judges = [
    { id: "J1", name: "上午讲师", role: "lecturer", room: "R1", phone: "", userId: "" },
    { id: "J2", name: "下午专家", role: "expert", room: "", phone: "", userId: "" }
  ];
  const periodReviews: PeriodReviews = {};
  let revision = 3,
    phase = "LIVE",
    pending = true;
  const gates: Record<string, string> = { C1: "closed" };
  const summary = () => ({
    id: "sample",
    title: "绘本舞蹈赛课 · 分场复核演示",
    revision,
    edition: 1,
    rehearsal: true,
    phase
  });
  const tasks = () =>
    c.sessions.map((session, i) => ({
      session,
      name: c.judges[i].name,
      judgeId: c.judges[i].id,
      role: c.judges[i].role,
      roleLabel: i ? "TED 专家" : "总部讲师",
      receipt: "B" + i,
      status: !i && pending ? "pending" : "valid",
      present: true
    }));
  const ballots = () =>
    tasks().map((t, i) => ({
      id: t.receipt,
      sessionKey: t.session.id,
      teacherKey: "T1",
      judgeKey: t.judgeId,
      role: t.role,
      units: t.status === "pending" ? null : 2800,
      status: t.status,
      answers: { score: 28 },
      rubric: { ...c.rubrics[t.role], version: 1 }
    }));
  const actions: string[] = [];
  await context.addInitScript((v) => localStorage.setItem("conference_admin_token", v), randomUUID());
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
    if (path.endsWith("/auth/me"))
      return ok({
        admin: {
          id: "ops",
          username: "运营",
          conferenceScopeMode: "ALL",
          permissions: [
            "judging:view",
            "judging:config",
            "system:account",
            "judging:floor",
            "judging:results",
            "judging:adjust",
            "judging:confirm"
          ]
        }
      });
    if (path === "/api/admin/judging") return ok([summary()]);
    if (path.endsWith("/judging/accounts")) return ok([{ id: "ops", username: "运营", displayName: null }]);
    if (path.endsWith("/sample"))
      return ok({ ...summary(), gates, periodReviews, config: c, editions: [], staffIds: [] });
    if (path.endsWith("/progress")) return ok({ ...summary(), gates, periodReviews, tasks: tasks() });
    if (path.endsWith("/results"))
      return ok({
        ...summary(),
        periodReviews,
        periodTasks: tasks().map((t) => ({ ...t, sessionId: t.session.id })),
        ballots: ballots(),
        rows: [],
        merits: [],
        schools: [],
        ties: [],
        log: []
      });
    if (path.endsWith("/actions")) {
      const body = route.request().postDataJSON(),
        p = body.period as JudgingPeriod;
      expect(body.revision).toBe(revision);
      actions.push(body.action + "/" + (p || ""));
      if (body.action === "access") {
        expect(body.staffIds).toEqual([]);
        expect(body).not.toHaveProperty("confirmerId");
      } else if (body.action === "gate") {
        expect(body).toMatchObject({ session: "S1", scope: "group", open: true });
        gates.S1 = "open";
      } else if (body.action === "period-close") {
        periodReviews[p] = { status: "reviewing", version: 1 };
        gates[p === "am" ? "C1" : "S1"] = "closed";
        if (periodReviews.am && periodReviews.pm) phase = "REVIEW";
      } else if (body.action === "correction") {
        expect(p).toBe("am");
        expect(body.ballotId).toBe("B0");
        expect(body.reason).toBe("复核现场记录");
        pending = false;
        periodReviews.am!.version++;
      } else if (body.action === "period-approve") {
        expect(body.periodVersion).toBe(periodReviews[p]!.version);
        periodReviews[p] = {
          status: "confirmed",
          version: body.periodVersion + 1,
          confirmedBy: "运营",
          confirmedAt: new Date().toISOString()
        };
      } else if (body.action === "confirm") {
        expect(body.reviewedRevision).toBe(revision);
        expect(periodReviews.am?.status).toBe("confirmed");
        expect(periodReviews.pm?.status).toBe("confirmed");
        phase = "LOCKED";
      } else throw new Error("Unexpected action " + body.action);
      revision++;
      return ok(summary());
    }
    return ok({});
  });
  await page.goto("http://localhost:5174/#/judging?event=sample");
  const nav = page.getByRole("navigation", { name: "赛事操作" });
  const close = async (p: string) => {
    await nav.getByRole("button", { name: "现场收分" }).click();
    await page.getByRole("button", { name: "结束" + p + "评分" }).click();
    await page.getByRole("button", { name: "结束并进入复核" }).click();
    await page.getByRole("button", { name: "查看" + p + "复核" }).click();
    await expect(page.getByRole("heading", { name: p + "评分复核" })).toBeVisible();
  };
  const approve = async (p: string) => {
    await page.getByRole("button", { name: "完成" + p + "复核" }).click();
    await page.getByRole("button", { name: "确认完成复核" }).click();
    await expect(page.getByRole("button", { name: "重新复核" + p })).toBeVisible();
  };
  await nav.getByRole("button", { name: "赛前设置" }).click();
  await page.getByRole("tab", { name: "工作人员授权" }).click();
  const access = page.getByRole("tabpanel", { name: "工作人员授权" });
  await expect(access.getByRole("combobox")).toHaveCount(1);
  await expect(access).not.toContainText("最终确认人");
  await access.getByRole("button", { name: "保存赛事授权" }).click();
  await expect.poll(() => actions.includes("access/")).toBe(true);
  await nav.getByRole("button", { name: "现场收分" }).click();
  await expect(page.locator(".j-period-row").filter({ hasText: "上午场" })).toContainText("待结束收分");
  const afternoon = page.locator(".j-period-row").filter({ hasText: "下午场" });
  await expect(afternoon).toContainText("待开放");
  await page.getByRole("button", { name: "开放全部 TED" }).click();
  await page.getByRole("dialog", { name: "批量调整评分" }).locator(".el-button--primary").click();
  await expect(afternoon).toContainText("收分中");
  await close("上午场");
  expect(gates.S1).toBe("open");
  await expect(page.getByRole("button", { name: "完成上午场复核" })).toBeDisabled();
  await expect(page.getByText("下午专家", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看 / 更正" }).click();
  await page.getByPlaceholder("更正或作废原因").fill("复核现场记录");
  await page.getByRole("button", { name: "保存更正记录" }).click();
  await approve("上午场");
  await close("下午场");
  const views = page.getByRole("radiogroup", { name: "选择复核场别" });
  await views.getByText("全天成绩", { exact: true }).click();
  await expect(page.getByRole("button", { name: "确认并锁定全天成绩" })).toBeDisabled();
  await views.getByText("下午场复核", { exact: true }).click();
  await expect(page.getByText("上午讲师", { exact: true })).toHaveCount(0);
  await approve("下午场");
  await views.getByText("全天成绩", { exact: true }).click();
  await page.getByRole("button", { name: "确认并锁定全天成绩" }).click();
  await page.getByRole("dialog", { name: "确认全天成绩" }).getByRole("button", { name: "确认锁定" }).click();
  await expect.poll(() => phase).toBe("LOCKED");
  expect(actions).toEqual([
    "access/",
    "gate/",
    "period-close/am",
    "correction/am",
    "period-approve/am",
    "period-close/pm",
    "period-approve/pm",
    "confirm/"
  ]);
});

test("the shared H5 tells a judge when morning scores are under review and when the review is complete", async ({
  page
}) => {
  const c = defaultJudgingConfig();
  const path = "/api/judging/sample/entry/shared",
    ticket = randomUUID();
  let status: "reviewing" | "confirmed" = "reviewing";
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const url = new URL(route.request().url());
      const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
      if (url.pathname === path) return ok({ title: "绘本赛课", look: c.look, guidance: c.guidance });
      if (url.pathname === path + "/identify") return ok({ kind: "ready", ticket });
      if (url.pathname !== path + "/desk") return route.abort();
      expect((await route.request().allHeaders()).authorization).toBe("Bearer " + ticket);
      return ok({
        judge: { id: "J1", role: "lecturer", name: "演示讲师", org: "绘本教室" },
        page: {
          title: "绘本赛课",
          rehearsal: false,
          look: c.look,
          guidance: c.guidance,
          teacher: { name: "演示选手甲", org: "", topic: "绘本", photo: "", poster: "" },
          session: {
            id: "C1",
            kind: "class",
            room: "绘本教室",
            round: 1,
            time: "",
            period: "am",
            reviewStatus: status
          },
          role: "lecturer",
          form: c.rubrics.lecturer,
          formVersion: 1,
          max: 40,
          open: false,
          receipt: null,
          tasks: []
        }
      });
    }
  );
  await page.goto("/#/pages/judging/entry?event=sample&entry=shared");
  await page.getByRole("textbox").fill("演示讲师");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("上午场评分已结束，正在复核。")).toBeVisible();
  await expect(page.getByRole("spinbutton")).toHaveCount(0);
  status = "confirmed";
  await page.getByText("刷新场次", { exact: true }).click();
  await expect(page.getByText("上午场评分已结束，已完成复核。")).toBeVisible();
});
