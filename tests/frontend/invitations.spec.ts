import { expect, test, type Page, type Route } from "@playwright/test";
import { createRequire } from "node:module";
import { readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  createInvitationContent,
  applyInvitationPreset,
  INVITATION_THEMES,
  createInvitationLayer,
  INVITATION_FONTS,
  createInvitationModule,
  normalizeInvitationContent,
  normalizeInvitationNavigation,
  type PublicInvitation,
} from "../../packages/shared/src/invitations";
import { applyInvitationBooklet } from "../../packages/shared/src/invitation-booklet";
const token = "a".repeat(43);
const origin =
  process.env.INVITATION_TEST_ADMIN_ORIGIN || "http://localhost:5174";
const artworkPath =
  process.env.INVITATION_ARTWORK_PATH ||
  "apps/admin/public/invitation-art/tide-paper.jpg";

for (const width of [320, 390, 1440])
  test(`booklet template renders nine readable chapters and live data at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    const doc = document();
    doc.content.guests = [];
    doc.content.highlights = [];
    doc.content = applyInvitationBooklet(doc.content);
    doc.content.agenda.push({
      id: "third-day",
      date: "12月20日",
      time: "下午",
      title: "第三天共创讨论",
      speaker: "",
      location: "",
    });
    doc.recipient.name = "演示嘉宾25";
    const org = doc.content.modules.find(
      (module) => module.type === "organizations",
    )!;
    org.items![0].description = "示例指导单位";
    org.items![0].imageUrl = "/invitation-art/booklet-waves.png";
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await publicFixture(page, () => doc);
    await page.goto(`${origin}/i/${token}`);
    await expect(page.locator(".invitation-document")).toHaveClass(
      /invitation-preset--booklet/,
    );
    await expect(page.locator(".invitation-section__heading")).toHaveCount(9);
    await expect(
      page.locator(".invitation-section__heading > span"),
    ).toHaveText(["01", "02", "03", "04", "05", "06", "07", "08", "09"]);
    await expect(page.locator(".invitation-hero h1")).toHaveText(
      doc.content.title,
    );
    await expect(page.locator(".invitation-hero__recipient strong")).toHaveText(
      doc.recipient.name,
    );
    await expect(page.locator(".invitation-agenda__day")).toHaveText([
      "12月18日",
      "12月19日",
      "12月20日",
    ]);
    await expect(page.locator(".invitation-days")).toHaveCount(0);
    await expect(page.locator(".invitation-topic")).toHaveCount(8);
    await expect(page.locator(".invitation-organization-list dt")).toHaveText([
      "指导单位",
      "主办单位",
    ]);
    await expect(page.locator(".organization-identity img")).toHaveJSProperty(
      "naturalWidth",
      5032,
    );
    await expect(page.locator(".invitation-hero__image")).toHaveJSProperty(
      "naturalWidth",
      1826,
    );
    const geometry = await page
      .locator(".invitation-section, .invitation-hero__copy, .invitation-topic")
      .evaluateAll((elements) =>
        elements.map((element) => ({
          width: element.clientWidth,
          scrollWidth: element.scrollWidth,
        })),
      );
    expect(geometry.every((item) => item.scrollWidth <= item.width + 1)).toBe(
      true,
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document
        .querySelectorAll(".invitation-reveal")
        .forEach((element) => element.classList.remove("invitation-reveal"));
      window.scrollTo(0, 0);
    });
    await page.screenshot({
      path: `output/playwright/invitation-booklet-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.screenshot({
      path: `output/playwright/invitation-booklet-first-screen-${width}.png`,
      animations: "disabled",
    });
    await page
      .locator(".invitation-topic-list")
      .screenshot({
        path: `output/playwright/invitation-booklet-topics-${width}.png`,
        animations: "disabled",
      });
    await page.getByRole("button", { name: "查看我的位置" }).click();
    await expect(page.locator('[data-roster-id="p24"]')).toBeFocused();
    doc.content.title = "后台更新后同步的会议名称";
    doc.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator(".invitation-hero h1")).toHaveText(
      doc.content.title,
    );
    expect(failures).toEqual([]);
  });

