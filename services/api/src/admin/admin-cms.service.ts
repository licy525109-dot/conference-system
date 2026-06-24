import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import {
  ALL_COMPONENT_PRESETS,
  ALL_COMPONENT_TYPES,
  DEFAULT_TABBAR_ITEMS,
  DEFAULT_THEME_CONFIG,
  ENABLED_COMPONENT_TYPES,
  SYSTEM_PAGE_LIBRARY_TEMPLATES,
  defaultPageComponents
} from "../cms/cms-defaults";
import { assertCmsPresetsArePublishable, assertCmsPublishable, buildCmsPublishCheck } from "../cms/cms-component-support";
import { ok } from "../cms/cms.service";
import { CurrentAdmin } from "./current-admin";

const KNOWN_PAGE_KEYS = new Set([
  "home",
  "conference-list",
  "conference-detail",
  "registration-form",
  "registration-success",
  "my-registrations",
  "cart",
  "member-center",
  "mall",
  "mall-detail",
  "mall-orders",
  "invoice"
]);
const PAGE_TYPES_REQUIRING_CONFERENCE = new Set(["CONFERENCE_DETAIL_PAGE", "REGISTRATION_FORM_PAGE", "REGISTRATION_CREDENTIAL_PAGE"]);
const PAGE_TYPES_REQUIRING_PRODUCT = new Set(["PRODUCT_DETAIL_PAGE"]);
const DEFAULT_SCOPE = "global";
const PAGE_LIBRARY_PREFIX = "template:";

