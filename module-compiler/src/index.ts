import {
  createBusinessModule,
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
  const base = {
    id: module.id,
    enabled: module.enabled,
    sortOrder: Number.isFinite(module.sortOrder) ? module.sortOrder : index * 10,
    meta: {
      source: "business-module",
      moduleId: module.id,
      moduleType: module.type
    }
  };

  if (module.type === "home-hero") {
    return {
      ...base,
      type: "ds-banner",
      props: {
        title: text(config.title, "首页主视觉"),
        subtitle: text(config.subtitle),
        description: text(config.description),
        imageUrl: text(config.imageUrl),
        buttonText: text(config.buttonText),
        action: moduleAction(config)
      }
    };
  }

  if (module.type === "home-quick-entry" || module.type === "home-product-grid" || module.type === "mall-product-grid") {
    return {
      ...base,
      type: config.layout === "list" ? "ds-list" : "ds-grid",
      props: {
        title: text(config.title, "入口"),
        subtitle: text(config.subtitle),
        columns: Number(config.columns || (module.type === "home-quick-entry" ? 4 : 2)),
        items: (config.items ?? []).map(itemToDslItem)
      }
    };
  }

  if (module.type === "home-event-list") {
    return {
      ...base,
      type: config.layout === "grid" ? "ds-grid" : "ds-list",
      props: {
        title: text(config.title, "会议推荐"),
        subtitle: text(config.subtitle),
        emptyText: "暂无会议",
        columns: Number(config.columns || 2),
        items: (config.items ?? []).map(itemToDslItem)
      }
    };
  }

  if (module.type === "home-member-card" || module.type === "conference-register-form") {
    return {
      ...base,
      type: "ds-card",
      props: {
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
      title: text(config.title),
      subtitle: text(config.subtitle),
      description: text(config.description),
      imageUrl: text(config.imageUrl),
      buttonText: text(config.buttonText),
      action: moduleAction(config)
    }
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
