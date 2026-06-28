import {
  createBusinessModule,
  getModuleRenderContract,
  normalizeBusinessModules,
  type BusinessModule,
  type BusinessModuleConfig,
  type BusinessModuleItem,
  type BusinessModuleType
} from "@conference/business-modules";
import type { DslNode, PageDsl } from "@conference/dsl-runtime";

export interface ModuleCompileInput {
  page: string;
  modules: BusinessModule[];
}

export interface ModuleCompileResult {
  dsl: PageDsl;
  modules: BusinessModule[];
}

export function compileBusinessModules(input: ModuleCompileInput): ModuleCompileResult {
  const modules = normalizeBusinessModules(input.modules);
  return {
    modules,
    dsl: {
      schemaVersion: "p9",
      page: input.page,
      dsl: {
        nodes: modules.filter((module) => module.enabled !== false).map((module, index) => compileModule(module, index))
      },
      meta: {
        source: "business-modules",
        businessModules: modules
      }
    }
  };
}

export function extractBusinessModules(input: unknown, fallbackPage: string): ModuleCompileResult {
  const record = isRecord(input) ? input : {};
  const page = readString(record.page) || fallbackPage;
  const modules = normalizeBusinessModules(isRecord(record.meta) ? record.meta.businessModules : undefined);
  if (modules.length > 0) {
    return compileBusinessModules({ page, modules });
  }
  return compileBusinessModules({ page, modules: modulesFromDslNodes(isRecord(record.dsl) && Array.isArray(record.dsl.nodes) ? record.dsl.nodes : []) });
}

export function defaultModulesForPage(page: string): BusinessModule[] {
  if (page === "home") {
    return [
      createBusinessModule("home-hero", 0),
      createBusinessModule("home-quick-entry", 1),
      createBusinessModule("home-event-list", 2)
    ];
  }
  if (page === "mall") {
    return [createBusinessModule("mall-product-grid", 0)];
  }
  if (page === "member-center") {
    return [createBusinessModule("home-member-card", 0)];
  }
  if (page === "conference-detail") {
    return [createBusinessModule("conference-detail-info", 0), createBusinessModule("conference-register-form", 1)];
  }
  if (page === "registration-form") {
    return [createBusinessModule("conference-register-form", 0)];
  }
  return [];
}