@Injectable()
export class AdminCmsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPages() {
    await this.ensureCmsDefaults();
    const items = await this.prisma.pageTemplate.findMany({
      where: {
        enabled: true,
        NOT: {
          pageKey: { startsWith: PAGE_LIBRARY_PREFIX }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: pageSelect
    });
    return ok({ items: items.map(formatPageTemplate) });
  }

  async createPage(input: unknown, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const body = readObject(input);
    const pageKey = normalizePageKey(readRequiredString(body, "pageKey"));
    const title = readRequiredString(body, "title");
    const pageType = readOptionalString(body, "pageType") ?? inferPageType(pageKey);
    const binding = await this.normalizePageBinding(pageType, body);
    const templateVersion = await this.loadPageLibraryTemplateVersion(readOptionalString(body, "templateId"));
    const components = parseComponents(body.components ?? templateVersion?.components ?? defaultPageComponents(defaultComponentPageKey(pageType, pageKey)));
    const bodyThemeJson = typeof body.themeJson === "undefined" ? null : readNullableJsonObject(body.themeJson);
    const themeJson = cloneTemplateThemeForPage(templateVersion?.themeJson ?? bodyThemeJson, title);
    const template = await catchUniqueConstraint(
      this.prisma.pageTemplate.create({
        data: {
          pageKey,
          title,
          description: readOptionalString(body, "description"),
          pageType,
          ...binding,
          enabled: readOptionalBoolean(body, "enabled") ?? true,
          sortOrder: readOptionalInt(body, "sortOrder") ?? 0,
          versions: {
            create: {
              versionNo: 1,
              status: "DRAFT",
              title,
              components,
              ...(themeJson ? { themeJson } : {}),
              createdBy: admin.id
            }
          }
        },
        select: pageSelect
      }),
      "页面 key 已存在"
    );
    await this.writeAudit(admin, AuditAction.CREATE, "PageTemplate", template.id, "Create page template", { pageKey });
    return ok(formatPageTemplate(template));
  }

  async listPageLibraryTemplates() {
    await this.ensureCmsDefaults();
    const items = await this.prisma.pageTemplate.findMany({
      where: {
        pageKey: { startsWith: PAGE_LIBRARY_PREFIX }
      },
      orderBy: [{ pageType: "asc" }, { updatedAt: "desc" }],
      select: pageLibrarySelect
    });
    return ok({ items: items.map(formatPageLibraryTemplate) });
  }

  async createPageLibraryTemplate(input: unknown, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const body = readObject(input);
    const slug = normalizeTemplateSlug(readRequiredString(body, "slug"));
    const title = readRequiredString(body, "title");
    const description = readOptionalString(body, "description");
    const category = readOptionalString(body, "category") ?? "自定义模板";
    const components = parseComponents(body.components ?? defaultPageComponents("home"));
    const templateThemeJson = typeof body.themeJson === "undefined" ? {} : readNullableJsonObject(body.themeJson) ?? {};
    const themeJson = attachTemplateMeta(templateThemeJson, category, description);
    const created = await catchUniqueConstraint(
      this.prisma.$transaction(async (tx) => {
        const template = await tx.pageTemplate.create({
          data: {
            pageKey: `${PAGE_LIBRARY_PREFIX}${slug}`,
            title,
            description,
            pageType: "USER_TEMPLATE",
            enabled: true
          },
          select: { id: true }
        });
        const version = await tx.pageVersion.create({
          data: {
            templateId: template.id,
            versionNo: 1,
            status: "PUBLISHED",
            title,
            components,
            themeJson,
            createdBy: admin.id,
            publishedAt: new Date()
          },
          select: { id: true }
        });
        await tx.pageTemplate.update({
          where: { id: template.id },
          data: { publishedVersionId: version.id }
        });
        await tx.pagePublishLog.create({
          data: {
            templateId: template.id,
            versionId: version.id,
            action: "PUBLISH",
            summary: "Create page library template",
            createdBy: admin.id
          }
        });
        return tx.pageTemplate.findUniqueOrThrow({
          where: { id: template.id },
          select: pageLibrarySelect
        });
      }),
      "模板标识已存在"
    );
    await this.writeAudit(admin, AuditAction.CREATE, "PageLibraryTemplate", created.id, "Create page library template", {
      pageKey: created.pageKey
    });
    return ok(formatPageLibraryTemplate(created));
  }

  async updatePage(id: string, input: unknown, admin: CurrentAdmin) {
    await this.ensurePage(id);
    const body = readObject(input);
    const current = await this.prisma.pageTemplate.findUniqueOrThrow({
      where: { id },
      select: { pageType: true }
    });
    const nextPageType = readOptionalString(body, "pageType") ?? current.pageType;
    const binding = await this.normalizePageBinding(nextPageType, body, true);
    const template = await this.prisma.pageTemplate.update({
      where: { id },
      data: {
        ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
        ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
        ...(typeof body.pageType !== "undefined" ? { pageType: nextPageType } : {}),
        ...binding,
        ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
        ...(typeof body.sortOrder !== "undefined" ? { sortOrder: readRequiredInt(body, "sortOrder") } : {})
      },
      select: pageSelect
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PageTemplate", id, "Update page template", { pageKey: template.pageKey });
    return ok(formatPageTemplate(template));
  }

  async deletePage(id: string, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const template = await this.prisma.pageTemplate.findUnique({
      where: { id },
      select: {
        id: true,
        pageKey: true,
        title: true,
        pageType: true,
        publishedVersionId: true
      }
    });
    if (!template) throw new NotFoundException("页面不存在");
    if (template.publishedVersionId) {
      throw new BadRequestException("已发布页面不能删除，请先新建草稿替代或停用发布入口");
    }
    if (template.pageKey.startsWith(PAGE_LIBRARY_PREFIX) || template.pageType === "SYSTEM_TEMPLATE") {
      throw new BadRequestException("固定模板不能删除");
    }
    if (KNOWN_PAGE_KEYS.has(template.pageKey)) {
      await this.prisma.pageTemplate.update({ where: { id }, data: { enabled: false } });
      await this.writeAudit(admin, AuditAction.DELETE, "PageTemplate", id, "Disable built-in draft page template", {
        pageKey: template.pageKey,
        title: template.title
      });
      return ok({ id, deleted: true, disabled: true });
    }
    await this.prisma.pageTemplate.delete({ where: { id } });
    await this.writeAudit(admin, AuditAction.DELETE, "PageTemplate", id, "Delete page template", {
      pageKey: template.pageKey,
      title: template.title
    });
    return ok({ id, deleted: true });
  }

  async getPageVersion(id: string) {
    const version = await this.prisma.pageVersion.findUnique({
      where: { id },
      select: versionSelect
    });
    if (!version) {
      throw new NotFoundException("Page version not found");
    }
    return ok(formatPageVersion(version));
  }

  async updatePageVersion(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const existing = await this.prisma.pageVersion.findUnique({
      where: { id },
      select: { id: true, status: true, templateId: true, title: true, components: true, themeJson: true }
    });
    if (!existing) {
      throw new NotFoundException("Page version not found");
    }
    if (existing.status === "PUBLISHED") {
      const nextVersionNo = await this.nextVersionNo(existing.templateId);
      const draft = await this.prisma.pageVersion.create({
        data: {
          templateId: existing.templateId,
          versionNo: nextVersionNo,
          status: "DRAFT",
          title: typeof body.title !== "undefined" ? readRequiredString(body, "title") : existing.title,
          components: typeof body.components !== "undefined" ? parseComponents(body.components) : parseComponents(existing.components),
          themeJson:
            typeof body.themeJson !== "undefined"
              ? readNullableJsonObject(body.themeJson)
              : readPlainObject(existing.themeJson) ?? undefined,
          createdBy: admin.id
        },
        select: versionSelect
      });
      await this.writeAudit(admin, AuditAction.CREATE, "PageVersion", draft.id, "Create draft from published page version", {
        templateId: existing.templateId,
        sourceVersionId: existing.id
      });
      return ok(formatPageVersion(draft));
    }
    if (existing.status === "ARCHIVED") {
      throw new BadRequestException("归档版本不能直接编辑，请回滚或从已发布版本继续编辑");
    }

    const version = await this.prisma.pageVersion.update({
      where: { id },
      data: {
        ...(typeof body.title !== "undefined" ? { title: readRequiredString(body, "title") } : {}),
        ...(typeof body.components !== "undefined" ? { components: parseComponents(body.components) } : {}),
        ...(typeof body.themeJson !== "undefined" ? { themeJson: readNullableJsonObject(body.themeJson) } : {}),
        createdBy: admin.id
      },
      select: versionSelect
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PageVersion", id, "Update page version", {
      templateId: existing.templateId
    });
    return ok(formatPageVersion(version));
  }

  async publishPageVersion(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input ?? {});
    const existing = await this.prisma.pageVersion.findUnique({
      where: { id },
      select: { id: true, templateId: true, title: true, components: true, themeJson: true }
    });
    if (!existing) {
      throw new NotFoundException("Page version not found");
    }
    const publishReport = assertCmsPublishable(existing.components, { confirmBasic: readOptionalBoolean(body, "confirmBasic") ?? false });
    const components = parseComponents(existing.components);
    const themeJson = readPlainObject(existing.themeJson);
    const latestVersion = await this.prisma.pageVersion.findFirst({
      where: { templateId: existing.templateId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true }
    });
    const publishVersionNo = (latestVersion?.versionNo ?? 0) + 1;

    const publishedAt = new Date();
    const draft = await this.prisma.$transaction(async (tx) => {
      await tx.pageVersion.updateMany({
        where: { templateId: existing.templateId, status: "PUBLISHED" },
        data: { status: "ARCHIVED" }
      });
      await tx.pageVersion.update({
        where: { id: existing.id },
        data: { status: "ARCHIVED" }
      });
      const published = await tx.pageVersion.create({
        data: {
          templateId: existing.templateId,
          versionNo: publishVersionNo,
          status: "PUBLISHED",
          title: existing.title,
          components,
          themeJson: themeJson ?? undefined,
          createdBy: admin.id,
          publishedAt
        },
        select: { id: true }
      });
      const nextDraft = await tx.pageVersion.create({
        data: {
          templateId: existing.templateId,
          versionNo: publishVersionNo + 1,
          status: "DRAFT",
          title: existing.title,
          components,
          themeJson: themeJson ?? undefined,
          createdBy: admin.id
        },
        select: versionSelect
      });
      await tx.pageTemplate.update({
        where: { id: existing.templateId },
        data: {
          publishedVersionId: published.id,
          title: existing.title
        }
      });
      await tx.pagePublishLog.create({
        data: {
          templateId: existing.templateId,
          versionId: published.id,
          action: "PUBLISH",
          summary: `Publish page version from draft ${existing.id}`,
          createdBy: admin.id
        }
      });
      return nextDraft;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PageVersion", id, "Publish page version", {
      templateId: existing.templateId,
      publishReport: publishReport as unknown as Prisma.InputJsonValue
    });
    return ok(formatPageVersion(draft));
  }

  async rollbackPage(id: string, input: unknown, admin: CurrentAdmin) {
    const template = await this.prisma.pageTemplate.findUnique({
      where: { id },
      select: { id: true, publishedVersionId: true }
    });
    if (!template) {
      throw new NotFoundException("Page template not found");
    }
    const body = readObject(input);
    const targetVersionId = readOptionalString(body, "versionId");
    const source = await this.prisma.pageVersion.findFirst({
      where: targetVersionId
        ? { id: targetVersionId, templateId: id }
        : { templateId: id, status: "ARCHIVED", id: { not: template.publishedVersionId ?? undefined } },
      orderBy: [{ publishedAt: "desc" }, { versionNo: "desc" }],
      select: { id: true, title: true, components: true, themeJson: true }
    });
    if (!source) {
      throw new NotFoundException("No rollback version found");
    }
    const nextVersionNo = await this.nextVersionNo(id);
    const publishedAt = new Date();
    const version = await this.prisma.$transaction(async (tx) => {
      await tx.pageVersion.updateMany({
        where: { templateId: id, status: "PUBLISHED" },
        data: { status: "ARCHIVED" }
      });
      const created = await tx.pageVersion.create({
        data: {
          templateId: id,
          versionNo: nextVersionNo,
          status: "PUBLISHED",
          title: source.title,
          components: parseComponents(source.components),
          themeJson: source.themeJson ?? undefined,
          createdBy: admin.id,
          publishedAt
        },
        select: versionSelect
      });
      await tx.pageTemplate.update({
        where: { id },
        data: {
          publishedVersionId: created.id,
          title: source.title
        }
      });
      await tx.pagePublishLog.create({
        data: {
          templateId: id,
          versionId: created.id,
          action: "ROLLBACK",
          summary: `Rollback from ${source.id}`,
          createdBy: admin.id
        }
      });
      return created;
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "PageTemplate", id, "Rollback page", { sourceVersionId: source.id });
    return ok(formatPageVersion(version));
  }

  async listComponentPresets() {
    await this.ensureCmsDefaults();
    const items = await this.prisma.componentPreset.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });
    return ok({ items: items.map(formatComponentPreset) });
  }

  async getTheme() {
    await this.ensureCmsDefaults();
    const active = await this.prisma.activeThemeConfig.findUnique({
      where: { scope: DEFAULT_SCOPE }
    });
    return ok(formatActiveTheme(active));
  }

  async updateTheme(input: unknown, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const body = readObject(input);
    const config = normalizeThemeConfig(body.config ?? body.configJson ?? body);
    const active = await this.prisma.activeThemeConfig.upsert({
      where: { scope: DEFAULT_SCOPE },
      update: {
        themePresetId: readNullableString(body.themePresetId),
        configJson: config,
        publishedAt: new Date()
      },
      create: {
        scope: DEFAULT_SCOPE,
        themePresetId: readNullableString(body.themePresetId),
        configJson: config,
        publishedAt: new Date()
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "ActiveThemeConfig", active.id, "Update active theme", {});
    return ok(formatActiveTheme(active));
  }

  async listThemePresets() {
    await this.ensureCmsDefaults();
    const items = await this.prisma.themePreset.findMany({
      orderBy: [{ system: "desc" }, { createdAt: "desc" }]
    });
    return ok({ items: items.map(formatThemePreset) });
  }

  async createThemePreset(input: unknown, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const body = readObject(input);
    const preset = await catchUniqueConstraint(
      this.prisma.themePreset.create({
        data: {
          code: readRequiredString(body, "code"),
          name: readRequiredString(body, "name"),
          description: readOptionalString(body, "description"),
          configJson: normalizeThemeConfig(body.configJson ?? body.config),
          system: false,
          enabled: readOptionalBoolean(body, "enabled") ?? true
        }
      }),
      "主题编码已存在"
    );
    await this.writeAudit(admin, AuditAction.CREATE, "ThemePreset", preset.id, "Create theme preset", { code: preset.code });
    return ok(formatThemePreset(preset));
  }

  async updateThemePreset(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const preset = await this.prisma.themePreset.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
        ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
        ...(typeof body.configJson !== "undefined" || typeof body.config !== "undefined"
          ? { configJson: normalizeThemeConfig(body.configJson ?? body.config) }
          : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {})
      }
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "ThemePreset", id, "Update theme preset", { code: preset.code });
    return ok(formatThemePreset(preset));
  }

  async getTabbar() {
    await this.ensureCmsDefaults();
    const config = await this.prisma.tabBarConfig.findUnique({
      where: { scope: DEFAULT_SCOPE },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
    });
    return ok(formatTabbar(config));
  }

  async updateTabbar(input: unknown, admin: CurrentAdmin) {
    await this.ensureCmsDefaults();
    const body = readObject(input);
    const items = parseTabbarItems(body.items);
    const enabled = readOptionalBoolean(body, "enabled") ?? true;
    const config = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tabBarConfig.upsert({
        where: { scope: DEFAULT_SCOPE },
        update: { enabled },
        create: { scope: DEFAULT_SCOPE, enabled }
      });
      await tx.tabBarItem.deleteMany({ where: { configId: current.id } });
      await tx.tabBarItem.createMany({
        data: items.map((item) => ({ ...item, configId: current.id }))
      });
      return tx.tabBarConfig.findUniqueOrThrow({
        where: { id: current.id },
        include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } }
      });
    });
    await this.writeAudit(admin, AuditAction.UPDATE, "TabBarConfig", config.id, "Update tabbar", {});
    return ok(formatTabbar(config));
  }

  async ensureCmsDefaults(): Promise<void> {
    assertCmsPresetsArePublishable(ENABLED_COMPONENT_TYPES);
    for (const [index, preset] of ALL_COMPONENT_PRESETS.entries()) {
      await this.prisma.componentPreset.upsert({
        where: { type: preset.type },
        update: {
          name: preset.name,
          group: preset.group,
          description: preset.description,
          schemaJson: preset.schemaJson,
          defaultConfigJson: preset.defaultConfigJson,
          enabled: preset.enabled,
          system: preset.system,
          sortOrder: index
        },
        create: {
          ...preset,
          sortOrder: index
        }
      });
    }

    const themePreset = await this.prisma.themePreset.upsert({
      where: { code: "default-light" },
      update: {
        name: "默认浅色主题",
        configJson: DEFAULT_THEME_CONFIG,
        system: true,
        enabled: true
      },
      create: {
        code: "default-light",
        name: "默认浅色主题",
        description: "系统默认主题",
        configJson: DEFAULT_THEME_CONFIG,
        system: true,
        enabled: true
      }
    });

    await this.prisma.activeThemeConfig.upsert({
      where: { scope: DEFAULT_SCOPE },
      update: {},
      create: {
        scope: DEFAULT_SCOPE,
        themePresetId: themePreset.id,
        configJson: DEFAULT_THEME_CONFIG,
        publishedAt: new Date()
      }
    });

    const tabbar = await this.prisma.tabBarConfig.upsert({
      where: { scope: DEFAULT_SCOPE },
      update: {},
      create: { scope: DEFAULT_SCOPE, enabled: true }
    });
    const count = await this.prisma.tabBarItem.count({ where: { configId: tabbar.id } });
    if (count === 0) {
      await this.prisma.tabBarItem.createMany({
        data: DEFAULT_TABBAR_ITEMS.map((item) => ({ ...item, configId: tabbar.id }))
      });
    }

    for (const page of [
      { pageKey: "home", title: "首页", pageType: "HOME", sortOrder: 0 },
      { pageKey: "conference-list", title: "会议列表页", pageType: "CONFERENCE_LIST", sortOrder: 10 },
      { pageKey: "custom:about-paiqi", title: "年度排期", pageType: "CUSTOM", sortOrder: 15 },
      { pageKey: "conference-detail", title: "会议详情页", pageType: "CONFERENCE_DETAIL_TEMPLATE", sortOrder: 20 },
      { pageKey: "registration-form", title: "会议报名页", pageType: "REGISTRATION_FORM", sortOrder: 30 },
      { pageKey: "registration-success", title: "报名凭证页", pageType: "REGISTRATION_CREDENTIAL", sortOrder: 40 },
      { pageKey: "my-registrations", title: "我的报名页", pageType: "USER", sortOrder: 50 },
      { pageKey: "cart", title: "商城下单/购物车页", pageType: "MALL_CHECKOUT", sortOrder: 60 },
      { pageKey: "member-center", title: "会员中心页", pageType: "USER", sortOrder: 70 },
      { pageKey: "mall", title: "商城首页", pageType: "MALL", sortOrder: 80 },
      { pageKey: "mall-detail", title: "商城商品详情页", pageType: "PRODUCT_DETAIL_TEMPLATE", sortOrder: 90 },
      { pageKey: "mall-orders", title: "售后申请页", pageType: "MALL_AFTERSALE", sortOrder: 100 },
      { pageKey: "invoice", title: "发票申请页", pageType: "INVOICE", sortOrder: 110 }
    ]) {
      const template = await this.prisma.pageTemplate.upsert({
        where: { pageKey: page.pageKey },
        update: {
          title: page.title,
          pageType: page.pageType,
          bindingType: page.pageKey === "mall-detail" ? "PRODUCT_TEMPLATE" : page.pageKey === "conference-detail" ? "CONFERENCE_TEMPLATE" : null,
          sortOrder: page.sortOrder
        },
        create: {
          ...page,
          bindingType: page.pageKey === "mall-detail" ? "PRODUCT_TEMPLATE" : page.pageKey === "conference-detail" ? "CONFERENCE_TEMPLATE" : null,
          enabled: true
        }
      });
      const versions = await this.prisma.pageVersion.count({ where: { templateId: template.id } });
      if (versions === 0) {
        await this.prisma.pageVersion.create({
          data: {
            templateId: template.id,
            versionNo: 1,
            status: "DRAFT",
            title: page.title,
            components: defaultPageComponents(page.pageKey)
          }
        });
      }
    }

    for (const template of SYSTEM_PAGE_LIBRARY_TEMPLATES) {
      const page = await this.prisma.pageTemplate.upsert({
        where: { pageKey: template.pageKey },
        update: {
          title: template.title,
          description: template.description,
          pageType: template.pageType,
          enabled: true
        },
        create: {
          pageKey: template.pageKey,
          title: template.title,
          description: template.description,
          pageType: template.pageType,
          enabled: true
        }
      });
      const versions = await this.prisma.pageVersion.count({ where: { templateId: page.id } });
      if (versions === 0) {
        const version = await this.prisma.pageVersion.create({
          data: {
            templateId: page.id,
            versionNo: 1,
            status: "PUBLISHED",
            title: template.title,
            components: parseComponents(template.components),
            themeJson: template.themeJson,
            publishedAt: new Date()
          },
          select: { id: true }
        });
        await this.prisma.pageTemplate.update({
          where: { id: page.id },
          data: { publishedVersionId: version.id }
        });
      }
    }
  }

  private async ensurePage(id: string): Promise<void> {
    const page = await this.prisma.pageTemplate.findUnique({ where: { id }, select: { id: true } });
    if (!page) {
      throw new NotFoundException("Page template not found");
    }
  }

  private async nextVersionNo(templateId: string): Promise<number> {
    const latest = await this.prisma.pageVersion.findFirst({
      where: { templateId },
      orderBy: { versionNo: "desc" },
      select: { versionNo: true }
    });
    return (latest?.versionNo ?? 0) + 1;
  }

  private async loadPageLibraryTemplateVersion(templateId: string | undefined) {
    if (!templateId) return null;
    const template = await this.prisma.pageTemplate.findFirst({
      where: {
        id: templateId,
        pageKey: { startsWith: PAGE_LIBRARY_PREFIX }
      },
      select: {
        id: true,
        publishedVersionId: true
      }
    });
    if (!template) {
      throw new NotFoundException("Page library template not found");
    }
    const version = await this.prisma.pageVersion.findFirst({
      where: template.publishedVersionId
        ? { id: template.publishedVersionId, templateId: template.id }
        : { templateId: template.id },
      orderBy: [{ versionNo: "desc" }],
      select: {
        components: true,
        themeJson: true
      }
    });
    if (!version) {
      throw new NotFoundException("Page library template version not found");
    }
    return {
      components: Array.isArray(version.components) ? version.components : [],
      themeJson: readPlainObject(version.themeJson)
    };
  }

  private async normalizePageBinding(pageType: string, body: Record<string, unknown>, patch = false) {
    if (PAGE_TYPES_REQUIRING_CONFERENCE.has(pageType)) {
      const conferenceId = readRequiredString(body, "conferenceId");
      const conference = await this.prisma.conference.findUnique({ where: { id: conferenceId }, select: { id: true } });
      if (!conference) throw new BadRequestException("绑定会议不存在，请重新选择会议");
      return { bindingType: "SPECIFIC_CONFERENCE", conferenceId, productId: null };
    }
    if (PAGE_TYPES_REQUIRING_PRODUCT.has(pageType)) {
      const productId = readRequiredString(body, "productId");
      const product = await this.prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
      if (!product) throw new BadRequestException("绑定商品不存在，请重新选择商品");
      return { bindingType: "SPECIFIC_PRODUCT", conferenceId: null, productId };
    }
    if (pageType === "CONFERENCE_DETAIL_TEMPLATE") {
      return { bindingType: "CONFERENCE_TEMPLATE", conferenceId: null, productId: null };
    }
    if (pageType === "PRODUCT_DETAIL_TEMPLATE") {
      return { bindingType: "PRODUCT_TEMPLATE", conferenceId: null, productId: null };
    }
    if (!patch || typeof body.pageType !== "undefined" || typeof body.conferenceId !== "undefined" || typeof body.productId !== "undefined") {
      return { bindingType: null, conferenceId: null, productId: null };
    }
    return {};
  }

  private async writeAudit(
    admin: CurrentAdmin,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summary: string,
    metadataJson?: Prisma.InputJsonObject
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadataJson
      }
    });
  }
}

