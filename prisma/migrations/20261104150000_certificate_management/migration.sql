-- CreateTable
CREATE TABLE "certificate_projects" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "conferenceId" TEXT,
    "ownerAdminId" TEXT NOT NULL,
    "draftJson" JSONB NOT NULL,
    "draftRevision" INTEGER NOT NULL DEFAULT 1,
    "publishedRevision" INTEGER,
    "paused" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_recipients" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "claimCodeHash" TEXT,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certificate_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_versions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "configJson" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_published_recipients" (
    "id" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceRecipientId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "dataJson" JSONB NOT NULL,
    "lookupJson" JSONB NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "approved" BOOLEAN NOT NULL,
    "claimCodeHash" TEXT,

    CONSTRAINT "certificate_published_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_assets" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "bytes" BYTEA NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_issues" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "versionId" TEXT NOT NULL,
    "sourceRecipientId" TEXT NOT NULL,
    "certificateNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "image" BYTEA NOT NULL,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_grants" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_projects_publicId_key" ON "certificate_projects"("publicId");

-- CreateIndex
CREATE INDEX "certificate_projects_conferenceId_idx" ON "certificate_projects"("conferenceId");

-- CreateIndex
CREATE INDEX "certificate_projects_ownerAdminId_idx" ON "certificate_projects"("ownerAdminId");

-- CreateIndex
CREATE INDEX "certificate_recipients_projectId_idx" ON "certificate_recipients"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_recipients_projectId_templateId_certificateNo_key" ON "certificate_recipients"("projectId", "templateId", "certificateNo");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_versions_projectId_revision_key" ON "certificate_versions"("projectId", "revision");

-- CreateIndex
CREATE INDEX "certificate_published_recipients_versionId_idx" ON "certificate_published_recipients"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_published_recipients_versionId_sourceRecipientI_key" ON "certificate_published_recipients"("versionId", "sourceRecipientId");

-- CreateIndex
CREATE INDEX "certificate_assets_projectId_idx" ON "certificate_assets"("projectId");

-- CreateIndex
CREATE INDEX "certificate_issues_projectId_createdAt_idx" ON "certificate_issues"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_issues_versionId_sourceRecipientId_key" ON "certificate_issues"("versionId", "sourceRecipientId");

-- CreateIndex
CREATE UNIQUE INDEX "certificate_grants_tokenHash_key" ON "certificate_grants"("tokenHash");

-- CreateIndex
CREATE INDEX "certificate_grants_expiresAt_idx" ON "certificate_grants"("expiresAt");

-- AddForeignKey
ALTER TABLE "certificate_projects" ADD CONSTRAINT "certificate_projects_conferenceId_fkey" FOREIGN KEY ("conferenceId") REFERENCES "conferences"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_recipients" ADD CONSTRAINT "certificate_recipients_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "certificate_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_versions" ADD CONSTRAINT "certificate_versions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "certificate_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_published_recipients" ADD CONSTRAINT "certificate_published_recipients_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "certificate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_assets" ADD CONSTRAINT "certificate_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "certificate_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "certificate_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_issues" ADD CONSTRAINT "certificate_issues_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "certificate_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificate_grants" ADD CONSTRAINT "certificate_grants_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "certificate_issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Register permissions without granting them to existing operator/partner roles.
INSERT INTO "permissions" ("id", "code", "name", "group", "createdAt", "updatedAt") VALUES
('certificate-permission-view', 'certificate:view', '查看证书项目与名单', '会议管理', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('certificate-permission-write', 'certificate:write', '配置证书模板和规则', '会议管理', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('certificate-permission-import', 'certificate:import', '导入证书名单', '会议管理', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('certificate-permission-publish', 'certificate:publish', '发布、暂停与撤销证书', '会议管理', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('certificate-permission-export', 'certificate:export', '导出证书名单', '会议管理', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "role_permissions" ("id", "roleId", "permissionId", "createdAt")
SELECT 'certificate-grant-' || md5(r."id" || p."id"), r."id", p."id", CURRENT_TIMESTAMP
FROM "roles" r CROSS JOIN "permissions" p
WHERE r."code" = 'super_admin' AND p."code" LIKE 'certificate:%'
ON CONFLICT ("roleId", "permissionId") DO NOTHING;
