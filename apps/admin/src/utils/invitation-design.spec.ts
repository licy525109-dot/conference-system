import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInvitationContent,
  createInvitationLayer,
  normalizeInvitationContent,
  normalizeInvitationCover,
  normalizeInvitationModules,
  normalizeInvitationRichText,
  invitationRichTextHtml,
  INVITATION_FONTS,
  createInvitationModule,
  sortInvitationInvitees,
  matchInvitationInvitee,
  normalizeInvitationNavigation,
  invitationNavigationLinks,
  invitationVisibleModules,
  applyInvitationBooklet,
  invitationAssetUrl,
} from "@conference/shared";

test("booklet arranges nine chapters without replacing authored facts or extra modules", () => {
  let content = createInvitationContent({
    title: "真实会议",
    location: "真实会场",
  });
  content.dateLabel = "真实日期";
  content.registration = {
    mode: "external",
    conferenceId: "",
    url: "https://example.com/register",
    label: "填写表单",
  };
  content.invitees = [
    { id: "real-person", name: "真实嘉宾", organization: "真实机构" },
  ];
  content.agenda = [
    {
      id: "real-agenda",
      date: "第二天",
      time: "10:00",
      title: "已有议程",
      speaker: "",
      location: "",
    },
  ];
  content.organizers = ["真实协作单位"];
  content.modules[0].body = normalizeInvitationRichText([
    { tag: "p", children: [{ text: "工作人员已编辑的正文" }] },
  ]);
  const custom = createInvitationModule("richtext", "custom-note");
  custom.body = normalizeInvitationRichText([
    { tag: "p", children: [{ text: "必须保留的附加内容" }] },
  ]);
  content.modules.push(custom);
  content = normalizeInvitationContent(content);
  const before = structuredClone(content),
    result = applyInvitationBooklet(content);
  assert.deepEqual(content, before);
  for (const key of [
    "title",
    "dateLabel",
    "location",
    "introduction",
    "registration",
    "invitees",
    "agenda",
    "shareTitle",
    "shareDescription",
    "inviteeSort",
  ] as const)
    assert.deepEqual(result[key], content[key]);
  assert.deepEqual(result.modules[0].body, content.modules[0].body);
  assert.deepEqual(
    result.modules.find((module) => module.id === custom.id),
    custom,
  );
  assert.deepEqual(
    result.modules.slice(0, 9).map((module) => module.title),
    [
      "会议背景",
      "会议关键词",
      "会议亮点",
      "时间地点",
      "组织架构",
      "会议议程",
      "小组讨论话题",
      "拟邀嘉宾",
      "参会方式",
    ],
  );
  assert.deepEqual(normalizeInvitationContent(result), result);
  assert.equal(
    result.modules
      .find((module) => module.type === "organizations")
      ?.items?.some((item) => item.description === "真实协作单位"),
    true,
  );
});
test("booklet reapplication keeps edits, visibility, navigation and topic presentation", () => {
  const content = applyInvitationBooklet(
    createInvitationContent({ title: "模板会议" }),
  );
  const topic = content.modules.find(
    (module) => module.id === "booklet-discussion",
  )!;
  topic.items![0].title = "我已修改的讨论";
  topic.enabled = false;
  const keywords = content.modules.find(
    (module) => module.id === "booklet-keywords",
  )!;
  keywords.body = [];
  content.navigation = normalizeInvitationNavigation(
    {
      enabled: false,
      sticky: false,
      items: [{ moduleId: topic.id, label: "自定义导航", visible: false }],
    },
    content.modules,
  );
  const again = applyInvitationBooklet(content);
  assert.deepEqual(again, content);
  assert.equal(topic.settings!.layout, "list");
});
test("booklet creates editable examples but no fixed real recipient, date or venue", () => {
  const content = applyInvitationBooklet(
    createInvitationContent({ title: "外部会议", location: "自主选择会场" }),
  );
  content.dateLabel = "自主选择日期";
  assert.equal(invitationVisibleModules(content).length, 9);
  assert.equal(content.invitees.length, 0);
  assert.deepEqual(
    [...new Set(content.agenda.map((item) => item.date))],
    ["第一天", "第二天", "第三天"],
  );
  assert.equal(
    content.modules.find((module) => module.id === "booklet-discussion")?.items
      ?.length,
    8,
  );
  assert.equal(JSON.stringify(content).includes("鲁锡章"), false);
  assert.equal(JSON.stringify(content).includes("江门"), false);
  assert.equal(JSON.stringify(content).includes("2026年10月20"), false);
});
test("booklet rejects module overflow without dropping any authored content", () => {
  const content = createInvitationContent();
  content.modules = Array.from({ length: 24 }, (_, index) =>
    createInvitationModule("richtext", `custom-${index}`),
  );
  const before = structuredClone(content);
  assert.throws(() => applyInvitationBooklet(content), RangeError);
  assert.deepEqual(content, before);
});
test("booklet handles reserved ID collisions and restricts bundled asset URLs", () => {
  const content = createInvitationContent();
  const custom = createInvitationModule("image", "booklet-discussion");
  custom.imageUrl = "https://example.com/image.png";
  content.modules.push(custom);
  const result = applyInvitationBooklet(content);
  assert.equal(
    result.modules.find((module) => module.type === "tabs")?.id,
    "booklet-discussion-1",
  );
  assert.deepEqual(
    result.modules.find((module) => module.id === custom.id),
    custom,
  );
  for (const url of [
    "/invitation-art/booklet-cover.png",
    "/invitation-art/booklet-waves.png",
    "/invitation-art/booklet-pattern.jpg",
  ])
    assert.equal(invitationAssetUrl(url), url);
  for (const url of [
    "/invitation-art/../secret.png",
    "/invitation-art/booklet-cover.svg",
    "/invitation-art/booklet-cover.png?x=1",
    "javascript:alert(1)",
  ])
    assert.equal(invitationAssetUrl(url), "");
});