function compileModule(module: BusinessModule, index: number): DslNode {
  const config = module.config;
  const renderContracts = {
    adminPreview: getModuleRenderContract(module.type, "adminPreview"),
    h5: getModuleRenderContract(module.type, "h5"),
    miniapp: getModuleRenderContract(module.type, "miniapp")
  };
  const base = {
    id: module.id,
    enabled: module.enabled,
    sortOrder: Number.isFinite(module.sortOrder) ? module.sortOrder : index * 10,
    meta: {
      source: "business-module",
      moduleId: module.id,
      moduleType: module.type,
      renderContracts
    }
  };

  if (module.type === "fixed-business-template") {
    return {
      ...base,
      type: "ds-section",
      props: {
        ...moduleStyleProps(config),
        templateKey: text(config.templateKey, "home"),
        assetRoot: text(config.assetRoot, "/static/fixed-templates"),
        heroTitle: text(config.heroTitle || config.title),
        heroSubtitle: text(config.heroSubtitle || config.subtitle),
        heroImageUrl: text(config.heroImageUrl || config.imageUrl),
        noticeText: text(config.noticeText || config.description),
        growthValue: text(config.growthValue),
        noticeBar: config.noticeBar !== false,
        loginCard: config.loginCard !== false,
        quickGrid: config.quickGrid !== false,
        highlightStrip: config.highlightStrip !== false,
        statsCard: config.statsCard !== false,
        conferenceModels: config.conferenceModels !== false,
        tagRows: config.tagRows !== false,
        items: (config.items ?? []).map(itemToDslItem)
      },
      meta: {
        ...base.meta,
        originalType: "fixed-business-template"
      }
    };
  }

  if (module.type === "home-hero" || module.type === "image-banner") {
    return {
      ...base,
      type: "ds-banner",
      props: {
        ...moduleStyleProps(config),
        title: text(config.title),
        subtitle: text(config.subtitle),
        description: text(config.description),
        imageUrl: text(config.imageUrl),
        imageMode: text(config.imageMode),
        imageOnly: config.imageOnly === true,
        showOverlay: config.showOverlay !== false,
        buttonText: text(config.buttonText),
        action: moduleAction(config)
      }
    };
  }

  if (module.type === "home-quick-entry" || module.type === "quick-icon-grid" || module.type === "home-product-grid" || module.type === "mall-product-grid") {
    return {
      ...base,
      type: config.layout === "list" ? "ds-list" : "ds-grid",
      props: {
        ...moduleStyleProps(config),
        title: text(config.title),
        subtitle: text(config.subtitle),
        columns: Number(config.columns || (module.type === "home-quick-entry" ? 4 : 2)),
        iconSize: text(config.iconSize),
        cardStyle: text(config.cardStyle),
        items: (config.items ?? []).map(itemToDslItem)
      }
    };
  }

  if (module.type === "home-event-list" || module.type === "event-card-carousel" || module.type === "conference-card") {
    return {
      ...base,
      type: config.layout === "grid" ? "ds-grid" : "ds-list",
      props: {
        ...moduleStyleProps(config),
        title: text(config.title),
        subtitle: text(config.subtitle),
        emptyText: "暂无会议",
        columns: Number(config.columns || 2),
        items: (config.items ?? []).map(itemToDslItem)
      }
    };
  }

  if (
    module.type === "home-member-card" ||
    module.type === "member-profile-card" ||
    module.type === "member-benefit-card" ||
    module.type === "order-card" ||
    module.type === "product-card" ||
    module.type === "cart-item" ||
    module.type === "conference-register-form" ||
    module.type === "invoice-form" ||
    module.type === "aftersale-form"
  ) {
    return {
      ...base,
      type: "ds-card",
      props: {
        ...moduleStyleProps(config),
        title: text(config.title),
        subtitle: text(config.subtitle),
        description: text(config.description),
        buttonText: text(config.buttonText),
        action: moduleAction(config)
      }
    };
  }

  return {
    ...base,
    type: "ds-section",
    props: {
      ...moduleStyleProps(config),
      title: text(config.title),
      subtitle: text(config.subtitle),
      description: text(config.description),
      imageUrl: text(config.imageUrl),
      imageMode: text(config.imageMode),
      buttonText: text(config.buttonText),
      action: moduleAction(config)
    }
  };
}

function moduleStyleProps(config: BusinessModuleConfig): Record<string, unknown> {
  return {
    radiusPreset: config.radiusPreset ?? "md",
    spacingPreset: config.spacingPreset ?? "standard",
    imageRatio: config.imageRatio ?? "",
    buttonStyle: config.buttonStyle ?? "primary",
    cardStyle: config.cardStyle ?? "soft"
  };
}

function modulesFromDslNodes(nodes: unknown[]): BusinessModule[] {
  return nodes.map((node, index) => moduleFromDslNode(node, index)).filter((module): module is BusinessModule => Boolean(module));
}

function moduleFromDslNode(value: unknown, index: number): BusinessModule | null {
  if (!isRecord(value)) return null;
  const meta = isRecord(value.meta) ? value.meta : {};
  const moduleType = readString(meta.moduleType);
  if (moduleType) {
    const module = createBusinessModule(moduleType as BusinessModuleType, index);
    module.id = readString(value.id) || module.id;
    module.enabled = typeof value.enabled === "boolean" ? value.enabled : true;
    module.sortOrder = Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10;
    module.config = configFromProps(isRecord(value.props) ? value.props : {}, module.config);
    return module;
  }

  const nodeType = readString(value.type);
  const fallbackType: BusinessModuleType = nodeType === "ds-banner" ? "home-hero" : nodeType === "ds-grid" ? "home-quick-entry" : nodeType === "ds-list" ? "home-event-list" : "conference-detail-info";
  const module = createBusinessModule(fallbackType, index);
  module.id = readString(value.id) || module.id;
  module.config = configFromProps(isRecord(value.props) ? value.props : {}, module.config);
  module.sortOrder = Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10;
  return module;
}

