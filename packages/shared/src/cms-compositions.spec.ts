import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCmsPageComposition,
  buildCmsCompositionDsl,
  expandLegacyCmsTemplate,
  normalizeCmsCompositionKind,
  type CmsCompositionKind
} from "./cms-compositions";

const kinds: CmsCompositionKind[] = ["home", "schedule", "registration", "member-center", "mall", "cart"];

test("page compositions are editable component lists rather than fixed templates", () => {
  for (const kind of kinds) {
    const components = buildCmsPageComposition(kind);
    assert.ok(components.length > 0, `${kind} should contain components`);
    assert.equal(components.some((item) => item.type === "fixed-business-template"), false);
    assert.equal(new Set(components.map((item) => item.id)).size, components.length);
    assert.ok(components.every((item) => item.enabled && item.config && typeof item.config === "object"));
  }
});

test("legacy template expansion preserves editable overrides", () => {
  const entries = [{ id: "custom-entry", enabled: true, title: "自定义入口", subtitle: "CUSTOM" }];
  const expanded = expandLegacyCmsTemplate({
    id: "legacy-home",
    enabled: true,
    sortOrder: 20,
    config: {
      templateKey: "fixed-home-guanchao",
      heroTitle: "自定义首页",
      heroSubtitle: "",
      heroShowTitle: false,
      noticeText: "自定义公告",
      items: entries
    }
  });

  const hero = expanded.find((item) => item.type === "hero-banner");
  const notice = expanded.find((item) => item.type === "notice");
  const quickGrid = expanded.find((item) => item.type === "quick-icon-grid");
  assert.equal(hero?.config.title, "自定义首页");
  assert.equal(hero?.config.subtitle, "");
  assert.equal(hero?.config.showTitle, false);
  assert.equal(notice?.config.text, "自定义公告");
  assert.deepEqual(quickGrid?.config.items, entries);
  assert.ok(expanded.every((item) => item.id.startsWith("legacy-home:")));
});

test("template markers normalize consistently", () => {
  assert.equal(normalizeCmsCompositionKind("fixed-schedule-guanchao"), "schedule");
  assert.equal(normalizeCmsCompositionKind("conference-list"), "registration");
  assert.equal(normalizeCmsCompositionKind("fixed-member-center"), "member-center");
  assert.equal(normalizeCmsCompositionKind("fixed-mall"), "mall");
  assert.equal(normalizeCmsCompositionKind("fixed-cart"), "cart");
  assert.equal(normalizeCmsCompositionKind("unknown"), "home");
});

test("member composition declares current-user runtime statistics", () => {
  const stats = buildCmsPageComposition("member-center").find((item) => item.type === "stats-grid");
  assert.equal(stats?.config.dataSource, "current-user");
  assert.equal(stats?.config.columns, 4);
});

test("default composition DSL keeps visual metadata and avoids technical fallback titles", () => {
  const dsl = buildCmsCompositionDsl("home", "home");
  assert.equal(dsl.schemaVersion, "p9");
  assert.equal(dsl.dsl.nodes.length, (dsl.meta.editorComponents as unknown[]).length);
  assert.ok(dsl.dsl.nodes.every((node) => node.meta.originalType && !String(node.props.title || "").startsWith("ds-")));
});