const pageSelect = {
  id: true,
  pageKey: true,
  title: true,
  description: true,
  pageType: true,
  bindingType: true,
  conferenceId: true,
  productId: true,
  enabled: true,
  sortOrder: true,
  publishedVersionId: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    orderBy: [{ versionNo: "desc" as const }],
    take: 6,
    select: {
      id: true,
      versionNo: true,
      status: true,
      title: true,
      components: true,
      themeJson: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  }
} satisfies Prisma.PageTemplateSelect;

const versionSelect = {
  id: true,
  templateId: true,
  versionNo: true,
  status: true,
  title: true,
  components: true,
  themeJson: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  template: {
    select: {
      id: true,
      pageKey: true,
      title: true
    }
  }
} satisfies Prisma.PageVersionSelect;

const pageLibrarySelect = {
  id: true,
  pageKey: true,
  title: true,
  description: true,
  pageType: true,
  bindingType: true,
  conferenceId: true,
  productId: true,
  enabled: true,
  publishedVersionId: true,
  createdAt: true,
  updatedAt: true,
  versions: {
    orderBy: [{ versionNo: "desc" as const }],
    take: 1,
    select: {
      id: true,
      versionNo: true,
      status: true,
      title: true,
      components: true,
      themeJson: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true
    }
  }
} satisfies Prisma.PageTemplateSelect;

