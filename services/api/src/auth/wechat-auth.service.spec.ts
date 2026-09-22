import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { WechatAuthService } from "./wechat-auth.service";

const originalAppId = process.env.WECHAT_APP_ID;
const originalAppSecret = process.env.WECHAT_APP_SECRET;

afterEach(() => {
  restoreEnv("WECHAT_APP_ID", originalAppId);
  restoreEnv("WECHAT_APP_SECRET", originalAppSecret);
});

describe("WechatAuthService phone number exchange", () => {
  it("refreshes a stale access token once before exchanging the phone code", async () => {
    withWechatCredentials();
    const service = new StubWechatAuthService(
      [accessToken("stale-token"), accessToken("fresh-token")],
      [wechatError(40014), phoneSuccess("13800138000")]
    );

    const result = await service.getPhoneNumber("phone-code");

    assert.equal(result.purePhoneNumber, "13800138000");
    assert.equal(service.accessTokenCalls, 2);
    assert.equal(service.phoneCalls, 2);
  });

  it("returns an actionable message when the phone code has expired", async () => {
    withWechatCredentials();
    const service = new StubWechatAuthService([accessToken("token")], [wechatError(40029)]);

    await assert.rejects(
      () => service.getPhoneNumber("expired-code"),
      (error: unknown) => error instanceof BadRequestException && String(error.message).includes("授权已失效")
    );
  });

  it("explains when the mini program phone capability is unavailable", async () => {
    withWechatCredentials();
    const service = new StubWechatAuthService([accessToken("token")], [wechatError(48001)]);

    await assert.rejects(
      () => service.getPhoneNumber("phone-code"),
      (error: unknown) => error instanceof BadRequestException && String(error.message).includes("手机号验证能力")
    );
  });

  it("explains invalid production app credentials without exposing them", async () => {
    withWechatCredentials();
    const service = new StubWechatAuthService([wechatError(40125)], []);

    await assert.rejects(
      () => service.getPhoneNumber("phone-code"),
      (error: unknown) => error instanceof BadGatewayException && String(error.message).includes("AppID 或 AppSecret")
    );
  });
});

class StubWechatAuthService extends WechatAuthService {
  accessTokenCalls = 0;
  phoneCalls = 0;

  constructor(
    private readonly accessTokenResponses: Array<{ ok: boolean; payload: Record<string, unknown> }>,
    private readonly phoneResponses: Array<{ ok: boolean; payload: Record<string, unknown> }>
  ) {
    super();
  }

  protected override async fetchAccessTokenPayload() {
    const response = this.accessTokenResponses[this.accessTokenCalls++];
    if (!response) throw new Error("missing access token test response");
    return response;
  }

  protected override async fetchPhoneNumberPayload() {
    const response = this.phoneResponses[this.phoneCalls++];
    if (!response) throw new Error("missing phone number test response");
    return response;
  }
}

function accessToken(value: string) {
  return { ok: true, payload: { access_token: value, expires_in: 7200 } };
}

function phoneSuccess(value: string) {
  return {
    ok: true,
    payload: {
      errcode: 0,
      phone_info: { phoneNumber: `+86${value}`, purePhoneNumber: value, countryCode: "86" }
    }
  };
}

function wechatError(errcode: number) {
  return { ok: true, payload: { errcode, errmsg: `wechat error ${errcode}` } };
}

function withWechatCredentials() {
  process.env.WECHAT_APP_ID = "test-app-id";
  process.env.WECHAT_APP_SECRET = "test-app-secret";
}

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}

