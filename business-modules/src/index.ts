export type BusinessModuleType =
  | "home-hero"
  | "home-quick-entry"
  | "home-event-list"
  | "home-product-grid"
  | "home-member-card"
  | "conference-detail-info"
  | "conference-register-form"
  | "mall-product-grid";

export type BusinessModuleFieldType = "text" | "textarea" | "image" | "select" | "switch" | "items";

export interface BusinessModuleItem {
  id: string;
  label: string;
  subtitle?: string;
  iconUrl?: string;
  imageUrl?: string;
  linkType?: "page" | "conference" | "product" | "registration" | "url" | "none";
  link?: string;
}

export interface BusinessModuleConfig {
  title?: string;
  subtitle?: string;
  description?: string;
  imageUrl?: string;
  buttonText?: string;
  layout?: "grid" | "list" | "card";
  columns?: number;
  enabled?: boolean;
  linkType?: "page" | "conference" | "product" | "registration" | "url" | "none";
  link?: string;
  items?: BusinessModuleItem[];
}

export interface BusinessModule {
  id: string;
  type: BusinessModuleType;
  enabled: boolean;
  sortOrder: number;
  config: BusinessModuleConfig;
}

export interface BusinessModuleField {
  key: keyof BusinessModuleConfig;
  label: string;
  type: BusinessModuleFieldType;
  placeholder?: string;
  help?: string;
  options?: Array<{ label: string; value: string | number | boolean }>;
}

export interface BusinessModuleDefinition {
  type: BusinessModuleType;
  name: string;
  group: "首页模块" | "会议模块" | "商城模块" | "会员模块";
  description: string;
  defaultConfig: BusinessModuleConfig;
  fields: BusinessModuleField[];
}

const LINK_OPTIONS = [
  { label: "无跳转", value: "none" },
  { label: "小程序页面", value: "page" },
  { label: "会议详情", value: "conference" },
  { label: "报名页", value: "registration" },
  { label: "商品详情", value: "product" },
  { label: "外部 H5", value: "url" }
] as const;

const LAYOUT_OPTIONS = [
  { label: "宫格", value: "grid" },
  { label: "列表", value: "list" },
  { label: "卡片", value: "card" }
] as const;

const COMMON_TEXT_FIELDS: BusinessModuleField[] = [
  { key: "title", label: "标题", type: "text", placeholder: "请输入模块标题" },
  { key: "subtitle", label: "副标题", type: "text", placeholder: "用于小字提示，可不填" },
  { key: "description", label: "说明文案", type: "textarea", placeholder: "请输入模块说明" }
];