test("booklet template applies and publishes from editor without changing registration or extra content", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  const doc = document();
  doc.content.registration = {
    mode: "external",
    conferenceId: "",
    url: "https://example.com/registration",
    label: "填写报名表",
  };
  const campaign = await adminFixture(page, ["*"], doc);
  const before = normalizeInvitationContent(campaign.draft);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "视觉与分享" }).click();
  await page.getByRole("button", { name: /观潮·会议长卷/ }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".invite-editor-toolbar")).toContainText(
    "草稿已保存",
  );
  expect(campaign.draft.visualPreset).toBe("booklet");
  expect(campaign.draft.title).toBe(before.title);
  expect(campaign.draft.registration).toEqual(before.registration);
  expect(campaign.draft.agenda).toEqual(before.agenda);
  expect(campaign.draft.invitees).toEqual(before.invitees);
  await page.getByRole("tab", { name: "会议内容", exact: true }).click();
  await page
    .getByRole("button", { name: /组织架构/ })
    .first()
    .click();
  await page
    .locator(".extra-module-editor .el-collapse-item__header")
    .first()
    .click();
  await expect(
    page.getByText("角色 / 分组", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: /小组讨论话题/ }).click();
  await expect(page.getByText("议题列表", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "发布更新", exact: true }).click();
  await page
    .getByRole("dialog", { name: "发布会议邀请函" })
    .getByRole("button", { name: "发布更新", exact: true })
    .click();
  await expect(
    page.getByText("已发布，所有专属链接已同步", { exact: true }),
  ).toBeVisible();
  expect(campaign.published.visualPreset).toBe("booklet");
  await page.getByRole("tab", { name: "视觉与分享" }).click();
  await page.screenshot({
    path: "output/playwright/invitation-booklet-editor.png",
    fullPage: true,
    animations: "disabled",
  });
});
function document(): PublicInvitation {
  const content = applyInvitationPreset(createInvitationContent(), "tide");
  Object.assign(content, {
    title: "观潮会集 · 行业交流会",
    subtitle: "与同行相聚，共探新的可能",
    host: "观潮会集",
    dateLabel: "2026年12月18日",
    location: "杭州 · 会议中心",
    introduction:
      "诚邀您与同行相聚，在交流与实践中，共同探讨行业新的方向。\n期待与您面对面，让想法在交流中生长。",
    highlights: [
      {
        id: "h1",
        title: "与行业同行深入交流",
        description: "围绕真实实践展开讨论，分享各自的经验与思考。",
      },
    ],
    agenda: [
      {
        id: "a1",
        date: "12月18日",
        time: "09:00–10:00",
        title: "开场交流",
        speaker: "",
        location: "主会场",
      },
      {
        id: "a2",
        date: "12月19日",
        time: "10:00–11:30",
        title: "专题圆桌",
        speaker: "",
        location: "分会场",
      },
    ],
    guests: [
      {
        id: "g1",
        name: "演示嘉宾",
        organization: "示例机构",
        role: "仅用于界面验证",
        status: "INVITED",
        imageUrl: "",
      },
    ],
    invitees: Array.from({ length: 45 }, (_, i) => ({
      id: `p${i}`,
      name: `演示嘉宾${i + 1}`,
      organization: "用于测试长机构名称在手机页面中的换行与完整显示",
    })),
  });
  return {
    recipient: { name: "受邀嘉宾", salutation: "老师" },
    conferenceId: "meeting",
    revision: 1,
    publishedAt: "2026-09-30T00:00:00.000Z",
    content,
    shareUrl: `https://guanchaohuiji.com/i/${token}`,
    registrationPath: `pages/registration/form?conferenceId=meeting&invitationToken=${token}`,
    registrationOpen: true,
    registrationMessage: "前往小程序报名",
    miniAppId: "",
  };
}
async function ok(route: Route, data: unknown) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ code: "OK", message: "ok", data }),
  });
}
async function publicFixture(page: Page, getDocument: () => PublicInvitation) {
  await page.route("**/api/invitations/**", (route) =>
    ok(route, getDocument()),
  );
}
test("custom uploaded fonts load, replace inline type and fall back safely when unavailable", async ({
  page,
}) => {
  const doc = document();
  doc.content.design = {
    ...doc.content.design!,
    font: "custom",
    fontUrl: "/uploads/test-font.woff2",
    replaceAllFonts: true,
  };
  await publicFixture(page, () => doc);
  const fontDir = resolve(
    dirname(
      createRequire(resolve("services/api/package.json")).resolve(
        "prisma/package.json",
      ),
    ),
    "build/public/assets",
  );
  const fontName = (await readdir(fontDir)).find((name) =>
    /^inter-latin-400-normal\..+\.woff2$/.test(name),
  );
  expect(fontName).toBeTruthy();
  await page.route("**/uploads/test-font.woff2", (route) =>
    route.fulfill({
      path: resolve(fontDir, fontName!),
      contentType: "font/woff2",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto(`${origin}/i/${token}`);
  await expect
    .poll(() =>
      page
        .locator(".invitation-document")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--invite-global-font"),
        ),
    )
    .toContain("InvitationFont");
  await expect(page.locator(".invitation-document")).toHaveClass(
    /invitation-unified-font/,
  );
  await expect(page.locator(".invitation-hero h1")).toHaveCSS(
    "font-family",
    /InvitationFont/,
  );
  await page.evaluate(() => {
    (
      window as unknown as { invitationTestFont?: FontFace }
    ).invitationTestFont = Array.from(document.fonts).find((face) =>
      face.family.startsWith("InvitationFont"),
    );
  });
  doc.content.subtitle = "更新会议信息而不重复加载字体";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".invitation-hero__copy")).toContainText(
    doc.content.subtitle,
  );
  expect(
    await page.evaluate(() =>
      document.fonts.has(
        (window as unknown as { invitationTestFont: FontFace })
          .invitationTestFont,
      ),
    ),
  ).toBe(true);
  doc.revision++;
  doc.content.design!.fontUrl = "/uploads/missing-font.woff2";
  await page.route("**/uploads/missing-font.woff2", (route) => route.abort());
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".invitation-document")).not.toHaveClass(
    /invitation-unified-font/,
  );
  await expect(page.locator(".invitation-hero h1")).toBeVisible();
});
function expandedDocument(): PublicInvitation {
  const doc = document(),
    image = "/invitation-art/tide-paper.jpg";
  doc.content.guests[0].biography =
    "嘉宾长篇介绍第一段。\n第二段介绍研究、实践与分享方向。";
  doc.content.guests[0].imageUrl = image;
  doc.content.agenda[0].imageUrl = image;
  doc.content.agenda[0].speaker = "议程分享嘉宾";
  doc.content.inviteeSort = { key: "name", direction: "desc" };
  doc.recipient = {
    name: "演示嘉宾1",
    salutation: "老师",
    publicInviteeId: "p0",
  };
  const gallery = createInvitationModule("carousel", "gallery");
  gallery.settings!.effect = "coverflow";
  gallery.items = [1, 2, 3].map((i) => ({
    id: `slide-${i}`,
    title: `轮播图片${i}`,
    description: "本地界面测试素材",
    imageUrl: image,
    href: "",
    icon: "link",
    body: [],
  }));
  const tabs = createInvitationModule("tabs", "tabs");
  tabs.items = [1, 2].map((i) => ({
    id: `tab-${i}`,
    title: `会场${i}`,
    description: "",
    imageUrl: "",
    href: "",
    icon: "link",
    body: [{ tag: "p", attrs: {}, children: [{ text: `会场${i}详细说明` }] }],
  }));
  const links = createInvitationModule("links", "links");
  links.items = [
    {
      id: "link-1",
      title: "官方网站",
      description: "更多会议信息",
      imageUrl: "",
      href: "https://guanchaohuiji.com",
      icon: "link",
      body: [],
    },
  ];
  const map = createInvitationModule("map", "map");
  map.settings!.address = "北京会议中心";
  map.settings!.latitude = 39.9;
  map.settings!.longitude = 116.4;
  doc.content.modules.push(
    gallery,
    tabs,
    links,
    createInvitationModule("search", "search"),
    map,
  );
  doc.content.modules.find((m) => m.type === "guests")!.settings = {
    ...createInvitationModule("guests", "g").settings!,
    layout: "list",
  };
  doc.content = normalizeInvitationContent(doc.content);
  return doc;
}
test("media controls play uploaded audio and show a readable video failure state", async ({
  page,
}) => {
  const doc = document();
  const audio = createInvitationModule("audio", "sound");
  audio.settings!.mediaUrl = "/uploads/test.wav";
  const video = createInvitationModule("video", "film");
  video.settings!.mediaUrl = "/uploads/unavailable.mp4";
  video.settings!.posterUrl = "/invitation-art/tide-paper.jpg";
  doc.content.modules.push(audio, video);
  await publicFixture(page, () => doc);
  // Two seconds of silent PCM exercise native media decoding without an external dependency.
  const samples = 16000,
    wave = Buffer.alloc(44 + samples * 2);
  wave.write("RIFF", 0);
  wave.writeUInt32LE(wave.length - 8, 4);
  wave.write("WAVEfmt ", 8);
  wave.writeUInt32LE(16, 16);
  wave.writeUInt16LE(1, 20);
  wave.writeUInt16LE(1, 22);
  wave.writeUInt32LE(8000, 24);
  wave.writeUInt32LE(16000, 28);
  wave.writeUInt16LE(2, 32);
  wave.writeUInt16LE(16, 34);
  wave.write("data", 36);
  wave.writeUInt32LE(samples * 2, 40);
  await page.route("**/uploads/test.wav", (route) =>
    route.fulfill({
      body: wave,
      contentType: "audio/wav",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.route("**/uploads/unavailable.mp4", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await page.goto(`${origin}/i/${token}`);
  const player = page.locator("audio");
  await player.scrollIntoViewIfNeeded();
  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.duration))
    .toBe(2);
  await expect(player).toHaveAttribute("controls", "");
  expect(await player.evaluate((el: HTMLAudioElement) => el.paused)).toBe(true);
  await player.evaluate((el: HTMLAudioElement) => el.play());
  await expect
    .poll(() => player.evaluate((el: HTMLAudioElement) => el.currentTime))
    .toBeGreaterThan(0);
  await player.evaluate((el: HTMLAudioElement) => el.pause());
  await expect(page.locator("video")).toHaveAttribute("playsinline", "");
  await expect(page.locator("video")).not.toHaveAttribute("autoplay", "");
  await expect(page.locator(".media-error")).toHaveText(
    "媒体暂时无法播放，请稍后重试。",
  );
});
for (const width of [390, 1440])
  test(`extended modules, portraits, sorted roster and accessible interactions at ${width}px`, async ({
    page,
  }) => {
    const failures: string[] = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const doc = expandedDocument();
    await publicFixture(page, () => doc);
    // Deterministic tile image for layout/interaction tests; live map networking is tested separately.
    await page.route("https://tile.openstreetmap.org/**", (route) =>
      route.fulfill({ path: artworkPath }),
    );
    await page.goto(`${origin}/i/${token}`);
    await expect(page.locator(".invitation-agenda__speaker img")).toHaveCount(
      1,
    );
    await expect(page.locator(".invitation-guest__biography")).toContainText(
      "第二段",
    );
    await expect(
      page.locator(".invitation-roster tbody tr").first(),
    ).toContainText("演示嘉宾45");
    await page.getByRole("button", { name: "查看我的位置" }).click();
    await expect(page.locator(".invitation-roster-pages")).toContainText(
      "3 / 3",
    );
    await expect(page.locator(".is-recipient")).toBeVisible();
    await page.getByRole("tab", { name: "会场1", exact: true }).click();
    await page
      .getByRole("tab", { name: "会场1", exact: true })
      .press("ArrowRight");
    await expect(
      page.getByRole("tab", { name: "会场2", exact: true }),
    ).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText("会场2详细说明");
    const gallery = page.locator(".invitation-carousel");
    await gallery.scrollIntoViewIfNeeded();
    await expect(gallery.locator(".swiper-slide")).toHaveCount(3);
    await expect
      .poll(() =>
        gallery
          .locator("img")
          .first()
          .evaluate((img: HTMLImageElement) => img.naturalWidth),
      )
      .toBeGreaterThan(0);
    await gallery.getByRole("slider", { name: "轮播进度滑块" }).fill("2");
    await expect(gallery.locator(".swiper-slide-active")).toContainText(
      "轮播图片3",
    );
    await page
      .getByRole("searchbox", { name: "搜索邀请函内容" })
      .fill("演示嘉宾1");
    await page
      .locator(".content-search-results")
      .getByRole("button")
      .first()
      .click();
    await expect(page.locator(".invitation-roster")).toBeVisible();
    await expect(page.getByRole("link", { name: /官方网站/ })).toHaveAttribute(
      "href",
      "https://guanchaohuiji.com/",
    );
    await page.locator(".map-canvas").scrollIntoViewIfNeeded();
    await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
    await page.locator(".leaflet-control-zoom-in").click();
    await expect(
      page.locator('.leaflet-tile-loaded[src*="org/16/"]').first(),
    ).toBeVisible();
    await expect(page.locator('.leaflet-tile[src*="org/15/"]')).toHaveCount(0);
    doc.content.subtitle = "更新正文时保留地图缩放";
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.locator(".invitation-hero__copy")).toContainText(
      doc.content.subtitle,
    );
    await expect(page.locator('.leaflet-tile[src*="org/15/"]')).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "导航", exact: true }),
    ).toHaveAttribute("href", /uri.amap.com/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `output/playwright/invitation-expanded-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(failures).toEqual([]);
  });
for (const width of [390, 1512])
  test(`editor supports asset reuse, biographies, sorting and module styling at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const campaign = await adminFixture(page, ["*"]);
    await page.route("**/campaigns/campaign/assets**", (route) =>
      ok(route, {
        items: [
          {
            id: "photo",
            name: "测试头像",
            url: "/invitation-art/tide-paper.jpg",
            fileType: "image/jpeg",
            sizeBytes: 1000,
          },
        ],
        total: 1,
      }),
    );
    await page.goto(`${origin}/#/invitations`);
    await page.getByRole("tab", { name: "会议内容", exact: true }).click();
    await page.getByRole("button", { name: /04 嘉宾介绍/ }).click();
    const editor = page.locator(".invitation-module-editor");
    await editor
      .getByRole("textbox", { name: "嘉宾介绍", exact: true })
      .fill("第一段：完整的嘉宾背景。\n第二段：长期研究方向与实践。");
    await editor.getByRole("button", { name: "素材库", exact: true }).click();
    await page.getByRole("button", { name: "选择素材 测试头像" }).click();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.locator(".invite-editor-toolbar")).toContainText(
      "草稿已保存",
    );
    expect(campaign.draft.guests[0].biography).toContain("第二段");
    expect(campaign.draft.guests[0].imageUrl).toBe(
      "/invitation-art/tide-paper.jpg",
    );
    await editor.getByRole("tab", { name: "样式", exact: true }).click();
    await editor.getByText("宽松", { exact: true }).click();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.locator(".invite-editor-toolbar")).toContainText(
      "草稿已保存",
    );
    expect(
      campaign.draft.modules.find((m) => m.type === "guests")?.style?.spacing,
    ).toBe("spacious");
    await expect(
      editor.getByRole("radio", { name: "宽松", exact: true }),
    ).toBeChecked();
    await page.reload();
    await page.getByRole("tab", { name: "会议内容", exact: true }).click();
    await page.getByRole("button", { name: /04 嘉宾介绍/ }).click();
    await editor.getByRole("tab", { name: "样式", exact: true }).click();
    await expect(
      editor.getByRole("radio", { name: "宽松", exact: true }),
    ).toBeChecked();
    await page.screenshot({
      path: `output/playwright/invitation-studio-style-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("tab", { name: "公开名单", exact: true }).click();
    await page.locator(".roster-order .el-select").click();
    await page.getByRole("option", { name: "按姓名拼音" }).click();
    await page.getByText("降序", { exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "名单姓名" }).first(),
    ).toHaveValue("演示嘉宾45");
    await page
      .getByRole("spinbutton", { name: "调整演示嘉宾45顺序" })
      .fill("3");
    await page
      .getByRole("spinbutton", { name: "调整演示嘉宾45顺序" })
      .press("Tab");
    await expect(
      page.getByRole("textbox", { name: "名单姓名" }).nth(2),
    ).toHaveValue("演示嘉宾45");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(page.locator(".invite-editor-toolbar")).toContainText(
      "草稿已保存",
    );
    expect(campaign.draft.inviteeSort?.key).toBe("manual");
    expect(campaign.draft.invitees[2].id).toBe("p44");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
for (const width of [320, 360, 390, 430, 1440])
  test(`invitation is readable and interactive at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 900 });
    const doc = document();
    if (width === 430)
      Object.assign(doc.content, {
        theme: "coral",
        ...INVITATION_THEMES.coral,
      });
    await publicFixture(page, () => doc);
    await page.goto(`${origin}/i/${token}`);
    await expect(
      page.getByRole("heading", { name: doc.content.title }),
    ).toBeVisible();
    await expect(page.locator(".invitation-letter")).toContainText(
      "受邀嘉宾老师",
    );
    const image = page.locator(".invitation-hero__image");
    await expect(image).toBeVisible();
    expect(
      await page
        .locator(".invitation-letter__eyebrow")
        .evaluate((el) => el.getBoundingClientRect().top < innerHeight - 76),
    ).toBe(true);
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `output/playwright/invitation-first-fold-${width}.png`,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("tab", { name: "12月19日" }).click();
    await expect(page.locator(".invitation-agenda")).toContainText("专题圆桌");
    await page.getByRole("searchbox").fill("演示嘉宾45");
    await expect(page.locator(".invitation-roster tbody tr")).toHaveCount(1);
    await page.getByRole("button", { name: "分享邀请函", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText("guanchaohuiji.com");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.evaluate(() => {
      document
        .querySelectorAll(".invitation-reveal")
        .forEach((el) => el.classList.remove("invitation-reveal"));
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await expect
      .poll(() =>
        page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: "instant" });
          return window.scrollY;
        }),
      )
      .toBe(0);
    await page.screenshot({
      path: `output/playwright/invitation-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
test("a published update refreshes an already open link without changing the recipient", async ({
  page,
}) => {
  const doc = document();
  await publicFixture(page, () => doc);
  await page.goto(`${origin}/i/${token}`);
  await expect(page.locator(".invitation-agenda")).toContainText("开场交流");
  doc.revision = 2;
  doc.content.agenda[0]!.title = "更新后的会议议程";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.locator(".invitation-agenda")).toContainText(
    "更新后的会议议程",
  );
  await expect(page.locator(".invitation-letter")).toContainText(
    "受邀嘉宾老师",
  );
  await page.route("**/api/invitations/**", (route) =>
    route.fulfill({
      status: 410,
      contentType: "application/json",
      body: JSON.stringify({ message: "disabled" }),
    }),
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(
    page.getByRole("heading", { name: "邀请函暂不可用" }),
  ).toBeVisible();
  await expect(page.locator(".invitation-document")).toHaveCount(0);
});
async function adminFixture(
  page: Page,
  permissions: string[],
  doc = document(),
) {
  const campaign = {
    id: "campaign",
    conferenceId: "meeting",
    title: doc.content.title,
    draft: doc.content,
    published: doc.content,
    draftRevision: 1,
    publishedRevision: 1,
    publishedAt: doc.publishedAt,
    hasChanges: false,
  };
  await page.addInitScript(() =>
    localStorage.setItem(
      "conference_admin_token",
      "invitation-browser-fixture",
    ),
  );
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    if (path.endsWith("/auth/me"))
      return ok(route, {
        admin: {
          id: "admin",
          username: "operator",
          displayName: "邀约工作人员",
          permissions,
        },
      });
    if (path.endsWith("/theme")) return ok(route, { config: {} });
    if (path.endsWith("/campaigns")) return ok(route, { items: [campaign] });
    if (path.endsWith("/campaigns/campaign")) {
      if (route.request().method() === "PATCH") {
        campaign.draft = route.request().postDataJSON().content;
        campaign.draftRevision++;
        campaign.hasChanges = true;
      }
      return ok(route, campaign);
    }
    if (path.endsWith("/publish")) {
      expect(route.request().postDataJSON().draftRevision).toBe(
        campaign.draftRevision,
      );
      campaign.published = campaign.draft;
      campaign.publishedRevision++;
      campaign.hasChanges = false;
      return ok(route, campaign);
    }
    if (path.endsWith("/members")) return ok(route, { adminIds: ["admin"] });
    if (path.endsWith("/options"))
      return ok(route, {
        conferences: [],
        admins: [
          { id: "admin", username: "operator", displayName: "邀约工作人员" },
        ],
      });
    if (path.endsWith("/registration-options"))
      return ok(route, {
        conferences: [{ id: "meeting", title: campaign.title }],
      });
    if (path.endsWith("/recipients")) {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        expect(body.name).toBeTruthy();
        return ok(route, { id: "invite", shareUrl: doc.shareUrl });
      }
      return ok(route, {
        total: 1,
        items: [
          {
            id: "invite",
            name: "受邀嘉宾",
            salutation: "老师",
            enabled: true,
            shareUrl: doc.shareUrl,
            createdAt: doc.publishedAt,
            createdBy: "admin",
            creator: { displayName: "邀约工作人员", username: "operator" },
            registrationCount: 0,
          },
        ],
      });
    }
    return ok(route, {});
  });
  return campaign;
}
for (const width of [390, 1440]) {
  test(`external meeting creation and registration settings are usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 920 });
    const campaign = await adminFixture(page, ["*"]);
    let created: Record<string, any> | undefined;
    await page.route("**/api/admin/invitations/campaigns", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      created = route.request().postDataJSON();
      Object.assign(campaign, {
        conferenceId: null,
        draft: {
          ...campaign.draft,
          title: created!.title,
          registration: created!.registration,
        },
      });
      return ok(route, { id: "campaign" });
    });
    await page.goto(`${origin}/#/invitations`);
    await page
      .getByRole("button", { name: "新建会议邀请函", exact: true })
      .click();
    const dialog = page.getByRole("dialog", { name: "新建会议邀请函" });
    await dialog
      .locator(".el-radio-button")
      .filter({ hasText: "外部会议" })
      .click();
    await dialog
      .getByRole("textbox", { name: "会议名称", exact: true })
      .fill("独立行业研讨会");
    await dialog
      .getByRole("textbox", { name: "会议时间", exact: true })
      .fill("2026年12月18日");
    await dialog
      .getByRole("textbox", { name: "会议地点", exact: true })
      .fill("杭州");
    await dialog
      .getByRole("textbox", { name: "外部报名链接", exact: true })
      .fill("https://example.com/form?event=conference");
    await page.screenshot({
      path: `output/playwright/invitation-external-create-${width}.png`,
      animations: "disabled",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "创建", exact: true }).click();
    await expect(dialog).toBeHidden();
    expect(created?.source).toBe("external");
    expect(created?.conferenceId).toBeUndefined();
    expect(created?.registration.url).toBe(
      "https://example.com/form?event=conference",
    );
    await page.getByRole("tab", { name: "报名入口", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "外部报名链接", exact: true }),
    ).toHaveValue("https://example.com/form?event=conference");
    await page
      .getByRole("textbox", { name: "报名按钮文字", exact: true })
      .fill("填写参会表");
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect(
      page
        .locator(".invite-editor-toolbar")
        .getByText("草稿已保存", { exact: true }),
    ).toBeVisible();
    expect(campaign.draft.registration?.label).toBe("填写参会表");
    await page.screenshot({
      path: `output/playwright/invitation-registration-${width}.png`,
      animations: "disabled",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`official account settings save without echoing secret at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 920 });
    await adminFixture(page, ["*"]);
    let state = {
      revision: 0,
      enabled: false,
      appId: "",
      secretConfigured: false,
      source: "none",
      domain: "guanchaohuiji.com",
      verificationFileName: "",
      verificationUrl: "",
    };
    await page.route(
      "**/api/admin/invitations/settings/wechat",
      async (route) => {
        if (route.request().method() === "PATCH") {
          const body = route.request().postDataJSON();
          expect(body.appSecret).toHaveLength(32);
          expect(body.verificationFile.name).toBe("MP_verify_fixture.txt");
          state = {
            ...state,
            appId: body.appId,
            enabled: body.enabled,
            secretConfigured: true,
            revision: 1,
            source: "database",
            verificationFileName: body.verificationFile.name,
            verificationUrl: "https://guanchaohuiji.com/MP_verify_fixture.txt",
          };
        }
        return ok(route, state);
      },
    );
    await page.route("**/api/admin/invitations/settings/wechat/test", (route) =>
      ok(route, {
        ok: true,
        message: "微信接口连接成功；分享效果仍需在微信中验证",
      }),
    );
    await page.goto(`${origin}/#/invitations`);
    await page.getByRole("button", { name: "公众号配置", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "公众号配置" });
    await drawer
      .getByRole("textbox", { name: "公众号 AppID", exact: true })
      .fill("wx" + "a".repeat(16));
    await drawer
      .getByLabel("公众号 AppSecret", { exact: true })
      .fill("1".repeat(32));
    await drawer.locator(".el-switch").click();
    await drawer.getByLabel("公众号域名校验文件").setInputFiles({
      name: "MP_verify_fixture.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("FixtureVerification0123"),
    });
    await drawer.getByRole("button", { name: "保存配置", exact: true }).click();
    await expect(
      drawer.getByLabel("公众号 AppSecret", { exact: true }),
    ).toHaveValue("");
    await expect(drawer.getByText("密钥已配置", { exact: true })).toBeVisible();
    await drawer.getByRole("button", { name: "检测连接", exact: true }).click();
    await expect(
      drawer.getByText("微信接口连接成功；分享效果仍需在微信中验证", {
        exact: true,
      }),
    ).toBeVisible();
    await page.screenshot({
      path: `output/playwright/invitation-wechat-settings-${width}.png`,
      animations: "disabled",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await drawer
      .getByRole("textbox", { name: "公众号 AppID", exact: true })
      .fill("wx" + "b".repeat(16));
    await expect(
      drawer.getByText("微信接口连接成功；分享效果仍需在微信中验证", {
        exact: true,
      }),
    ).toBeHidden();
    await expect(
      drawer.getByRole("button", { name: "检测连接", exact: true }),
    ).toBeDisabled();
    await drawer
      .getByRole("button", { name: "关闭", exact: true })
      .last()
      .click();
    await page.getByRole("button", { name: "公众号配置", exact: true }).click();
    await expect(
      page.getByLabel("公众号 AppSecret", { exact: true }),
    ).toHaveValue("");
  });
}
test("official settings action is hidden without its dedicated permission", async ({
  page,
}) => {
  await adminFixture(page, ["invitation:view", "invitation:content"]);
  await page.goto(`${origin}/#/invitations`);
  await expect(
    page.getByRole("heading", { name: "专属邀请函", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "公众号配置", exact: true }),
  ).toHaveCount(0);
});
test("external registration opens only its configured URL and none hides the CTA", async ({
  page,
}) => {
  const doc = document();
  doc.registrationMode = "external";
  doc.registrationUrl = "https://example.com/form?event=1";
  doc.registrationMessage = "填写参会表";
  await publicFixture(page, () => doc);
  await page.route("https://example.com/form?event=1", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>外部报名表</h1>" }),
  );
  await page.goto(`${origin}/i/${token}`);
  await page.getByRole("button", { name: "填写参会表", exact: true }).click();
  await expect(page).toHaveURL("https://example.com/form?event=1");
  doc.registrationMode = "none";
  doc.registrationOpen = false;
  await page.goto(`${origin}/i/${token}`);
  await expect(page.locator(".invitation-document")).toBeVisible();
  await expect(page.locator(".invitation-register")).toHaveCount(0);
});
for (const width of [390, 1512]) {
  test(`navigation editor saves independent order, labels and switches at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const campaign = await adminFixture(page, ["*"]);
    const originalModules = normalizeInvitationContent(campaign.draft).modules;
    await page.goto(`${origin}/#/invitations`);
    await page.getByRole("tab", { name: "视觉与分享" }).click();
    await page.getByRole("tab", { name: "章节导航", exact: true }).click();
    await expect(
      page.getByRole("switch", { name: "显示章节导航", exact: true }),
    ).toBeChecked();
    await page
      .getByRole("textbox", { name: "会议议程导航名称" })
      .fill("活动安排");
    await page.getByRole("button", { name: "上移会议议程导航" }).click();
    await page.getByRole("button", { name: "上移会议议程导航" }).click();
    await page
      .locator(".el-switch")
      .filter({
        has: page.getByRole("switch", {
          name: "显示嘉宾介绍导航",
          exact: true,
        }),
      })
      .click();
    await page
      .locator(".el-switch")
      .filter({
        has: page.getByRole("switch", { name: "导航吸顶显示", exact: true }),
      })
      .click();
    await expect(page.locator(".navigation-item").first()).toHaveAttribute(
      "data-navigation-id",
      "agenda",
    );
    await expect(
      page.locator(".navigation-preview-strip span").first(),
    ).toHaveText("活动安排");
    await expect(page.locator(".navigation-preview-strip")).not.toContainText(
      "嘉宾介绍",
    );
    await page.getByRole("button", { name: "保存并发布", exact: true }).click();
    await page
      .getByRole("dialog", { name: "发布会议邀请函" })
      .getByRole("button", { name: "发布更新", exact: true })
      .click();
    await expect.poll(() => campaign.published.navigation?.sticky).toBe(false);
    expect(campaign.published.navigation?.items[0].label).toBe("活动安排");
    expect(campaign.draft.modules).toEqual(originalModules);
    await page.reload();
    await page.getByRole("tab", { name: "视觉与分享" }).click();
    await page.getByRole("tab", { name: "章节导航", exact: true }).click();
    await expect(page.locator(".navigation-item").first()).toHaveAttribute(
      "data-navigation-id",
      "agenda",
    );
    await expect(
      page.getByRole("textbox", { name: "会议议程导航名称" }),
    ).toHaveValue("活动安排");
    await expect(
      page.getByRole("switch", { name: "显示嘉宾介绍导航", exact: true }),
    ).not.toBeChecked();
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: `output/playwright/invitation-navigation-editor-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .locator(".el-switch")
      .filter({
        has: page.getByRole("switch", { name: "显示章节导航", exact: true }),
      })
      .click();
    await page.getByRole("button", { name: "保存草稿", exact: true }).click();
    await expect.poll(() => campaign.draft.navigation?.enabled).toBe(false);
    expect(campaign.published.navigation?.enabled).toBe(true);
    await page
      .locator(".el-switch")
      .filter({
        has: page.getByRole("switch", { name: "显示章节导航", exact: true }),
      })
      .click();
    await expect(
      page.getByRole("textbox", { name: "会议议程导航名称" }),
    ).toHaveValue("活动安排");
    await page.getByRole("button", { name: "按正文顺序排列" }).click();
    await expect(page.locator(".navigation-item").first()).toHaveAttribute(
      "data-navigation-id",
      "letter",
    );
    await expect(
      page.getByRole("switch", { name: "显示嘉宾介绍导航", exact: true }),
    ).not.toBeChecked();
  });
}
for (const width of [390, 1440]) {
  test(`published navigation respects order, visibility and live refresh at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const doc = document();
    doc.content.modules.push(createInvitationModule("richtext", "empty"));
    doc.content.navigation = normalizeInvitationNavigation(
      {
        items: [
          { moduleId: "agenda", label: "活动安排" },
          { moduleId: "letter", label: "阅读邀请" },
          { moduleId: "guests", visible: false },
        ],
      },
      doc.content.modules,
    );
    await publicFixture(page, () => doc);
    await page.goto(`${origin}/i/${token}`);
    const nav = page.getByRole("navigation", { name: "邀请函章节" });
    await expect(nav.locator("a")).toHaveText([
      "活动安排",
      "阅读邀请",
      "相聚的理由",
      "拟邀名单",
      "赴约信息",
    ]);
    await expect(nav).toHaveCSS("position", "sticky");
    await expect(
      page.locator(".invitation-module-wrap").first(),
    ).toHaveAttribute("data-module-id", "letter");
    await expect(page.locator('[data-module-id="guests"]')).toHaveCount(1);
    await expect(page.locator('[data-module-id="empty"]')).toHaveCount(0);
    await nav.getByRole("link", { name: "活动安排", exact: true }).click();
    await expect(page.locator("#invitation-agenda")).toBeInViewport();
    await expect
      .poll(() =>
        page
          .locator("#invitation-agenda")
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBeGreaterThanOrEqual(45);
    await expect
      .poll(() =>
        page
          .locator("#invitation-agenda")
          .evaluate((el) => el.getBoundingClientRect().top),
      )
      .toBeLessThan(100);
    await page.screenshot({
      path: `output/playwright/invitation-navigation-public-${width}.png`,
      animations: "disabled",
    });
    doc.content.navigation.sticky = false;
    doc.content.effects.scroll = "chapters";
    doc.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(nav).toHaveCSS("position", "static");
    await expect(page.locator("#invitation-agenda")).toHaveCSS(
      "scroll-margin-top",
      "0px",
    );
    doc.content.navigation.enabled = false;
    doc.revision++;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(nav).toHaveCount(0);
    await expect(page.locator('[data-module-id="agenda"]')).toHaveCount(1);
    await expect(page.locator('[data-module-id="guests"]')).toHaveCount(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
test("mobile staff can generate an invitation without content or authorization access", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await adminFixture(page, ["invitation:view", "invitation:write"]);
  await page.goto(`${origin}/#/invitations`);
  await expect(page.locator(".invite-record")).toBeVisible();
  await expect(page.getByRole("tab", { name: "会议内容" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "封面定位", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "生成邀请函", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "生成专属邀请函" });
  await dialog.getByRole("textbox").first().fill("张老师");
  await dialog.getByRole("button", { name: "生成邀请函", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "邀请函已就绪" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "专属邀请地址" })).toHaveValue(
    `https://guanchaohuiji.com/i/${token}`,
  );
  await expect(dialog).toBeHidden();
  await expect(page.getByAltText("微信扫码打开专属邀请函")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/invitation-admin-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});
test("content editor applies full visual presets with live preview and save-and-publish", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 1000 });
  await adminFixture(page, ["*"]);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "视觉与分享" }).click();
  await page.getByRole("button", { name: /山水青玉/ }).click();
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(
    page.locator(".invite-preview-dialog .invitation-document"),
  ).toHaveClass(/invitation-preset--jade/);
  await page
    .getByRole("dialog", { name: "邀请函预览" })
    .getByRole("button", { name: "Close this dialog" })
    .click();
  await expect(page.getByRole("button", { name: "保存并发布" })).toBeEnabled();
  await page.getByRole("textbox", { name: "预览受邀人姓名" }).fill("陈老师");
  await page.getByRole("tab", { name: "微信分享", exact: true }).click();
  await expect(page.locator(".studio-share-card")).toContainText(
    "陈老师专属邀请函",
  );
  await expect(page.getByRole("button", { name: "保存草稿" })).toBeEnabled();
  await page.screenshot({
    path: "output/playwright/invitation-admin-editor.png",
    fullPage: true,
    animations: "disabled",
  });
});

