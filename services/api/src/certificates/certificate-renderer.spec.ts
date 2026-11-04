import assert from "node:assert/strict";
import { test } from "node:test";
import { imageDimensions, wrapCertificateText, xml } from "./certificate-renderer";
test("certificate renderer rejects fake or unbounded raster inputs", () => {
  assert.throws(() => imageDimensions(Buffer.from("not-an-image"), "image/png"));
  const b = Buffer.alloc(24); Buffer.from([137,80,78,71,13,10,26,10]).copy(b); b.writeUInt32BE(100000,16); b.writeUInt32BE(100000,20); assert.throws(() => imageDimensions(b,"image/png"));
});
test("certificate text wraps without splitting code points and escapes markup", () => {
  const result = wrapCertificateText("这是一段很长的单位名称，用于测试自动换行与缩小字号", 54, 500, 2);
  assert.ok(result.lines.length <= 2); assert.ok(result.size <= 54); assert.equal(result.lines.join(""), "这是一段很长的单位名称，用于测试自动换行与缩小字号");
  assert.equal(xml('<script>&"\u0001'), "&lt;script&gt;&amp;&quot;");
});