function formatPageTemplate(template: Prisma.PageTemplateGetPayload<{ select: typeof pageSelect }>) {
  return {
    ...template,
    versions: template.versions.map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      status: version.status,
      title: version.title,
      componentCount: Array.isArray(version.components) ? version.components.length : 0,
      publishedAt: version.publishedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
      updatedAt: version.updatedAt.toISOString()
    })),
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

function formatPageVersion(version: Prisma.PageVersionGetPayload<{ select: typeof versionSelect }>) {
  const components = Array.isArray(version.components) ? version.components : [];
  return {
    ...version,
    components,
    themeJson: readPlainObject(version.themeJson),
    publishCheck: buildCmsPublishCheck(components),
    publishedAt: version.publishedAt?.toISOString() ?? null,
    createdAt: version.createdAt.toISOString(),
    updatedAt: version.updatedAt.toISOString()
  };
}

function formatComponentPreset(preset: Prisma.ComponentPresetGetPayload<Record<string, never>>) {
  return {
    ...preset,
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString()
  };
}

function formatThemePreset(preset: Prisma.ThemePresetGetPayload<Record<string, never>>) {
  return {
    ...preset,
    configJson: normalizeThemeConfig(readPlainObject(preset.configJson) ?? DEFAULT_THEME_CONFIG),
    createdAt: preset.createdAt.toISOString(),
    updatedAt: preset.updatedAt.toISOString()
  };
}

