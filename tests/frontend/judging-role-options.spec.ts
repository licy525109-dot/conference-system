import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { defaultJudgingConfig } from "../../packages/shared/src/judging";

test("operators can replace the TED panel, remove all four default types and add one to an empty event", async ({
  page,
  context
}) => {
  let config = defaultJudgingConfig(),
    revision = 1;
  config.judges = [{ id: "J01", name: "联排嘉宾", role: "expert", room: "", phone: "", userId: "" }];
  config.rubrics.experience.title = "双席共用评分表";
  const summary = () => ({
    id: "roles",
    title: "评委类型联排",
    phase: "SETUP",
    rehearsal: true,
    edition: 1,
    revision
  });
  await context.addInitScript((v) => localStorage.setItem("conference_admin_token", v), randomUUID());
  await context.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const ok = (data: unknown) => route.fulfill({ json: { code: "OK", data } });
    if (path === "/api/admin/auth/me")
      return ok({
        admin: {
          username: "editor",
          conferenceScopeMode: "ASSIGNED",
          permissions: ["judging:view", "judging:config"]
        }
      });
    if (path === "/api/admin/judging") return ok([summary()]);
    if (path.endsWith("/roles/actions")) {
      const body = route.request().postDataJSON();
      expect(body.action).toBe("config");
      expect(body.revision).toBe(revision);
      config = body.config;
      revision++;
      return ok(summary());
    }
    if (path.endsWith("/roles")) return ok({ ...summary(), config, staffIds: [], editions: [], gates: {} });
    return ok({});
  });

  const forms = async () => {
    await page.getByRole("button", { name: "赛前设置", exact: true }).click();
    await page.getByRole("tab", { name: "评分表与规则" }).click();
  };
  const choose = (name: string) =>
    page.getByRole("radiogroup", { name: "评委类型" }).getByText(name, { exact: true }).click();
  const add = page.getByRole("button", { name: "新增评委类型", exact: true });
  const remove = page.getByRole("button", { name: "删除当前类型" });
  const addDialog = page.getByRole("dialog", { name: "新增评委类型" });
  const removeDialog = page.getByRole("dialog", { name: "删除评委类型" });
  const save = () => page.getByRole("button", { name: "保存评分表与规则" }).click();
  await page.goto("http://localhost:5174/#/judging?event=roles");
  await forms();
  await choose("TED 专家");
  await add.click();
  await addDialog.getByRole("textbox", { name: "类型名称" }).fill("演讲评委团");
  await expect(addDialog).toContainText("TED 分 · 30 分");
  await addDialog.getByRole("button", { name: "添加到草稿" }).click();
  await expect(page.getByLabel("评分表标题")).toHaveValue("演讲评委团评分表");
  await choose("TED 专家");
  await remove.click();
  await expect(removeDialog).toContainText("1 位评委");
  await removeDialog.getByRole("button", { name: "取消" }).click();
  await expect(page.getByRole("radio", { name: "TED 专家" })).toBeChecked();
  await remove.click();
  await removeDialog.getByText("请选择", { exact: true }).click();
  await page.getByRole("option", { name: "转入「演讲评委团」" }).click();
  await removeDialog.getByRole("button", { name: "确认删除类型" }).click();
  await save();
  await expect.poll(() => revision).toBe(2);
  const custom = config.roleOptions!.find((r) => r.label === "演讲评委团")!.id;
  expect(config.judges[0].role).toBe(custom);
  expect(config.rubrics.expert).toBeUndefined();
  await page.reload();
  await forms();
  await expect(page.getByRole("radio", { name: "TED 专家" })).toHaveCount(0);
  for (const label of ["总部讲师", "体验席", "观察席", "演讲评委团"]) {
    await choose(label);
    if (label === "观察席") await expect(page.getByLabel("评分表标题")).toHaveValue("双席共用评分表");
    await remove.click();
    if (label === "演讲评委团") {
      await removeDialog.getByText("请选择", { exact: true }).click();
      await page.getByRole("option", { name: "同时从本赛事名单移除这 1 位评委" }).click();
    }
    await removeDialog.getByRole("button", { name: "确认删除类型" }).click();
  }
  await expect(page.getByText("请先新增评委类型", { exact: true })).toBeVisible();
  await save();
  await expect.poll(() => revision).toBe(3);
  expect(config.roleOptions).toEqual([]);
  expect(config.judges).toEqual([]);
  await add.click();
  await addDialog.getByRole("textbox", { name: "类型名称" }).fill("家长评审");
  await addDialog.getByRole("button", { name: "添加到草稿" }).click();
  await save();
  await expect.poll(() => revision).toBe(4);
  const restored = config.roleOptions![0].id;
  expect(config.rubrics[restored].title).toBe("家长评审评分表");
});
