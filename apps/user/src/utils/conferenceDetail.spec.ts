import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizeConferenceDetailLongImage } from "./conferenceDetail";

describe("normalizeConferenceDetailLongImage", () => {
  it("normalizes the segmented long-image contract", () => {
    const result = normalizeConferenceDetailLongImage({
      detailLongImage: {
        sourceUrl: "https://example.com/detail-1.webp",
        width: 750,
        height: 4800,
        displayUrls: ["https://example.com/detail-1.webp", "https://example.com/detail-2.webp"],
        segments: [
          { url: "https://example.com/detail-1.webp", width: 750, height: 2400 },
          { url: "https://example.com/detail-2.webp", width: 750, height: 2400 }
        ]
      }
    });

    assert.deepEqual(result, {
      sourceUrl: "https://example.com/detail-1.webp",
      width: 750,
      height: 4800,
      segments: [
        { url: "https://example.com/detail-1.webp", width: 750, height: 2400 },
        { url: "https://example.com/detail-2.webp", width: 750, height: 2400 }
      ]
    });
  });

  it("supports legacy single-url fields without exposing unrelated CMS content", () => {
    assert.deepEqual(normalizeConferenceDetailLongImage({ detailLongImageUrl: "https://example.com/detail.jpg" }), {
      sourceUrl: "https://example.com/detail.jpg",
      width: null,
      height: null,
      segments: [{ url: "https://example.com/detail.jpg", width: null, height: null }]
    });
    assert.equal(normalizeConferenceDetailLongImage({ blocks: [{ type: "rich-text" }] }), null);
  });
});
