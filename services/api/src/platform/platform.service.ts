import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  NotificationChannelType,
  PlatformCredentialStatus,
  PlatformPluginInstallStatus,
  Prisma,
  SaasSubscriptionStatus,
  SaasTenantStatus
} from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview() {
    await this.ensureDefaultPlans();
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [tenantCount, workspaceCount, activeSubscriptionCount, activeApiKeyCount, usage, providers] = await Promise.all([
      this.prisma.saasTenant.count({ where: { status: SaasTenantStatus.ACTIVE } }),
      this.prisma.saasWorkspace.count({ where: { status: "ACTIVE" } }),
      this.prisma.saasSubscription.count({ where: { status: { in: [SaasSubscriptionStatus.ACTIVE, SaasSubscriptionStatus.TRIAL] } } }),
      this.prisma.platformApiKey.count({ where: { status: PlatformCredentialStatus.ACTIVE } }),
      this.prisma.platformUsageEvent.groupBy({
        by: ["metric", "unit"],
        where: { occurredAt: { gte: since } },
        _sum: { quantity: true },
        orderBy: { metric: "asc" }
      }),
      this.providerReadiness()
    ]);

    return ok({
      metrics: {
        tenants: tenantCount,
        workspaces: workspaceCount,
        activeSubscriptions: activeSubscriptionCount,
        activeApiKeys: activeApiKeyCount
      },
      usage30d: usage.map((item) => ({ metric: item.metric, unit: item.unit, quantity: item._sum.quantity ?? 0 })),
      providers,
      isolation: {
        controlPlane: "READY",
        dataPlane: "FOUNDATION_ONLY",
        summary: "租户控制面已建立；会议、订单、支付等现有业务表仍保持单租户数据面，尚未启用强制 tenant_id 隔离。"
      }
    });
  }

  async listTenants() {
    const items = await this.prisma.saasTenant.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        organizations: { orderBy: { createdAt: "asc" } },
        workspaces: { orderBy: { createdAt: "asc" } },
        subscriptions: { orderBy: { createdAt: "desc" }, take: 1, include: { plan: true } },
        apiKeys: { orderBy: { createdAt: "desc" }, select: apiKeySelect },
        webhooks: { orderBy: { createdAt: "desc" }, select: webhookSelect },
        featureFlags: { orderBy: [{ scopeKey: "asc" }, { key: "asc" }] },
        pluginInstalls: { orderBy: { installedAt: "desc" }, include: { plugin: true, workspace: { select: { id: true, name: true } } } },
        _count: { select: { members: true, usageEvents: true } }
      }
    });
    return ok({ items });
  }

  async createTenant(input: unknown, admin: CurrentAdmin) {
    await this.ensureDefaultPlans();
    const body = readObject(input);
    const slug = readCode(body, "slug");
    const name = readRequiredString(body, "name");
    const organizationName = readOptionalString(body, "organizationName") || `${name}组织`;
    const workspaceName = readOptionalString(body, "workspaceName") || `${name}工作区`;
    const planCode = readOptionalString(body, "planCode") || "STARTER";
    const plan = await this.prisma.saasPlan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.enabled) throw new BadRequestException("所选套餐不存在或已停用");

    const tenant = await catchUnique(async () => this.prisma.$transaction(async (tx) => {
      const created = await tx.saasTenant.create({
        data: {
          slug,
          name,
          contactName: readOptionalString(body, "contactName"),
          contactEmail: readOptionalString(body, "contactEmail"),
          contactPhone: readOptionalString(body, "contactPhone"),
          settingsJson: readJsonObject(body.settings)
        }
      });
      const organization = await tx.saasOrganization.create({
        data: { tenantId: created.id, code: "default", name: organizationName }
      });
      await tx.saasWorkspace.create({
        data: { tenantId: created.id, organizationId: organization.id, slug: "default", name: workspaceName }
      });
      await tx.saasTenantMember.create({
        data: { tenantId: created.id, adminUserId: admin.id, role: "OWNER" }
      });
      await tx.saasSubscription.create({
        data: {
          tenantId: created.id,
          planId: plan.id,
          status: SaasSubscriptionStatus.TRIAL,
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        }
      });
      return created;
    }), "租户标识已存在");

    await this.writeAudit(admin, AuditAction.CREATE, "SaasTenant", tenant.id, "Create SaaS tenant", { slug, planCode });
    return ok(tenant);
  }

  async updateTenant(id: string, input: unknown, admin: CurrentAdmin) {
    await this.requireTenant(id);
    const body = readObject(input);
    const tenant = await this.prisma.saasTenant.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.status !== "undefined" ? { status: readEnum(body.status, SaasTenantStatus, "status") } : {}),
        ...(typeof body.contactName !== "undefined" ? { contactName: readNullableString(body.contactName) } : {}),
        ...(typeof body.contactEmail !== "undefined" ? { contactEmail: readNullableString(body.contactEmail) } : {}),
        ...(typeof body.contactPhone !== "undefined" ? { contactPhone: readNullableString(body.contactPhone) } : {}),
        ...(typeof body.settings !== "undefined" ? { settingsJson: readJsonObject(body.settings) ?? Prisma.JsonNull } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "SaasTenant", tenant.id, "Update SaaS tenant", { status: tenant.status });
    return ok(tenant);
  }

  async listPlans() {
    await this.ensureDefaultPlans();
    const items = await this.prisma.saasPlan.findMany({ orderBy: [{ monthlyPriceCent: "asc" }, { createdAt: "asc" }] });
    return ok({ items });
  }

  async upsertPlan(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const code = readCode(body, "code").toUpperCase();
    const plan = await this.prisma.saasPlan.upsert({
      where: { code },
      update: {
        name: readRequiredString(body, "name"),
        description: readOptionalString(body, "description"),
        monthlyPriceCent: readNonNegativeInt(body, "monthlyPriceCent"),
        annualPriceCent: readNonNegativeInt(body, "annualPriceCent"),
        limitsJson: readJsonObject(body.limits),
        featuresJson: readJsonObject(body.features),
        enabled: readOptionalBoolean(body, "enabled") ?? true
      },
      create: {
        code,
        name: readRequiredString(body, "name"),
        description: readOptionalString(body, "description"),
        monthlyPriceCent: readNonNegativeInt(body, "monthlyPriceCent"),
        annualPriceCent: readNonNegativeInt(body, "annualPriceCent"),
        limitsJson: readJsonObject(body.limits),
        featuresJson: readJsonObject(body.features),
        enabled: readOptionalBoolean(body, "enabled") ?? true
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "SaasPlan", plan.id, "Upsert SaaS plan", { code });
    return ok(plan);
  }

  async createSubscription(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    const planId = readRequiredString(body, "planId");
    await this.requireTenant(tenantId);
    if (!(await this.prisma.saasPlan.findUnique({ where: { id: planId } }))) throw new NotFoundException("套餐不存在");
    const subscription = await this.prisma.saasSubscription.create({
      data: {
        tenantId,
        planId,
        status: readOptionalEnum(body.status, SaasSubscriptionStatus, "status") ?? SaasSubscriptionStatus.ACTIVE,
        billingCycle: readOptionalString(body, "billingCycle") || "MONTHLY",
        startsAt: readOptionalDate(body, "startsAt") ?? new Date(),
        renewsAt: readOptionalDate(body, "renewsAt"),
        endsAt: readOptionalDate(body, "endsAt"),
        metadataJson: readJsonObject(body.metadata)
      },
      include: { plan: true }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "SaasSubscription", subscription.id, "Create SaaS subscription", { tenantId, planId });
    return ok(subscription);
  }

  async createApiKey(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    await this.requireTenant(tenantId);
    const secret = `gcs_live_${randomBytes(24).toString("base64url")}`;
    const keyPrefix = secret.slice(0, 18);
    const item = await this.prisma.platformApiKey.create({
      data: {
        tenantId,
        name: readRequiredString(body, "name"),
        keyPrefix,
        secretHash: sha256(secret),
        scopesJson: readStringArray(body.scopes) as Prisma.InputJsonArray,
        expiresAt: readOptionalDate(body, "expiresAt"),
        createdBy: admin.id
      },
      select: apiKeySelect
    });
    await this.writeAudit(admin, AuditAction.CREATE, "PlatformApiKey", item.id, "Create platform API key", { tenantId, keyPrefix });
    return ok({ item, secret, warning: "密钥仅本次返回，服务端只保存 SHA-256 哈希。" });
  }

  async revokeApiKey(id: string, admin: CurrentAdmin) {
    const item = await this.prisma.platformApiKey.update({
      where: { id },
      data: { status: PlatformCredentialStatus.REVOKED },
      select: apiKeySelect
    }).catch(() => { throw new NotFoundException("API Key 不存在"); });
    await this.writeAudit(admin, AuditAction.UPDATE, "PlatformApiKey", id, "Revoke platform API key", { tenantId: item.tenantId });
    return ok(item);
  }

  async createWebhook(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    await this.requireTenant(tenantId);
    const url = readWebhookUrl(body, "url");
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const item = await this.prisma.platformWebhook.create({
      data: {
        tenantId,
        name: readRequiredString(body, "name"),
        url,
        signingSecretHash: sha256(secret),
        eventsJson: readStringArray(body.events) as Prisma.InputJsonArray
      },
      select: webhookSelect
    });
    await this.writeAudit(admin, AuditAction.CREATE, "PlatformWebhook", item.id, "Create platform webhook", { tenantId, url });
    return ok({ item, secret, warning: "签名密钥仅本次返回；Webhook 投递器尚未启用，当前仅建立控制面配置。" });
  }

  async updateWebhook(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.platformWebhook.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.url !== "undefined" ? { url: readWebhookUrl(body, "url") } : {}),
        ...(typeof body.events !== "undefined" ? { eventsJson: readStringArray(body.events) as Prisma.InputJsonArray } : {}),
        ...(typeof body.status !== "undefined" ? { status: readEnum(body.status, PlatformCredentialStatus, "status") } : {})
      },
      select: webhookSelect
    }).catch(() => { throw new NotFoundException("Webhook 不存在"); });
    await this.writeAudit(admin, AuditAction.UPDATE, "PlatformWebhook", id, "Update platform webhook", { tenantId: item.tenantId });
    return ok(item);
  }

  async recordUsage(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    await this.requireTenant(tenantId);
    const item = await catchUnique(() => this.prisma.platformUsageEvent.create({
      data: {
        tenantId,
        workspaceId: readOptionalString(body, "workspaceId"),
        metric: readCode(body, "metric"),
        quantity: readPositiveInt(body, "quantity", 1),
        unit: readOptionalString(body, "unit") || "COUNT",
        idempotencyKey: readOptionalString(body, "idempotencyKey"),
        metadataJson: readJsonObject(body.metadata),
        occurredAt: readOptionalDate(body, "occurredAt") ?? new Date()
      }
    }), "用量事件幂等键已存在");
    await this.writeAudit(admin, AuditAction.CREATE, "PlatformUsageEvent", item.id, "Record platform usage", { tenantId, metric: item.metric });
    return ok(item);
  }

  async upsertFeatureFlag(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    await this.requireTenant(tenantId);
    const workspaceId = readOptionalString(body, "workspaceId");
    const key = readCode(body, "key");
    const scopeKey = workspaceId ? `workspace:${workspaceId}` : "tenant";
    const item = await this.prisma.platformFeatureFlag.upsert({
      where: { tenantId_key_scopeKey: { tenantId, key, scopeKey } },
      update: {
        workspaceId,
        enabled: readOptionalBoolean(body, "enabled") ?? false,
        configJson: readJsonObject(body.config)
      },
      create: {
        tenantId,
        workspaceId,
        key,
        scopeKey,
        enabled: readOptionalBoolean(body, "enabled") ?? false,
        configJson: readJsonObject(body.config)
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PlatformFeatureFlag", item.id, "Upsert platform feature flag", { tenantId, key, scopeKey });
    return ok(item);
  }

  async upsertPlugin(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const code = readCode(body, "code");
    const item = await this.prisma.platformPlugin.upsert({
      where: { code },
      update: {
        name: readRequiredString(body, "name"),
        version: readRequiredString(body, "version"),
        description: readOptionalString(body, "description"),
        manifestJson: readJsonObject(body.manifest) ?? {},
        enabled: readOptionalBoolean(body, "enabled") ?? true
      },
      create: {
        code,
        name: readRequiredString(body, "name"),
        version: readRequiredString(body, "version"),
        description: readOptionalString(body, "description"),
        manifestJson: readJsonObject(body.manifest) ?? {},
        enabled: readOptionalBoolean(body, "enabled") ?? true
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PlatformPlugin", item.id, "Upsert platform plugin", { code });
    return ok(item);
  }

  async listPlugins() {
    const items = await this.prisma.platformPlugin.findMany({
      orderBy: [{ enabled: "desc" }, { name: "asc" }],
      include: { _count: { select: { installs: true } } }
    });
    return ok({ items });
  }

  async installPlugin(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const tenantId = readRequiredString(body, "tenantId");
    const pluginId = readRequiredString(body, "pluginId");
    const workspaceId = readOptionalString(body, "workspaceId");
    await this.requireTenant(tenantId);
    const scopeKey = workspaceId ? `workspace:${workspaceId}` : "tenant";
    const item = await this.prisma.platformPluginInstall.upsert({
      where: { tenantId_pluginId_scopeKey: { tenantId, pluginId, scopeKey } },
      update: {
        workspaceId,
        status: readOptionalEnum(body.status, PlatformPluginInstallStatus, "status") ?? PlatformPluginInstallStatus.ACTIVE,
        configJson: readJsonObject(body.config),
        installedBy: admin.id
      },
      create: {
        tenantId,
        workspaceId,
        pluginId,
        scopeKey,
        status: readOptionalEnum(body.status, PlatformPluginInstallStatus, "status") ?? PlatformPluginInstallStatus.ACTIVE,
        configJson: readJsonObject(body.config),
        installedBy: admin.id
      },
      include: { plugin: true, workspace: { select: { id: true, name: true } } }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PlatformPluginInstall", item.id, "Install platform plugin", { tenantId, pluginId, scopeKey });
    return ok(item);
  }

  private async providerReadiness() {
    const [channels, wecom, ai] = await Promise.all([
      this.prisma.notificationChannelConfig.findMany({
        where: { channel: { in: [NotificationChannelType.WECHAT_SUBSCRIBE, NotificationChannelType.SMS] } }
      }),
      this.prisma.wecomIntegration.findFirst({ orderBy: { updatedAt: "desc" } }),
      this.prisma.aiConfig.findFirst({ orderBy: { updatedAt: "desc" } })
    ]);
    const channel = (type: NotificationChannelType) => channels.find((item) => item.channel === type);
    const wechat = channel(NotificationChannelType.WECHAT_SUBSCRIBE);
    const sms = channel(NotificationChannelType.SMS);
    const wechatConfigured = Boolean(wechat?.enabled && (wechat.templateKey || process.env.WECHAT_SUBSCRIBE_TEMPLATE_ID) && process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET);
    const smsConfigured = Boolean(sms?.enabled && (sms.provider || process.env.SMS_PROVIDER) && (sms.apiKeyEnc || process.env.SMS_ENABLED === "true"));
    const wecomConfigured = Boolean(wecom?.enabled && wecom.corpId && wecom.agentId && (wecom.customerContactSecretEnc || wecom.appSecretEnc));
    const aiConfigured = Boolean((ai?.enabled && ai.provider !== "LOCAL_FALLBACK" && ai.apiKeyEnc) || (process.env.AI_PROVIDER && process.env.AI_PROVIDER !== "LOCAL_FALLBACK" && process.env.AI_API_KEY));
    const refundConfigured = requiredEnv(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_REFUND_NOTIFY_URL"]);
    const billConfigured = requiredEnv(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_BILL_STORAGE_PATH"]);

    return [
      readiness("wechat-subscribe", "微信订阅消息", wechatConfigured ? "CONFIGURED" : wechat?.enabled ? "PARTIAL" : "NOT_CONFIGURED", wechatConfigured, false, missingEnv(["WECHAT_APP_ID", "WECHAT_APP_SECRET", "WECHAT_SUBSCRIBE_TEMPLATE_ID"]), "需完成真机订阅授权和真实模板发送回执后才能标记生产就绪。"),
      readiness("sms", "短信", smsConfigured ? "CONFIGURED" : sms?.enabled ? "PARTIAL" : "NOT_CONFIGURED", smsConfigured, false, smsConfigured ? [] : ["供应商账号、签名、模板或发送适配器"], "通道配置不代表供应商侧已审核通过，需灰度发送验证。"),
      readiness("wecom", "企业微信客户群", wecom?.verified ? "READY" : wecomConfigured ? "CONFIGURED" : "NOT_CONFIGURED", wecomConfigured, Boolean(wecom?.verified), wecomConfigured ? [] : ["CorpID、AgentID、客户联系 Secret、回调验证"], "READY 仅表示接入验证通过，群主确认和失败码仍需持续监控。"),
      readiness("ai", "AI Provider", aiConfigured ? "CONFIGURED" : "NOT_CONFIGURED", aiConfigured, false, aiConfigured ? [] : ["真实 provider、API Key、模型与 baseURL"], "LOCAL_FALLBACK 不计为真实 LLM；需独立评估答案质量和引用命中。"),
      readiness("wechat-refund", "微信真实退款", refundConfigured ? "CONFIGURED" : "NOT_CONFIGURED", refundConfigured, false, missingEnv(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_REFUND_NOTIFY_URL"]), "必须完成真实出款与退款回调专项验收，本控制面不触碰退款状态机。"),
      readiness("wechat-bill", "微信账单自动下载", billConfigured ? "CONFIGURED" : "NOT_CONFIGURED", billConfigured, false, missingEnv(["WECHAT_PAY_MCH_ID", "WECHAT_PAY_API_V3_KEY", "WECHAT_PAY_PRIVATE_KEY_PATH", "WECHAT_PAY_BILL_STORAGE_PATH"]), "手动导入可继续使用；自动下载需商户权限和定时任务实测。"),
      readiness("tenant-isolation", "租户数据面隔离", "FOUNDATION_ONLY", true, false, ["核心业务表 tenant_id", "请求租户上下文", "行级授权与迁移策略"], "本轮只建立控制面，未修改支付、订单、报名等核心表。")
    ];
  }

  private async ensureDefaultPlans() {
    const defaults = [
      { code: "STARTER", name: "基础版", monthlyPriceCent: 0, annualPriceCent: 0, limitsJson: { workspaces: 1, admins: 3 }, featuresJson: { cms: true, conference: true } },
      { code: "BUSINESS", name: "商业版", monthlyPriceCent: 29900, annualPriceCent: 299000, limitsJson: { workspaces: 3, admins: 20 }, featuresJson: { cms: true, conference: true, mall: true, member: true, api: true } },
      { code: "ENTERPRISE", name: "企业版", monthlyPriceCent: 99900, annualPriceCent: 999000, limitsJson: { workspaces: 20, admins: 200 }, featuresJson: { cms: true, conference: true, mall: true, member: true, api: true, plugins: true, dedicatedSupport: true } }
    ];
    for (const item of defaults) {
      await this.prisma.saasPlan.upsert({ where: { code: item.code }, update: {}, create: item });
    }
  }

  private async requireTenant(id: string) {
    const tenant = await this.prisma.saasTenant.findUnique({ where: { id }, select: { id: true } });
    if (!tenant) throw new NotFoundException("租户不存在");
    return tenant;
  }

  private writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string, summary: string, metadata: Record<string, unknown>) {
    return this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson: metadata as Prisma.InputJsonObject }
    });
  }
}

const apiKeySelect = {
  id: true,
  tenantId: true,
  name: true,
  keyPrefix: true,
  scopesJson: true,
  status: true,
  expiresAt: true,
  lastUsedAt: true,
  createdBy: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PlatformApiKeySelect;

const webhookSelect = {
  id: true,
  tenantId: true,
  name: true,
  url: true,
  eventsJson: true,
  status: true,
  lastDeliveredAt: true,
  lastStatusCode: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PlatformWebhookSelect;

function readiness(id: string, name: string, status: string, configured: boolean, verified: boolean, missing: string[], summary: string) {
  return { id, name, status, configured, verified, productionReady: status === "READY", missing, summary };
}

function requiredEnv(names: string[]): boolean {
  return names.every((name) => Boolean(process.env[name]?.trim()));
}

function missingEnv(names: string[]): string[] {
  return names.filter((name) => !process.env[name]?.trim());
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok", data };
}

function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("请求体必须是 JSON 对象");
  return value as Record<string, unknown>;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${key} 不能为空`);
  return value.trim();
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${key} 必须是字符串`);
  return value.trim() || undefined;
}

function readNullableString(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") throw new BadRequestException("字段必须是字符串或 null");
  return value.trim() || null;
}

function readCode(body: Record<string, unknown>, key: string): string {
  const value = readRequiredString(body, key);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,63}$/.test(value)) throw new BadRequestException(`${key} 只能包含字母、数字、下划线和短横线`);
  return value;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "boolean") throw new BadRequestException(`${key} 必须是布尔值`);
  return value;
}

function readNonNegativeInt(body: Record<string, unknown>, key: string): number {
  const value = body[key];
  if (!Number.isInteger(value) || Number(value) < 0) throw new BadRequestException(`${key} 必须是非负整数`);
  return Number(value);
}

function readPositiveInt(body: Record<string, unknown>, key: string, fallback: number): number {
  if (typeof body[key] === "undefined") return fallback;
  const value = body[key];
  if (!Number.isInteger(value) || Number(value) <= 0) throw new BadRequestException(`${key} 必须是正整数`);
  return Number(value);
}

function readOptionalDate(body: Record<string, unknown>, key: string): Date | undefined {
  const value = body[key];
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new BadRequestException(`${key} 必须是日期字符串`);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`${key} 日期格式不正确`);
  return date;
}

function readJsonObject(value: unknown): Prisma.InputJsonObject | undefined {
  if (typeof value === "undefined" || value === null) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new BadRequestException("JSON 配置必须是对象");
  return value as Prisma.InputJsonObject;
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "undefined" || value === null) return [];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new BadRequestException("字段必须是字符串数组");
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
}

function readEnum<T extends Record<string, string>>(value: unknown, source: T, key: string): T[keyof T] {
  if (typeof value !== "string" || !Object.values(source).includes(value)) throw new BadRequestException(`${key} 不支持`);
  return value as T[keyof T];
}

function readOptionalEnum<T extends Record<string, string>>(value: unknown, source: T, key: string): T[keyof T] | undefined {
  if (typeof value === "undefined" || value === null || value === "") return undefined;
  return readEnum(value, source, key);
}

function readWebhookUrl(body: Record<string, unknown>, key: string): string {
  const value = readRequiredString(body, key);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new BadRequestException("Webhook URL 格式不正确");
  }
  const local = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && local)) throw new BadRequestException("生产 Webhook 必须使用 HTTPS");
  return parsed.toString();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function catchUnique<T>(factory: () => Promise<T>, message: string): Promise<T> {
  try {
    return await factory();
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new ConflictException(message);
    throw error;
  }
}
