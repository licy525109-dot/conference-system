CREATE TABLE "roles" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "system" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "permissions" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "group" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "admin_user_roles" (
  "id" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "admin_user_roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "role_permissions" (
  "id" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "permissionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "material_categories" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "material_assets" (
  "id" TEXT NOT NULL,
  "categoryId" TEXT,
  "name" TEXT NOT NULL,
  "usage" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "sizeBytes" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "remark" TEXT,
  "createdBy" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "material_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");
CREATE INDEX "roles_enabled_idx" ON "roles"("enabled");
CREATE INDEX "roles_createdAt_idx" ON "roles"("createdAt");
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");
CREATE INDEX "permissions_group_idx" ON "permissions"("group");
CREATE INDEX "permissions_createdAt_idx" ON "permissions"("createdAt");
CREATE UNIQUE INDEX "admin_user_roles_adminUserId_roleId_key" ON "admin_user_roles"("adminUserId", "roleId");
CREATE INDEX "admin_user_roles_adminUserId_idx" ON "admin_user_roles"("adminUserId");
CREATE INDEX "admin_user_roles_roleId_idx" ON "admin_user_roles"("roleId");
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");
CREATE INDEX "role_permissions_roleId_idx" ON "role_permissions"("roleId");
CREATE INDEX "role_permissions_permissionId_idx" ON "role_permissions"("permissionId");
CREATE UNIQUE INDEX "material_categories_code_key" ON "material_categories"("code");
CREATE INDEX "material_categories_enabled_idx" ON "material_categories"("enabled");
CREATE INDEX "material_categories_sortOrder_idx" ON "material_categories"("sortOrder");
CREATE INDEX "material_categories_createdAt_idx" ON "material_categories"("createdAt");
CREATE INDEX "material_assets_categoryId_idx" ON "material_assets"("categoryId");
CREATE INDEX "material_assets_usage_idx" ON "material_assets"("usage");
CREATE INDEX "material_assets_enabled_idx" ON "material_assets"("enabled");
CREATE INDEX "material_assets_createdAt_idx" ON "material_assets"("createdAt");

ALTER TABLE "admin_user_roles"
  ADD CONSTRAINT "admin_user_roles_adminUserId_fkey"
  FOREIGN KEY ("adminUserId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "admin_user_roles"
  ADD CONSTRAINT "admin_user_roles_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_roleId_fkey"
  FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "role_permissions"
  ADD CONSTRAINT "role_permissions_permissionId_fkey"
  FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "material_assets"
  ADD CONSTRAINT "material_assets_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "material_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
