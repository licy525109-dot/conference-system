import { createHash } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { WecomSmartBotAdapter } from "./wecom-smart-bot.adapter";

describe("WecomSmartBotAdapter", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("signs the auth request and reads an existing SmartSheet by full URL", async () => {
    const calls: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      calls.push({ url: String(input), headers: new Headers(init?.headers), body });
      if (calls.length === 1) return jsonResponse({ errcode: 0, errmsg: "ok", token: "bot-token" });
      return gatewayResponse({
        errcode: 0,
        errmsg: "ok",
        name: "观潮嘉宾表",
        sheets: [{ sheet_id: "sheet-data", title: "数据汇总", type: "smartsheet", record_count: 266 }]
      });
    }) as typeof fetch;
    const client = new WecomSmartBotAdapter();
    const credentials = { botId: "bot-id", secret: "bot-secret" };
    const docUrl = "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=share-code&tab=sheet-data";

    const sheets = await client.getSmartSheetSheets(credentials, docUrl);

    const auth = calls[0]!.body;
    assert.equal(auth.bot_id, "bot-id");
    assert.equal(auth.bind_source, 1);
    assert.equal(
      auth.signature,
      createHash("sha256").update(`bot-secretbot-id${auth.time}${auth.nonce}`).digest("hex")
    );
    assert.equal(calls[1]!.headers.get("authorization"), "Bearer bot-token");
    assert.deepEqual(JSON.parse(String(calls[1]!.body.payload)), { docid: docUrl });
    assert.deepEqual(sheets, [{ sheet_id: "sheet-data", title: "数据汇总", type: "smartsheet", record_count: 266 }]);
  });

  it("paginates records and decodes JSON-serialized cell values", async () => {
    const payloads: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("get_cli_config")) return jsonResponse({ errcode: 0, token: "token" });
      const body = JSON.parse(String(init?.body)) as { payload: string };
      payloads.push(JSON.parse(body.payload) as Record<string, unknown>);
      return gatewayResponse(payloads.length === 1
        ? {
            errcode: 0,
            has_more: true,
            next_cursor: "cursor-2",
            records: [{ record_id: "r1", values: { 姓名: "[{\"type\":\"text\",\"text\":\"张三\"}]" } }]
          }
        : {
            errcode: 0,
            has_more: false,
            records: [{ record_id: "r2", values: { 姓名: "李四" } }]
          });
    }) as typeof fetch;
    const client = new WecomSmartBotAdapter();

    const records = await client.getSmartSheetRecords(
      { botId: "bot-id", secret: "secret" },
      "https://doc.weixin.qq.com/smartsheet/s3_existing?scode=code",
      "sheet-data"
    );

    assert.deepEqual(records.map((item) => item.record_id), ["r1", "r2"]);
    assert.deepEqual(records[0]?.values?.姓名, [{ type: "text", text: "张三" }]);
    assert.equal(records[1]?.values?.姓名, "李四");
    assert.equal(payloads[0]?.cursor, undefined);
    assert.equal(payloads[1]?.cursor, "cursor-2");
  });

  it("serializes record values for add and update calls", async () => {
    const calls: Array<{ url: string; payload: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes("get_cli_config")) return jsonResponse({ errcode: 0, token: "token" });
      const body = JSON.parse(String(init?.body)) as { payload: string };
      calls.push({ url: String(input), payload: JSON.parse(body.payload) as Record<string, unknown> });
      return gatewayResponse(String(input).endsWith("/add")
        ? { errcode: 0, records: [{ record_id: "record-1" }] }
        : { errcode: 0, records: [{ record_id: "record-1" }] });
    }) as typeof fetch;
    const client = new WecomSmartBotAdapter();
    const credentials = { botId: "bot-id", secret: "secret" };
    const values = { 姓名: [{ type: "text", text: "张三" }] };

    const ids = await client.addSmartSheetRecords(credentials, "https://doc.weixin.qq.com/smartsheet/s3_doc", "sheet", [{ values }]);
    await client.updateSmartSheetRecords(credentials, "https://doc.weixin.qq.com/smartsheet/s3_doc", "sheet", [{ record_id: "record-1", values }]);

    assert.deepEqual(ids, ["record-1"]);
    assert.equal((calls[0]?.payload.records as Array<{ values: Record<string, string> }>)[0]?.values.姓名, JSON.stringify(values.姓名));
    assert.equal((calls[1]?.payload.records as Array<{ record_id: string }>)[0]?.record_id, "record-1");
    assert.equal(calls[0]?.payload.key_type, "field_title");
    assert.equal(calls[1]?.payload.type, "update");
  });

  it("refreshes an expired CLI token once", async () => {
    let authCalls = 0;
    let apiCalls = 0;
    globalThis.fetch = (async (input: string | URL | Request) => {
      if (String(input).includes("get_cli_config")) {
        authCalls += 1;
        return jsonResponse({ errcode: 0, token: `token-${authCalls}` });
      }
      apiCalls += 1;
      if (apiCalls === 1) return jsonResponse({ errcode: 853004, errmsg: "token expired" });
      return gatewayResponse({ errcode: 0, sheets: [{ sheet_id: "sheet", title: "总表" }] });
    }) as typeof fetch;
    const client = new WecomSmartBotAdapter();

    const sheets = await client.getSmartSheetSheets(
      { botId: "bot-id", secret: "secret" },
      "https://doc.weixin.qq.com/smartsheet/s3_doc"
    );

    assert.equal(authCalls, 2);
    assert.equal(apiCalls, 2);
    assert.equal(sheets[0]?.sheet_id, "sheet");
  });

  it("does not expose the bot secret in authorization errors", async () => {
    globalThis.fetch = (async () => jsonResponse({ errcode: 853001, errmsg: "invalid signature" })) as typeof fetch;
    const client = new WecomSmartBotAdapter();

    await assert.rejects(
      () => client.verifyCredentials({ botId: "bot-id", secret: "never-show-this-secret" }),
      (error: Error) => !error.message.includes("never-show-this-secret") && error.message.includes("853001")
    );
  });
});

function gatewayResponse(result: Record<string, unknown>): Response {
  return jsonResponse({
    errcode: 0,
    errmsg: "ok",
    results_json: JSON.stringify({ result: JSON.stringify(result) })
  });
}

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
