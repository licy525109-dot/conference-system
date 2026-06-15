CREATE TABLE "page_templates" (
  "id" TEXT NOT NULL,
  "pageKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "pageType" TEXT NOT NULL DEFAULT 'CUSTOM',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publishedVersionId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "page_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_versions" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "title" TEXT NOT NULL,
  "components" JSONB NOT NULL,
  "themeJson" JSONB,
  "createdBy" TEXT,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "page_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "component_presets" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "group" TEXT NOT NULL,
  "description" TEXT,
  "schemaJson" JSONB NOT NULL,
  "defaultConfigJson" JSONB NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "system" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "component_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "theme_presets" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "configJson" JSONB NOT NULL,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "theme_presets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "active_theme_configs" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "themePresetId" TEXT,
  "configJson" JSONB NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "active_theme_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tabbar_configs" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'global',
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tabbar_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tabbar_items" (
  "id" TEXT NOT NULL,
  "configId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "iconUrl" TEXT,
  "selectedIconUrl" TEXT,
  "pageKey" TEXT NOT NULL,
  "path" TEXT NOT NULL,
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "requireLogin" BOOLEAN NOT NULL DEFAULT false,
  "badgeText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tabbar_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "page_publish_logs" (
  "id" TEXT NOT NULL,
  "templateId" TEXT NOT NULL,
  "versionId" TEXT,
  "action" TEXT NOT NULL,
  "summary" TEXT,
  "createdBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "page_publish_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "page_templates_pageKey_key" ON "page_templates"("pageKey");
CREATE INDEX "page_templates_pageType_idx" ON "page_templates"("pageType");
CREATE INDEX "page_templates_enabled_idx" ON "page_templates"("enabled");
CREATE INDEX "page_templates_sortOrder_idx" ON "page_templates"("sortOrder");
CREATE INDEX "page_templates_createdAt_idx" ON "page_templates"("createdAt");

CREATE UNIQUE INDEX "page_versions_templateId_versionNo_key" ON "page_versions"("templateId", "versionNo");
CREATE INDEX "page_versions_templateId_idx" ON "page_versions"("templateId");
CREATE INDEX "page_versions_status_idx" ON "page_versions"("status");
CREATE INDEX "page_versions_createdAt_idx" ON "page_versions"("createdAt");

CREATE UNIQUE INDEX "component_presets_type_key" ON "component_presets"("type");
CREATE INDEX "component_presets_group_idx" ON "component_presets"("group");
CREATE INDEX "component_presets_enabled_idx" ON "component_presets"("enabled");
CREATE INDEX "component_presets_sortOrder_idx" ON "component_presets"("sortOrder");

CREATE UNIQUE INDEX "theme_presets_code_key" ON "theme_presets"("code");
CREATE INDEX "theme_presets_enabled_idx" ON "theme_presets"("enabled");
CREATE INDEX "theme_presets_createdAt_idx" ON "theme_presets"("createdAt");

CREATE UNIQUE INDEX "active_theme_configs_scope_key" ON "active_theme_configs"("scope");
CREATE INDEX "active_theme_configs_themePresetId_idx" ON "active_theme_configs"("themePresetId");

CREATE UNIQUE INDEX "tabbar_configs_scope_key" ON "tabbar_configs"("scope");
CREATE INDEX "tabbar_items_configId_idx" ON "tabbar_items"("configId");
CREATE INDEX "tabbar_items_visible_idx" ON "tabbar_items"("visible");
CREATE INDEX "tabbar_items_sortOrder_idx" ON "tabbar_items"("sortOrder");

CREATE INDEX "page_publish_logs_templateId_idx" ON "page_publish_logs"("templateId");
CREATE INDEX "page_publish_logs_versionId_idx" ON "page_publish_logs"("versionId");
CREATE INDEX "page_publish_logs_action_idx" ON "page_publish_logs"("action");
CREATE INDEX "page_publish_logs_createdAt_idx" ON "page_publish_logs"("createdAt");

ALTER TABLE "page_versions"
  ADD CONSTRAINT "page_versions_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "page_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tabbar_items"
  ADD CONSTRAINT "tabbar_items_configId_fkey"
  FOREIGN KEY ("configId") REFERENCES "tabbar_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_publish_logs"
  ADD CONSTRAINT "page_publish_logs_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "page_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "page_publish_logs"
  ADD CONSTRAINT "page_publish_logs_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "page_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
