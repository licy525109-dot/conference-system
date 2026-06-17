import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, WecomIntegration } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { CurrentAdmin } from "../../admin/current-admin";
import { AuditAction } from "@prisma/client";
import { decryptSecret, encryptSecret, maskSecret } from "../wecom.crypto";
import { WecomTokenService } from "./wecom-token.service";
import { WecomClientAdapter } from "../adapters/wecom-client.adapter";

@Injectable()
export class WecomConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokenService: WecomTokenService,
    private readonly client: WecomClientAdapter
  ) {}

  async getConfig() {
    const integration = await this.ensureDefaultIntegration();
    return ok(await this.formatConfig(integration));
  }

  async updateConfig(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const current = await this.ensureDefaultIntegration();
    const updated = await this.prisma.wecomIntegration.update({
      where: { id: current.id },
      data: {
        ...(has(body, "corpId") ? { corpId: readNullableString(body.corpId) } : {}),
        ...(has(body, "agentId") ? { agentId: readNullableString(body.agentId) } : {}),
        ...(has(body, "enabled") ? { enabled: readBoolean(body.enabled) } : {}),
        ...(has(body, "remark") ? { remark: readNullableString(body.remark) } : {}),
        ...(has(body, "customerContactCallbackUrl") ? { customerContactCallbackUrl: readNullableString(body.customerContactCallbackUrl) } : {}),
        ...(has(body, "appCallbackUrl") ? { appCallbackUrl: readNullableString(body.appCallbackUrl) } : {}),
        ...(readSensitive(body.customerContactSecret) ? { customerContactSecretEnc: encryptSecret(readSensitive(body.customerContactSecret)) } : {}),
        ...(readSensitive(body.appSecret) ? { appSecretEnc: encryptSecret(readSensitive(body.appSecret)) } : {}),
        ...(readSensitive(body.callbackToken) ? { callbackTokenEnc: encryptSecret(readSensitive(body.callbackToken)) } : {}),
        ...(readSensitive(body.callbackEncodingAesKey) ? { callbackEncodingAesKeyEnc: encryptSecret(readSensitive(body.callbackEncodingAesKey)) } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "WecomIntegration", updated.id, "Update WeCom integration config");
    return ok(await this.formatConfig(updated));
  }

  async testAccessToken(admin: CurrentAdmin) {
    const integration = await this.ensureDefaultIntegration();
    const results = {
      customerContact: await this.testTokenType(integration, "customer_contact"),
      app: await this.testTokenType(integration, "app")
    };
    await this.prisma.wecomIntegration.update({ where: { id: integration.id }, data: { lastTokenCheckedAt: new Date(), verified: results.customerContact.ok || results.app.ok } });
    await this.writeAudit(admin, AuditAction.SYSTEM, "WecomIntegration", integration.id, "Test WeCom access token", results);
    return ok(results);
  }

  async checkCustomerContactPermission(admin: CurrentAdmin) {
    const integration = await this.ensureDefaultIntegration();
    const token = await this.tokenService.getAccessToken(integration, "customer_contact", true);
    const result = await this.client.checkCustomerContactPermission(token.accessToken);
    await this.writeAudit(admin, AuditAction.SYSTEM, "WecomIntegration", integration.id, "Check WeCom customer contact permission", result);
    return ok(result);
  }

  async ensureDefaultIntegration(): Promise<WecomIntegration> {
    const integration = await this.prisma.wecomIntegration.findUnique({ where: { name: "default" } });
    if (integration) return integration;
    const callbackUrls = defaultCallbackUrls();
    return this.prisma.wecomIntegration.create({
      data: {
        name: "default",
        customerContactCallbackUrl: callbackUrls.customerContactCallbackUrl,
        appCallbackUrl: callbackUrls.appCallbackUrl
      }
    });
  }

  private async testTokenType(integration: WecomIntegration, tokenType: "customer_contact" | "app") {
    try {
      const token = await this.tokenService.getAccessToken(integration, tokenType, true);
      return { ok: true, tokenType, expiresAt: token.expiresAt.toISOString(), message: "AccessToken 获取成功" };
    } catch (error) {
      return { ok: false, tokenType, message: error instanceof Error ? error.message : "AccessToken 获取失败" };
    }
  }

  private async formatConfig(integration: WecomIntegration) {
    const callbackUrls = defaultCallbackUrls();
    const lastCallback = await this.prisma.wecomCallbackEvent.findFirst({ orderBy: { createdAt: "desc" } });
    const token = await this.prisma.wecomAccessTokenCache.findFirst({ where: { integrationId: integration.id }, orderBy: { expiresAt: "desc" } });
    const customerSecret = decryptSecret(integration.customerContactSecretEnc);
    const appSecret = decryptSecret(integration.appSecretEnc);
    const callbackToken = decryptSecret(integration.callbackTokenEnc);
    const aesKey = decryptSecret(integration.callbackEncodingAesKeyEnc);
    return {
      id: integration.id,
      corpId: integration.corpId ?? "",
      agentId: integration.agentId ?? "",
      enabled: integration.enabled,
      verified: integration.verified,
      remark: integration.remark ?? "",
      customerContactCallbackUrl: integration.customerContactCallbackUrl || callbackUrls.customerContactCallbackUrl,
      appCallbackUrl: integration.appCallbackUrl || callbackUrls.appCallbackUrl,
      secrets: {
        customerContactSecret: { configured: Boolean(customerSecret), masked: maskSecret(customerSecret) },
        appSecret: { configured: Boolean(appSecret), masked: maskSecret(appSecret) },
        callbackToken: { configured: Boolean(callbackToken), masked: maskSecret(callbackToken) },
        callbackEncodingAesKey: { configured: Boolean(aesKey), masked: maskSecret(aesKey) }
      },
      status: {
        enabled: integration.enabled,
        corpIdConfigured: Boolean(integration.corpId),
        customerContactSecretConfigured: Boolean(customerSecret),
        appSecretConfigured: Boolean(appSecret),
        callbackConfigured: Boolean(callbackToken && aesKey),
        callbackVerified: integration.verified,
        accessTokenStatus: token ? (token.expiresAt > new Date() ? "VALID" : "EXPIRED") : "MISSING",
        lastTokenCheckedAt: integration.lastTokenCheckedAt?.toISOString() ?? null,
        lastGroupSyncedAt: integration.lastGroupSyncedAt?.toISOString() ?? null,
        lastCallbackAt: (integration.lastCallbackAt ?? lastCallback?.createdAt)?.toISOString() ?? null
      },
      encryption: {
        enabled: true,
        keyConfigured: Boolean(process.env.WECOM_CONFIG_ENCRYPTION_KEY || process.env.JWT_SECRET)
      }
    };
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadata?: unknown) {
    await this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson: (metadata ?? {}) as Prisma.InputJsonValue }
    });
  }
}

export function defaultCallbackUrls() {
  const base = (process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || process.env.API_BASE_URL || "https://guanchaohuiji.com/api").replace(/\/$/, "");
  return {
    customerContactCallbackUrl: `${base}/wecom/customer-contact/callback`,
    appCallbackUrl: `${base}/wecom/app/callback`
  };
}

export function ok<T>(data: T) {
  return { code: "OK", data };
}

export function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("Invalid request body");
  return value as Record<string, unknown>;
}

export function readNullableString(value: unknown): string | null {
  if (value === null || typeof value === "undefined") return null;
  if (typeof value !== "string") throw new BadRequestException("Expected string value");
  return value.trim() || null;
}

export function readBoolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw new BadRequestException("Expected boolean value");
  return value;
}

function has(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function readSensitive(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^\*+$/.test(trimmed)) return null;
  return trimmed;
}
