import { apiRequest } from "./api";

export type PlatformReadinessStatus = "READY" | "CONFIGURED" | "PARTIAL" | "NOT_CONFIGURED" | "FOUNDATION_ONLY";

export interface PlatformProviderReadiness {
  id: string;
  name: string;
  status: PlatformReadinessStatus;
  configured: boolean;
  verified: boolean;
  productionReady: boolean;
  missing: string[];
  summary: string;
}

export interface PlatformOverview {
  metrics: { tenants: number; workspaces: number; activeSubscriptions: number; activeApiKeys: number };
  usage30d: Array<{ metric: string; unit: string; quantity: number }>;
  providers: PlatformProviderReadiness[];
  isolation: { controlPlane: string; dataPlane: string; summary: string };
}

export interface SaasPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  monthlyPriceCent: number;
  annualPriceCent: number;
  limitsJson: Record<string, unknown> | null;
  featuresJson: Record<string, unknown> | null;
  enabled: boolean;
}

export interface PlatformApiKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopesJson: string[] | null;
  status: "ACTIVE" | "REVOKED";
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface PlatformWebhook {
  id: string;
  tenantId: string;
  name: string;
  url: string;
  eventsJson: string[] | null;
  status: "ACTIVE" | "REVOKED";
  lastDeliveredAt: string | null;
  lastStatusCode: number | null;
}

export interface PlatformFeatureFlag {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  key: string;
  scopeKey: string;
  enabled: boolean;
  configJson: Record<string, unknown> | null;
}

export interface PlatformPluginInstall {
  id: string;
  tenantId: string;
  workspaceId: string | null;
  scopeKey: string;
  status: "ACTIVE" | "DISABLED" | "FAILED";
  plugin: { id: string; code: string; name: string; version: string };
  workspace: { id: string; name: string } | null;
}

export interface PlatformPlugin {
  id: string;
  code: string;
  name: string;
  version: string;
  description: string | null;
  manifestJson: Record<string, unknown>;
  enabled: boolean;
  _count: { installs: number };
}

export interface SaasTenant {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "ARCHIVED";
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  organizations: Array<{ id: string; code: string; name: string }>;
  workspaces: Array<{ id: string; slug: string; name: string; status: "ACTIVE" | "DISABLED" }>;
  subscriptions: Array<{ id: string; status: string; billingCycle: string; renewsAt: string | null; plan: SaasPlan }>;
  apiKeys: PlatformApiKey[];
  webhooks: PlatformWebhook[];
  featureFlags: PlatformFeatureFlag[];
  pluginInstalls: PlatformPluginInstall[];
  _count: { members: number; usageEvents: number };
}

export function getPlatformOverview() {
  return apiRequest<PlatformOverview>("/admin/platform/overview");
}

export function listPlatformTenants() {
  return apiRequest<{ items: SaasTenant[] }>("/admin/platform/tenants");
}

export function createPlatformTenant(input: Record<string, unknown>) {
  return apiRequest<SaasTenant>("/admin/platform/tenants", { method: "POST", body: JSON.stringify(input) });
}

export function updatePlatformTenant(id: string, input: Record<string, unknown>) {
  return apiRequest<SaasTenant>(`/admin/platform/tenants/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function listSaasPlans() {
  return apiRequest<{ items: SaasPlan[] }>("/admin/platform/plans");
}

export function upsertSaasPlan(input: Record<string, unknown>) {
  return apiRequest<SaasPlan>("/admin/platform/plans", { method: "POST", body: JSON.stringify(input) });
}

export function createTenantSubscription(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/platform/subscriptions", { method: "POST", body: JSON.stringify(input) });
}

export function createPlatformApiKey(input: Record<string, unknown>) {
  return apiRequest<{ item: PlatformApiKey; secret: string; warning: string }>("/admin/platform/api-keys", { method: "POST", body: JSON.stringify(input) });
}

export function revokePlatformApiKey(id: string) {
  return apiRequest<PlatformApiKey>(`/admin/platform/api-keys/${encodeURIComponent(id)}/revoke`, { method: "PATCH" });
}

export function createPlatformWebhook(input: Record<string, unknown>) {
  return apiRequest<{ item: PlatformWebhook; secret: string; warning: string }>("/admin/platform/webhooks", { method: "POST", body: JSON.stringify(input) });
}

export function updatePlatformWebhook(id: string, input: Record<string, unknown>) {
  return apiRequest<PlatformWebhook>(`/admin/platform/webhooks/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function upsertPlatformFeatureFlag(input: Record<string, unknown>) {
  return apiRequest<PlatformFeatureFlag>("/admin/platform/feature-flags", { method: "POST", body: JSON.stringify(input) });
}

export function upsertPlatformPlugin(input: Record<string, unknown>) {
  return apiRequest<Record<string, unknown>>("/admin/platform/plugins", { method: "POST", body: JSON.stringify(input) });
}

export function listPlatformPlugins() {
  return apiRequest<{ items: PlatformPlugin[] }>("/admin/platform/plugins");
}

export function installPlatformPlugin(input: Record<string, unknown>) {
  return apiRequest<PlatformPluginInstall>("/admin/platform/plugin-installs", { method: "POST", body: JSON.stringify(input) });
}