function formatActiveTheme(active: Prisma.ActiveThemeConfigGetPayload<Record<string, never>> | null) {
  return {
    scope: DEFAULT_SCOPE,
    themePresetId: active?.themePresetId ?? null,
    config: normalizeThemeConfig(readPlainObject(active?.configJson) ?? DEFAULT_THEME_CONFIG),
    publishedAt: active?.publishedAt?.toISOString() ?? null,
    createdAt: active?.createdAt.toISOString() ?? null,
    updatedAt: active?.updatedAt.toISOString() ?? null
  };
}

function formatPageLibraryTemplate(template: Prisma.PageTemplateGetPayload<{ select: typeof pageLibrarySelect }>) {
  const latest = template.versions[0];
  const themeJson = readPlainObject(latest?.themeJson);
  const meta = readTemplateMeta(themeJson);
  return {
    id: template.id,
    pageKey: template.pageKey,
    title: template.title,
    description: template.description,
    category: meta.category,
    summary: meta.summary,
    system: template.pageType === "SYSTEM_TEMPLATE",
    version: latest
      ? {
          id: latest.id,
          versionNo: latest.versionNo,
          status: latest.status,
          title: latest.title,
          components: Array.isArray(latest.components) ? latest.components : [],
          themeJson,
          publishedAt: latest.publishedAt?.toISOString() ?? null,
          createdAt: latest.createdAt.toISOString(),
          updatedAt: latest.updatedAt.toISOString()
        }
      : null,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString()
  };
}

