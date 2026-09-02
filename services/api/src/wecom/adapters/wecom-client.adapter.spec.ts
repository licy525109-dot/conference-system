import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { WecomClientAdapter } from "./wecom-client.adapter";

describe("WecomClientAdapter SmartSheet", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("paginates records with the returned cursor", async () => {
    const bodies: Array<Record<string, unknown>> = [];
    globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      bodies.push(body);
      return jsonResponse(bodies.length === 1
        ? {
            errcode: 0,
            has_more: true,
            next_cursor: "cursor-2",
            records: [{ record_id: "record-1", values: { 姓名: [{ type: "text", text: "张三" }] } }]
          }
        : {
            errcode: 0,
            has_more: false,
            records: [{ record_id: "record-2", values: { 姓名: [{ type: "text", text: "李四" }] } }]
          });
    }) as typeof fetch;
    const client = new WecomClientAdapter();

    const records = await client.getSmartSheetRecords("token", "doc-1", "sheet-1");

    assert.deepEqual(records.map((item) => item.record_id), ["record-1", "record-2"]);
    assert.equal(bodies[0]?.cursor, undefined);
    assert.equal(bodies[1]?.cursor, "cursor-2");
    assert.equal(bodies[0]?.limit, 1000);
  });

  it("uses field titles for additions and explicit title key type for updates", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return jsonResponse(url.includes("add_records")
        ? { errcode: 0, record_ids: ["record-1"] }
        : { errcode: 0 });
    }) as typeof fetch;
    const client = new WecomClientAdapter();
    const values = { 姓名: [{ type: "text", text: "张三" }] };

    const ids = await client.addSmartSheetRecords("token", "doc-1", "sheet-1", [{ values }]);
    await client.updateSmartSheetRecords("token", "doc-1", "sheet-1", [{ record_id: "record-1", values }]);

    assert.deepEqual(ids, ["record-1"]);
    assert.equal(calls[0]?.body.key_type, undefined);
    assert.equal(calls[1]?.body.key_type, "CELL_VALUE_KEY_TYPE_FIELD_TITLE");
    assert.deepEqual(calls[0]?.body.records, [{ values }]);
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
