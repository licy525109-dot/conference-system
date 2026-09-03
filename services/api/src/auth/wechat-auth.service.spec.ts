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