export const BUSINESS_MODULE_DEFINITIONS: BusinessModuleDefinition[] = [
  {
    type: "home-hero",
    name: "首页主视觉",
    group: "首页模块",
    description: "首页顶部主标题、背景图和主按钮。",
    defaultConfig: {
      title: "会务运营平台",
      subtitle: "年度活动精选",
      description: "聚合会议报名、商城服务和会员权益。",
      imageUrl: "",
      buttonText: "查看会议",
      linkType: "page",
      link: "conference-list"
    },
    fields: [
      ...COMMON_TEXT_FIELDS,
      { key: "imageUrl", label: "背景图片", type: "image", placeholder: "图片 URL 或素材地址" },
      { key: "buttonText", label: "按钮文案", type: "text", placeholder: "例如：立即报名" },
      { key: "linkType", label: "按钮跳转类型", type: "select", options: [...LINK_OPTIONS] },
      { key: "link", label: "按钮跳转目标", type: "text", placeholder: "页面 key / 会议 ID / URL" }
    ]
  },
  {
    type: "home-quick-entry",
    name: "快捷入口",
    group: "首页模块",
    description: "运营常用入口，如会议报名、我的报名、商城、会员中心。",
    defaultConfig: {
      title: "快捷入口",
      layout: "grid",
      columns: 4,
      items: [
        { id: "entry-conference", label: "会议报名", subtitle: "查看活动", linkType: "page", link: "conference-list" },
        { id: "entry-mall", label: "商城", subtitle: "精选商品", linkType: "page", link: "mall" },
        { id: "entry-member", label: "会员中心", subtitle: "权益服务", linkType: "page", link: "member-center" }
      ]
    },
    fields: [
      { key: "title", label: "标题", type: "text", placeholder: "请输入模块标题" },
      { key: "layout", label: "展示样式", type: "select", options: [...LAYOUT_OPTIONS] },
      { key: "columns", label: "每行数量", type: "select", options: [{ label: "2 个", value: 2 }, { label: "3 个", value: 3 }, { label: "4 个", value: 4 }] },
      { key: "items", label: "入口列表", type: "items", help: "每个入口可配置名称、图标和跳转。" }
    ]
  },
  {
    type: "home-event-list",
    name: "会议推荐",
    group: "首页模块",
    description: "首页会议列表或年度排期入口。",
    defaultConfig: {
      title: "热门会议",
      subtitle: "近期可报名",
      layout: "list",
      items: [
        { id: "event-1", label: "年度产业峰会", subtitle: "报名进行中", linkType: "conference", link: "" }
      ]
    },
    fields: [
      { key: "title", label: "标题", type: "text" },
      { key: "subtitle", label: "副标题", type: "text" },
      { key: "layout", label: "展示样式", type: "select", options: [...LAYOUT_OPTIONS] },
      { key: "items", label: "会议条目", type: "items" }
    ]
  },
  {
    type: "home-product-grid",
    name: "首页商品推荐",
    group: "商城模块",
    description: "首页展示精选商品或服务。",
    defaultConfig: {
      title: "精选商品",
      layout: "grid",
      columns: 2,
      items: [{ id: "product-1", label: "会议资料包", subtitle: "热销推荐", linkType: "product", link: "" }]
    },
    fields: [
      { key: "title", label: "标题", type: "text" },
      { key: "layout", label: "展示样式", type: "select", options: [...LAYOUT_OPTIONS] },
      { key: "columns", label: "每行数量", type: "select", options: [{ label: "2 个", value: 2 }, { label: "3 个", value: 3 }, { label: "4 个", value: 4 }] },
      { key: "items", label: "商品条目", type: "items" }
    ]
  },
  {
    type: "home-member-card",
    name: "会员卡片",
    group: "会员模块",
    description: "会员中心入口、权益宣传或登录欢迎。",
    defaultConfig: {
      title: "会员权益",
      subtitle: "专属价格与活动提醒",
      description: "完善资料后可查看会员权益和专属服务。",
      buttonText: "进入会员中心",
      linkType: "page",
      link: "member-center"
    },
    fields: [
      ...COMMON_TEXT_FIELDS,
      { key: "buttonText", label: "按钮文案", type: "text" },
      { key: "linkType", label: "跳转类型", type: "select", options: [...LINK_OPTIONS] },
      { key: "link", label: "跳转目标", type: "text" }
    ]
  },
  {
    type: "conference-detail-info",
    name: "会议信息",
    group: "会议模块",
    description: "会议详情页的信息摘要区。",
    defaultConfig: {
      title: "会议信息",
      description: "时间、地点、议程和参会须知。",
      layout: "card"
    },
    fields: [...COMMON_TEXT_FIELDS, { key: "layout", label: "展示样式", type: "select", options: [...LAYOUT_OPTIONS] }]
  },
  {
    type: "conference-register-form",
    name: "报名引导",
    group: "会议模块",
    description: "报名页或详情页的行动按钮。",
    defaultConfig: {
      title: "立即报名",
      description: "选择票种并填写报名信息。",
      buttonText: "去报名",
      linkType: "registration",
      link: ""
    },
    fields: [
      ...COMMON_TEXT_FIELDS,
      { key: "buttonText", label: "按钮文案", type: "text" },
      { key: "linkType", label: "跳转类型", type: "select", options: [...LINK_OPTIONS] },
      { key: "link", label: "会议 ID", type: "text" }
    ]
  },
  {
    type: "mall-product-grid",
    name: "商品宫格",
    group: "商城模块",
    description: "商城页商品推荐宫格。",
    defaultConfig: {
      title: "商品推荐",
      layout: "grid",
      columns: 2,
      items: [{ id: "mall-product-1", label: "服务商品", subtitle: "点击查看", linkType: "product", link: "" }]
    },
    fields: [
      { key: "title", label: "标题", type: "text" },
      { key: "layout", label: "展示样式", type: "select", options: [...LAYOUT_OPTIONS] },
      { key: "columns", label: "每行数量", type: "select", options: [{ label: "2 个", value: 2 }, { label: "3 个", value: 3 }, { label: "4 个", value: 4 }] },
      { key: "items", label: "商品条目", type: "items" }
    ]
  }
];

