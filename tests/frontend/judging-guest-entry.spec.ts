import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  defaultJudgingConfig,
  roleLabels,
  type GuestSeat,
  type ScoreReceipt,
  type ScoringView
} from "../../packages/shared/src/judging";

test("one H5 link opens the named judge's ballot and distinguishes two guests with the same name", async ({
  page
}) => {
  const config = defaultJudgingConfig();
  const seats: GuestSeat[] = [
    { id: "J01", name: "陈晨", org: "云舞", role: "lecturer" },
    { id: "J02", name: "林小雨", org: "星河", role: "experience" },
    { id: "J03", name: "林小雨", org: "明月", role: "observer" }
  ];
  const tickets = new Map<string, GuestSeat>(),
    receipts = new Map<string, ScoreReceipt>();
  const unrelated: string[] = [];
  const path = "/api/judging/test/entry/common";
  await page.route(
    (url) => url.pathname.startsWith("/api/"),
    async (route) => {
      const req = route.request();
      const url = new URL(req.url());
      const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
      if (url.pathname === path) return ok({ title: "联排", rehearsal: true, look: config.look });
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
        expect(req.postDataJSON()).toEqual({ formVersion: 1, answers: { score: 25 } });
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
  const input = page.getByRole("textbox");
  await input.fill("未登记");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("名单中未找到这个姓名", { exact: true })).toBeVisible();
  await input.fill("陈晨");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("陈晨 · " + roleLabels.lecturer, { exact: true })).toBeVisible();
  await expect(page.getByText("许星禾", { exact: true })).toBeVisible();
  await page.getByText("切换姓名", { exact: true }).click();
  await input.fill("林小雨");
  await page.getByText("进入评分", { exact: true }).click();
  await expect(page.getByText("编号 J02", { exact: true })).toBeVisible();
  await expect(page.getByText("编号 J03", { exact: true })).toBeVisible();
  await page.locator("uni-button").filter({ hasText: "明月" }).click();
  await expect(page.getByText("林小雨 · " + roleLabels.observer, { exact: true })).toBeVisible();
  await page.getByRole("spinbutton").fill("12");
  await page.getByRole("spinbutton").fill("25");
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
  expect(unrelated).toEqual([]);
});
