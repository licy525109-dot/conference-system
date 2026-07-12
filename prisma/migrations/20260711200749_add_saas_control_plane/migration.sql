-- CreateEnum
CREATE TYPE "SaasTenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SaasWorkspaceStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "SaasSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PlatformCredentialStatus" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlatformPluginInstallStatus" AS ENUM ('ACTIVE', 'DISABLED', 'FAILED');

-- CreateTable
CREATE TABLE "saas_tenants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SaasTenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_organizations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_workspaces" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organizationId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "SaasWorkspaceStatus" NOT NULL DEFAULT 'ACTIVE',
    "settingsJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_tenant_members" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_tenant_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "monthlyPriceCent" INTEGER NOT NULL DEFAULT 0,
    "annualPriceCent" INTEGER NOT NULL DEFAULT 0,
    "limitsJson" JSONB,
    "featuresJson" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SaasSubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "billingCycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" TIMESTAMP(3),
    "renewsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopesJson" JSONB,
    "status" "PlatformCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_webhooks" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "signingSecretHash" TEXT NOT NULL,
    "eventsJson" JSONB,
    "status" "PlatformCredentialStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastDeliveredAt" TIMESTAMP(3),
    "lastStatusCode" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_usage_events" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "metric" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unit" TEXT NOT NULL DEFAULT 'COUNT',
    "idempotencyKey" TEXT,
    "metadataJson" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plugins" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "manifestJson" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plugins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plugin_installs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "pluginId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'tenant',
    "status" "PlatformPluginInstallStatus" NOT NULL DEFAULT 'ACTIVE',
    "configJson" JSONB,
    "installedBy" TEXT,
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plugin_installs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_feature_flags" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "key" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL DEFAULT 'tenant',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "configJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_feature_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saas_tenants_slug_key" ON "saas_tenants"("slug");

-- CreateIndex
CREATE INDEX "saas_tenants_status_idx" ON "saas_tenants"("status");

-- CreateIndex
CREATE INDEX "saas_tenants_createdAt_idx" ON "saas_tenants"("createdAt");

-- CreateIndex
CREATE INDEX "saas_organizations_tenantId_idx" ON "saas_organizations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "saas_organizations_tenantId_code_key" ON "saas_organizations"("tenantId", "code");

-- CreateIndex
CREATE INDEX "saas_workspaces_tenantId_idx" ON "saas_workspaces"("tenantId");

-- CreateIndex
CREATE INDEX "saas_workspaces_organizationId_idx" ON "saas_workspaces"("organizationId");

-- CreateIndex
CREATE INDEX "saas_workspaces_status_idx" ON "saas_workspaces"("status");

-- CreateIndex
CREATE UNIQUE INDEX "saas_workspaces_tenantId_slug_key" ON "saas_workspaces"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "saas_tenant_members_adminUserId_idx" ON "saas_tenant_members"("adminUserId");

-- CreateIndex
CREATE INDEX "saas_tenant_members_enabled_idx" ON "saas_tenant_members"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "saas_tenant_members_tenantId_adminUserId_key" ON "saas_tenant_members"("tenantId", "adminUserId");

-- CreateIndex
CREATE UNIQUE INDEX "saas_plans_code_key" ON "saas_plans"("code");

-- CreateIndex
CREATE INDEX "saas_plans_enabled_idx" ON "saas_plans"("enabled");

-- CreateIndex
CREATE INDEX "saas_subscriptions_tenantId_idx" ON "saas_subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "saas_subscriptions_planId_idx" ON "saas_subscriptions"("planId");

-- CreateIndex
CREATE INDEX "saas_subscriptions_status_idx" ON "saas_subscriptions"("status");

-- CreateIndex
CREATE INDEX "saas_subscriptions_renewsAt_idx" ON "saas_subscriptions"("renewsAt");

-- CreateIndex
CREATE INDEX "platform_api_keys_tenantId_idx" ON "platform_api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "platform_api_keys_status_idx" ON "platform_api_keys"("status");

-- CreateIndex
CREATE INDEX "platform_api_keys_expiresAt_idx" ON "platform_api_keys"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "platform_api_keys_tenantId_keyPrefix_key" ON "platform_api_keys"("tenantId", "keyPrefix");

-- CreateIndex
CREATE INDEX "platform_webhooks_tenantId_idx" ON "platform_webhooks"("tenantId");

-- CreateIndex
CREATE INDEX "platform_webhooks_status_idx" ON "platform_webhooks"("status");

-- CreateIndex
CREATE INDEX "platform_usage_events_tenantId_metric_occurredAt_idx" ON "platform_usage_events"("tenantId", "metric", "occurredAt");

-- CreateIndex
CREATE INDEX "platform_usage_events_workspaceId_idx" ON "platform_usage_events"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "platform_usage_events_tenantId_idempotencyKey_key" ON "platform_usage_events"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plugins_code_key" ON "platform_plugins"("code");

-- CreateIndex
CREATE INDEX "platform_plugins_enabled_idx" ON "platform_plugins"("enabled");

-- CreateIndex
CREATE INDEX "platform_plugin_installs_workspaceId_idx" ON "platform_plugin_installs"("workspaceId");

-- CreateIndex
CREATE INDEX "platform_plugin_installs_status_idx" ON "platform_plugin_installs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plugin_installs_tenantId_pluginId_scopeKey_key" ON "platform_plugin_installs"("tenantId", "pluginId", "scopeKey");

-- CreateIndex
CREATE INDEX "platform_feature_flags_tenantId_idx" ON "platform_feature_flags"("tenantId");

-- CreateIndex
CREATE INDEX "platform_feature_flags_workspaceId_idx" ON "platform_feature_flags"("workspaceId");

-- CreateIndex
CREATE INDEX "platform_feature_flags_enabled_idx" ON "platform_feature_flags"("enabled");

-- CreateIndex
CREATE UNIQUE INDEX "platform_feature_flags_tenantId_key_scopeKey_key" ON "platform_feature_flags"("tenantId", "key", "scopeKey");

-- AddForeignKey
ALTER TABLE "saas_organizations" ADD CONSTRAINT "saas_organizations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_workspaces" ADD CONSTRAINT "saas_workspaces_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_workspaces" ADD CONSTRAINT "saas_workspaces_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "saas_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_tenant_members" ADD CONSTRAINT "saas_tenant_members_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_tenant_members" ADD CONSTRAINT "saas_tenant_members_adminUserId_fkey" FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saas_subscriptions" ADD CONSTRAINT "saas_subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "saas_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_api_keys" ADD CONSTRAINT "platform_api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_webhooks" ADD CONSTRAINT "platform_webhooks_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_usage_events" ADD CONSTRAINT "platform_usage_events_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_usage_events" ADD CONSTRAINT "platform_usage_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "saas_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plugin_installs" ADD CONSTRAINT "platform_plugin_installs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plugin_installs" ADD CONSTRAINT "platform_plugin_installs_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "saas_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_plugin_installs" ADD CONSTRAINT "platform_plugin_installs_pluginId_fkey" FOREIGN KEY ("pluginId") REFERENCES "platform_plugins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_feature_flags" ADD CONSTRAINT "platform_feature_flags_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "saas_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_feature_flags" ADD CONSTRAINT "platform_feature_flags_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "saas_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
