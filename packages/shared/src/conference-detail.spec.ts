import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hasConferenceDetailRichTextContract,
  hasConferenceDetailSectionsContract,
  isConferenceDetailBlockRenderable,
  isConferenceDetailRichTextRenderable,
  normalizeConferenceDetailContent,
  normalizeConferenceDetailRichText,
  normalizeConferenceDetailSections,
  serializeConferenceDetailRichText,
  serializeConferenceDetailSections,
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

  it("normalizes the cross-platform rich-text node contract", () => {
    const content = normalizeConferenceDetailRichText({
      detailRichText: {
        version: 1,
        html: "<h2>费用包含</h2>",
        nodes: [
          {
            name: "h2",
            attrs: { style: "color:#8b6822;position:fixed;background-image:url(javascript:bad)" },
            children: [{ type: "text", text: "费用包含" }]
          },
          { name: "script", attrs: {}, children: [{ type: "text", text: "bad" }] },
          { name: "img", attrs: { src: "javascript:alert(1)", alt: "bad" }, children: [] }
        ]
      }
    });

    assert.equal(content.nodes.length, 2);
    assert.deepEqual(content.nodes[0], {
      name: "h2",
      attrs: { style: "color:#8b6822" },
      children: [{ type: "text", text: "费用包含" }]
    });
    assert.deepEqual(content.nodes[1], { name: "img", attrs: { alt: "bad" }, children: [] });
    assert.equal(isConferenceDetailRichTextRenderable(content), true);
  });

  it("serializes rich text without accepting unrelated contentJson fields", () => {
    const unrelated = normalizeConferenceDetailRichText({ html: "<p>技术内容</p>", nodes: [] });
    assert.equal(isConferenceDetailRichTextRenderable(unrelated), false);

    const serialized = serializeConferenceDetailRichText("<p>会议说明</p>", [
      { name: "p", attrs: {}, children: [{ type: "text", text: "会议说明" }] }
    ]);
    assert.equal(serialized.version, 1);
    assert.equal(serialized.html, "<p>会议说明</p>");
    assert.equal(isConferenceDetailRichTextRenderable(serialized), true);
  });

  it("distinguishes an intentionally empty rich-text document from a legacy page", () => {
    assert.equal(hasConferenceDetailRichTextContract({ detailRichText: { version: 1, html: "", nodes: [] } }), true);
    assert.equal(hasConferenceDetailRichTextContract({ detailContent: { version: 1, blocks: [] } }), false);
    assert.equal(isConferenceDetailRichTextRenderable(normalizeConferenceDetailRichText({
      detailRichText: {
        version: 1,
        html: "<p><br></p>",
        nodes: [{ name: "p", attrs: {}, children: [{ name: "br", attrs: {}, children: [] }] }]
      }
    })), false);
  });

  it("normalizes editable detail sections and keeps their configured order", () => {
    const sections = normalizeConferenceDetailSections({
      detailSections: {
        version: 1,
        items: [
          {
            id: "notice",
            title: "参会须知",
            sort: 20,
            content: { version: 1, html: "<p>请携带证件</p>", nodes: [{ name: "p", attrs: {}, children: [{ type: "text", text: "请携带证件" }] }] }
          },
          {
            id: "intro",
            title: "活动详情",
            sort: 10,
            content: { version: 1, html: "<p>会议介绍</p>", nodes: [{ name: "p", attrs: {}, children: [{ type: "text", text: "会议介绍" }] }] }
          }
        ]
      }
    });

    assert.equal(hasConferenceDetailSectionsContract({ detailSections: { version: 1, items: [] } }), true);
    assert.deepEqual(sections.items.map((item) => item.id), ["intro", "notice"]);
    assert.deepEqual(sections.items.map((item) => item.sort), [10, 20]);
    assert.equal(serializeConferenceDetailSections(sections.items).items[1]?.title, "参会须知");
  });
});
