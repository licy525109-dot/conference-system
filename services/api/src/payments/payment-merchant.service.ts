import { createPrivateKey, createPublicKey, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import { decryptSecret, encryptSecret } from "../wecom/wecom.crypto";
import { readWechatPayConfig, WechatPayConfig } from "./wechat-pay.config";
import { WechatPayEncryptedResource, WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPaySigner } from "./wechat-pay.signer";

export const DEFAULT_PAYMENT_COMPANY = "北京壹昂智创科技有限公司";
export const merchantOrderSelect = { paymentMerchantRevisionId: true, paymentMerchantSnapshot: true } as const;
type MerchantOrder = { paymentMerchantRevisionId?: string | null; paymentMerchantSnapshot?: Prisma.JsonValue };
type MerchantRevision = Prisma.PaymentMerchantRevisionGetPayload<{ include: { merchant: true } }>;
type Credential = { apiV3Key: string; privateKeyPem: string; platformPublicKeyPem: string; merchantId: string; mchId: string; appId: string };

@Injectable()
export class PaymentMerchantService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const items = await this.prisma.paymentMerchant.findMany({
      orderBy: { createdAt: "desc" },
      include: { revisions: { orderBy: { version: "desc" } }, _count: { select: { conferences: true } } }
    });
    return ok({
      defaultMerchant: { id: null, companyName: DEFAULT_PAYMENT_COMPANY, mchId: process.env.WECHAT_PAY_MCH_ID?.trim() || null, source: "ENVIRONMENT" },
      encryptionConfigured: (process.env.WECOM_CONFIG_ENCRYPTION_KEY?.trim().length ?? 0) >= 32,
      items: items.map(({ revisions, _count, ...merchant }) => ({ ...merchant, conferenceCount: _count.conferences, revisions: revisions.map(publicRevision) }))
    });
  }

  async create(input: unknown, admin: CurrentAdmin) {
    const body = object(input);
    const companyName = required(body.companyName, "单位全称", 160);
    const mchId = required(body.mchId, "商户号", 32);
    if (!/^\d{6,20}$/.test(mchId)) throw new BadRequestException("商户号格式无效");
    if (mchId === process.env.WECHAT_PAY_MCH_ID?.trim()) throw new ConflictException("该商户号已用于默认收款单位");
    if (await this.prisma.paymentMerchant.findUnique({ where: { mchId } })) throw new ConflictException("该商户号已配置");
    const result = await this.prisma.$transaction(async tx => {
      const merchant = await tx.paymentMerchant.create({ data: { companyName, mchId, remark: optional(body.remark, 500) } });
      await audit(tx, admin, merchant.id, "Create payment merchant", { companyName, mchId });
      return merchant;
    });
    return ok(result);
  }

  async update(id: string, input: unknown, admin: CurrentAdmin) {
    const body = object(input);
    if ("mchId" in body || "companyName" in body || "activeRevisionId" in body || body.enabled === true) {
      throw new BadRequestException("收款单位及商户号不能覆盖修改；启用请使用配置版本的启用操作");
    }
    const result = await this.prisma.$transaction(async tx => {
      const item = await tx.paymentMerchant.findUnique({ where: { id } });
      if (!item) throw new NotFoundException("收款单位不存在");
      const merchant = await tx.paymentMerchant.update({ where: { id }, data: {
        ...(body.enabled === false ? { enabled: false } : {}),
        ...(body.remark !== undefined ? { remark: optional(body.remark, 500) } : {})
      } });
      await audit(tx, admin, id, "Update payment merchant", { enabled: merchant.enabled });
      return merchant;
    });
    return ok(result);
  }

  async saveRevision(id: string, input: unknown, admin: CurrentAdmin) {
    const body = object(input);
    const merchant = await this.prisma.paymentMerchant.findUnique({ where: { id }, include: { revisions: { orderBy: { version: "desc" }, take: 1 } } });
    if (!merchant) throw new NotFoundException("收款单位不存在");
    if ((process.env.WECOM_CONFIG_ENCRYPTION_KEY?.trim().length ?? 0) < 32) {
      throw new ConflictException("服务器尚未配置安全的配置加密密钥，不能保存支付凭据");
    }
    const previous = merchant.revisions[0];
    const needsPrevious = [body.apiV3Key, body.privateKeyPem, body.platformPublicKeyPem].some(value => typeof value !== "string" || !value.trim());
    const old = previous && needsPrevious ? readCredential(previous.credentialEnc) : null;
    const appId = required(body.appId ?? previous?.appId, "小程序 AppID", 64);
    assertAppId(appId);
    const mchSerialNo = required(body.mchSerialNo ?? previous?.mchSerialNo, "商户证书序列号", 128);
    const platformKeyId = required(body.platformKeyId ?? previous?.platformKeyId, "微信支付公钥 ID / 平台证书序列号", 128);
    const apiV3Key = secret(body.apiV3Key, old?.apiV3Key, "API v3 密钥", 32);
    const privateKeyPem = secret(body.privateKeyPem, old?.privateKeyPem, "商户私钥", 16000);
    const platformPublicKeyPem = secret(body.platformPublicKeyPem, old?.platformPublicKeyPem, "微信支付公钥 / 平台证书", 16000);
    validateKeys({ apiV3Key, privateKeyPem, platformPublicKeyPem });
    const credential: Credential = { apiV3Key, privateKeyPem, platformPublicKeyPem, merchantId: id, mchId: merchant.mchId, appId };
    const result = await this.prisma.$transaction(async tx => {
      const revision = await tx.paymentMerchantRevision.create({ data: {
        merchantId: id, version: (previous?.version ?? 0) + 1, appId, mchSerialNo, platformKeyId,
        credentialEnc: encryptSecret(JSON.stringify(credential))!
      } });
      await audit(tx, admin, id, "Save immutable payment credentials", { revisionId: revision.id, version: revision.version });
      return publicRevision(revision);
    });
    return ok(result);
  }

  async checkRevision(id: string, revisionId: string, admin: CurrentAdmin) {
    const revision = await this.revision(revisionId);
    if (revision.merchantId !== id) throw new NotFoundException("配置版本不存在");
    const config = this.revisionConfig(revision);
    assertAppId(config.appId);
    // A signed, authenticated read probes credentials without creating a payment.
    await this.probeMerchant(config);
    const result = await this.prisma.$transaction(async tx => {
      const checked = await tx.paymentMerchantRevision.update({ where: { id: revisionId }, data: { checkedAt: new Date() } });
      await audit(tx, admin, id, "Check payment merchant credentials", { revisionId });
      return publicRevision(checked);
    });
    return ok({ ...result, message: "签名与验签配置验证通过；API v3 密钥仅检查格式，回调解密须真实交易验证。JSAPI 权限和小程序关联仍需在微信商户平台确认" });
  }

  async activate(id: string, revisionId: string, input: unknown, admin: CurrentAdmin) {
    if (object(input).associationConfirmed !== true) throw new BadRequestException("请先确认已开通 JSAPI 支付并完成当前小程序关联");
    const revision = await this.revision(revisionId);
    if (revision.merchantId !== id) throw new NotFoundException("配置版本不存在");
    if (!revision.checkedAt || Date.now() - revision.checkedAt.getTime() > 24 * 60 * 60 * 1000) {
      throw new ConflictException("请先在 24 小时内验证此版本的商户接口凭据");
    }
    assertAppId(revision.appId);
    await this.prisma.$transaction(async tx => {
      await tx.paymentMerchantRevision.update({ where: { id: revisionId }, data: { associationConfirmedAt: new Date() } });
      await tx.paymentMerchant.update({ where: { id }, data: { activeRevisionId: revisionId, enabled: true } });
      await audit(tx, admin, id, "Activate payment merchant revision", { revisionId });
    });
    return ok({ id, enabled: true, activeRevisionId: revisionId });
  }

  async getConference(conferenceId: string) {
    const conference = await this.prisma.conference.findUnique({ where: { id: conferenceId }, select: { id: true, paymentMerchantId: true, paymentMerchant: { select: { companyName: true, enabled: true, mchId: true } } } });
    if (!conference) throw new NotFoundException("会议不存在");
    return ok({ ...conference, companyName: conference.paymentMerchant?.companyName ?? DEFAULT_PAYMENT_COMPANY });
  }

  async setConference(conferenceId: string, input: unknown, admin: CurrentAdmin) {
    const body = object(input);
    if (!("paymentMerchantId" in body)) throw new BadRequestException("缺少收款单位设置");
    const id = body.paymentMerchantId === null ? null : required(body.paymentMerchantId, "收款单位", 128);
    await this.prisma.$transaction(async tx => {
      const before = await tx.conference.findUnique({ where: { id: conferenceId }, select: { id: true, paymentMerchantId: true } });
      if (!before) throw new NotFoundException("会议不存在");
      if (id) await this.activeMerchant(tx, id);
      await tx.conference.update({ where: { id: conferenceId }, data: { paymentMerchantId: id } });
      await audit(tx, admin, conferenceId, "Change conference payment merchant for new orders", { previousMerchantId: before.paymentMerchantId, merchantId: id });
    });
    return this.getConference(conferenceId);
  }

  async snapshotForConference(client: Pick<Prisma.TransactionClient, "conference" | "paymentMerchant">, conferenceId: string) {
    const conference = await client.conference.findUnique({ where: { id: conferenceId }, select: { paymentMerchantId: true } });
    if (!conference) throw new NotFoundException("会议不存在");
    if (!conference.paymentMerchantId) {
      return { paymentMerchantRevisionId: null, paymentMerchantSnapshot: {
        source: "ENVIRONMENT", companyName: DEFAULT_PAYMENT_COMPANY,
        mchId: process.env.WECHAT_PAY_MCH_ID?.trim() || null,
        appId: process.env.WECHAT_PAY_APP_ID?.trim() || process.env.WECHAT_APP_ID?.trim() || null
      } satisfies Prisma.InputJsonObject };
    }
    const merchant = await this.activeMerchant(client, conference.paymentMerchantId);
    return { paymentMerchantRevisionId: merchant.activeRevision!.id, paymentMerchantSnapshot: {
      source: "MANAGED", merchantId: merchant.id, revisionId: merchant.activeRevision!.id,
      companyName: merchant.companyName, mchId: merchant.mchId, appId: merchant.activeRevision!.appId
    } satisfies Prisma.InputJsonObject };
  }

  async configForOrder(order: MerchantOrder, purpose: "PREPAY" | "HISTORY" = "HISTORY"): Promise<WechatPayConfig> {
    if (!order.paymentMerchantRevisionId) {
      const config = readWechatPayConfig();
      const snapshot = jsonObject(order.paymentMerchantSnapshot);
      if ((snapshot.mchId && snapshot.mchId !== config.mchId) || (snapshot.appId && snapshot.appId !== config.appId) || snapshot.source === "MANAGED") {
        throw new ConflictException("订单原收款商户与默认支付配置不一致，禁止更换商户处理历史订单");
      }
      return config;
    }
    const revision = await this.revision(order.paymentMerchantRevisionId);
    if (purpose === "PREPAY" && !revision.merchant.enabled) throw new ConflictException("该订单收款单位已停用，请联系会务组");
    const snapshot = jsonObject(order.paymentMerchantSnapshot);
    if (snapshot.mchId !== revision.merchant.mchId || snapshot.appId !== revision.appId || snapshot.revisionId !== revision.id) {
      throw new ConflictException("订单收款配置快照不一致");
    }
    // Pin the recipient identity, not an obsolete certificate. Rotation stays within
    // the same merchant/AppID while callbacks retain the order's original URL.
    const active = await this.operationalRevision(revision);
    return this.revisionConfig(active, revision.id);
  }

  async configForOutTradeNo(outTradeNo: string): Promise<WechatPayConfig> {
    const payment = await this.prisma.payment.findUnique({ where: { outTradeNo }, select: { order: { select: merchantOrderSelect } } });
    if (payment) return this.configForOrder(payment.order);
    // Mall payments remain on the legacy merchant, without expanding mall scope.
    const mallPayment = await this.prisma.mallPayment.findUnique({ where: { outTradeNo }, select: { id: true } });
    if (!mallPayment) throw new NotFoundException("支付记录不存在");
    return readWechatPayConfig();
  }

  async configForCallback(revisionId?: string): Promise<WechatPayConfig> {
    return (await this.configForCallbackCandidates(revisionId))[0]!;
  }

  async configForCallbackCandidates(revisionId?: string): Promise<WechatPayConfig[]> {
    if (!revisionId) return [readWechatPayConfig()];
    const original = await this.revision(revisionId);
    if (!original.checkedAt || !original.associationConfirmedAt) throw new ConflictException("回调收款配置未启用");
    const active = await this.operationalRevision(original);
    const history = await this.prisma.paymentMerchantRevision.findMany({
      where: { merchantId: original.merchantId, appId: original.appId, checkedAt: { not: null }, associationConfirmedAt: { not: null } },
      orderBy: { version: "desc" }, include: { merchant: true }
    });
    const configs: WechatPayConfig[] = [];
    const seen = new Set<string>();
    for (const revision of [active, original, ...history]) {
      if (seen.has(revision.id) || revision.merchantId !== original.merchantId || revision.appId !== original.appId || !revision.checkedAt || !revision.associationConfirmedAt) continue;
      seen.add(revision.id);
      try { configs.push(this.revisionConfig(revision, original.id)); } catch { /* Retired encryption keys must not block a usable active revision. */ }
    }
    if (!configs.length) throw new ConflictException("无可用的原商户回调凭据");
    return configs;
  }

  async verifyCallback(input: { merchantRevisionId?: string; headers: WechatPayHeaders; rawBody: Buffer; resource: WechatPayEncryptedResource }, verifier: WechatPayNotifyVerifier) {
    const candidates = await this.configForCallbackCandidates(input.merchantRevisionId);
    // The old/new verification and decryption keys can switch independently during
    // provider rotation. Both sets are limited to this original merchant and AppID.
    let verified = false;
    for (const config of candidates) {
      try { verifier.verifySignature({ headers: input.headers, rawBody: input.rawBody, verificationKey: config.verificationKey }); verified = true; break; } catch { /* Try trusted rotation overlap keys only. */ }
    }
    if (!verified) throw new UnauthorizedException("微信支付回调验签失败");
    for (const config of candidates) {
      try { return { config, decrypted: verifier.decryptResource(input.resource, config.apiV3Key) }; } catch { /* Try trusted API v3 rotation overlap keys only. */ }
    }
    throw new BadRequestException("微信支付回调解密失败，请核对原商户 API v3 密钥");
  }

  assertCallbackOrder(order: MerchantOrder, revisionId: string | undefined, payload: Record<string, unknown>, config: WechatPayConfig, refund = false) {
    if ((order.paymentMerchantRevisionId ?? null) !== (revisionId ?? null)) throw new ConflictException("回调收款商户与订单不一致");
    if (payload.mchid !== config.mchId || (!refund && payload.appid !== config.appId)) throw new ConflictException("微信支付回调商户或 AppID 不匹配");
  }

  private async activeMerchant(client: Pick<Prisma.TransactionClient, "paymentMerchant">, id: string) {
    const merchant = await client.paymentMerchant.findUnique({ where: { id }, include: { activeRevision: true } });
    if (!merchant?.enabled || !merchant.activeRevision?.checkedAt || !merchant.activeRevision.associationConfirmedAt || merchant.activeRevision.merchantId !== merchant.id) {
      throw new ConflictException("指定收款单位尚未启用或配置无效，不会改用默认单位收款");
    }
    assertAppId(merchant.activeRevision.appId);
    return merchant;
  }

  private async revision(id: string): Promise<MerchantRevision> {
    const item = await this.prisma.paymentMerchantRevision.findUnique({ where: { id }, include: { merchant: true } });
    if (!item) throw new NotFoundException("收款配置版本不存在");
    return item;
  }

  private async operationalRevision(original: MerchantRevision): Promise<MerchantRevision> {
    const activeId = original.merchant.activeRevisionId;
    const active = activeId && activeId !== original.id ? await this.revision(activeId) : original;
    if (active.merchantId !== original.merchantId || active.appId !== original.appId || !active.checkedAt || !active.associationConfirmedAt) {
      throw new ConflictException("原商户的运行凭据未启用或身份不一致");
    }
    return active;
  }

  private revisionConfig(revision: MerchantRevision, callbackRevisionId = revision.id): WechatPayConfig {
    const credentials = readCredential(revision.credentialEnc);
    if (credentials.merchantId !== revision.merchantId || credentials.mchId !== revision.merchant.mchId || credentials.appId !== revision.appId) {
      throw new ConflictException("支付凭据与收款单位不一致");
    }
    return {
      appId: revision.appId, mchId: revision.merchant.mchId, mchSerialNo: revision.mchSerialNo,
      apiV3Key: credentials.apiV3Key, privateKeyPem: credentials.privateKeyPem,
      verificationKey: { id: revision.platformKeyId, pem: credentials.platformPublicKeyPem },
      notifyUrl: merchantCallbackUrl(callbackRevisionId, false), refundNotifyUrl: merchantCallbackUrl(callbackRevisionId, true)
    };
  }

  protected async probeMerchant(config: WechatPayConfig) {
    const path = `/v3/pay/transactions/out-trade-no/VERIFY${randomUUID().replace(/-/g, "").slice(0, 24)}?mchid=${encodeURIComponent(config.mchId)}`;
    const authorization = new WechatPaySigner().createAuthorization({ method: "GET", urlPathWithQuery: path, body: "", config });
    try {
      const response = await fetch(`https://api.mch.weixin.qq.com${path}`, { headers: { authorization, accept: "application/json" }, signal: AbortSignal.timeout(8000) });
      const rawBody = Buffer.from(await response.arrayBuffer());
      new WechatPayNotifyVerifier().verifySignature({ rawBody, verificationKey: config.verificationKey, headers: {
        timestamp: response.headers.get("wechatpay-timestamp") ?? "", nonce: response.headers.get("wechatpay-nonce") ?? "",
        signature: response.headers.get("wechatpay-signature") ?? "", serial: response.headers.get("wechatpay-serial") ?? ""
      } });
      const payload = JSON.parse(rawBody.toString("utf8"));
      if (response.status !== 404 || payload.code !== "ORDER_NOT_EXIST") throw new Error("Provider credentials check failed");
    } catch {
      throw new BadRequestException("商户接口凭据验证未通过，请检查证书、微信支付公钥及商户权限；未创建交易");
    }
  }
}

