import "reflect-metadata";
import assert from "node:assert/strict";
import { createCipheriv, generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, before, beforeEach, describe, it } from "node:test";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret } from "../wecom/wecom.crypto";
import { DEFAULT_PAYMENT_COMPANY, PaymentMerchantService } from "./payment-merchant.service";
import { WechatPayConfig } from "./wechat-pay.config";
import { WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";

const admin: CurrentAdmin = { id: "merchant-admin", username: "merchant-admin", displayName: null };
const appId = "wx-merchant-test-app";
const defaultMchId = "1900000001";
const conferenceId = "conference-1";
const day = 24 * 60 * 60 * 1000;
const environmentKeys = [
  "WECHAT_PAY_APP_ID", "WECHAT_APP_ID", "WECHAT_PAY_MCH_ID", "WECHAT_PAY_MCH_SERIAL_NO",
  "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_NOTIFY_URL",
  "WECOM_CONFIG_ENCRYPTION_KEY", "WECOM_CONFIG_ENCRYPTION_KEY_PREVIOUS", "JWT_SECRET"
] as const;

describe("PaymentMerchantService", { concurrency: false }, () => {
  let originalEnv: Map<string, string | undefined>;
  let directory: string;
  let privateKeyPem: string;
  let platformPublicKeyPem: string;
  let platformPrivateKeyPem: string;
  let rotatedPrivateKeyPem: string;
  let rotatedPlatformPublicKeyPem: string;
  let rotatedPlatformPrivateKeyPem: string;
  let untrustedPlatformPublicKeyPem: string;
  let untrustedPlatformPrivateKeyPem: string;
  let apiV3Key: string;
  let prisma: ReturnType<typeof createPrismaFake>;
  let service: OfflinePaymentMerchantService;
  let networkCalls: number;
  let originalFetch: typeof globalThis.fetch;

  before(() => {
    const options = {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" }
    } as const;
    privateKeyPem = generateKeyPairSync("rsa", options).privateKey.trim();
    const platform = generateKeyPairSync("rsa", options);
    platformPublicKeyPem = platform.publicKey.trim();
    platformPrivateKeyPem = platform.privateKey.trim();
    rotatedPrivateKeyPem = generateKeyPairSync("rsa", options).privateKey.trim();
    const rotatedPlatform = generateKeyPairSync("rsa", options);
    rotatedPlatformPublicKeyPem = rotatedPlatform.publicKey.trim();
    rotatedPlatformPrivateKeyPem = rotatedPlatform.privateKey.trim();
    const untrustedPlatform = generateKeyPairSync("rsa", options);
    untrustedPlatformPublicKeyPem = untrustedPlatform.publicKey.trim();
    untrustedPlatformPrivateKeyPem = untrustedPlatform.privateKey.trim();
  });

  beforeEach(() => {
    originalEnv = new Map(environmentKeys.map(key => [key, process.env[key]]));
    directory = mkdtempSync(join(tmpdir(), "payment-merchant-test-"));
    const keyPath = join(directory, "ephemeral-private.pem");
    writeFileSync(keyPath, privateKeyPem, { mode: 0o600 });
    apiV3Key = randomBytes(16).toString("hex");
    Object.assign(process.env, {
      WECHAT_PAY_APP_ID: appId,
      WECHAT_APP_ID: "wx-unused-fallback",
      WECHAT_PAY_MCH_ID: defaultMchId,
      WECHAT_PAY_MCH_SERIAL_NO: "default-serial",
      WECHAT_PAY_API_V3_KEY: randomBytes(16).toString("hex"),
      WECHAT_PAY_PRIVATE_KEY_PATH: keyPath,
      WECHAT_PAY_NOTIFY_URL: "https://payments.example.test/api/payments/wechat/notify",
      WECOM_CONFIG_ENCRYPTION_KEY: randomBytes(32).toString("hex")
    });
    delete process.env.WECOM_CONFIG_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.JWT_SECRET;
    networkCalls = 0;
    originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      networkCalls += 1;
      throw new Error("Network access is forbidden in PaymentMerchantService unit tests");
    };
    prisma = createPrismaFake();
    service = new OfflinePaymentMerchantService(prisma as unknown as PrismaService);
  });

  afterEach(() => {
    try {
      rmSync(directory, { recursive: true, force: true });
      assert.equal(networkCalls, 0, "merchant tests must not invoke the real credential probe");
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of originalEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  const credentials = () => ({
    appId, mchSerialNo: "managed-serial", platformKeyId: "PUB_KEY_ID_TEST",
    apiV3Key, privateKeyPem, platformPublicKeyPem
  });
  const snapshot = () => service.snapshotForConference(prisma as unknown as Prisma.TransactionClient, conferenceId);

  async function createActiveMerchant(mchId = "1900000002") {
    const merchant = (await service.create({ companyName: `Test company ${mchId}`, mchId }, admin)).data;
    const revision = (await service.saveRevision(merchant.id, credentials(), admin)).data;
    await service.checkRevision(merchant.id, revision.id, admin);
    await service.activate(merchant.id, revision.id, { associationConfirmed: true }, admin);
    return { merchant, revision };
  }

  async function managedOrder() {
    const result = await createActiveMerchant();
    await service.setConference(conferenceId, { paymentMerchantId: result.merchant.id }, admin);
    return { ...result, order: await snapshot() };
  }

  function rotatedCredentials() {
    return {
      ...credentials(), apiV3Key: randomBytes(16).toString("hex"),
      privateKeyPem: rotatedPrivateKeyPem, platformPublicKeyPem: rotatedPlatformPublicKeyPem,
      mchSerialNo: "rotated-serial", platformKeyId: "PUB_KEY_ID_ROTATED"
    };
  }

  async function rotateMerchant(merchantId: string, overrides: Partial<ReturnType<typeof rotatedCredentials>> = {}) {
    const input = { ...rotatedCredentials(), ...overrides };
    const revision = (await service.saveRevision(merchantId, input, admin)).data;
    await service.checkRevision(merchantId, revision.id, admin);
    await service.activate(merchantId, revision.id, { associationConfirmed: true }, admin);
    return { revision, input };
  }

  function assertOriginalRoute(config: WechatPayConfig, revisionId: string) {
    assert.equal(config.notifyUrl, `https://payments.example.test/api/payments/wechat/merchants/${revisionId}/notify`);
    assert.equal(config.refundNotifyUrl, `https://payments.example.test/api/payments/wechat/merchants/${revisionId}/refund-notify`);
  }

  function assertRedacted(value: unknown, additionalSecrets: string[] = []) {
    const serialized = JSON.stringify(value);
    for (const field of ["credentialEnc", "apiV3Key", "privateKeyPem", "platformPublicKeyPem"]) {
      assert.equal(serialized.includes(`"${field}"`), false, `public response/audit must omit ${field}`);
    }
    const secrets = [apiV3Key, privateKeyPem, platformPublicKeyPem,
      process.env.WECOM_CONFIG_ENCRYPTION_KEY!, ...additionalSecrets];
    for (const value of secrets) {
      assert.equal(serialized.includes(JSON.stringify(value).slice(1, -1)), false,
        "public response/audit must not contain credential material");
    }
  }

  it("snapshots the default environment merchant without looking up a managed merchant", async () => {
    process.env.WECHAT_PAY_MCH_ID = ` ${defaultMchId} `;
    process.env.WECHAT_PAY_APP_ID = ` ${appId} `;

    assert.deepEqual(await snapshot(), {
      paymentMerchantRevisionId: null,
      paymentMerchantSnapshot: { source: "ENVIRONMENT", companyName: DEFAULT_PAYMENT_COMPANY, mchId: defaultMchId, appId }
    });
    assert.equal(prisma.merchantReads, 0);
    assert.equal(prisma.audits.length, 0);
  });

  it("uses the AppID alias and records null for absent default identifiers", async () => {
    process.env.WECHAT_PAY_APP_ID = " ";
    process.env.WECHAT_APP_ID = ` ${appId} `;
    assert.equal((await snapshot()).paymentMerchantSnapshot.appId, appId);
    delete process.env.WECHAT_APP_ID;
    delete process.env.WECHAT_PAY_MCH_ID;
    assert.deepEqual((await snapshot()).paymentMerchantSnapshot, {
      source: "ENVIRONMENT", companyName: DEFAULT_PAYMENT_COMPANY, mchId: null, appId: null
    });
  });

  it("reads default configuration only when the historical default snapshot still matches", async () => {
    const order = await snapshot();
    const config = await service.configForOrder(order);
    assert.equal(config.mchId, defaultMchId);
    assert.equal(config.appId, appId);
    assert.equal(config.privateKeyPem === privateKeyPem, true, "default config uses the ephemeral key");
    assert.equal(config.apiV3Key === process.env.WECHAT_PAY_API_V3_KEY, true, "default config uses the test API key");
    for (const changed of [{ mchId: "1900000099" }, { appId: "wx-other-app" }, { source: "MANAGED" }]) {
      await assert.rejects(() => service.configForOrder({
        ...order, paymentMerchantSnapshot: { ...order.paymentMerchantSnapshot, ...changed }
      }), ConflictException);
    }
  });

  it("rejects a missing conference instead of snapshotting the default merchant", async () => {
    prisma.conferences.length = 0;
    await assert.rejects(snapshot, NotFoundException);
  });

  for (const invalid of ["disabled", "missing", "no revision", "unchecked", "unconfirmed", "wrong owner", "wrong app"] as const) {
    it(`fails closed for an explicitly configured merchant that is ${invalid}`, async () => {
      const { merchant, revision } = await managedOrder();
      const storedMerchant = prisma.merchants.find(item => item.id === merchant.id)!;
      const storedRevision = prisma.revisions.find(item => item.id === revision.id)!;
      if (invalid === "disabled") storedMerchant.enabled = false;
      if (invalid === "missing") prisma.merchants.length = 0;
      if (invalid === "no revision") storedMerchant.activeRevisionId = null;
      if (invalid === "unchecked") storedRevision.checkedAt = null;
      if (invalid === "unconfirmed") storedRevision.associationConfirmedAt = null;
      if (invalid === "wrong owner") storedRevision.merchantId = "different-merchant";
      if (invalid === "wrong app") storedRevision.appId = "wx-other-app";
      const auditCount = prisma.audits.length;

      await assert.rejects(snapshot, invalid === "wrong app" ? BadRequestException : ConflictException);
      await assert.rejects(() => service.setConference(conferenceId, { paymentMerchantId: merchant.id }, admin),
        invalid === "wrong app" ? BadRequestException : ConflictException);
      assert.equal(prisma.conferences[0]!.paymentMerchantId, merchant.id);
      assert.equal(prisma.audits.length, auditCount);
    });
  }

  it("records the explicit active revision and its merchant identity in the order snapshot", async () => {
    const { merchant, revision, order } = await managedOrder();
    assert.deepEqual(order, {
      paymentMerchantRevisionId: revision.id,
      paymentMerchantSnapshot: {
        source: "MANAGED", merchantId: merchant.id, revisionId: revision.id,
        companyName: merchant.companyName, mchId: merchant.mchId, appId
      }
    });
    assertRedacted(order);
  });

  it("rotates outbound credentials while preserving the immutable order identity, revision and callback route", async () => {
    const { merchant, revision, order } = await managedOrder();
    const originalSnapshot = structuredClone(order);
    const originalCiphertext = prisma.revisions[0]!.credentialEnc;
    const { revision: next, input } = await rotateMerchant(merchant.id);

    assert.equal(next.version, revision.version + 1);
    assert.equal((await snapshot()).paymentMerchantRevisionId, next.id);
    assert.equal(prisma.revisions[0]!.credentialEnc === originalCiphertext, true, "old ciphertext stays immutable");
    for (const purpose of ["HISTORY", "PREPAY"] as const) {
      const config = await service.configForOrder(order, purpose);
      assert.equal(config.apiV3Key === input.apiV3Key, true, "old order uses the active API key for the original merchant");
      assert.equal(config.privateKeyPem === rotatedPrivateKeyPem, true, "outbound requests use the active merchant key");
      assert.equal(config.verificationKey?.pem === rotatedPlatformPublicKeyPem, true, "responses use the active verification key");
      assert.equal(config.mchSerialNo, "rotated-serial");
      assert.equal(config.verificationKey?.id, "PUB_KEY_ID_ROTATED");
      assert.equal(config.mchId, merchant.mchId);
      assert.equal(config.appId, appId);
      assertOriginalRoute(config, revision.id);
    }
    assert.equal((await service.configForOrder(await snapshot())).apiV3Key === input.apiV3Key, true,
      "new orders use the new API key");
    assert.deepEqual(order, originalSnapshot);
  });

  it("keeps historical orders on their revision after the conference switches merchants or returns to default", async () => {
    const { merchant, revision, order } = await managedOrder();
    const originalSnapshot = structuredClone(order);
    const other = await createActiveMerchant("1900000003");
    await service.setConference(conferenceId, { paymentMerchantId: other.merchant.id }, admin);
    assert.equal((await snapshot()).paymentMerchantRevisionId, other.revision.id);
    assert.equal((await service.configForOrder(order)).mchId, merchant.mchId);

    await service.setConference(conferenceId, { paymentMerchantId: null }, admin);
    assert.equal((await snapshot()).paymentMerchantRevisionId, null);
    const historical = await service.configForOrder(order);
    assert.equal(historical.mchId, merchant.mchId);
    assert.equal(historical.refundNotifyUrl,
      `https://payments.example.test/api/payments/wechat/merchants/${revision.id}/refund-notify`);
    assert.deepEqual(order, originalSnapshot);
  });

  it("allows historical config and callbacks for a disabled merchant but blocks PREPAY and new snapshots", async () => {
    const { merchant, revision, order } = await managedOrder();
    const rotated = await rotateMerchant(merchant.id);
    await service.update(merchant.id, { enabled: false }, admin);
    const historical = await service.configForOrder(order, "HISTORY");
    const callback = await service.configForCallback(revision.id);
    assert.equal(historical.mchId, merchant.mchId);
    assert.equal(callback.mchId, merchant.mchId);
    assert.equal(historical.apiV3Key === rotated.input.apiV3Key, true, "disabled merchant history uses active credentials");
    assert.equal(callback.apiV3Key === rotated.input.apiV3Key, true, "callback defaults to the active trusted candidate");
    assertOriginalRoute(historical, revision.id);
    assertOriginalRoute(callback, revision.id);
    const candidates = await service.configForCallbackCandidates(revision.id);
    assert.equal(candidates.length, 2);
    assert.equal(candidates.some(config => config.apiV3Key === apiV3Key), true, "old callback keys remain trusted during overlap");
    assert.doesNotThrow(() => service.assertCallbackOrder(order, revision.id, {
      mchid: merchant.mchId, appid: appId
    }, callback));
    await assert.rejects(() => service.configForOrder(order, "PREPAY"), ConflictException);
    await assert.rejects(snapshot, ConflictException);
  });

  for (const invalid of ["unchecked", "unconfirmed", "foreign merchant", "different AppID"] as const) {
    it(`rejects outbound and callback configuration when the active revision is ${invalid}`, async () => {
      const { merchant, revision, order } = await managedOrder();
      const next = await rotateMerchant(merchant.id);
      const active = prisma.revisions.find(item => item.id === next.revision.id)!;
      if (invalid === "unchecked") active.checkedAt = null;
      if (invalid === "unconfirmed") active.associationConfirmedAt = null;
      if (invalid === "different AppID") active.appId = "wx-other-app";
      if (invalid === "foreign merchant") {
        const other = await createActiveMerchant("1900000003");
        prisma.merchants.find(item => item.id === merchant.id)!.activeRevisionId = other.revision.id;
      }
      for (const purpose of ["HISTORY", "PREPAY"] as const) {
        await assert.rejects(() => service.configForOrder(order, purpose), ConflictException);
      }
      await assert.rejects(() => service.configForCallbackCandidates(revision.id), ConflictException);
    });
  }

  it("returns only the default environment candidate when no managed callback revision is supplied", async () => {
    const candidates = await service.configForCallbackCandidates();
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0]!.mchId, defaultMchId);
    assert.equal(candidates[0]!.appId, appId);
    assert.equal(candidates[0]!.apiV3Key === process.env.WECHAT_PAY_API_V3_KEY, true, "default candidate uses test environment credentials");
    assert.equal(candidates[0]!.notifyUrl, process.env.WECHAT_PAY_NOTIFY_URL);
    assert.equal(prisma.merchantReads, 0);
    assert.equal(JSON.stringify(await service.configForCallback()) === JSON.stringify(candidates[0]), true,
      "configForCallback delegates to the first environment candidate");
  });

  it("returns active credentials first and every validated same-merchant/AppID revision exactly once", async () => {
    const { merchant, revision, order } = await managedOrder();
    const second = await rotateMerchant(merchant.id, { mchSerialNo: "second-serial" });
    await rotateMerchant(merchant.id, { mchSerialNo: "third-serial" });
    await service.activate(merchant.id, second.revision.id, { associationConfirmed: true }, admin);
    await service.saveRevision(merchant.id, { ...rotatedCredentials(), mchSerialNo: "unchecked-serial" }, admin);
    const checkedOnly = await service.saveRevision(merchant.id, { ...rotatedCredentials(), mchSerialNo: "unconfirmed-serial" }, admin);
    await service.checkRevision(merchant.id, checkedOnly.data.id, admin);
    const other = await createActiveMerchant("1900000003");
    await service.setConference(conferenceId, { paymentMerchantId: other.merchant.id }, admin);
    const original = prisma.revisions.find(item => item.id === revision.id)!;
    const originalCredential = JSON.parse(decryptSecret(original.credentialEnc));
    prisma.revisions.push({ ...original, id: "different-app-revision", version: 100, appId: "wx-other-app",
      mchSerialNo: "different-app-serial", credentialEnc: encryptSecret(JSON.stringify({ ...originalCredential, appId: "wx-other-app" }))! });
    prisma.revisions.push({ ...original, id: "tampered-credential-revision", version: 101,
      mchSerialNo: "tampered-serial", credentialEnc: encryptSecret(JSON.stringify({ ...originalCredential, merchantId: other.merchant.id }))! });
    const frozenOrder = structuredClone(order);

    const candidates = await service.configForCallbackCandidates(revision.id);

    assert.equal(candidates[0]!.mchSerialNo, "second-serial");
    assert.deepEqual(candidates.map(config => config.mchSerialNo).sort(), ["managed-serial", "second-serial", "third-serial"]);
    for (const config of candidates) {
      assert.equal(config.mchId, merchant.mchId);
      assert.equal(config.appId, appId);
      assertOriginalRoute(config, revision.id);
    }
    assert.equal(JSON.stringify(await service.configForCallback(revision.id)) === JSON.stringify(candidates[0]), true,
      "configForCallback returns the first trusted candidate without exposing old credential material");
    assert.deepEqual(order, frozenOrder);
  });

  it("does not authorize a callback route that belongs to an unactivated draft", async () => {
    const { merchant } = await createActiveMerchant();
    const draft = (await service.saveRevision(merchant.id, rotatedCredentials(), admin)).data;
    await assert.rejects(() => service.configForCallbackCandidates(draft.id), ConflictException);
    await service.checkRevision(merchant.id, draft.id, admin);
    await assert.rejects(() => service.configForCallbackCandidates(draft.id), ConflictException);
  });

  for (const signingGeneration of ["old", "new"] as const) {
    for (const encryptionGeneration of ["old", "new"] as const) {
      it(`verifies a late callback with ${signingGeneration} RSA signing and ${encryptionGeneration} AES keys on the original route`, async () => {
        const { merchant, revision, order } = await managedOrder();
        const frozenOrder = structuredClone(order);
        const rotated = await rotateMerchant(merchant.id);
        const payload = { mchid: merchant.mchId, appid: appId, out_trade_no: "LATE_ORDER", trade_state: "SUCCESS" };
        const encryptionKey = encryptionGeneration === "new" ? rotated.input.apiV3Key : apiV3Key;
        const input = encryptedCallback(payload, encryptionKey,
          signingGeneration === "new" ? rotatedPlatformPrivateKeyPem : platformPrivateKeyPem,
          signingGeneration === "new" ? "PUB_KEY_ID_ROTATED" : "PUB_KEY_ID_TEST");

        const result = await service.verifyCallback({ merchantRevisionId: revision.id, ...input }, new WechatPayNotifyVerifier());

        assert.deepEqual(result.decrypted, payload);
        assert.equal(result.config.apiV3Key === encryptionKey, true, "signature and decryption keys can rotate independently");
        assert.equal(result.config.mchId, merchant.mchId);
        assert.equal(result.config.appId, appId);
        assertOriginalRoute(result.config, revision.id);
        assert.doesNotThrow(() => service.assertCallbackOrder(order, revision.id, result.decrypted, result.config));
        assert.throws(() => service.assertCallbackOrder(order, rotated.revision.id, result.decrypted, result.config), ConflictException);
        assert.deepEqual(order, frozenOrder);
      });
    }
  }

  for (const source of ["draft", "foreign merchant", "different AppID"] as const) {
    it(`never trusts signing or encryption keys from a ${source} revision`, async context => {
      const { merchant, revision } = await managedOrder();
      const excluded = { ...credentials(), apiV3Key: randomBytes(16).toString("hex"),
        platformPublicKeyPem: untrustedPlatformPublicKeyPem, platformKeyId: "PUB_KEY_ID_EXCLUDED" };
      if (source === "foreign merchant") {
        const other = (await service.create({ companyName: "Other company", mchId: "1900000003" }, admin)).data;
        const otherRevision = (await service.saveRevision(other.id, excluded, admin)).data;
        await service.checkRevision(other.id, otherRevision.id, admin);
        await service.activate(other.id, otherRevision.id, { associationConfirmed: true }, admin);
      } else {
        const draft = (await service.saveRevision(merchant.id, excluded, admin)).data;
        if (source === "different AppID") {
          const stored = prisma.revisions.find(item => item.id === draft.id)!;
          const decrypted = JSON.parse(decryptSecret(stored.credentialEnc));
          Object.assign(stored, { appId: "wx-other-app", checkedAt: new Date(), associationConfirmedAt: new Date(),
            credentialEnc: encryptSecret(JSON.stringify({ ...decrypted, appId: "wx-other-app" }))! });
        }
      }
      const payload = { mchid: merchant.mchId, appid: appId };
      const verifier = new WechatPayNotifyVerifier();
      const decrypt = context.mock.method(verifier, "decryptResource");
      const untrustedSignature = encryptedCallback(payload, apiV3Key, untrustedPlatformPrivateKeyPem, "PUB_KEY_ID_EXCLUDED");
      await assert.rejects(() => service.verifyCallback({ merchantRevisionId: revision.id, ...untrustedSignature }, verifier), {
        name: "UnauthorizedException", message: "微信支付回调验签失败"
      });
      assert.equal(decrypt.mock.callCount(), 0, "no callback decryption occurs before a trusted signature verifies");
      const forgedKnownSerial = encryptedCallback(payload, apiV3Key, untrustedPlatformPrivateKeyPem, "PUB_KEY_ID_TEST");
      await assert.rejects(() => service.verifyCallback({ merchantRevisionId: revision.id, ...forgedKnownSerial }, verifier), UnauthorizedException);
      assert.equal(decrypt.mock.callCount(), 0);
      const untrustedEncryption = encryptedCallback(payload, excluded.apiV3Key, platformPrivateKeyPem, "PUB_KEY_ID_TEST");
      await assert.rejects(() => service.verifyCallback({ merchantRevisionId: revision.id, ...untrustedEncryption }, verifier), {
        name: "BadRequestException", message: "微信支付回调解密失败，请核对原商户 API v3 密钥"
      });
      assert.equal(decrypt.mock.callCount(), 1, "only the trusted merchant API key is attempted");
    });
  }

  for (const [field, value] of [["mchId", "1900000099"], ["appId", "wx-other-app"], ["revisionId", "different-revision"]] as const) {
    it(`rejects an order configuration whose snapshot ${field} does not match its revision`, async () => {
      const { order } = await managedOrder();
      await assert.rejects(() => service.configForOrder({
        ...order, paymentMerchantSnapshot: { ...order.paymentMerchantSnapshot, [field]: value }
      }), ConflictException);
    });
  }

  it("rejects payment callbacks with missing or mismatched mchid, appid, or revision", async () => {
    const { merchant, revision, order } = await managedOrder();
    const config = await service.configForCallback(revision.id);
    const payload = { mchid: merchant.mchId, appid: appId };
    assert.doesNotThrow(() => service.assertCallbackOrder(order, revision.id, payload, config));
    for (const changed of [
      { mchid: "1900000099", appid: appId }, { mchid: merchant.mchId, appid: "wx-other-app" },
      { mchid: merchant.mchId }, { appid: appId }
    ]) {
      assert.throws(() => service.assertCallbackOrder(order, revision.id, changed, config), ConflictException);
    }
    for (const callbackRevision of [undefined, "different-revision"]) {
      assert.throws(() => service.assertCallbackOrder(order, callbackRevision, payload, config), ConflictException);
    }
    assert.throws(() => service.assertCallbackOrder({ paymentMerchantRevisionId: null }, revision.id, payload, config),
      ConflictException);
  });

  it("allows a refund callback without appid but still validates mchid and revision", async () => {
    const { merchant, revision, order } = await managedOrder();
    const config = await service.configForCallback(revision.id);
    assert.doesNotThrow(() => service.assertCallbackOrder(order, revision.id, { mchid: merchant.mchId }, config, true));
    assert.throws(() => service.assertCallbackOrder(order, revision.id, { mchid: "1900000099" }, config, true),
      ConflictException);
    assert.throws(() => service.assertCallbackOrder(order, "different-revision", { mchid: merchant.mchId }, config, true),
      ConflictException);
  });

  it("rejects missing historical revisions without falling back to environment credentials", async () => {
    const { order } = await managedOrder();
    prisma.revisions.length = 0;
    await assert.rejects(() => service.configForOrder(order), NotFoundException);
    await assert.rejects(() => service.configForCallback(order.paymentMerchantRevisionId!), NotFoundException);
  });

  it("encrypts stored credentials and redacts every CRUD/check/activation reply and audit entry", async () => {
    const created = await service.create({ companyName: "Credential test company", mchId: "1900000002" }, admin);
    const saved = await service.saveRevision(created.data.id, credentials(), admin);
    const stored = prisma.revisions[0]!;
    assert.equal(stored.credentialEnc.startsWith("v1:"), true, "credentials must be encrypted at rest");
    for (const value of [apiV3Key, privateKeyPem, platformPublicKeyPem]) {
      assert.equal(stored.credentialEnc.includes(value), false, "ciphertext must not contain plaintext credentials");
    }
    const decrypted = JSON.parse(decryptSecret(stored.credentialEnc));
    assert.equal(decrypted.apiV3Key === apiV3Key, true, "encrypted API key round-trips");
    assert.equal(decrypted.privateKeyPem === privateKeyPem, true, "encrypted private key round-trips");
    assert.equal(decrypted.platformPublicKeyPem === platformPublicKeyPem, true, "encrypted verification key round-trips");
    assert.equal(decrypted.merchantId, created.data.id);
    assert.equal(decrypted.mchId, created.data.mchId);
    assert.equal(decrypted.appId, appId);
    for (const field of ["apiV3Key", "privateKeyPem", "platformPublicKeyPem"]) {
      assert.equal(Object.hasOwn(stored, field), false, "database row must not retain plaintext credential fields");
    }

    const checked = await service.checkRevision(created.data.id, saved.data.id, admin);
    const activated = await service.activate(created.data.id, saved.data.id, { associationConfirmed: true }, admin);
    const assigned = await service.setConference(conferenceId, { paymentMerchantId: created.data.id }, admin);
    const updated = await service.update(created.data.id, { remark: "reviewed", enabled: false }, admin);
    const listed = await service.list();
    assert.equal(listed.data.encryptionConfigured, true);
    assert.equal(listed.data.items[0]!.conferenceCount, 1);
    assert.equal(listed.data.items[0]!.revisions[0]!.credentialsConfigured, true);
    assert.equal(updated.data.enabled, false);
    assert.equal(updated.data.remark, "reviewed");
    assert.equal(prisma.audits.length, 6);
    assert.deepEqual(prisma.audits[1]!.metadataJson, { revisionId: saved.data.id, version: 1 });
    for (const entry of prisma.audits) {
      assert.equal(entry.adminUserId, admin.id);
      assert.equal(entry.action, AuditAction.UPDATE);
      assert.equal(entry.entityType, "PaymentMerchant");
    }
    assertRedacted([created, saved, checked, activated, assigned, updated, listed, prisma.audits], [stored.credentialEnc]);
  });

  it("creates a fresh unchecked revision when blank secret inputs reuse prior credentials", async () => {
    const { merchant, revision } = await createActiveMerchant();
    const originalCiphertext = prisma.revisions[0]!.credentialEnc;
    const next = await service.saveRevision(merchant.id, {
      apiV3Key: " ", privateKeyPem: "", platformPublicKeyPem: "\n"
    }, admin);
    assert.notEqual(next.data.id, revision.id);
    assert.equal(next.data.version, 2);
    assert.equal(next.data.checkedAt, null);
    assert.equal(next.data.associationConfirmedAt, null);
    assert.equal(prisma.merchants[0]!.activeRevisionId, revision.id);
    assert.equal(prisma.revisions[0]!.credentialEnc === originalCiphertext, true, "previous revision is not overwritten");
    assert.equal(prisma.revisions[1]!.credentialEnc !== originalCiphertext, true, "new encryption uses a fresh IV");
    const copied = JSON.parse(decryptSecret(prisma.revisions[1]!.credentialEnc));
    assert.equal(copied.apiV3Key === apiV3Key && copied.privateKeyPem === privateKeyPem &&
      copied.platformPublicKeyPem === platformPublicKeyPem, true, "blank fields retain the previous credentials");
    assertRedacted([next, await service.list(), prisma.audits], prisma.revisions.map(item => item.credentialEnc));
  });

  it("recovers with full replacement credentials after retiring the old encryption key without changing old order identity", async () => {
    const { merchant, revision, order } = await managedOrder();
    const frozenOrder = structuredClone(order);
    const originalCiphertext = prisma.revisions[0]!.credentialEnc;
    process.env.WECOM_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const input = rotatedCredentials();
    const replacement = await service.saveRevision(merchant.id, input, admin);
    assert.equal(replacement.data.version, revision.version + 1);
    assert.equal(replacement.data.checkedAt, null);
    assert.equal(replacement.data.associationConfirmedAt, null);
    assert.equal(prisma.revisions[0]!.credentialEnc === originalCiphertext, true, "the unreadable predecessor is not overwritten");
    assert.equal(prisma.merchants[0]!.activeRevisionId, revision.id, "saving replacement credentials does not activate them");
    const decrypted = JSON.parse(decryptSecret(prisma.revisions[1]!.credentialEnc));
    assert.equal(decrypted.apiV3Key === input.apiV3Key && decrypted.privateKeyPem === input.privateKeyPem &&
      decrypted.platformPublicKeyPem === input.platformPublicKeyPem, true, "replacement credentials use the new encryption key");
    await service.checkRevision(merchant.id, replacement.data.id, admin);
    await service.activate(merchant.id, replacement.data.id, { associationConfirmed: true }, admin);

    const outbound = await service.configForOrder(order, "HISTORY");
    assert.equal(outbound.apiV3Key === input.apiV3Key, true, "old orders use the recovered active credentials");
    assertOriginalRoute(outbound, revision.id);
    const candidates = await service.configForCallbackCandidates(revision.id);
    assert.equal(candidates.length, 1, "unreadable history is skipped without blocking the active candidate");
    assert.equal(candidates[0]!.apiV3Key === input.apiV3Key, true);
    assertOriginalRoute(candidates[0]!, revision.id);
    assert.deepEqual(order, frozenOrder);
    assertRedacted([replacement, await service.list(), prisma.audits], [input.apiV3Key, input.privateKeyPem,
      input.platformPublicKeyPem, ...prisma.revisions.map(item => item.credentialEnc)]);
  });

  it("still fails closed when a partial replacement needs an unreadable previous secret", async () => {
    const { merchant } = await createActiveMerchant();
    process.env.WECOM_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    const auditCount = prisma.audits.length;
    for (const missing of ["apiV3Key", "privateKeyPem", "platformPublicKeyPem"] as const) {
      await assert.rejects(() => service.saveRevision(merchant.id, {
        ...rotatedCredentials(), [missing]: " "
      }, admin), ConflictException);
    }
    assert.equal(prisma.revisions.length, 1);
    assert.equal(prisma.audits.length, auditCount);
  });

  it("checks API v3 key length locally and warns that the credential probe does not verify callback decryption", async () => {
    const merchant = (await service.create({ companyName: "Probe test company", mchId: "1900000002" }, admin)).data;
    await assert.rejects(() => service.saveRevision(merchant.id, {
      ...credentials(), apiV3Key: randomBytes(15).toString("hex")
    }, admin), BadRequestException);
    const revision = (await service.saveRevision(merchant.id, credentials(), admin)).data;
    const result = await service.checkRevision(merchant.id, revision.id, admin);
    assert.match(result.data.message, /API v3.*仅.*(?:格式|长度)/);
    assert.match(result.data.message, /回调解密.*真实交易验证/);
    assert.ok(result.data.checkedAt instanceof Date);
    assert.equal(prisma.merchants[0]!.enabled, false);
    assertRedacted(result);
  });

  it("refuses to save credentials without a sufficiently long encryption key", async () => {
    const merchant = (await service.create({ companyName: "Test company", mchId: "1900000002" }, admin)).data;
    for (const value of [undefined, randomBytes(8).toString("hex")]) {
      if (value === undefined) delete process.env.WECOM_CONFIG_ENCRYPTION_KEY;
      else process.env.WECOM_CONFIG_ENCRYPTION_KEY = value;
      await assert.rejects(() => service.saveRevision(merchant.id, credentials(), admin), ConflictException);
    }
    assert.equal(prisma.revisions.length, 0);
    assert.equal(prisma.audits.length, 1);
  });

  for (const field of ["merchantId", "mchId", "appId"] as const) {
    it(`rejects decrypted credentials bound to a different ${field}`, async () => {
      const { revision, order } = await managedOrder();
      const stored = prisma.revisions[0]!;
      const original = JSON.parse(decryptSecret(stored.credentialEnc));
      stored.credentialEnc = encryptSecret(JSON.stringify({ ...original, [field]: "different-identity" }))!;
      await assert.rejects(() => service.configForOrder(order), ConflictException);
      await assert.rejects(() => service.configForCallback(revision.id), ConflictException);
    });
  }

  it("fails closed when the encryption key can no longer decrypt a stored revision", async () => {
    const { revision, order } = await managedOrder();
    process.env.WECOM_CONFIG_ENCRYPTION_KEY = randomBytes(32).toString("hex");
    await assert.rejects(() => service.configForOrder(order), ConflictException);
    await assert.rejects(() => service.configForCallback(revision.id), ConflictException);
  });

  for (const associationConfirmed of [undefined, false, "true"]) {
    it(`requires literal associationConfirmed=true, not ${JSON.stringify(associationConfirmed)}, before activation`, async () => {
      const { merchant, revision } = await createActiveMerchant();
      await service.update(merchant.id, { enabled: false }, admin);
      const before = structuredClone(prisma.revisions[0]!.associationConfirmedAt);
      const auditCount = prisma.audits.length;
      await assert.rejects(() => service.activate(merchant.id, revision.id, { associationConfirmed }, admin), BadRequestException);
      assert.equal(prisma.merchants[0]!.enabled, false);
      assert.deepEqual(prisma.revisions[0]!.associationConfirmedAt, before);
      assert.equal(prisma.audits.length, auditCount);
    });
  }

  for (const age of [null, day + 1]) {
    it(`rejects activation when credentials were ${age === null ? "never checked" : "checked over 24 hours ago"}`, async context => {
      const now = Date.now();
      context.mock.method(Date, "now", () => now);
      const merchant = (await service.create({ companyName: "Test company", mchId: "1900000002" }, admin)).data;
      const revision = (await service.saveRevision(merchant.id, credentials(), admin)).data;
      prisma.revisions[0]!.checkedAt = age === null ? null : new Date(now - age);
      await assert.rejects(() => service.activate(merchant.id, revision.id, { associationConfirmed: true }, admin),
        ConflictException);
      assert.equal(prisma.merchants[0]!.enabled, false);
      assert.equal(prisma.merchants[0]!.activeRevisionId, null);
      assert.equal(prisma.revisions[0]!.associationConfirmedAt, null);
      assert.equal(prisma.audits.length, 2);
    });
  }

  it("activates a checked revision at the 24-hour boundary only with association confirmation", async context => {
    const now = Date.now();
    context.mock.method(Date, "now", () => now);
    const merchant = (await service.create({ companyName: "Test company", mchId: "1900000002" }, admin)).data;
    const revision = (await service.saveRevision(merchant.id, credentials(), admin)).data;
    const checked = await service.checkRevision(merchant.id, revision.id, admin);
    assert.ok(checked.data.checkedAt instanceof Date);
    assert.deepEqual(service.probedMchIds, [merchant.mchId]);
    prisma.revisions[0]!.checkedAt = new Date(now - day);
    const result = await service.activate(merchant.id, revision.id, { associationConfirmed: true }, admin);
    assert.deepEqual(result.data, { id: merchant.id, enabled: true, activeRevisionId: revision.id });
    assert.equal(prisma.merchants[0]!.enabled, true);
    assert.equal(prisma.merchants[0]!.activeRevisionId, revision.id);
    assert.ok(prisma.revisions[0]!.associationConfirmedAt instanceof Date);
    assert.equal(prisma.audits.length, 4);
  });

  it("does not mark credentials checked or permit activation after a failed offline credential probe", async () => {
    const merchant = (await service.create({ companyName: "Test company", mchId: "1900000002" }, admin)).data;
    const revision = (await service.saveRevision(merchant.id, credentials(), admin)).data;
    service.probeFailure = new BadRequestException("Offline credential check failed");
    await assert.rejects(() => service.checkRevision(merchant.id, revision.id, admin), BadRequestException);
    await assert.rejects(() => service.activate(merchant.id, revision.id, { associationConfirmed: true }, admin),
      ConflictException);
    assert.equal(prisma.revisions[0]!.checkedAt, null);
    assert.equal(prisma.merchants[0]!.enabled, false);
    assert.equal(prisma.audits.length, 2);
  });

  it("does not check or activate another merchant's revision", async () => {
    const { revision } = await createActiveMerchant();
    const before = prisma.audits.length;
    const probeCount = service.probedMchIds.length;
    await assert.rejects(() => service.checkRevision("other-merchant", revision.id, admin), NotFoundException);
    await assert.rejects(() => service.activate("other-merchant", revision.id, { associationConfirmed: true }, admin),
      NotFoundException);
    assert.equal(service.probedMchIds.length, probeCount);
    assert.equal(prisma.audits.length, before);
  });

  it("cannot bypass activation or overwrite merchant identity through update", async () => {
    const { merchant, revision } = await createActiveMerchant();
    await service.update(merchant.id, { enabled: false }, admin);
    const auditCount = prisma.audits.length;
    for (const input of [{ enabled: true }, { activeRevisionId: revision.id }, { mchId: "1900000099" }, { companyName: "Changed" }]) {
      await assert.rejects(() => service.update(merchant.id, input, admin), BadRequestException);
    }
    assert.equal(prisma.merchants[0]!.enabled, false);
    assert.equal(prisma.merchants[0]!.mchId, merchant.mchId);
    assert.equal(prisma.merchants[0]!.companyName, merchant.companyName);
    assert.equal(prisma.audits.length, auditCount);
  });
});

class OfflinePaymentMerchantService extends PaymentMerchantService {
  readonly probedMchIds: string[] = [];
  probeFailure: Error | null = null;

  protected override async probeMerchant(config: WechatPayConfig) {
    this.probedMchIds.push(config.mchId);
    if (this.probeFailure) throw this.probeFailure;
  }
}

function encryptedCallback(payload: Record<string, unknown>, apiV3Key: string, signingPrivateKey: string, serial: string) {
  const nonce = randomBytes(6).toString("hex");
  const associatedData = "transaction";
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), Buffer.from(nonce, "utf8"));
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]);
  const resource = { algorithm: "AEAD_AES_256_GCM", nonce, associated_data: associatedData, ciphertext: ciphertext.toString("base64") };
  const rawBody = Buffer.from(JSON.stringify({ resource }), "utf8");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signatureNonce = randomBytes(12).toString("hex");
  const message = `${timestamp}\n${signatureNonce}\n${rawBody.toString("utf8")}\n`;
  const signature = sign("RSA-SHA256", Buffer.from(message, "utf8"), signingPrivateKey).toString("base64");
  return { rawBody, resource, headers: { timestamp, nonce: signatureNonce, serial, signature } };
}

