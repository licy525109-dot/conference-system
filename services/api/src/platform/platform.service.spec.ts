import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { PlatformService } from "./platform.service";

const admin = { id: "admin-1", username: "admin", displayName: "系统管理员" };

describe("Platform control plane", () => {
  it("returns API key plaintext once while persisting only a hash", async () => {
    let persisted: Record<string, unknown> | undefined;
    const prisma = {
      saasTenant: { findUnique: async () => ({ id: "tenant-1" }) },
      platformApiKey: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          persisted = data;
          return {
            id: "key-1",
            tenantId: data.tenantId,
            name: data.name,
            keyPrefix: data.keyPrefix,
            scopesJson: data.scopesJson,
            status: "ACTIVE",
            expiresAt: null,
            lastUsedAt: null,
            createdBy: data.createdBy,
            createdAt: new Date(),
            updatedAt: new Date()
          };
        }
      },
      auditLog: { create: async () => ({ id: "audit-1" }) }
    } as unknown as PrismaService;
    const service = new PlatformService(prisma);

    const response = await service.createApiKey({ tenantId: "tenant-1", name: "数据接口", scopes: ["conference:read"] }, admin);

    assert.equal(response.code, "OK");
    assert.match(response.data.secret, /^gcs_live_/);
    assert.equal(typeof persisted?.secretHash, "string");
    assert.notEqual(persisted?.secretHash, response.data.secret);
    assert.equal(String(persisted?.secretHash).length, 64);
    assert.equal("secret" in (persisted ?? {}), false);
  });

  it("distinguishes configured providers from production-ready providers", async () => {
    const prisma = {
      saasPlan: { upsert: async () => ({}) },
      saasTenant: { count: async () => 1 },
      saasWorkspace: { count: async () => 1 },
      saasSubscription: { count: async () => 1 },
      platformApiKey: { count: async () => 0 },
      platformUsageEvent: { groupBy: async () => [] },
      notificationChannelConfig: {
        findMany: async () => [
          { channel: "WECHAT_SUBSCRIBE", enabled: true, templateKey: "template", provider: "WECHAT", apiKeyEnc: null },
          { channel: "SMS", enabled: false, templateKey: null, provider: null, apiKeyEnc: null }
        ]
      },
      wecomIntegration: { findFirst: async () => ({ enabled: true, verified: false, corpId: "corp", agentId: "agent", customerContactSecretEnc: "encrypted", appSecretEnc: null }) },
      aiConfig: { findFirst: async () => ({ enabled: true, provider: "OPENAI_COMPATIBLE", apiKeyEnc: "encrypted" }) }
    } as unknown as PrismaService;
    const service = new PlatformService(prisma);
    const previous = { appId: process.env.WECHAT_APP_ID, appSecret: process.env.WECHAT_APP_SECRET, template: process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID };
    process.env.WECHAT_APP_ID = "app";
    process.env.WECHAT_APP_SECRET = "secret";
    process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID = "template";
    try {
      const response = await service.getOverview();
      const providers = response.data.providers as Array<{ id: string; status: string; productionReady: boolean }>;
      assert.equal(providers.find((item) => item.id === "wechat-subscribe")?.status, "CONFIGURED");
      assert.equal(providers.find((item) => item.id === "wechat-subscribe")?.productionReady, false);
      assert.equal(providers.find((item) => item.id === "wecom")?.status, "CONFIGURED");
      assert.equal(providers.find((item) => item.id === "tenant-isolation")?.status, "FOUNDATION_ONLY");
    } finally {
      restoreEnv("WECHAT_APP_ID", previous.appId);
      restoreEnv("WECHAT_APP_SECRET", previous.appSecret);
      restoreEnv("WECHAT_SUBSCRIBE_TEMPLATE_ID", previous.template);
    }
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (typeof value === "undefined") delete process.env[key];
  else process.env[key] = value;
}