for (const width of [320, 390, 1440])
  test(`artwork overlays and ordered rich modules remain accurate at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const doc = document();
    doc.content.coverImageUrl = "/uploads/poster.png";
    doc.content.cover = {
      mode: "artwork",
      width: 1080,
      height: 1920,
      layers: [
        {
          ...createInvitationLayer("name"),
          text: "{姓名}",
          font: "kai",
          color: "#943f55",
          italic: true,
        },
        {
          ...createInvitationLayer("hidden"),
          enabled: false,
          text: "不应出现",
        },
      ],
    };
    doc.recipient.name = "陈嘉宾";
    doc.content.modules = [
      {
        id: "custom-first",
        type: "richtext",
        enabled: true,
        title: "参会说明",
        imageUrl: "",
        body: [
          {
            tag: "p",
            attrs: { style: "text-align:center" },
            children: [
              {
                tag: "span",
                attrs: {
                  style: `font-family:${INVITATION_FONTS.kai.family};font-size:24px;font-weight:700;font-style:italic;color:#943f55`,
                },
                children: [{ text: "专属图文内容" }],
              },
            ],
          },
        ],
      },
      { ...doc.content.modules.find((item) => item.type === "agenda")! },
      {
        ...doc.content.modules.find((item) => item.type === "venue")!,
        enabled: false,
      },
    ];
    await publicFixture(page, () => doc);
    await page.route("**/uploads/poster.png", (route) =>
      route.fulfill({ path: artworkPath }),
    );
    await page.goto(`${origin}/i/${token}`);
    await expect(page.locator(".invite-artwork__text")).toHaveCount(1);
    const layer = page.locator('[data-layer-id="name"]');
    await expect(layer).toHaveText("陈嘉宾");
    const geometry = await layer.evaluate((el) => {
      const r = el.getBoundingClientRect(),
        p = el.closest(".invite-artwork")!.getBoundingClientRect();
      return {
        x: (r.x - p.x) / p.width,
        y: (r.y - p.y) / p.height,
        ratio: p.width / p.height,
        color: getComputedStyle(el).color,
        italic: getComputedStyle(el).fontStyle,
      };
    });
    expect(geometry.x).toBeCloseTo(0.1, 2);
    expect(geometry.y).toBeCloseTo(0.42, 2);
    expect(geometry.ratio).toBeCloseTo(9 / 16, 3);
    expect(geometry.color).toBe("rgb(148, 63, 85)");
    expect(geometry.italic).toBe("italic");
    await expect(page.locator(".invitation-hero")).toHaveCount(0);
    await expect(page.locator("#invitation-venue")).toHaveCount(0);
    expect(
      await page
        .locator(".invitation-document > .invitation-module-wrap > section")
        .evaluateAll((nodes) => nodes.map((node) => node.id)),
    ).toEqual(["invitation-custom-first", "invitation-agenda"]);
    await page.locator(".invitation-rich-body").scrollIntoViewIfNeeded();
    await expect(page.locator(".invitation-rich-body span")).toHaveCSS(
      "font-size",
      "24px",
    );
    await expect(page.locator(".invitation-rich-body span")).toHaveCSS(
      "font-weight",
      "700",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => {
      document
        .querySelectorAll(".invitation-reveal")
        .forEach((el) => el.classList.remove("invitation-reveal"));
      window.scrollTo({ top: 0, behavior: "instant" });
    });
    await page.screenshot({
      path: `output/playwright/invitation-artwork-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    doc.recipient.name = "超长受邀嘉宾姓名".repeat(10);
    await page.reload();
    await expect(page.locator('[data-layer-id="name"]')).toHaveText(
      doc.recipient.name,
    );
    await expect
      .poll(() =>
        page
          .locator('[data-layer-id="name"] span')
          .evaluate(
            (el) =>
              el.scrollWidth <= el.parentElement!.clientWidth &&
              el.scrollHeight <= el.parentElement!.clientHeight,
          ),
      )
      .toBe(true);
  });

test("cover editor uploads artwork, drags and styles optional recipient text", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 1050 });
  const campaign = await adminFixture(page, ["*"]);
  await page.route("**/campaigns/campaign/assets", (route) =>
    ok(route, { url: "/uploads/poster.png" }),
  );
  await page.route("**/uploads/poster.png", (route) =>
    route.fulfill({ path: artworkPath }),
  );
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("button", { name: "封面定位", exact: true }).click();
  const confirmation = page.getByRole("dialog", { name: "切换为定位画布" });
  await expect(confirmation).toBeVisible();
  await confirmation
    .getByRole("button", { name: "保留模板", exact: true })
    .click();
  await expect(page.locator(".cover-workspace")).toHaveCount(0);
  expect(campaign.draft.cover.mode).toBe("template");
  await page.getByRole("button", { name: "打开定位画布", exact: true }).click();
  await confirmation
    .getByRole("button", { name: "切换并打开", exact: true })
    .click();
  await expect(page.locator(".cover-workspace")).toBeVisible();
  await expect(
    page
      .locator(".cover-inspector")
      .getByRole("textbox", { name: "封面图片", exact: true }),
  ).toHaveValue(campaign.draft.coverImageUrl);
  await page
    .locator(".cover-inspector input[type=file]")
    .setInputFiles(artworkPath);
  await expect(page.locator(".cover-inspector")).toContainText("原图");
  await expect(page.locator(".cover-inspector")).toContainText(
    "1080 × 1920 px · 9:16",
  );
  const layer = page.getByRole("button", { name: "定位受邀人" });
  await layer.click();
  const rect = (await layer.boundingBox())!;
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width / 2 + 40,
    rect.y + rect.height / 2 + 25,
  );
  await page.mouse.up();
  await page.getByRole("spinbutton", { name: "文字字号" }).fill("60");
  await page.getByRole("spinbutton", { name: "文字字号" }).press("Tab");
  await page.getByRole("button", { name: "斜体", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".invite-editor-toolbar")).toContainText(
    "草稿已保存",
  );
  expect(campaign.draft.cover.layers[0].x).toBeGreaterThan(10);
  expect(campaign.draft.cover.layers[0].fontSize).toBe(60);
  expect(campaign.draft.cover.layers[0].italic).toBe(true);
  const savedPosition = campaign.draft.cover.layers[0].x;
  await page.getByRole("tab", { name: "视觉与动效", exact: true }).click();
  await page.getByRole("button", { name: "封面定位", exact: true }).click();
  await expect(page.locator(".cover-workspace")).toBeVisible();
  await expect(confirmation).toBeHidden();
  expect(campaign.draft.cover.layers[0].x).toBe(savedPosition);
  await page.reload();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "封面定位", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "定位受邀人", exact: true }),
  ).toBeVisible();
  await expect(confirmation).toBeHidden();
  await expect(
    page.getByRole("spinbutton", { name: "横向位置 %", exact: true }),
  ).toHaveValue(savedPosition.toFixed(2));
  await page.setViewportSize({ width: 1512, height: 1050 });
  await page.screenshot({
    path: "output/playwright/invitation-cover-editor.png",
    fullPage: true,
  });
  await page
    .locator(".el-switch")
    .filter({ has: page.getByRole("switch", { name: "显示受邀人" }) })
    .click();
  await expect(
    page.locator(".cover-stage-paper .invite-artwork__text"),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "output/playwright/invitation-cover-editor-mobile.png",
    fullPage: true,
  });
});

test("module workspace supports rich editing, sorting, hiding and fullscreen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 1050 });
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  const campaign = await adminFixture(page, ["*"]);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "会议内容", exact: true }).click();
  await page.getByRole("button", { name: "添加模块", exact: true }).click();
  await page.getByRole("menuitem", { name: "图文内容", exact: true }).click();
  await page.getByRole("textbox", { name: "模块标题" }).fill("参会须知");
  const editor = page.locator(".invitation-rich-canvas [contenteditable=true]");
  await editor.click();
  await page.keyboard.type("欢迎参加本次会议，期待相见。");
  await editor.press("Meta+a");
  await expect(
    page.locator('.invitation-rich-toolbar [data-menu-key="bold"]'),
  ).not.toHaveClass(/disabled/);
  await page.locator('.invitation-rich-toolbar [data-menu-key="bold"]').click();
  await expect
    .poll(() => editor.innerHTML())
    .toMatch(/font-weight|<strong|<b>/);
  await page
    .locator('.invitation-rich-toolbar [data-menu-key="italic"]')
    .click();
  await page
    .locator('.invitation-rich-toolbar [data-menu-key="fontFamily"]')
    .click();
  await page.getByText("楷体", { exact: true }).click();
  await page
    .locator('.invitation-rich-toolbar [data-menu-key="fontSize"]')
    .click();
  await page.getByText("24px", { exact: true }).click();
  await page.getByRole("button", { name: "模块上移", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".invite-editor-toolbar")).toContainText(
    "草稿已保存",
  );
  expect(campaign.draft.modules[5].title).toBe("参会须知");
  expect(JSON.stringify(campaign.draft.modules[5].body)).toContain(
    "欢迎参加本次会议",
  );
  expect(JSON.stringify(campaign.draft.modules[5].body)).toMatch(
    /strong|font-weight/,
  );
  expect(JSON.stringify(campaign.draft.modules[5].body)).toContain("Kaiti SC");
  expect(JSON.stringify(campaign.draft.modules[5].body)).toContain("24px");
  await page.getByRole("button", { name: /01 邀请正文/ }).click();
  await page.getByRole("button", { name: /06 参会须知/ }).click();
  await expect(editor).toContainText("欢迎参加本次会议");
  await expect.poll(() => editor.innerHTML()).toContain("Kaiti SC");
  await page.screenshot({
    path: "output/playwright/invitation-modules-editor.png",
    fullPage: true,
  });
  await page.locator('[data-menu-key="fullScreen"]').click();
  await expect(page.locator(".w-e-full-screen-container")).toBeVisible();
  await page.locator('[data-menu-key="fullScreen"]').click();
  await page
    .locator(".el-switch")
    .filter({ has: page.getByRole("switch", { name: "显示当前模块" }) })
    .click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".invite-editor-toolbar")).toContainText(
    "草稿已保存",
  );
  expect(campaign.draft.modules[5].enabled).toBe(false);
  expect(failures).toEqual([]);
});

test("effect choices persist and chapter scrolling respects reduced motion", async ({
  page,
}) => {
  const doc = document();
  doc.content.effects = {
    entrance: "unfold",
    cover: "focus",
    scroll: "chapters",
    duration: 800,
  };
  const campaign = await adminFixture(page, ["*"], doc);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "视觉与分享" }).click();
  await page.getByRole("tab", { name: "视觉与动效", exact: true }).click();
  await page.getByRole("button", { name: "渐入", exact: true }).click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect(page.locator(".invite-editor-toolbar")).toContainText(
    "草稿已保存",
  );
  expect(campaign.draft.effects.entrance).toBe("fade");
  await publicFixture(page, () => doc);
  await page.goto(`${origin}/i/${token}`);
  await expect(page.locator(".invitation-document")).toHaveCSS(
    "scroll-snap-type",
    "y",
  );
  await expect(page.locator(".invitation-actions")).toBeInViewport();
  await page
    .locator(".invitation-nav a")
    .filter({ hasText: "会议议程" })
    .click();
  await expect
    .poll(() =>
      page.locator(".invitation-document").evaluate((el) => el.scrollTop),
    )
    .toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".invitation-document")).toHaveCSS(
    "scroll-snap-type",
    "none",
  );
  await expect(page.locator(".invitation-hero")).toHaveCSS(
    "animation-name",
    "none",
  );
});

test("public roster locates a recipient on another page and does not guess duplicate names", async ({
  page,
}) => {
  const doc = document();
  doc.recipient.name = "演示嘉宾45";
  await publicFixture(page, () => doc);
  await page.goto(`${origin}/i/${token}`);
  await page.getByRole("button", { name: "查看我的位置" }).click();
  await expect(page.locator(".invitation-roster .is-recipient")).toContainText(
    "演示嘉宾45",
  );
  await expect(page.locator(".invitation-roster-pages")).toContainText("3 / 3");
  await expect(page.locator(".is-recipient")).toBeFocused();
  doc.content.invitees.push({
    id: "duplicate",
    name: doc.recipient.name,
    organization: "同名机构",
  });
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByRole("button", { name: "查看我的位置" })).toHaveCount(
    0,
  );
  doc.recipient.publicInviteeId = "duplicate";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.getByRole("button", { name: "查看我的位置" }).click();
  await expect(page.locator(".is-recipient")).toContainText("同名机构");
  await expect
    .poll(() =>
      page.locator(".is-recipient").evaluate((el) => {
        const box = el.getBoundingClientRect();
        return box.top >= 60 && box.bottom <= innerHeight - 80;
      }),
    )
    .toBe(true);
  await page.screenshot({
    path: "output/playwright/invitation-roster-position.png",
  });
});

test("CSV upload detects public columns, discards phone numbers and merges duplicates", async ({
  page,
}) => {
  await adminFixture(page, ["*"]);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "公开名单" }).click();
  await page.getByLabel("上传公开名单表格").setInputFiles({
    name: "公开名单.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "会议名单\n手机号,职务,机构名称,嘉宾姓名\n13800000000,院长,甲机构,张明\n,主任,乙机构,张明\n,院长,甲机构,张明\n",
    ),
  });
  const drawer = page.getByRole("dialog", { name: "导入公开名单" });
  await expect(drawer).toContainText("有效 2 行");
  await expect(drawer).toContainText("合并重复 1 行");
  await expect(drawer.locator(".el-table")).not.toContainText("13800000000");
  await drawer.getByRole("button", { name: "导入 2 行" }).click();
  await expect(drawer).toBeHidden();
  await page.getByRole("textbox", { name: "搜索公开名单" }).fill("张明");
  await expect(page.getByRole("textbox", { name: "名单姓名" })).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "名单职务" }).first(),
  ).toHaveValue("院长");
});

test("reduced motion disables entrance animation while personalized share data remains consistent", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const doc = document();
  doc.recipient.name = "王明";
  await publicFixture(page, () => doc);
  await page.goto(`${origin}/i/${token}`);
  await expect(page).toHaveTitle("王明专属邀请函");
  expect(
    await page
      .locator(".invitation-hero__copy")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.getByRole("button", { name: "分享邀请函", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("王明专属邀请函");
});

for (const format of ["xlsx", "xls"] as const)
  test(`${format} workbook imports reordered columns and multiple sheets`, async ({
    page,
  }) => {
    const XLSX = createRequire(resolve("apps/admin/package.json"))("xlsx");
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([["说明"], ["内部备注"]]),
      "说明",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet([
        ["会议名单"],
        ["职务", "机构", "姓名"],
        ["主任", "测试机构", "表格测试嘉宾"],
      ]),
      "名单",
    );
    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: format === "xls" ? "biff8" : "xlsx",
    });
    await adminFixture(page, ["*"]);
    await page.goto(`${origin}/#/invitations`);
    await page.getByRole("tab", { name: "公开名单" }).click();
    await page.getByLabel("上传公开名单表格").setInputFiles({
      name: `名单.${format}`,
      mimeType: "application/octet-stream",
      buffer,
    });
    const drawer = page.getByRole("dialog", { name: "导入公开名单" });
    await expect(drawer).toContainText("有效 1 行");
    await expect(drawer).toContainText("2 个工作表");
    await expect(drawer.locator(".el-table")).toContainText("表格测试嘉宾");
    await drawer.getByRole("button", { name: "导入 1 行" }).click();
    await page
      .getByRole("textbox", { name: "搜索公开名单" })
      .fill("表格测试嘉宾");
    await expect(page.getByRole("textbox", { name: "名单职务" })).toHaveValue(
      "主任",
    );
  });

