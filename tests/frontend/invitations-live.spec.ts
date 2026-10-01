import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const url = process.env.INVITATION_LIVE_URL;
test.skip(!url, "Set INVITATION_LIVE_URL to a seeded local API invitation");
for (const width of [390, 1440]) {
  test(`built invitation renders against the real API at ${width}px`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("response", (response) => {
      if (
        response.url().includes("/invitation-assets/") &&
        response.status() >= 400
      )
        failures.push(`${response.status()}: asset`);
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url!);
    await expect(page.locator(".invitation-hero h1")).toContainText("观潮会集");
    await expect(page.locator(".invitation-letter")).toContainText(
      "演示嘉宾甲老师",
    );
    await expect(page.locator(".invitation-agenda")).toContainText(
      "统一更新后的会议议程",
    );
    await expect
      .poll(() =>
        page
          .locator(".invitation-hero__image")
          .evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBeGreaterThan(0);
    expect(
      await page
        .locator(".invitation-hero h1")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/invitation-live-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "分享邀请函", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("专属邀请函");
    expect(failures).toEqual([]);
  });
}
test("local staff can sign in and create a real invitation from a phone", async ({
  page,
}) => {
  const credentials = JSON.parse(
    await readFile(".tmp/invitation-preview-access.json", "utf8"),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(credentials.url);
  await page.getByLabel("用户名", { exact: true }).fill(credentials.username);
  await page.getByLabel("密码", { exact: true }).fill(credentials.password);
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "专属邀请函", exact: true }),
  ).toBeVisible();
  await page.locator(".invite-campaign-bar .el-select").click();
  await page
    .getByRole("option", { name: "成品海报 · 邀请函编辑演示", exact: true })
    .click();
  await page.getByRole("button", { name: "生成邀请函", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "生成专属邀请函" });
  await dialog.getByRole("textbox").first().fill("手机验收嘉宾");
  await dialog.getByRole("button", { name: "生成邀请函", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByAltText("微信扫码打开专属邀请函")).toBeVisible();
  const shareUrl = await page
    .getByRole("textbox", { name: "专属邀请地址" })
    .inputValue();
  await page.screenshot({
    path: "output/playwright/invitation-live-admin-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.goto(shareUrl);
  await expect(
    page.locator(".invitation-hero__recipient, .invite-artwork__text").first(),
  ).toContainText("手机验收嘉宾");
});

for (const width of [390, 1440])
  test(`uploaded artwork and rich text render from the real API at ${width}px`, async ({
    page,
  }) => {
    test.skip(
      !process.env.INVITATION_LIVE_ARTWORK_URL,
      "Set INVITATION_LIVE_ARTWORK_URL",
    );
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(process.env.INVITATION_LIVE_ARTWORK_URL!);
    await expect(page.locator(".invite-artwork__text")).toHaveText(
      "演示嘉宾甲",
    );
    await expect
      .poll(() =>
        page
          .locator(".invite-artwork__sheet > img")
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBe(1080);
    await expect(page.locator(".invitation-rich-body strong")).toContainText(
      "让交流回到真实的问题",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/invitation-artwork-live-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(failures).toEqual([]);
  });