export function getBusinessModuleDefinition(type: BusinessModuleType): BusinessModuleDefinition {
  const definition = BUSINESS_MODULE_DEFINITIONS.find((item) => item.type === type);
  if (!definition) throw new Error(`Unknown business module type: ${type}`);
  return definition;
}

export function createBusinessModule(type: BusinessModuleType, index = 0): BusinessModule {
  const definition = getBusinessModuleDefinition(type);
  return {
    id: `${type}-${Date.now().toString(36)}-${index}`,
    type,
    enabled: true,
    sortOrder: index * 10,
    config: deepClone(definition.defaultConfig)
  };
}

export function normalizeBusinessModules(value: unknown): BusinessModule[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => normalizeBusinessModule(item, index))
    .filter((item): item is BusinessModule => Boolean(item))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export function normalizeBusinessModule(value: unknown, index = 0): BusinessModule | null {
  if (!isRecord(value)) return null;
  const type = typeof value.type === "string" && hasBusinessModuleType(value.type) ? value.type : null;
  if (!type) return null;
  const definition = getBusinessModuleDefinition(type);
  return {
    id: readString(value.id) || `${type}-${index + 1}`,
    type,
    enabled: typeof value.enabled === "boolean" ? value.enabled : true,
    sortOrder: Number.isFinite(Number(value.sortOrder)) ? Number(value.sortOrder) : index * 10,
    config: {
      ...deepClone(definition.defaultConfig),
      ...(isRecord(value.config) ? normalizeConfig(value.config) : {})
    }
  };
}

export function hasBusinessModuleType(value: string): value is BusinessModuleType {
  return BUSINESS_MODULE_DEFINITIONS.some((definition) => definition.type === value);
}

function normalizeConfig(value: Record<string, unknown>): BusinessModuleConfig {
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.subtitle === "string" ? { subtitle: value.subtitle } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.imageUrl === "string" ? { imageUrl: value.imageUrl } : {}),
    ...(typeof value.buttonText === "string" ? { buttonText: value.buttonText } : {}),
    ...(value.layout === "grid" || value.layout === "list" || value.layout === "card" ? { layout: value.layout } : {}),
    ...(Number.isFinite(Number(value.columns)) ? { columns: Number(value.columns) } : {}),
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(isLinkType(value.linkType) ? { linkType: value.linkType } : {}),
    ...(typeof value.link === "string" ? { link: value.link } : {}),
    ...(Array.isArray(value.items) ? { items: value.items.map((item, index) => normalizeItem(item, index)).filter((item): item is BusinessModuleItem => Boolean(item)) } : {})
  };
}

function normalizeItem(value: unknown, index: number): BusinessModuleItem | null {
  if (!isRecord(value)) return null;
  return {
    id: readString(value.id) || `item-${index + 1}`,
    label: readString(value.label || value.title || value.name) || `条目 ${index + 1}`,
    subtitle: readString(value.subtitle || value.description),
    iconUrl: readString(value.iconUrl),
    imageUrl: readString(value.imageUrl),
    linkType: isLinkType(value.linkType) ? value.linkType : "none",
    link: readString(value.link || value.url || value.pageKey)
  };
}

function isLinkType(value: unknown): value is BusinessModuleConfig["linkType"] {
  return value === "page" || value === "conference" || value === "product" || value === "registration" || value === "url" || value === "none";
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