function formatTabbar(config: Prisma.TabBarConfigGetPayload<{ include: { items: true } }> | null) {
  return {
    enabled: config?.enabled ?? true,
    items:
      config?.items.map((item) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })) ??
      DEFAULT_TABBAR_ITEMS.map((item, index) => ({
        id: `default-${index}`,
        ...item,
        iconUrl: null,
        selectedIconUrl: null,
        badgeText: null
      })),
    createdAt: config?.createdAt.toISOString() ?? null,
    updatedAt: config?.updatedAt.toISOString() ?? null
  };
}

function parseComponents(value: unknown): Prisma.InputJsonArray {
  if (!Array.isArray(value)) {
    throw new BadRequestException("组件配置必须是数组");
  }
  return value.map((item, index) => {
    const component = readObject(item);
    const type = readRequiredString(component, "type");
    if (!ALL_COMPONENT_TYPES.has(type)) {
      throw new BadRequestException(`未知组件类型：${type}`);
    }
    const enabled = readOptionalBoolean(component, "enabled") ?? true;
    if (enabled && !ENABLED_COMPONENT_TYPES.has(type)) {
      throw new BadRequestException(`组件 ${type} 为后续开放能力，不能启用发布`);
    }
    const config = readPlainObject(component.config) ?? {};
    validateComponentSafety(type, config);
    return {
      id: readOptionalString(component, "id") ?? `${type}-${index + 1}`,
      type,
      enabled,
      sortOrder: readOptionalInt(component, "sortOrder") ?? index,
      config
    };
  });
}

