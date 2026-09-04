import "reflect-metadata";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";

const originalEnv = {
  path: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH,
  publicKeyId: process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID,
  certificateSerial: process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO,
  tolerance: process.env.WECHAT_PAY_NOTIFY_TIMESTAMP_TOLERANCE_SECONDS
};

describe("WechatPayNotifyVerifier signature hardening", () => {
  let directory: string;
  let privateKey: string;
  let verifier: FixedTimeVerifier;
  const now = new Date("2026-09-04T12:00:00.000Z");

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "wechat-notify-"));
    const pair = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    });
    privateKey = pair.privateKey;
    const publicKeyPath = join(directory, "wechatpay-public.pem");
    writeFileSync(publicKeyPath, pair.publicKey, { mode: 0o600 });
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH = publicKeyPath;
    process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID = "PUB_KEY_ID_3000000001";
    delete process.env.WECHAT_PAY_PLATFORM_CERT_SERIAL_NO;
    delete process.env.WECHAT_PAY_NOTIFY_TIMESTAMP_TOLERANCE_SECONDS;
    verifier = new FixedTimeVerifier(now);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    restoreEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH", originalEnv.path);
    restoreEnv("WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID", originalEnv.publicKeyId);
    restoreEnv("WECHAT_PAY_PLATFORM_CERT_SERIAL_NO", originalEnv.certificateSerial);
    restoreEnv("WECHAT_PAY_NOTIFY_TIMESTAMP_TOLERANCE_SECONDS", originalEnv.tolerance);
  });

  it("accepts a fresh signature made by the configured WeChat Pay key", () => {
    const rawBody = Buffer.from('{"id":"notify-1"}', "utf8");
    const headers = signedHeaders(rawBody, now, privateKey);

    assert.doesNotThrow(() => verifier.verifySignature({ headers, rawBody }));
  });

  it("rejects callbacks outside the five-minute replay window", () => {
    const rawBody = Buffer.from('{"id":"notify-1"}', "utf8");
    const old = new Date(now.getTime() - 301_000);
    const headers = signedHeaders(rawBody, old, privateKey);

    assert.throws(() => verifier.verifySignature({ headers, rawBody }), UnauthorizedException);
  });

  it("rejects a signature whose serial does not match the configured key", () => {
    const rawBody = Buffer.from('{"id":"notify-1"}', "utf8");
    const headers = { ...signedHeaders(rawBody, now, privateKey), serial: "PUB_KEY_ID_9999999999" };

    assert.throws(() => verifier.verifySignature({ headers, rawBody }), UnauthorizedException);
  });

  it("fails configuration closed when no verification key id is configured", () => {
    delete process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_ID;
    const rawBody = Buffer.from('{"id":"notify-1"}', "utf8");
    const headers = signedHeaders(rawBody, now, privateKey);

    assert.throws(() => verifier.verifySignature({ headers, rawBody }), InternalServerErrorException);
  });
});

class FixedTimeVerifier extends WechatPayNotifyVerifier {
  constructor(private readonly now: Date) {
    super();
  }

  protected override getCurrentTime(): Date {
    return this.now;
  }
}

function signedHeaders(rawBody: Buffer, date: Date, privateKey: string): WechatPayHeaders {
  const timestamp = String(Math.floor(date.getTime() / 1000));
  const nonce = "notify-nonce";
  const message = `${timestamp}\n${nonce}\n${rawBody.toString("utf8")}\n`;
  return {
    timestamp,
    nonce,
    serial: "PUB_KEY_ID_3000000001",
    signature: sign("RSA-SHA256", Buffer.from(message, "utf8"), privateKey).toString("base64")
  };
}

function restoreEnv(name: string, value: string | undefined) {
  if (typeof value === "undefined") delete process.env[name];
  else process.env[name] = value;
}
