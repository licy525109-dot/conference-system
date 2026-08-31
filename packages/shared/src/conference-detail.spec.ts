import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  isConferenceDetailBlockRenderable,
  normalizeConferenceDetailContent,
  serializeConferenceDetailContent
} from "./conference-detail";

describe("conference detail content contract", () => {
  it("normalizes, orders and constrains cross-platform content blocks", () => {
    const content = normalizeConferenceDetailContent({
      detailContent: {
        version: 1,
        blocks: [
          { id: "body", type: "text", sort: 30, text: "会议说明" },
          { id: "title", type: "heading", sort: 10, title: "大会介绍", align: "center" },
          { id: "list", type: "list", sort: 20, text: "资料包\n会期用餐" }
        ]
      }
    });

    assert.deepEqual(content.blocks.map((block) => block.id), ["title", "list", "body"]);
    assert.deepEqual(content.blocks[1]?.items, ["资料包", "会期用餐"]);
    assert.equal(content.blocks[2]?.type, "paragraph");
    assert.deepEqual(content.blocks.map((block) => block.sort), [10, 20, 30]);
  });

  it("keeps disabled and empty blocks editable but excludes them from rendering", () => {
    const content = normalizeConferenceDetailContent({
      detailBlocks: [
        { id: "hidden", type: "heading", title: "隐藏", enabled: false },
        { id: "empty", type: "image" },
        { id: "divider", type: "divider" }
      ]
    });

    assert.equal(content.blocks.length, 3);
    assert.equal(isConferenceDetailBlockRenderable(content.blocks[0]!), false);
    assert.equal(isConferenceDetailBlockRenderable(content.blocks[1]!), false);
    assert.equal(isConferenceDetailBlockRenderable(content.blocks[2]!), true);
  });

  it("serializes a stable versioned protocol", () => {
    const content = normalizeConferenceDetailContent({
      version: 1,
      blocks: [{ type: "button", buttonText: "立即报名", actionTargetType: "registration" }]
    });
    const serialized = serializeConferenceDetailContent(content.blocks);

    assert.equal(serialized.version, 1);
    assert.equal(serialized.blocks[0]?.actionTargetType, "registration");
    assert.equal(serialized.blocks[0]?.sort, 10);
  });

  it("does not reinterpret unrelated legacy CMS blocks as conference detail", () => {
    const content = normalizeConferenceDetailContent({
      blocks: [{ type: "rich-text", title: "技术节点" }],
      meta: { source: "legacy-cms" }
    });

    assert.deepEqual(content.blocks, []);
  });
});
