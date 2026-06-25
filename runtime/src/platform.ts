import type { PageDsl } from "./types";

export interface TenantContext {
  tenantId: string;
  workspaceId: string;
  organizationId: string;
  featureFlags: Record<string, boolean>;
}

export interface DataSourceDefinition {
  id: string;
  type: "static" | "api" | "cms" | "order" | "user";
  name: string;
  config: Record<string, unknown>;
}

export interface TemplateMarketItem {
  id: string;
  type: "page" | "conference" | "mall";
  name: string;
  description?: string;
  snapshot: PageDsl;
  tags: string[];
  version: string;
}

export interface ThemeMarketItem {
  id: string;
  type: "enterprise" | "mall" | "conference";
  name: string;
  tokenOverrides: Record<string, unknown>;
  layoutPreset: Record<string, unknown>;
  version: string;
}

export interface VersionRecord<TSnapshot> {
  id: string;
  state: "draft" | "published" | "archived";
  snapshot: TSnapshot;
  createdAt: string;
  publishedAt?: string | null;
  parentVersionId?: string | null;
}

export interface BillingPlan {
  id: string;
  code: "free" | "subscription" | "enterprise";
  name: string;
  limits: Record<string, number>;
  features: string[];
}

export interface UsageBillableEvent {
  id: string;
  tenantId: string;
  metric: string;
  quantity: number;
  occurredAt: string;
}

export interface ApiAccessKey {
  id: string;
  tenantId: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  enabled: boolean;
  createdAt: string;
}

export interface RateLimitPolicy {
  id: string;
  tenantId: string;
  scope: string;
  windowSeconds: number;
  maxRequests: number;
}

export interface WebhookEndpoint {
  id: string;
  tenantId: string;
  url: string;
  events: string[];
  enabled: boolean;
}
