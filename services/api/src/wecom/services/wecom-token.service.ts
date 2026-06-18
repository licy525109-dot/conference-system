import { BadRequestException, Injectable } from "@nestjs/common";
import { WecomIntegration } from "@prisma/client";
import { PrismaService } from "../../prisma.service";
import { WecomClientAdapter } from "../adapters/wecom-client.adapter";
import { decryptSecret, encryptSecret } from "../wecom.crypto";

export type WecomAccessTokenMode = "self_built_app" | "legacy_customer_contact";

@Injectable()
export class WecomTokenService {
  constructor(private readonly prisma: PrismaService, private readonly client: WecomClientAdapter) {}

  getEffectiveMode(integration: WecomIntegration): WecomAccessTokenMode {
    if (integration.authMode === "SELF_BUILT_APP") return "self_built_app";
    if (integration.authMode === "LEGACY_CUSTOMER_CONTACT") return "legacy_customer_contact";
    return integration.appSecretEnc ? "self_built_app" : "legacy_customer_contact";
  }

  async getConfiguredAccessToken(integration: WecomIntegration, forceRefresh = false) {
    return this.getAccessToken(integration, this.getEffectiveMode(integration), forceRefresh);
  }

  async getAccessToken(integration: WecomIntegration, tokenType: WecomAccessTokenMode, forceRefresh = false) {
    if (!integration.corpId) throw new BadRequestException("请先配置企业 ID CorpID");
    const secret = tokenType === "legacy_customer_contact" ? decryptSecret(integration.customerContactSecretEnc) : decryptSecret(integration.appSecretEnc);
    if (!secret) throw new BadRequestException(tokenType === "legacy_customer_contact" ? "请先配置旧版客户联系 Secret" : "请先配置自建应用 Secret");

    const cached = await this.prisma.wecomAccessTokenCache.findUnique({ where: { integrationId_tokenType: { integrationId: integration.id, tokenType } } });
    if (cached && !forceRefresh && cached.expiresAt.getTime() > Date.now() + 60_000) {
      return { accessToken: decryptSecret(cached.accessTokenEnc), expiresAt: cached.expiresAt };
    }

    const token = await this.client.fetchAccessToken(integration.corpId, secret);
    const expiresAt = new Date(Date.now() + Math.max(60, token.expiresIn - 120) * 1000);
    await this.prisma.wecomAccessTokenCache.upsert({
      where: { integrationId_tokenType: { integrationId: integration.id, tokenType } },
      update: { accessTokenEnc: encryptSecret(token.accessToken)!, expiresAt },
      create: { integrationId: integration.id, tokenType, accessTokenEnc: encryptSecret(token.accessToken)!, expiresAt }
    });
    return { accessToken: token.accessToken, expiresAt };
  }
}