function validateComponentSafety(type: string, config: Prisma.JsonObject): void {
  if (type !== "rich-text" && type !== "safe-html") {
    return;
  }
  const html = typeof config.html === "string" ? config.html : "";
  if (/<\s*script/i.test(html) || /\son[a-z]+\s*=/i.test(html) || /javascript\s*:/i.test(html)) {
    throw new BadRequestException("富文本 HTML 不允许包含脚本、事件属性或 javascript 协议");
  }
}

function normalizeThemeConfig(value: unknown): Prisma.InputJsonObject {
  const input = readPlainObject(value) ?? {};
  return {
    ...DEFAULT_THEME_CONFIG,
    ...input,
    themeApplyMode: typeof input.themeApplyMode === "string" ? input.themeApplyMode : DEFAULT_THEME_CONFIG.themeApplyMode,
    themeApplyPageKeys: sanitizeStringArray(input.themeApplyPageKeys)
  };
}

function parseTabbarItems(value: unknown): Array<{
  title: string;
  iconUrl?: string | null;
  selectedIconUrl?: string | null;
  pageKey: string;
  path: string;
  visible: boolean;
  sortOrder: number;
  requireLogin: boolean;
  badgeText?: string | null;
}> {
  if (!Array.isArray(value)) {
    throw new BadRequestException("底部导航 items 必须是数组");
  }
  if (value.length === 0 || value.length > 5) {
    throw new BadRequestException("底部导航数量必须为 1 到 5 个");
  }
  return value.map((item, index) => {
    const body = readObject(item);
    const pageKey = normalizePageKey(readRequiredString(body, "pageKey"));
    const path = readRequiredString(body, "path");
    if (!path.startsWith("/pages/")) {
      throw new BadRequestException("底部导航路径必须以 /pages/ 开头");
    }
    return {
      title: readRequiredString(body, "title"),
      iconUrl: readNullableString(body.iconUrl),
      selectedIconUrl: readNullableString(body.selectedIconUrl),
      pageKey,
      path,
      visible: readOptionalBoolean(body, "visible") ?? true,
      sortOrder: readOptionalInt(body, "sortOrder") ?? index,
      requireLogin: readOptionalBoolean(body, "requireLogin") ?? false,
      badgeText: readNullableString(body.badgeText)
    };
  });
}

