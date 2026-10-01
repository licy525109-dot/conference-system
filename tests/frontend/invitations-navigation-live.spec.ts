import { expect, test } from "@playwright/test";
import {
  invitationModuleRepeatable,
  invitationNavigationLinks,
  invitationVisibleModules,
  normalizeInvitationContent,
} from "../../packages/shared/src/invitations";

const url = process.env.INVITATION_NAVIGATION_LIVE_URL;
test.skip(
  !url,
  "Set INVITATION_NAVIGATION_LIVE_URL to a local invitation for read-only checks",
);

for (const width of [390, 1440]) {
  test(`built navigation matches the current published content at ${width}px`, async ({
    page,
  }) => {
    const target = new URL(url!);
    expect(["localhost", "127.0.0.1"]).toContain(target.hostname);
    const response = await page.request.get(
      `${target.origin}/api/invitations/${target.pathname.split("/").pop()}`,
    );
    expect(response.ok()).toBe(true);
    const content = normalizeInvitationContent(
      (await response.json()).data.content,
    );
    const links = invitationNavigationLinks(content),
      modules = invitationVisibleModules(content);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (
        /\/invitation-assets\//.test(response.url()) &&
        response.status() >= 400
      )
        errors.push(`Asset HTTP ${response.status()}`);
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto(url!);
    await expect(page.locator(".invitation-document")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "邀请函章节" });
    if (links.length) {
      await expect(nav.locator("a")).toHaveText(
        links.map((item) => item.label),
      );
      await expect(nav).toHaveCSS(
        "position",
        content.navigation!.sticky ? "sticky" : "static",
      );
      for (const [index, item] of links.entries()) {
        const module = item.module;
        const id = `invitation-${module.type === "invitees" ? "list" : invitationModuleRepeatable(module.type) ? module.id : module.type}`;
        await expect(nav.locator("a").nth(index)).toHaveAttribute(
          "href",
          `#${id}`,
        );
        await expect(page.locator(`[id="${id}"]`)).toHaveCount(1);
      }
      const index = Math.max(
        0,
        links.findIndex((item) => item.module.type === "agenda"),
      );
      await nav.locator("a").nth(index).click();
      const href = await nav.locator("a").nth(index).getAttribute("href");
      await expect(page.locator(href!)).toBeInViewport();
      await expect
        .poll(() =>
          page
            .locator(href!)
            .evaluate((element) => element.getBoundingClientRect().top),
        )
        .toBeLessThan(180);
    } else {
      await expect(nav).toHaveCount(0);
    }
    await expect(page.locator(".invitation-module-wrap")).toHaveCount(
      modules.length,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await page.screenshot({
      path: `output/playwright/invitation-navigation-live-${width}.png`,
      animations: "disabled",
    });
  });
}