function configFromProps(props: Record<string, unknown>, fallback: BusinessModuleConfig): BusinessModuleConfig {
  return {
    ...fallback,
    title: text(props.title, fallback.title),
    subtitle: text(props.subtitle, fallback.subtitle),
    description: text(props.description || props.text, fallback.description),
    imageUrl: text(props.imageUrl, fallback.imageUrl),
    templateKey: text(props.templateKey, fallback.templateKey),
    assetRoot: text(props.assetRoot, fallback.assetRoot),
    heroTitle: text(props.heroTitle || props.title, fallback.heroTitle),
    heroSubtitle: text(props.heroSubtitle || props.subtitle, fallback.heroSubtitle),
    heroImageUrl: text(props.heroImageUrl || props.imageUrl, fallback.heroImageUrl),
    noticeText: text(props.noticeText || props.description || props.text, fallback.noticeText),
    growthValue: text(props.growthValue, fallback.growthValue),
    noticeBar: typeof props.noticeBar === "boolean" ? props.noticeBar : fallback.noticeBar,
    loginCard: typeof props.loginCard === "boolean" ? props.loginCard : fallback.loginCard,
    quickGrid: typeof props.quickGrid === "boolean" ? props.quickGrid : fallback.quickGrid,
    highlightStrip: typeof props.highlightStrip === "boolean" ? props.highlightStrip : fallback.highlightStrip,
    statsCard: typeof props.statsCard === "boolean" ? props.statsCard : fallback.statsCard,
    conferenceModels: typeof props.conferenceModels === "boolean" ? props.conferenceModels : fallback.conferenceModels,
    tagRows: typeof props.tagRows === "boolean" ? props.tagRows : fallback.tagRows,
    buttonText: text(props.buttonText || props.text, fallback.buttonText),
    columns: Number.isFinite(Number(props.columns)) ? Number(props.columns) : fallback.columns,
    items: Array.isArray(props.items) ? props.items.map((item, index) => dslItemToModuleItem(item, index)) : fallback.items
  };
}

function itemToDslItem(item: BusinessModuleItem): Record<string, unknown> {
  return {
    id: item.id,
    title: item.label,
    label: item.label,
    subtitle: item.subtitle ?? "",
    iconUrl: item.iconUrl ?? "",
    imageUrl: item.imageUrl ?? "",
    action: itemAction(item),
    actionTargetType: item.linkType,
    pageKey: item.linkType === "page" ? item.link : "",
    conferenceId: item.linkType === "conference" || item.linkType === "registration" ? item.link : "",
    productId: item.linkType === "product" ? item.link : "",
    url: item.linkType === "url" ? item.link : ""
  };
}

function dslItemToModuleItem(item: unknown, index: number): BusinessModuleItem {
  const record = isRecord(item) ? item : {};
  return {
    id: readString(record.id) || `item-${index + 1}`,
    label: text(record.label || record.title || record.name, `条目 ${index + 1}`),
    subtitle: text(record.subtitle || record.description),
    iconUrl: text(record.iconUrl),
    imageUrl: text(record.imageUrl),
    linkType: readLinkType(record.actionTargetType || record.linkType),
    link: text(record.pageKey || record.conferenceId || record.productId || record.url || record.link)
  };
}

function moduleAction(config: BusinessModuleConfig): Record<string, unknown> {
  return buildAction(config.linkType, config.link);
}

function itemAction(item: BusinessModuleItem): Record<string, unknown> {
  return buildAction(item.linkType, item.link);
}

function buildAction(linkType: BusinessModuleConfig["linkType"], link = ""): Record<string, unknown> {
  if (linkType === "page") return { type: "page", pageKey: link };
  if (linkType === "conference") return { type: "conference", conferenceId: link };
  if (linkType === "registration") return { type: "registration", conferenceId: link };
  if (linkType === "product") return { type: "product", productId: link };
  if (linkType === "url") return { type: "url", url: link };
  return { type: "none" };
}

function readLinkType(value: unknown): BusinessModuleConfig["linkType"] {
  if (value === "page" || value === "conference" || value === "registration" || value === "product" || value === "url" || value === "none") return value;
  return "none";
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
