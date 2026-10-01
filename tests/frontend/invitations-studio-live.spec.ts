import { expect, test } from "@playwright/test";

const url = process.env.INVITATION_STUDIO_LIVE_URL;
test.skip(!url, "Set INVITATION_STUDIO_LIVE_URL to the local studio showcase");

for (const width of [390, 1440]) {
  test(`built studio modules load at the guest asset prefix at ${width}px`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    page.on("response", (response) => {
      if (
        /\/(?:invitation-assets|assets)\//.test(response.url()) &&
        response.status() >= 400
      )
        failures.push(
          `${response.status()}: ${new URL(response.url()).pathname}`,
        );
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url!);
    await expect(page.locator(".invitation-letter")).toContainText(
      "演示嘉宾1老师",
    );
    const gallery = page.locator(".invitation-carousel");
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery.locator(".swiper")).toHaveCSS("overflow", "hidden");
    await expect
      .poll(() =>
        gallery
          .locator("img")
          .first()
          .evaluate((el: HTMLImageElement) => el.naturalWidth),
      )
      .toBeGreaterThan(0);
    await gallery.getByRole("slider", { name: "轮播进度滑块" }).fill("1");
    await expect(gallery.locator(".swiper-slide-active")).toContainText("青玉");
    await page.getByRole("tab", { name: "交通信息", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toContainText("真实会场");
    await page.getByRole("button", { name: "查看我的位置" }).click();
    await expect(page.locator(".invitation-roster-pages")).toContainText(
      "2 / 2",
    );
    await expect(page.locator(".is-recipient")).toContainText("演示嘉宾1");
    await page.locator(".map-canvas").scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-container")).toBeVisible();
    await expect(page.locator(".leaflet-tile").first()).toHaveAttribute(
      "referrerpolicy",
      "origin",
    );
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible({
      timeout: 20000,
    });
    await expect(page.locator(".map-error")).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "导航", exact: true }),
    ).toHaveAttribute("href", /uri.amap.com/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: `output/playwright/invitation-studio-live-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(failures).toEqual([]);
  });
}
