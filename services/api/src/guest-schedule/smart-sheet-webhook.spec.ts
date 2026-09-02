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

  it("accepts WeCom schema descriptors instead of plain title strings", () => {
    const schema = parseSmartSheetWebhookSample({
      schema: {
        fu6Kr7: { field_id: "fu6Kr7", field_title: "姓名", field_type: "text" },
        fPhone: { id: "fPhone", title: { text: "手机号" }, type: "text" }
      },
      add_records: [{ values: { fu6Kr7: [{ text: "菲菲" }], fPhone: "13800000000" } }]
    });

    assert.deepEqual(schema.schema, { fu6Kr7: "姓名", fPhone: "手机号" });
    assert.deepEqual(schema.sampleValues.fu6Kr7, [{ text: "菲菲" }]);
  });

  it("accepts fields arrays and reversed title-to-id mappings", () => {
    const fieldsSchema = parseSmartSheetWebhookSample({
      schema: {
        fields: [
          { field_id: "fName", field_name: "姓名" },
          { fieldId: "fCompany", displayName: "公司" }
        ]
      },
      add_records: [{ values: { fName: "张三", fCompany: "观潮会集" } }]
    });
    const reversedSchema = parseSmartSheetWebhookSample({
      schema: { "姓名": "fName", "手机号": "fPhone" },
      add_records: [{ values: { fName: "张三", fPhone: "13900000000" } }]
    });

    assert.deepEqual(fieldsSchema.schema, { fName: "姓名", fCompany: "公司" });
    assert.deepEqual(reversedSchema.schema, { fName: "姓名", fPhone: "手机号" });
  });

  it("accepts nested columns and descriptor objects keyed by field title", () => {
    const columnsSchema = parseSmartSheetWebhookSample({
      schema: {
        columns: [
          { field: { field_id: "fName", field_title: { text: "姓名" } } },
          { field: { fieldId: "fRole", fieldName: "会期身份" } }
        ]
      },
      add_records: [{ values: { fName: [{ text: "菲菲" }], fRole: [{ text: "分享嘉宾" }] } }]
    });
    const titleKeyedSchema = parseSmartSheetWebhookSample({
      schema: {
        "姓名": { field: { id: "fName", type: "text" } },
        "手机号": { fieldId: "fPhone", type: "text" }
      },
      add_records: [{ values: { fName: "菲菲", fPhone: "13900000000" } }]
    });

    assert.deepEqual(columnsSchema.schema, { fName: "姓名", fRole: "会期身份" });
    assert.deepEqual(titleKeyedSchema.schema, { fName: "姓名", fPhone: "手机号" });
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