class LinkService extends WechatAuthService {
  requests: Array<Record<string, unknown>> = [];
  tokenCalls = 0;
  responses: Array<{ ok: boolean; payload: Record<string, unknown> }> = [{ ok: true, payload: { errcode: 0, url_link: "https://wxaurl.cn/test-only" } }];
  protected override async fetchAccessTokenPayload() { this.tokenCalls++; return accessToken("test-only"); }
  protected override async fetchUrlLinkPayload(url: URL, body: Record<string, unknown>) {
    assert.equal(url.origin, "https://api.weixin.qq.com");
    assert.equal(url.pathname, "/wxa/generate_urllink");
    this.requests.push(body);
    return this.responses.shift()!;
  }
}
describe("WechatAuthService private invitation links", () => {
  it("generates a coupon-only released route for a seven-day invitation", async () => {
    withWechatCredentials(); const service = new LinkService(); const expiry = new Date(Date.now() + 168 * 3600_000 - 1000);
    await service.generateCouponClaimLink("c".repeat(43), expiry);
    assert.deepEqual(service.requests[0], { path: "pages/coupon/claim", query: `token=${"c".repeat(43)}`, env_version: "release", expire_type: 0, expire_time: Math.floor(expiry.getTime() / 1000) });
    await assert.rejects(service.generateGuestClaimLink("c".repeat(43), expiry));
    await assert.rejects(service.generateCouponClaimLink("c".repeat(43), new Date(Date.now() + 169 * 3600_000)));
    await assert.rejects(service.generateCouponClaimLink("c".repeat(43) + "&other=1", expiry));
    await assert.rejects(service.generateCouponClaimLink("c".repeat(43), new Date(NaN)));
    assert.equal(service.requests.length, 1);
  });
  it("retries stale coupon link access tokens once without changing recipient proof", async () => {
    withWechatCredentials(); const service = new LinkService(); service.responses.unshift(wechatError(42001));
    await service.generateCouponClaimLink("d".repeat(43), new Date(Date.now() + 3600_000));
    assert.equal(service.tokenCalls, 2); assert.deepEqual(service.requests[0], service.requests[1]);
  });
  it("returns sanitized coupon link timeout and transport errors", async () => {
    withWechatCredentials();
    class FailedLinkService extends LinkService {
      protected override async fetchUrlLinkPayload(): Promise<{ ok: boolean; payload: Record<string, unknown> }> { throw Object.assign(new Error("sensitive-token"), { name: "AbortError" }); }
    }
    await assert.rejects(new FailedLinkService().generateCouponClaimLink("d".repeat(43), new Date(Date.now() + 3600_000)), (e: Error) => e.message.includes("超时") && !e.message.includes("sensitive"));
  });
  it("uses only the fixed released invitation route and the existing invitation expiry", async () => {
    withWechatCredentials(); const service = new LinkService(); const expiry = new Date(Date.now() + 3600_000);
    const result = await service.generateGuestClaimLink("a".repeat(43), expiry);
    assert.equal(result, "https://wxaurl.cn/test-only");
    assert.deepEqual(service.requests[0], { path: "pages/account/claim", query: `token=${"a".repeat(43)}`, env_version: "release", expire_type: 0, expire_time: Math.floor(expiry.getTime() / 1000) });
  });
  it("refreshes stale access tokens once and never changes the invitation token", async () => {
    withWechatCredentials(); const service = new LinkService(); service.responses.unshift(wechatError(40014));
    await service.generateGuestClaimLink("b".repeat(43), new Date(Date.now() + 3600_000));
    assert.equal(service.tokenCalls, 2); assert.deepEqual(service.requests[0], service.requests[1]);
  });
  it("explains unpublished routes without exposing upstream response content", async () => {
    withWechatCredentials(); const service = new LinkService(); service.responses = [{ ok: true, payload: { errcode: 40165, errmsg: "sensitive-upstream-data" } }];
    await assert.rejects(service.generateGuestClaimLink("a".repeat(43), new Date(Date.now() + 3600_000)), (e: Error) => e.message.includes("发布") && !e.message.includes("sensitive"));
  });
  it("does not accept unsafe URLs or invalid expiry/token input", async () => {
    withWechatCredentials(); const service = new LinkService();
    await assert.rejects(service.generateGuestClaimLink("wrong", new Date(Date.now() + 3600_000)));
    await assert.rejects(service.generateGuestClaimLink("a".repeat(43), new Date(Date.now() + 30_000)));
    assert.equal(service.tokenCalls, 0);
    service.responses = [{ ok: true, payload: { url_link: "javascript:alert(1)" } }];
    await assert.rejects(service.generateGuestClaimLink("a".repeat(43), new Date(Date.now() + 3600_000)));
  });
});
