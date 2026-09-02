import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSmartSheetWebhookValues,
  parseSmartSheetAutomationPayload,
  parseSmartSheetWebhookSample,
  validateSmartSheetWebhookUrl
} from "./smart-sheet-webhook";

const sample = {
  schema: {
    fName: "姓名",
    fPhone: "手机号",
    fRole: "会期身份",
    fTime: "工作坊时间"
  },
  add_records: [{
    values: {
      fName: "示例姓名",
      fPhone: "13800000000",
      fRole: [{ text: "分享嘉宾" }],
      fTime: "1780819200000"
    }
  }]
};

describe("SmartSheet webhook automation", () => {
  it("parses the official schema sample and encodes title values with field ids", () => {
    const schema = parseSmartSheetWebhookSample(JSON.stringify(sample));
    const values = buildSmartSheetWebhookValues({
      姓名: [{ type: "text", text: "张三" }],
      手机号: "13900000000",
      会期身份: "工作坊嘉宾",
      工作坊时间: "2026-09-02T08:00:00.000Z"
    }, schema);

    assert.deepEqual(values.fName, "张三");
    assert.deepEqual(values.fRole, [{ text: "工作坊嘉宾" }]);
    assert.equal(values.fTime, "1788336000000");
  });

  it("maps incoming field ids back to original field titles", () => {
    const schema = parseSmartSheetWebhookSample(sample);
    const records = parseSmartSheetAutomationPayload({
      records: [{
        record_id: "row-1",
        update_time: 1_788_336_000_000,
        values: { fName: "张三", fPhone: "13900000000", fRole: [{ text: "分享嘉宾" }] }
      }]
    }, schema);

    assert.equal(records[0]?.record_id, "row-1");
    assert.deepEqual(records[0]?.values, {
      姓名: "张三",
      手机号: "13900000000",
      会期身份: [{ text: "分享嘉宾" }]
    });
  });

  it("rejects non-WeCom URLs before any outbound request", () => {
    assert.throws(
      () => validateSmartSheetWebhookUrl("https://example.com/cgi-bin/wedoc/smartsheet/webhook?key=secret"),
      /企业微信智能表/
    );
    assert.equal(
      validateSmartSheetWebhookUrl("https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=secret"),
      "https://qyapi.weixin.qq.com/cgi-bin/wedoc/smartsheet/webhook?key=secret"
    );
  });

  it("requires a stable record id for idempotent callbacks", () => {
    const schema = parseSmartSheetWebhookSample(sample);
    assert.throws(
      () => parseSmartSheetAutomationPayload({ values: { fName: "张三" } }, schema),
      /缺少 record_id/
    );
  });
});
