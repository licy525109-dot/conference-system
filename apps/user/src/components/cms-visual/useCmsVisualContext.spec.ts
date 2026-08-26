import assert from "node:assert/strict";
import test from "node:test";
import type { PageDsl } from "@conference/dsl-runtime";
import { cmsVisualComponentsFromDsl, hasLegacyCmsVisualNodes } from "./cmsVisualDslAdapter";

function legacyScheduleDsl(): PageDsl {
  return {
    schemaVersion: "p9",
    page: "conference-list",
    dsl: {
      nodes: [
        {
          id: "schedule-hero",
          type: "ds-banner",
          enabled: true,
          sortOrder: 0,
          props: { title: "年度排期", subtitle: "查看全年会议安排" },
          meta: { source: "cms-dsl", originalType: "hero-banner" }
        },
        {
          id: "schedule-months",
          type: "ds-section",
          enabled: true,
          sortOrder: 10,
          props: { title: "tag-filter", items: ["8 月｜8｜tag"] },
          meta: { source: "cms-dsl", originalType: "tag-filter" }
        },
        {
          id: "schedule-categories",
          type: "ds-list",
          enabled: true,
          sortOrder: 20,
          props: { title: "conference-tabs", tabs: ["全部", "闭门会"], limit: 8 },
          meta: { source: "cms-dsl", originalType: "conference-tabs" }
        }
      ]
    }
  };
}

test("legacy CMS schedule nodes use the visual renderer contract", () => {
  const dsl = legacyScheduleDsl();

  assert.equal(hasLegacyCmsVisualNodes(dsl), true);
  const components = cmsVisualComponentsFromDsl(dsl);
  assert.deepEqual(components.map((component) => component.type), ["hero-banner", "tag-filter", "conference-tabs"]);
  assert.equal(components[0]?.config.title, "年度排期");
  assert.equal(components[1]?.config.title, undefined);
  assert.equal(components[2]?.config.title, undefined);
  assert.deepEqual(components[2]?.config.tabs, ["全部", "闭门会"]);
});

test("native P9 design-system pages stay on the DSL runtime renderer", () => {
  const dsl: PageDsl = {
    schemaVersion: "p9",
    page: "custom",
    dsl: {
      nodes: [
        {
          id: "native-section",
          type: "ds-section",
          enabled: true,
          sortOrder: 0,
          props: { title: "原生 DSL 内容" }
        }
      ]
    }
  };

  assert.equal(hasLegacyCmsVisualNodes(dsl), false);
  assert.deepEqual(cmsVisualComponentsFromDsl(dsl).map((component) => component.type), ["rich-content-block"]);
});