export function merchantCallbackUrl(revisionId: string, refund: boolean) {
  const value = process.env.WECHAT_PAY_NOTIFY_URL?.trim();
  let url: URL;
  try { url = new URL(value ?? ""); } catch { throw new ConflictException("服务器未配置微信支付回调地址"); }
  if (url.protocol !== "https:" || url.search || url.hash || url.username || url.password || !url.pathname.endsWith("/wechat/notify")) {
    throw new ConflictException("服务器微信支付回调地址格式无效");
  }
  url.pathname = url.pathname.replace(/\/notify$/, `/merchants/${encodeURIComponent(revisionId)}/${refund ? "refund-notify" : "notify"}`);
  return url.toString();
}

function validateKeys(value: Pick<Credential, "apiV3Key" | "privateKeyPem" | "platformPublicKeyPem">) {
  if (Buffer.byteLength(value.apiV3Key, "utf8") !== 32) throw new BadRequestException("API v3 密钥必须为 32 字节");
  try {
    const key = createPrivateKey(value.privateKeyPem);
    const publicKey = createPublicKey(value.platformPublicKeyPem);
    if (key.asymmetricKeyType !== "rsa" || publicKey.asymmetricKeyType !== "rsa" || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048 || (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) throw new Error();
  } catch { throw new BadRequestException("商户私钥或微信支付公钥格式无效，需要 RSA 2048 位或以上 PEM"); }
}
function readCredential(value: string): Credential {
  try {
    const result = JSON.parse(decryptSecret(value));
    if (!["apiV3Key", "privateKeyPem", "platformPublicKeyPem", "merchantId", "mchId", "appId"].every(key => typeof result[key] === "string" && result[key])) throw new Error();
    return result;
  } catch { throw new ConflictException("无法读取收款凭据，请检查服务器配置加密密钥"); }
}
function assertAppId(appId: string) {
  const current = process.env.WECHAT_PAY_APP_ID?.trim() || process.env.WECHAT_APP_ID?.trim();
  if (!current || appId !== current) throw new BadRequestException("必须填写当前观潮会集小程序的 AppID，不能使用其他小程序");
}
function publicRevision(item: { id: string; merchantId: string; version: number; appId: string; mchSerialNo: string; platformKeyId: string; checkedAt: Date | null; associationConfirmedAt: Date | null; createdAt: Date }) {
  return { id: item.id, merchantId: item.merchantId, version: item.version, appId: item.appId, mchSerialNo: item.mchSerialNo, platformKeyId: item.platformKeyId,
    checkedAt: item.checkedAt, associationConfirmedAt: item.associationConfirmedAt, createdAt: item.createdAt, credentialsConfigured: true };
}
function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求内容无效"); return value as Record<string, unknown>; }
function jsonObject(value: Prisma.JsonValue | undefined): Prisma.JsonObject { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function required(value: unknown, label: string, max: number) { if (typeof value !== "string" || !value.trim() || value.trim().length > max) throw new BadRequestException(`${label}无效`); return value.trim(); }
function optional(value: unknown, max: number) { if (value == null || value === "") return null; return required(value, "备注", max); }
function secret(value: unknown, previous: string | undefined, label: string, max: number) { return required(typeof value === "string" && value.trim() ? value : previous, label, max); }
function ok<T>(data: T) { return { code: "OK", message: "ok", data }; }
async function audit(tx: Prisma.TransactionClient, admin: CurrentAdmin, entityId: string, summary: string, metadataJson: Prisma.InputJsonObject) {
  await tx.auditLog.create({ data: { adminUserId: admin.id, action: AuditAction.UPDATE, entityType: "PaymentMerchant", entityId, summary, metadataJson } });
}
