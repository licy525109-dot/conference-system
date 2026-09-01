import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildWechatPayDescription,
  truncateUtf8ByBytes,
  WECHAT_PAY_DESCRIPTION_MAX_BYTES
} from "./wechat-pay.description";

describe("buildWechatPayDescription", () => {
  it("keeps short descriptions unchanged", () => {
    assert.equal(
      buildWechatPayDescription("会议报名", "观潮闭门会", "REG001"),
      "会议报名-观潮闭门会-REG001"
    );
  });

  it("limits long Chinese descriptions by UTF-8 bytes and preserves the order number", () => {
    const description = buildWechatPayDescription(
      "会议报名",
      "观潮会集第五届舞蹈赛道创始人闭门会暨少儿舞剧专项舞蹈疗愈专项".repeat(5),
      "REG202609017S2MV8BD"
    );

    assert.ok(Buffer.byteLength(description, "utf8") <= WECHAT_PAY_DESCRIPTION_MAX_BYTES);
    assert.ok(description.endsWith("-REG202609017S2MV8BD"));
    assert.doesNotMatch(description, /�/);
  });

  it("does not split an emoji surrogate pair", () => {
    const truncated = truncateUtf8ByBytes("会议🎫报名", 10);

    assert.equal(truncated, "会议🎫");
    assert.equal(Buffer.byteLength(truncated, "utf8"), 10);
  });
});
