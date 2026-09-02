import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { WechatSubscribeClient } from "./wechat-subscribe-client";

describe("WechatSubscribeClient", () => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.WECHAT_APP_ID;
  const originalAppSecret = process.env.WECHAT_APP_SECRET;
  const originalState = process.env.WECHAT_MINIPROGRAM_STATE;

  beforeEach(() => {
    process.env.WECHAT_APP_ID = "wx-test-app";
    process.env.WECHAT_APP_SECRET = "test-secret";
    process.env.WECHAT_MINIPROGRAM_STATE = "trial";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    restoreEnv("WECHAT_APP_ID", originalAppId);
    restoreEnv("WECHAT_APP_SECRET", originalAppSecret);
    restoreEnv("WECHAT_MINIPROGRAM_STATE", originalState);
  });

  it("caches the access token and sends the approved subscription payload", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes("/cgi-bin/token")) {
        return jsonResponse({ access_token: "access-token", expires_in: 7200 });
      }
      return jsonResponse({ errcode: 0, errmsg: "ok", msgid: "message-1" });
    }) as typeof fetch;
    const client = new WechatSubscribeClient();

    const first = await client.send({
      openid: "openid-1",
      templateId: "template-1",
      page: "pages/registrations/schedule",
      data: { thing1: { value: "工作坊安排已更新" } }
    });
    const second = await client.send({
      openid: "openid-1",
      templateId: "template-1",
      data: { thing1: { value: "晚宴安排已更新" } }
    });

    assert.equal(first.ok, true);
    assert.equal(first.messageId, "message-1");
    assert.equal(second.ok, true);
    assert.equal(calls.filter((call) => call.url.includes("/cgi-bin/token")).length, 1);
    assert.equal(calls.filter((call) => call.url.includes("/message/subscribe/send")).length, 2);
    const firstBody = JSON.parse(String(calls[1]?.init?.body)) as Record<string, unknown>;
    assert.equal(firstBody.touser, "openid-1");
    assert.equal(firstBody.template_id, "template-1");
    assert.equal(firstBody.page, "pages/registrations/schedule");
    assert.equal(firstBody.miniprogram_state, "trial");
    assert.deepEqual(firstBody.data, { thing1: { value: "工作坊安排已更新" } });
  });

  it("returns the WeChat failure code without treating it as success", async () => {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input);
      return url.includes("/cgi-bin/token")
        ? jsonResponse({ access_token: "access-token", expires_in: 7200 })
        : jsonResponse({ errcode: 43101, errmsg: "user refuse to accept the msg" });
    }) as typeof fetch;
    const client = new WechatSubscribeClient();

    const result = await client.send({
      openid: "openid-1",
      templateId: "template-1",
      data: { thing1: { value: "安排更新" } }
    });

    assert.equal(result.ok, false);
    assert.equal(result.errcode, 43101);
    assert.match(result.errmsg, /refuse/);
  });
});

function jsonResponse(data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "undefined") delete process.env[key];
  else process.env[key] = value;
}
