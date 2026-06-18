import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { WecomAuthMode, type AuditAction, type WecomIntegration } from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { WecomClientAdapter } from "./adapters/wecom-client.adapter";
import { PrismaService } from "../prisma.service";
import { WecomConfigService } from "./services/wecom-config.service";
import { WecomCustomerGroupService } from "./services/wecom-customer-group.service";
import { WecomTokenService } from "./services/wecom-token.service";
import { decryptSecret, encryptSecret } from "./wecom.crypto";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["wecom:write"] };

describe("WeCom configuration compatibility", () => {
  it("saves self-built-app mode without customer contact secret", async () => {
    const integration = integrationRecord({ authMode: WecomAuthMode.SELF_BUILT_APP, appSecretEnc: encryptSecret("app-secret") });
    let updatedData: Record<string, unknown> = {};
    const prisma = createConfigPrismaMock(integration, (data) => {
      updatedData = data;
      return { ...integration, ...data } as WecomIntegration;
    });
    const service = new WecomConfigService(asPrisma(prisma), createTokenService(prisma), createWecomClientMock());

    const response = await service.updateConfig({ authMode: WecomAuthMode.SELF_BUILT_APP, corpId: "ww001", appSecret: "new-app-secret" }, admin);

    assert.equal(response.code, "OK");
    assert.equal(updatedData.authMode, WecomAuthMode.SELF_BUILT_APP);
    assert.equal("customerContactSecretEnc" in updatedData, false);
    assert.equal(decryptSecret(String(updatedData.appSecretEnc)), "new-app-secret");
  });

  it("requires customer contact secret in legacy mode", async () => {
    const integration = integrationRecord({ authMode: WecomAuthMode.SELF_BUILT_APP, customerContactSecretEnc: null });
    const prisma = createConfigPrismaMock(integration);
    const service = new WecomConfigService(asPrisma(prisma), createTokenService(prisma), createWecomClientMock());

    await assert.rejects(() => service.updateConfig({ authMode: WecomAuthMode.LEGACY_CUSTOMER_CONTACT }, admin), BadRequestException);
  });

  it("selects the configured secret and separates token cache by auth mode", async () => {
    const integration = integrationRecord({ authMode: WecomAuthMode.SELF_BUILT_APP, appSecretEnc: encryptSecret("app-secret"), customerContactSecretEnc: encryptSecret("legacy-secret") });
    const requestedSecrets: string[] = [];
    const upsertedTokenTypes: string[] = [];
    const prisma = {
      wecomAccessTokenCache: {
        findUnique: async () => null,
        upsert: async ({ where, create }: { where: { integrationId_tokenType: { tokenType: string } }; create: Record<string, unknown> }) => {
          upsertedTokenTypes.push(where.integrationId_tokenType.tokenType);
          return create;
        }
      }
    };
    const tokenService = new WecomTokenService(prisma as never, {
      fetchAccessToken: async (_corpId: string, secret: string) => {
        requestedSecrets.push(secret);
        return { accessToken: "token", expiresIn: 7200 };
      }
    } as WecomClientAdapter);

    await tokenService.getConfiguredAccessToken(integration, true);

    assert.deepEqual(requestedSecrets, ["app-secret"]);
    assert.deepEqual(upsertedTokenTypes, ["self_built_app"]);
  });

  it("syncs customer groups with self-built-app token when customer contact secret is absent", async () => {
    const integration = integrationRecord({ authMode: WecomAuthMode.SELF_BUILT_APP, appSecretEnc: encryptSecret("app-secret"), customerContactSecretEnc: null, enabled: true });
    const tokenSecrets: string[] = [];
    const prisma = createCustomerGroupPrismaMock();
    const tokenService = new WecomTokenService(prisma as never, {
      fetchAccessToken: async (_corpId: string, secret: string) => {
        tokenSecrets.push(secret);
        return { accessToken: "self-built-token", expiresIn: 7200 };
      }
    } as WecomClientAdapter);
    const config = { ensureDefaultIntegration: async () => integration } as WecomConfigService;
    const client = {
      listCustomerGroups: async (accessToken: string) => [{ chat_id: `group-${accessToken}`, name: "客户群", owner: { userid: "owner-1", name: "群主" }, status: 0 }]
    } as unknown as WecomClientAdapter;
    const service = new WecomCustomerGroupService(prisma as never, config, tokenService, client);

    const response = await service.sync(admin);
    const data = response.data as { synced: number; effectiveAuthMode: string };

    assert.equal(response.code, "OK");
    assert.equal(data.synced, 1);
    assert.equal(data.effectiveAuthMode, "self_built_app");
    assert.deepEqual(tokenSecrets, ["app-secret"]);
  });
});

function integrationRecord(overrides: Partial<WecomIntegration> = {}): WecomIntegration {
  const now = new Date();
  return {
    id: "wecom-1",
    name: "default",
    authMode: null,
    corpId: "ww001",
    agentId: null,
    customerContactSecretEnc: null,
    appSecretEnc: null,
    callbackTokenEnc: null,
    callbackEncodingAesKeyEnc: null,
    customerContactCallbackUrl: null,
    appCallbackUrl: null,
    enabled: true,
    verified: false,
    lastTokenCheckedAt: null,
    lastGroupSyncedAt: null,
    lastCallbackAt: null,
    remark: null,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

function createConfigPrismaMock(integration: WecomIntegration, update?: (data: Record<string, unknown>) => WecomIntegration) {
  return {
    wecomIntegration: {
      findUnique: async () => integration,
      update: async ({ data }: { data: Record<string, unknown> }) => update?.(data) ?? ({ ...integration, ...data } as WecomIntegration),
      create: async ({ data }: { data: Record<string, unknown> }) => ({ ...integrationRecord(), ...data })
    },
    wecomCallbackEvent: { findFirst: async () => null },
    wecomAccessTokenCache: { findUnique: async () => null, findFirst: async () => null },
    auditLog: { create: async ({ data }: { data: { action: AuditAction } }) => data }
  };
}

function createCustomerGroupPrismaMock() {
  return {
    wecomAccessTokenCache: {
      findUnique: async () => null,
      upsert: async ({ create }: { create: Record<string, unknown> }) => create
    },
    wecomCustomerGroup: {
      upsert: async ({ create }: { create: Record<string, unknown> }) => create
    },
    wecomIntegration: {
      update: async ({ data }: { data: Record<string, unknown> }) => data
    },
    auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => data }
  };
}

function createTokenService(prisma: ReturnType<typeof createConfigPrismaMock>) {
  return new WecomTokenService(asPrisma(prisma), createWecomClientMock());
}

function createWecomClientMock() {
  return {
    fetchAccessToken: async () => ({ accessToken: "token", expiresIn: 7200 }),
    checkCustomerContactPermission: async () => ({ ok: true, message: "ok" }),
    listCustomerGroups: async () => []
  } as WecomClientAdapter;
}

function asPrisma(value: unknown): PrismaService {
  return value as PrismaService;
}