type Merchant = {
  id: string; companyName: string; mchId: string; remark: string | null; enabled: boolean;
  activeRevisionId: string | null; createdAt: Date; updatedAt: Date;
};
type Revision = {
  id: string; merchantId: string; version: number; appId: string; mchSerialNo: string;
  platformKeyId: string; credentialEnc: string; checkedAt: Date | null;
  associationConfirmedAt: Date | null; createdAt: Date;
};
type Conference = { id: string; paymentMerchantId: string | null };
type Audit = {
  adminUserId: string; action: AuditAction; entityType: string; entityId: string;
  summary: string; metadataJson: Prisma.InputJsonObject;
};

function createPrismaFake() {
  const merchants: Merchant[] = [];
  const revisions: Revision[] = [];
  const conferences: Conference[] = [{ id: conferenceId, paymentMerchantId: null }];
  const audits: Audit[] = [];
  const revisionsFor = (merchantId: string) => revisions.filter(item => item.merchantId === merchantId)
    .sort((left, right) => right.version - left.version);
  const fake = {
    merchants, revisions, conferences, audits, merchantReads: 0,
    paymentMerchant: {
      async findUnique(args: {
        where: { id?: string; mchId?: string };
        include?: { activeRevision?: boolean; revisions?: { take?: number } };
      }) {
        fake.merchantReads += 1;
        const merchant = merchants.find(item => args.where.id !== undefined
          ? item.id === args.where.id : item.mchId === args.where.mchId);
        if (!merchant) return null;
        return structuredClone({
          ...merchant,
          ...(args.include?.activeRevision ? { activeRevision: revisions.find(item => item.id === merchant.activeRevisionId) ?? null } : {}),
          ...(args.include?.revisions ? { revisions: revisionsFor(merchant.id).slice(0, args.include.revisions.take) } : {})
        });
      },
      async findMany() {
        return structuredClone(merchants.map(merchant => ({
          ...merchant, revisions: revisionsFor(merchant.id),
          _count: { conferences: conferences.filter(item => item.paymentMerchantId === merchant.id).length }
        })));
      },
      async create({ data }: { data: Pick<Merchant, "companyName" | "mchId" | "remark"> }) {
        const merchant: Merchant = {
          ...data, id: `merchant-${merchants.length + 1}`, enabled: false, activeRevisionId: null,
          createdAt: new Date(), updatedAt: new Date()
        };
        merchants.push(merchant);
        return structuredClone(merchant);
      },
      async update({ where, data }: { where: { id: string }; data: Partial<Merchant> }) {
        const merchant = merchants.find(item => item.id === where.id)!;
        Object.assign(merchant, data);
        return structuredClone(merchant);
      }
    },
    paymentMerchantRevision: {
      async findUnique({ where }: { where: { id: string } }) {
        const revision = revisions.find(item => item.id === where.id);
        return revision ? structuredClone({ ...revision, merchant: merchants.find(item => item.id === revision.merchantId)! }) : null;
      },
      async findMany({ where, orderBy }: {
        where: { merchantId?: string; appId?: string; checkedAt?: { not: null }; associationConfirmedAt?: { not: null } };
        orderBy?: { version: "asc" | "desc" };
      }) {
        const matched = revisions.filter(item =>
          (where.merchantId === undefined || item.merchantId === where.merchantId) &&
          (where.appId === undefined || item.appId === where.appId) &&
          (!where.checkedAt || item.checkedAt !== null) &&
          (!where.associationConfirmedAt || item.associationConfirmedAt !== null));
        if (orderBy) matched.sort((left, right) => orderBy.version === "desc" ? right.version - left.version : left.version - right.version);
        return structuredClone(matched.map(revision => ({
          ...revision, merchant: merchants.find(item => item.id === revision.merchantId)!
        })));
      },
      async create({ data }: { data: Omit<Revision, "id" | "checkedAt" | "associationConfirmedAt" | "createdAt"> }) {
        const revision: Revision = {
          ...data, id: `revision-${revisions.length + 1}`, checkedAt: null,
          associationConfirmedAt: null, createdAt: new Date()
        };
        revisions.push(revision);
        return structuredClone(revision);
      },
      async update({ where, data }: { where: { id: string }; data: Partial<Revision> }) {
        const revision = revisions.find(item => item.id === where.id)!;
        Object.assign(revision, data);
        return structuredClone(revision);
      }
    },
    conference: {
      async findUnique({ where }: { where: { id: string } }) {
        const conference = conferences.find(item => item.id === where.id);
        const merchant = merchants.find(item => item.id === conference?.paymentMerchantId);
        return conference ? structuredClone({ ...conference, paymentMerchant: merchant
          ? { companyName: merchant.companyName, enabled: merchant.enabled, mchId: merchant.mchId } : null }) : null;
      },
      async update({ where, data }: { where: { id: string }; data: Partial<Conference> }) {
        const conference = conferences.find(item => item.id === where.id)!;
        Object.assign(conference, data);
        return structuredClone(conference);
      }
    },
    auditLog: {
      async create({ data }: { data: Audit }) {
        audits.push(structuredClone(data));
        return structuredClone(data);
      }
    },
    async $transaction<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
      const before = structuredClone({ merchants, revisions, conferences, audits });
      try {
        return await operation(fake as unknown as Prisma.TransactionClient);
      } catch (error) {
        merchants.splice(0, merchants.length, ...before.merchants);
        revisions.splice(0, revisions.length, ...before.revisions);
        conferences.splice(0, conferences.length, ...before.conferences);
        audits.splice(0, audits.length, ...before.audits);
        throw error;
      }
    }
  };
  return fake;
}