test("old invitation payloads acquire compatible presentation defaults", () => {
  const content = normalizeInvitationContent({
    title: "已有会议",
    motion: "none",
  });
  assert.equal(content.cover.mode, "template");
  assert.equal(content.effects.entrance, "none");
  assert.deepEqual(
    content.modules.map((item) => item.type),
    ["letter", "highlights", "agenda", "guests", "invitees", "venue"],
  );
  assert.equal(normalizeInvitationContent({ modules: [] }).modules.length, 0);
  assert.equal(content.navigation?.enabled, true);
  assert.equal(content.navigation?.sticky, true);
  assert.deepEqual(
    content.navigation?.items.map((item) => item.moduleId),
    content.modules.map((module) => module.id),
  );
});
test("navigation preserves independent labels, order and visibility through normalization", () => {
  const modules = [
    createInvitationModule("richtext", "first"),
    createInvitationModule("richtext", "second"),
  ];
  const navigation = normalizeInvitationNavigation(
    {
      enabled: false,
      sticky: false,
      items: [
        { moduleId: "second", label: "  自定义导航  ", visible: false },
        { moduleId: "deleted", label: "已删除" },
        { moduleId: "second", label: "重复" },
        { moduleId: "first", label: "长".repeat(50) },
      ],
    },
    modules,
  );
  assert.deepEqual(
    navigation.items.map((item) => item.moduleId),
    ["second", "first"],
  );
  assert.equal(navigation.items[0].label, "自定义导航");
  assert.equal(navigation.items[0].visible, false);
  assert.equal(navigation.items[1].label.length, 40);
  assert.equal(navigation.enabled, false);
  assert.equal(navigation.sticky, false);
  const content = normalizeInvitationContent({
    ...createInvitationContent(),
    modules,
    navigation,
  });
  assert.deepEqual(content.navigation, navigation);
  assert.deepEqual(
    content.modules.map((module) => module.id),
    ["first", "second"],
  );
  assert.deepEqual(normalizeInvitationContent(content), content);
  const updated = normalizeInvitationNavigation(navigation, [
    modules[1],
    createInvitationModule("image", "new"),
  ]);
  assert.deepEqual(
    updated.items.map((item) => item.moduleId),
    ["second", "new"],
  );
  assert.equal(updated.items[1].visible, true);
});
test("navigation filters empty, hidden and disabled entries without changing body content", () => {
  const content = createInvitationContent();
  const first = createInvitationModule("richtext", "first"),
    second = createInvitationModule("richtext", "second"),
    hidden = createInvitationModule("richtext", "hidden");
  for (const module of [first, second, hidden])
    module.body = [{ text: "正文保持不变" }];
  hidden.enabled = false;
  content.modules = [
    first,
    second,
    hidden,
    createInvitationModule("image", "empty"),
  ];
  content.navigation = normalizeInvitationNavigation(
    {
      items: [
        { moduleId: "second", label: "先看此项" },
        { moduleId: "first", visible: false },
      ],
    },
    content.modules,
  );
  assert.deepEqual(
    invitationNavigationLinks(content).map((item) => [
      item.module.id,
      item.label,
    ]),
    [["second", "先看此项"]],
  );
  assert.deepEqual(
    invitationVisibleModules(content).map((module) => module.id),
    ["first", "second"],
  );
  content.navigation.enabled = false;
  assert.deepEqual(invitationNavigationLinks(content), []);
  assert.deepEqual(
    invitationVisibleModules(content).map((module) => module.id),
    ["first", "second"],
  );
  delete content.navigation;
  assert.deepEqual(
    invitationNavigationLinks(content).map((item) => item.module.id),
    ["first", "second"],
  );
});
test("artwork preserves optional layers and clamps positions inside its canvas", () => {
  const source = {
    ...createInvitationContent(),
    title: "",
    dateLabel: "",
    location: "",
    introduction: "",
    cover: {
      mode: "artwork",
      width: 1080,
      height: 1920,
      layers: [
        {
          ...createInvitationLayer("name"),
          x: 99,
          y: -3,
          width: 40,
          fontSize: 999,
          color: "url(x)",
          enabled: false,
        },
      ],
    },
  };
  const content = normalizeInvitationContent(source);
  assert.equal(content.title, "");
  assert.equal(content.cover.width / content.cover.height, 9 / 16);
  assert.equal(content.cover.layers[0].x, 60);
  assert.equal(content.cover.layers[0].y, 0);
  assert.equal(content.cover.layers[0].fontSize, 240);
  assert.equal(content.cover.layers[0].enabled, false);
  assert.equal(content.cover.layers[0].color, "#765925");
  assert.equal(normalizeInvitationCover({ layers: [] }).layers.length, 0);
});
test("module order, hidden state and independent repeated rich text survive normalization", () => {
  const modules = normalizeInvitationModules([
    { id: "r2", type: "richtext", title: "参会费用", body: [{ text: "内容" }] },
    { id: "a", type: "agenda", enabled: false },
    { id: "r1", type: "richtext", title: "注意事项" },
    { id: "duplicate", type: "agenda" },
  ]);
  assert.deepEqual(
    modules.map((item) => item.id),
    ["r2", "a", "r1"],
  );
  assert.equal(modules[1].enabled, false);
  assert.deepEqual(normalizeInvitationModules(modules), modules);
});
test("rich typography round trips without executable markup or arbitrary CSS", () => {
  const nodes = normalizeInvitationRichText([
    {
      tag: "p",
      attrs: { style: "text-align:center;position:fixed" },
      children: [
        {
          tag: "span",
          attrs: {
            style: `font-family:${INVITATION_FONTS.kai.family};font-size:24px;color:#ab3548;font-weight:700;font-style:italic;text-decoration:underline`,
          },
          children: [{ text: "<script>不是代码</script>" }],
        },
        { tag: "script", attrs: {}, children: [{ text: "alert(1)" }] },
        { tag: "img", attrs: { src: "javascript:alert(1)", onerror: "bad" } },
        {
          tag: "a",
          attrs: { href: "https://example.com", onclick: "bad" },
          children: [{ text: "链接" }],
        },
      ],
    },
  ]);
  const html = invitationRichTextHtml(nodes);
  assert.match(html, /font-size:24px/);
  assert.match(html, /Kaiti SC/);
  assert.match(html, /text-align:center/);
  assert.match(html, /font-style:italic/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /noopener noreferrer/);
  assert.doesNotMatch(
    html,
    /<script|javascript:|onclick|onerror|position:|alert\(1\)/,
  );
  assert.deepEqual(normalizeInvitationRichText(nodes), nodes);
});
test("image and style URLs cannot escape safe rich content boundaries", () => {
  for (const src of [
    "//evil.example/x",
    "data:image/svg+xml,evil",
    "/uploads/../x",
    "/uploads/%2e%2e/x",
  ])
    assert.equal(
      invitationRichTextHtml([{ tag: "img", attrs: { src }, children: [] }]),
      "",
    );
  const html = invitationRichTextHtml(
    [
      {
        tag: "img",
        attrs: {
          src: "/uploads/image.png",
          style: "background-image:url(https://evil.example);width:9999px",
        },
        children: [],
      },
    ],
    "http://localhost:3001",
  );
  assert.equal(
    html,
    '<img src="http://localhost:3001/uploads/image.png" alt="">',
  );
});
test("effects accept only supported modes and bounded duration", () => {
  const content = normalizeInvitationContent({
    effects: {
      entrance: "unfold",
      cover: "focus",
      scroll: "chapters",
      duration: 9000,
    },
  });
  assert.deepEqual(content.effects, {
    entrance: "unfold",
    cover: "focus",
    scroll: "chapters",
    duration: 1200,
  });
});
test("expanded modules sanitize links, map coordinates, media, styles and fonts", () => {
  const content = normalizeInvitationContent({
    design: {
      font: "custom",
      fontUrl: "javascript:alert(1)",
      textColor: "red;position:fixed",
      bodySize: 90,
      backgroundOpacity: -1,
    },
    modules: [
      {
        ...createInvitationModule("carousel", "gallery"),
        settings: {
          mediaUrl: "data:text/html,evil",
          effect: "coverflow",
          interval: 1,
          latitude: 999,
          longitude: -300,
        },
        style: {
          backgroundColor: "#abcdef",
          textColor: "url(x)",
          backgroundImage: "/uploads/%2e%2e/a",
        },
        items: [
          {
            title: "外链",
            href: "javascript:alert(1)",
            imageUrl: "/uploads/a.png",
            icon: "__proto__",
            body: [{ tag: "script", children: [{ text: "bad" }] }],
          },
        ],
      },
      createInvitationModule("carousel", "gallery-2"),
      createInvitationModule("map", "map"),
    ],
  });
  assert.equal(content.modules.length, 3);
  const item = content.modules[0];
  assert.equal(item.style?.backgroundColor, "#abcdef");
  assert.equal(item.style?.textColor, "");
  assert.equal(item.style?.backgroundImage, "");
  assert.equal(item.settings?.effect, "coverflow");
  assert.equal(item.settings?.interval, 3000);
  assert.equal(item.settings?.latitude, null);
  assert.equal(item.settings?.longitude, null);
  assert.equal(item.settings?.mediaUrl, "");
  assert.equal(item.items?.[0].href, "");
  assert.equal(item.items?.[0].icon, "link");
  assert.deepEqual(item.items?.[0].body, []);
  assert.equal(content.design?.fontUrl, "");
  assert.equal(content.design?.bodySize, 22);
  assert.equal(content.design?.backgroundOpacity, 5);
  assert.deepEqual(normalizeInvitationContent(content), content);
});
test("sorting is stable, numeric-aware, preserves roster bindings and keeps blank values last", () => {
  const rows = [
    { id: "b", name: "嘉宾10", organization: "乙" },
    { id: "a", name: "嘉宾2", organization: "甲" },
    { id: "c", name: "嘉宾2", organization: "" },
  ];
  const sorted = sortInvitationInvitees(rows, {
    key: "name",
    direction: "asc",
  });
  assert.deepEqual(
    sorted.map((row) => row.id),
    ["a", "c", "b"],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ["b", "a", "c"],
  );
  assert.equal(
    matchInvitationInvitee(sorted, {
      name: "嘉宾2",
      salutation: "",
      publicInviteeId: "c",
    }).item?.id,
    "c",
  );
  assert.equal(
    sortInvitationInvitees(rows, { key: "organization", direction: "desc" }).at(
      -1,
    )?.id,
    "c",
  );
  assert.deepEqual(
    sortInvitationInvitees(rows, { key: "manual", direction: "desc" }),
    rows,
  );
});
test("agenda portraits and long guest biographies survive the shared document round trip", () => {
  const biography = "嘉宾介绍与研究经历\n".repeat(100);
  const content = normalizeInvitationContent({
    agenda: [{ imageUrl: "/uploads/photo.jpg" }],
    guests: [{ biography, imageUrl: "/uploads/guest.png" }],
  });
  assert.equal(content.agenda[0].imageUrl, "/uploads/photo.jpg");
  assert.equal(content.guests[0].biography, biography.trim());
  assert.equal(content.guests[0].imageUrl, "/uploads/guest.png");
});