test("save-and-publish writes the draft before publishing its exact revision", async ({
  page,
}) => {
  await adminFixture(page, ["*"]);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("tab", { name: "视觉与分享" }).click();
  await page.getByRole("button", { name: /山水青玉/ }).click();
  await page.getByRole("tab", { name: "微信分享", exact: true }).click();
  await page
    .getByRole("textbox", { name: "分享标题", exact: true })
    .fill("{姓名}，邀您共赴{会议名称}");
  await page.getByRole("button", { name: "保存并发布" }).click();
  await page
    .getByRole("dialog", { name: "发布会议邀请函" })
    .getByRole("button", { name: "发布更新" })
    .click();
  await expect(
    page
      .locator(".invite-editor-toolbar")
      .getByRole("button", { name: "发布更新", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".studio-share-card")).toContainText(
    "受邀嘉宾，邀您共赴观潮会集",
  );
  await expect(page.locator(".invite-campaign-bar")).toContainText("已发布");
});

test("staff must choose the correct organization for duplicate recipient names", async ({
  page,
}) => {
  const doc = document();
  doc.content.invitees = [
    { id: "one", name: "同名嘉宾", organization: "甲机构" },
    { id: "two", name: "同名嘉宾", organization: "乙机构" },
  ];
  await adminFixture(page, ["invitation:view", "invitation:write"], doc);
  await page.goto(`${origin}/#/invitations`);
  await page.getByRole("button", { name: "生成邀请函", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "生成专属邀请函" });
  await dialog.getByRole("textbox").first().fill("同名嘉宾");
  await expect(
    dialog.getByRole("button", { name: "生成邀请函" }),
  ).toBeDisabled();
  await dialog.getByText("选择对应的单位与职务", { exact: true }).click();
  await page.getByRole("option", { name: /乙机构/ }).click();
  const request = page.waitForRequest(
    (req) => req.url().endsWith("/recipients") && req.method() === "POST",
  );
  await dialog.getByRole("button", { name: "生成邀请函" }).click();
  expect((await request).postDataJSON().publicInviteeId).toBe("two");
});

test("entrance motion changes over time and can be turned off", async ({
  page,
}) => {
  const doc = document();
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await publicFixture(page, () => doc);
  await page.goto(`${origin}/i/${token}`);
  const art = page.locator(".invitation-hero__image");
  await expect(art).toBeVisible();
  await expect
    .poll(() => art.evaluate((el) => getComputedStyle(el).animationName))
    .toMatch(/^invite-art-settle/);
  const samples = await art.evaluate(async (el) => {
    const before = getComputedStyle(el).transform;
    await new Promise((resolve) => setTimeout(resolve, 200));
    return [before, getComputedStyle(el).transform];
  });
  expect(samples[0]).not.toBe(samples[1]);
  doc.content.motion = "none";
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect
    .poll(() => art.evaluate((el) => getComputedStyle(el).animationName))
    .toBe("none");
});