function normalizePageKey(value: string): string {
  const pageKey = value.trim();
  if (KNOWN_PAGE_KEYS.has(pageKey) || /^custom:[a-z0-9][a-z0-9-]{0,60}$/i.test(pageKey)) {
    return pageKey;
  }
  throw new BadRequestException("页面 key 仅支持内置 key 或 custom:<slug>");
}

function inferPageType(pageKey: string): string {
  if (pageKey === "home") return "HOME";
  if (pageKey === "conference-list") return "CONFERENCE_LIST";
  if (pageKey === "conference-detail") return "CONFERENCE_DETAIL_TEMPLATE";
  if (pageKey === "registration-form") return "REGISTRATION_FORM";
  if (pageKey === "registration-success") return "REGISTRATION_CREDENTIAL";
  if (pageKey === "my-registrations") return "USER";
  if (pageKey === "cart") return "MALL_CHECKOUT";
  if (pageKey === "member-center") return "USER";
  if (pageKey === "mall") return "MALL";
  if (pageKey === "mall-detail") return "PRODUCT_DETAIL_TEMPLATE";
  if (pageKey === "mall-orders") return "MALL_AFTERSALE";
  if (pageKey === "invoice") return "INVOICE";
  return "CUSTOM";
}

function defaultComponentPageKey(pageType: string, pageKey: string): string {
  if (["CONFERENCE_DETAIL", "CONFERENCE_DETAIL_TEMPLATE", "CONFERENCE_DETAIL_PAGE"].includes(pageType)) return "conference-detail";
  if (["REGISTRATION_FORM", "REGISTRATION_FORM_PAGE"].includes(pageType)) return "registration-form";
  if (["REGISTRATION_CREDENTIAL", "REGISTRATION_CREDENTIAL_PAGE"].includes(pageType)) return "registration-success";
  if (["PRODUCT_DETAIL_TEMPLATE", "PRODUCT_DETAIL_PAGE"].includes(pageType)) return "mall-detail";
  return pageKey;
}

function normalizeTemplateSlug(value: string): string {
  const slug = value.trim().replace(/^template:/, "").toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,60}$/.test(slug)) {
    throw new BadRequestException("模板标识仅支持小写字母、数字和中划线");
  }
  return slug;
}

function attachTemplateMeta(themeJson: Prisma.InputJsonObject, category: string, summary?: string): Prisma.InputJsonObject {
  return {
    ...themeJson,
    templateMeta: {
      category,
      summary: summary ?? ""
    }
  };
}

function readTemplateMeta(themeJson: Prisma.JsonObject | null): { category: string; summary: string } {
  const meta = readPlainObject(themeJson?.templateMeta);
  return {
    category: typeof meta?.category === "string" && meta.category.trim() ? meta.category.trim() : "全部",
    summary: typeof meta?.summary === "string" ? meta.summary : ""
  };
}

function cloneTemplateThemeForPage(themeJson: Prisma.JsonObject | Prisma.InputJsonObject | null | undefined, title: string): Prisma.InputJsonObject | undefined {
  if (!themeJson) return undefined;
  const next = { ...(themeJson as Record<string, unknown>) };
  delete next.templateMeta;
  const pageMeta = readPlainObject(next.pageMeta) ?? {};
  next.pageMeta = {
    ...pageMeta,
    pageTitle: typeof pageMeta.pageTitle === "string" && pageMeta.pageTitle.trim() ? pageMeta.pageTitle : title,
    shareTitle: typeof pageMeta.shareTitle === "string" && pageMeta.shareTitle.trim() ? pageMeta.shareTitle : title
  };
  return next as Prisma.InputJsonObject;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function readObject(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException("请求体格式不正确");
  }
  return value as Record<string, unknown>;
}

function readPlainObject(value: unknown): Prisma.JsonObject | null {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Prisma.JsonObject) : null;
}

function readRequiredString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${key} 不能为空`);
  }
  return value.trim();
}

function readOptionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function readRequiredBoolean(value: unknown, key: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${key} 必须是布尔值`);
  }
  return value;
}

function readOptionalInt(body: Record<string, unknown>, key: string): number | undefined {
  const value = body[key];
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : undefined;
}

function readRequiredInt(body: Record<string, unknown>, key: string): number {
  const parsed = readOptionalInt(body, key);
  if (typeof parsed !== "number") {
    throw new BadRequestException(`${key} 必须是整数`);
  }
  return parsed;
}

function readNullableJsonObject(value: unknown): Prisma.InputJsonObject | undefined {
  if (value === null) {
    return undefined;
  }
  const object = readPlainObject(value);
  if (!object) {
    throw new BadRequestException("themeJson 必须是对象");
  }
  return object;
}

async function catchUniqueConstraint<T>(promise: Promise<T>, message: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException(message);
    }
    throw error;
  }
}
