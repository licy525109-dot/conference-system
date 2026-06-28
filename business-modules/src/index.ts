export type BusinessModuleType =
  | "home-hero"
  | "home-quick-entry"
  | "home-event-list"
  | "home-product-grid"
  | "home-member-card"
  | "conference-detail-info"
  | "conference-register-form"
  | "mall-product-grid"
  | "quick-icon-grid"
  | "image-banner"
  | "rich-text"
  | "event-card-carousel"
  | "conference-card"
  | "product-card"
  | "cart-item"
  | "member-profile-card"
  | "member-benefit-card"
  | "order-card"
  | "invoice-form"
  | "aftersale-form";

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
  imageMode?: "scaleToFill" | "contain" | "aspectFill" | "widthFix";
  imageRatio?: "16:9" | "4:3" | "1:1" | "3:4";
  showTitle?: boolean;
  showDescription?: boolean;
  showOverlay?: boolean;
  imageOnly?: boolean;
  buttonText?: string;
  layout?: "grid" | "list" | "card";
  columns?: number;
  iconSize?: "small" | "large" | "xlarge";
  radiusPreset?: "sm" | "md" | "lg";
  spacingPreset?: "compact" | "standard" | "relaxed";
  colorMode?: "theme" | "custom";
  buttonStyle?: "primary" | "secondary" | "text";
  cardStyle?: "soft" | "outline" | "plain";
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
  configSchema: BusinessModuleConfigSchema;
  designTokens: BusinessModuleDesignTokens;
  adminPreviewAdapter: RendererAdapter;
  h5Adapter: RendererAdapter;
  miniappAdapter: RendererAdapter;
  parityRules: ParityRule[];
}

export type RendererPlatform = "adminPreview" | "h5" | "miniapp";

export interface RendererAdapter {
  platform: RendererPlatform;
  componentType: string;
  renderer: string;
  supportedConfigKeys: Array<keyof BusinessModuleConfig | "items.action">;
}

export interface BusinessModuleConfigSchema {
  fields: Array<{
    key: keyof BusinessModuleConfig;
    control: "input" | "textarea" | "image" | "select" | "switch" | "items";
    required?: boolean;
    options?: Array<string | number | boolean>;
  }>;
}

export interface BusinessModuleDesignTokens {
  columns?: number;
  iconSize?: "small" | "large" | "xlarge";
  radiusPreset: "sm" | "md" | "lg";
  spacingPreset: "compact" | "standard" | "relaxed";
  imageMode?: "scaleToFill" | "contain" | "aspectFill" | "widthFix";
  imageRatio?: "16:9" | "4:3" | "1:1" | "3:4";
  cardStyle?: "soft" | "outline" | "plain";
  buttonStyle?: "primary" | "secondary" | "text";
  titleSize: "sm" | "md" | "lg";
  subtitleSize: "xs" | "sm" | "md";
}

export interface ParityRule {
  key: string;
  label: string;
  appliesTo: RendererPlatform[];
  invariant: string;
}

export interface ModuleRenderContract {
  type: BusinessModuleType;
  adapter: RendererAdapter;
  designTokens: BusinessModuleDesignTokens;
  parityRules: ParityRule[];
  configSchema: BusinessModuleConfigSchema;
}

const COMMON_ADAPTER_KEYS: RendererAdapter["supportedConfigKeys"] = [
  "title",
  "subtitle",
  "description",
  "imageUrl",
  "imageMode",
  "imageRatio",
  "imageOnly",
  "showTitle",
  "showDescription",
  "showOverlay",
  "buttonText",
  "layout",
  "columns",
  "iconSize",
  "radiusPreset",
  "spacingPreset",
  "buttonStyle",
  "cardStyle",
  "linkType",
  "link",
  "items",
  "items.action"
];

const PLATFORM_ADAPTERS = {
  adminPreview: (componentType: string, renderer = `admin-preview/${componentType}`): RendererAdapter => ({
    platform: "adminPreview",
    componentType,
    renderer,
    supportedConfigKeys: [...COMMON_ADAPTER_KEYS]
  }),
  h5: (componentType: string, renderer = `h5/${componentType}`): RendererAdapter => ({
    platform: "h5",
    componentType,
    renderer,
    supportedConfigKeys: [...COMMON_ADAPTER_KEYS]
  }),
  miniapp: (componentType: string, renderer = `miniapp/${componentType}`): RendererAdapter => ({
    platform: "miniapp",
    componentType,
    renderer,
    supportedConfigKeys: [...COMMON_ADAPTER_KEYS]
  })
} as const;

const COMMON_PARITY_RULES: ParityRule[] = [
  { key: "tokens.radius", label: "圆角预设一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "三端只能使用 sm/md/lg 圆角预设，不允许按端写死圆角。" },
  { key: "tokens.spacing", label: "间距预设一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "三端只能使用 compact/standard/relaxed 间距预设。" },
  { key: "action", label: "动作协议一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "跳转类型和目标来自同一份 linkType/link 或 items.action 配置，平台只做导航适配。" }
];

const HERO_PARITY_RULES: ParityRule[] = [
  ...COMMON_PARITY_RULES,
  { key: "imageMode", label: "图片显示方式一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "完整显示、裁切、宽度铺满在三端使用同一个 imageMode 配置。" },
  { key: "copyVisibility", label: "文案显示一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "标题/描述删除后不自动补默认文案，三端都按 showTitle/showDescription 和实际内容渲染。" },
  { key: "overlay", label: "遮罩策略一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "遮罩只由 showOverlay 和 imageOnly 决定。" }
];

const GRID_PARITY_RULES: ParityRule[] = [
  ...COMMON_PARITY_RULES,
  { key: "columns", label: "列数一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "列数仅允许 2/3/4，三端读取同一个 columns。" },
  { key: "iconSize", label: "图标尺寸一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "图标尺寸仅允许 small/large/xlarge，三端映射到对应 token。" },
  { key: "cardStyle", label: "卡片样式一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "卡片只允许 soft/outline/plain 三种样式。" }
];

const CARD_PARITY_RULES: ParityRule[] = [
  ...COMMON_PARITY_RULES,
  { key: "cardLayout", label: "卡片结构一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "标题、图片、按钮、摘要位置保持同构，平台只做单位适配。" },
  { key: "buttonStyle", label: "按钮预设一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "按钮只允许 primary/secondary/text 三种预设。" }
];

const FORM_PARITY_RULES: ParityRule[] = [
  ...COMMON_PARITY_RULES,
  { key: "formFields", label: "表单字段一致", appliesTo: ["adminPreview", "h5", "miniapp"], invariant: "表单模块只允许使用 schema 暴露字段，三端不新增私有字段。" }
];

const DEFAULT_TOKENS: BusinessModuleDesignTokens = {
  radiusPreset: "md",
  spacingPreset: "standard",
  buttonStyle: "primary",
  titleSize: "md",
  subtitleSize: "sm"
};

const GRID_TOKENS: BusinessModuleDesignTokens = {
  ...DEFAULT_TOKENS,
  columns: 4,
  iconSize: "large",
  cardStyle: "soft"
};

const HERO_TOKENS: BusinessModuleDesignTokens = {
  ...DEFAULT_TOKENS,
  imageMode: "scaleToFill",
  imageRatio: "16:9",
  radiusPreset: "lg",
  titleSize: "lg"
};

const CARD_TOKENS: BusinessModuleDesignTokens = {
  ...DEFAULT_TOKENS,
  imageRatio: "16:9",
  cardStyle: "soft"
};

function configSchema(fields: BusinessModuleField[]): BusinessModuleConfigSchema {
  return {
    fields: fields.map((field) => ({
      key: field.key,
      control: field.type === "text" ? "input" : field.type,
      options: field.options?.map((option) => option.value)
    }))
  };
}

function moduleDefinition(input: Omit<BusinessModuleDefinition, "configSchema" | "designTokens" | "adminPreviewAdapter" | "h5Adapter" | "miniappAdapter" | "parityRules"> & {
  componentType: string;
  designTokens?: BusinessModuleDesignTokens;
  parityRules?: ParityRule[];
}): BusinessModuleDefinition {
  return {
    ...input,
    configSchema: configSchema(input.fields),
    designTokens: input.designTokens ?? DEFAULT_TOKENS,
    adminPreviewAdapter: PLATFORM_ADAPTERS.adminPreview(input.componentType),
    h5Adapter: PLATFORM_ADAPTERS.h5(input.componentType),
    miniappAdapter: PLATFORM_ADAPTERS.miniapp(input.componentType),
    parityRules: input.parityRules ?? COMMON_PARITY_RULES
  };
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

const IMAGE_MODE_FIELD: BusinessModuleField = {
  key: "imageMode",
  label: "图片显示方式",
  type: "select",
  options: [
    { label: "整图铺满", value: "scaleToFill" },
    { label: "完整显示", value: "contain" },
    { label: "等比裁切", value: "aspectFill" },
    { label: "宽度铺满", value: "widthFix" }
  ]
};

const TOKEN_FIELDS: BusinessModuleField[] = [
  { key: "radiusPreset", label: "圆角", type: "select", options: [{ label: "小", value: "sm" }, { label: "中", value: "md" }, { label: "大", value: "lg" }] },
  { key: "spacingPreset", label: "间距", type: "select", options: [{ label: "紧凑", value: "compact" }, { label: "标准", value: "standard" }, { label: "宽松", value: "relaxed" }] }
];

const ACTION_FIELDS: BusinessModuleField[] = [
  { key: "buttonText", label: "按钮文案", type: "text", placeholder: "例如：立即报名" },
  { key: "buttonStyle", label: "按钮样式", type: "select", options: [{ label: "主按钮", value: "primary" }, { label: "次按钮", value: "secondary" }, { label: "文字按钮", value: "text" }] },
  { key: "linkType", label: "跳转类型", type: "select", options: [...LINK_OPTIONS] },
  { key: "link", label: "跳转目标", type: "text", placeholder: "页面 key / 会议 ID / 商品 ID / URL" }
];

const HERO_FIELDS: BusinessModuleField[] = [
  ...COMMON_TEXT_FIELDS,
  { key: "imageUrl", label: "图片", type: "image", placeholder: "图片 URL 或素材地址" },
  IMAGE_MODE_FIELD,
  { key: "imageOnly", label: "仅显示图片", type: "switch" },
  { key: "showOverlay", label: "显示遮罩", type: "switch" },
  ...TOKEN_FIELDS,
  ...ACTION_FIELDS
];

const GRID_FIELDS: BusinessModuleField[] = [
  { key: "title", label: "标题", type: "text", placeholder: "请输入模块标题" },
  { key: "layout", label: "布局模式", type: "select", options: [{ label: "宫格", value: "grid" }, { label: "横向滑动", value: "card" }] },
  { key: "columns", label: "列数", type: "select", options: [{ label: "2 列", value: 2 }, { label: "3 列", value: 3 }, { label: "4 列", value: 4 }] },
  { key: "iconSize", label: "图标尺寸", type: "select", options: [{ label: "小", value: "small" }, { label: "大", value: "large" }, { label: "超大", value: "xlarge" }] },
  { key: "cardStyle", label: "卡片样式", type: "select", options: [{ label: "柔和", value: "soft" }, { label: "描边", value: "outline" }, { label: "无边框", value: "plain" }] },
  ...TOKEN_FIELDS,
  { key: "items", label: "条目", type: "items", help: "每个条目只允许配置标题、副标题、图标和统一跳转。" }
];

const CARD_FIELDS: BusinessModuleField[] = [
  ...COMMON_TEXT_FIELDS,
  { key: "imageUrl", label: "图片", type: "image" },
  IMAGE_MODE_FIELD,
  { key: "cardStyle", label: "卡片样式", type: "select", options: [{ label: "柔和", value: "soft" }, { label: "描边", value: "outline" }, { label: "无边框", value: "plain" }] },
  ...TOKEN_FIELDS,
  ...ACTION_FIELDS
];

const FORM_FIELDS: BusinessModuleField[] = [
  ...COMMON_TEXT_FIELDS,
  ...TOKEN_FIELDS,
  { key: "buttonText", label: "提交按钮文案", type: "text" },
  { key: "buttonStyle", label: "按钮样式", type: "select", options: [{ label: "主按钮", value: "primary" }, { label: "次按钮", value: "secondary" }, { label: "文字按钮", value: "text" }] }
];

export const BUSINESS_MODULE_DEFINITIONS: BusinessModuleDefinition[] = [
  moduleDefinition({
    type: "home-hero",
    componentType: "hero-banner",
    name: "首页主视觉",
    group: "首页模块",
    description: "首页顶部主标题、背景图和主按钮。",
    defaultConfig: {
      title: "会务运营平台",
      subtitle: "年度活动精选",
      description: "聚合会议报名、商城服务和会员权益。",
      imageUrl: "",
      imageMode: "scaleToFill",
      imageOnly: false,
      showOverlay: true,
      radiusPreset: "lg",
      spacingPreset: "standard",
      buttonStyle: "primary",
      buttonText: "查看会议",
      linkType: "page",
      link: "conference-list"
    },
    fields: HERO_FIELDS,
    designTokens: HERO_TOKENS,
    parityRules: HERO_PARITY_RULES
  }),
  moduleDefinition({
    type: "image-banner",
    componentType: "hero-banner",
    name: "图片 Banner",
    group: "首页模块",
    description: "仅图片或少量文案的横幅模块。",
    defaultConfig: {
      title: "",
      description: "",
      imageUrl: "",
      imageMode: "scaleToFill",
      imageOnly: true,
      showOverlay: false,
      radiusPreset: "lg",
      spacingPreset: "standard"
    },
    fields: HERO_FIELDS,
    designTokens: HERO_TOKENS,
    parityRules: HERO_PARITY_RULES
  }),
  moduleDefinition({
    type: "home-quick-entry",
    componentType: "quick-icon-grid",
    name: "快捷入口",
    group: "首页模块",
    description: "运营常用入口，如会议报名、我的报名、商城、会员中心。",
    defaultConfig: {
      title: "快捷入口",
      layout: "grid",
      columns: 4,
      iconSize: "large",
      cardStyle: "soft",
      radiusPreset: "md",
      spacingPreset: "standard",
      items: [
        { id: "entry-conference", label: "会议报名", subtitle: "查看活动", linkType: "page", link: "conference-list" },
        { id: "entry-mall", label: "商城", subtitle: "精选商品", linkType: "page", link: "mall" },
        { id: "entry-member", label: "会员中心", subtitle: "权益服务", linkType: "page", link: "member-center" }
      ]
    },
    fields: GRID_FIELDS,
    designTokens: GRID_TOKENS,
    parityRules: GRID_PARITY_RULES
  }),
  moduleDefinition({
    type: "quick-icon-grid",
    componentType: "quick-icon-grid",
    name: "图标入口宫格",
    group: "首页模块",
    description: "强约束的图标入口宫格，三端列数、图标、间距一致。",
    defaultConfig: {
      title: "快捷入口",
      layout: "grid",
      columns: 3,
      iconSize: "large",
      cardStyle: "soft",
      radiusPreset: "md",
      spacingPreset: "standard",
      items: []
    },
    fields: GRID_FIELDS,
    designTokens: GRID_TOKENS,
    parityRules: GRID_PARITY_RULES
  }),
  moduleDefinition({
    type: "rich-text",
    componentType: "rich-content-block",
    name: "图文内容",
    group: "首页模块",
    description: "强约束图文模块，避免技术节点标题泄漏。",
    defaultConfig: {
      title: "",
      description: "",
      layout: "card",
      radiusPreset: "md",
      spacingPreset: "standard"
    },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "home-event-list",
    componentType: "conference-card",
    name: "会议推荐",
    group: "首页模块",
    description: "首页会议列表或年度排期入口。",
    defaultConfig: {
      title: "热门会议",
      subtitle: "近期可报名",
      layout: "list",
      radiusPreset: "md",
      spacingPreset: "standard",
      items: [{ id: "event-1", label: "年度产业峰会", subtitle: "报名进行中", linkType: "conference", link: "" }]
    },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "event-card-carousel",
    componentType: "event-card-carousel",
    name: "会议横滑卡片",
    group: "会议模块",
    description: "会议卡片横向滑动展示。",
    defaultConfig: { title: "精选会议", layout: "card", radiusPreset: "md", spacingPreset: "standard", items: [] },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "conference-card",
    componentType: "conference-card",
    name: "会议卡片",
    group: "会议模块",
    description: "单个会议或会议列表卡片协议。",
    defaultConfig: { title: "会议", layout: "card", radiusPreset: "md", spacingPreset: "standard" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "home-product-grid",
    componentType: "product-card",
    name: "首页商品推荐",
    group: "商城模块",
    description: "首页展示精选商品或服务。",
    defaultConfig: {
      title: "精选商品",
      layout: "grid",
      columns: 2,
      radiusPreset: "md",
      spacingPreset: "standard",
      items: [{ id: "product-1", label: "会议资料包", subtitle: "热销推荐", linkType: "product", link: "" }]
    },
    fields: GRID_FIELDS,
    designTokens: { ...GRID_TOKENS, columns: 2 },
    parityRules: GRID_PARITY_RULES
  }),
  moduleDefinition({
    type: "mall-product-grid",
    componentType: "product-card",
    name: "商品宫格",
    group: "商城模块",
    description: "商城页商品推荐宫格。",
    defaultConfig: {
      title: "商品推荐",
      layout: "grid",
      columns: 2,
      radiusPreset: "md",
      spacingPreset: "standard",
      items: [{ id: "mall-product-1", label: "服务商品", subtitle: "点击查看", linkType: "product", link: "" }]
    },
    fields: GRID_FIELDS,
    designTokens: { ...GRID_TOKENS, columns: 2 },
    parityRules: GRID_PARITY_RULES
  }),
  moduleDefinition({
    type: "product-card",
    componentType: "product-card",
    name: "商品卡片",
    group: "商城模块",
    description: "商品封面、价格和操作按钮卡片。",
    defaultConfig: { title: "商品", layout: "card", radiusPreset: "md", spacingPreset: "standard", buttonStyle: "primary" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "cart-item",
    componentType: "cart-item",
    name: "购物车条目",
    group: "商城模块",
    description: "购物车商品条目卡片。",
    defaultConfig: { title: "购物车商品", layout: "card", radiusPreset: "md", spacingPreset: "compact" },
    fields: CARD_FIELDS,
    designTokens: { ...CARD_TOKENS, spacingPreset: "compact" },
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "home-member-card",
    componentType: "member-benefit-card",
    name: "会员卡片",
    group: "会员模块",
    description: "会员中心入口、权益宣传或登录欢迎。",
    defaultConfig: {
      title: "会员权益",
      subtitle: "专属价格与活动提醒",
      description: "完善资料后可查看会员权益和专属服务。",
      buttonText: "进入会员中心",
      buttonStyle: "primary",
      radiusPreset: "md",
      spacingPreset: "standard",
      linkType: "page",
      link: "member-center"
    },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "member-profile-card",
    componentType: "member-profile-card",
    name: "会员资料卡",
    group: "会员模块",
    description: "头像、昵称、手机号和会员状态。",
    defaultConfig: { title: "会员资料", layout: "card", radiusPreset: "md", spacingPreset: "standard", buttonText: "完善资料" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "member-benefit-card",
    componentType: "member-benefit-card",
    name: "会员权益卡",
    group: "会员模块",
    description: "会员权益、等级和专属服务卡片。",
    defaultConfig: { title: "会员权益", layout: "card", radiusPreset: "md", spacingPreset: "standard" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "order-card",
    componentType: "order-card",
    name: "订单卡片",
    group: "会员模块",
    description: "报名订单和商城订单状态卡片。",
    defaultConfig: { title: "我的订单", layout: "card", radiusPreset: "md", spacingPreset: "standard" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "conference-detail-info",
    componentType: "conference-card",
    name: "会议信息",
    group: "会议模块",
    description: "会议详情页的信息摘要区。",
    defaultConfig: { title: "会议信息", description: "时间、地点、议程和参会须知。", layout: "card", radiusPreset: "md", spacingPreset: "standard" },
    fields: CARD_FIELDS,
    designTokens: CARD_TOKENS,
    parityRules: CARD_PARITY_RULES
  }),
  moduleDefinition({
    type: "conference-register-form",
    componentType: "invoice-form",
    name: "报名引导",
    group: "会议模块",
    description: "报名页或详情页的行动按钮。",
    defaultConfig: { title: "立即报名", description: "选择票种并填写报名信息。", buttonText: "去报名", linkType: "registration", link: "", radiusPreset: "md", spacingPreset: "standard" },
    fields: FORM_FIELDS,
    designTokens: DEFAULT_TOKENS,
    parityRules: FORM_PARITY_RULES
  }),
  moduleDefinition({
    type: "invoice-form",
    componentType: "invoice-form",
    name: "发票申请表单",
    group: "会员模块",
    description: "发票抬头和联系方式表单协议。",
    defaultConfig: { title: "发票申请", description: "填写发票抬头和收票邮箱。", buttonText: "提交申请", radiusPreset: "md", spacingPreset: "standard" },
    fields: FORM_FIELDS,
    designTokens: DEFAULT_TOKENS,
    parityRules: FORM_PARITY_RULES
  }),
  moduleDefinition({
    type: "aftersale-form",
    componentType: "aftersale-form",
    name: "售后申请表单",
    group: "商城模块",
    description: "售后原因和凭证上传表单协议。",
    defaultConfig: { title: "售后申请", description: "选择售后类型并提交说明。", buttonText: "提交售后", radiusPreset: "md", spacingPreset: "standard" },
    fields: FORM_FIELDS,
    designTokens: DEFAULT_TOKENS,
    parityRules: FORM_PARITY_RULES
  })
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

const VISUAL_COMPONENT_MODULE_MAP: Record<string, BusinessModuleType> = {
  "hero-banner": "home-hero",
  hero: "image-banner",
  carousel: "image-banner",
  "quick-icon-grid": "quick-icon-grid",
  "service-shortcut-card": "quick-icon-grid",
  "rich-content-block": "rich-text",
  "rich-text": "rich-text",
  "safe-html": "rich-text",
  "event-card-carousel": "event-card-carousel",
  "conference-list": "conference-card",
  "conference-schedule": "conference-card",
  "conference-tabs": "conference-card",
  "mall-product-grid": "product-card",
  "image-promo-card": "product-card",
  "login-card": "member-profile-card",
  "user-profile-card": "member-profile-card",
  "membership-benefits": "member-benefit-card",
  "member-promo-banner": "member-benefit-card",
  "my-order-list": "order-card",
  "registration-button": "conference-register-form",
  "floating-registration-button": "conference-register-form"
};

export function getBusinessModuleTypeForVisualComponent(type: string): BusinessModuleType | null {
  return VISUAL_COMPONENT_MODULE_MAP[type] ?? null;
}

export function getModuleRenderContract(type: BusinessModuleType, platform: RendererPlatform): ModuleRenderContract {
  const definition = getBusinessModuleDefinition(type);
  const adapter = platform === "adminPreview" ? definition.adminPreviewAdapter : platform === "h5" ? definition.h5Adapter : definition.miniappAdapter;
  return {
    type,
    adapter,
    designTokens: definition.designTokens,
    parityRules: definition.parityRules,
    configSchema: definition.configSchema
  };
}

export function getModuleRenderContractForVisualComponent(type: string, platform: RendererPlatform): ModuleRenderContract | null {
  const moduleType = getBusinessModuleTypeForVisualComponent(type);
  return moduleType ? getModuleRenderContract(moduleType, platform) : null;
}

function normalizeConfig(value: Record<string, unknown>): BusinessModuleConfig {
  return {
    ...(typeof value.title === "string" ? { title: value.title } : {}),
    ...(typeof value.subtitle === "string" ? { subtitle: value.subtitle } : {}),
    ...(typeof value.description === "string" ? { description: value.description } : {}),
    ...(typeof value.imageUrl === "string" ? { imageUrl: value.imageUrl } : {}),
    ...(isImageMode(value.imageMode) ? { imageMode: value.imageMode } : {}),
    ...(isImageRatio(value.imageRatio) ? { imageRatio: value.imageRatio } : {}),
    ...(typeof value.showTitle === "boolean" ? { showTitle: value.showTitle } : {}),
    ...(typeof value.showDescription === "boolean" ? { showDescription: value.showDescription } : {}),
    ...(typeof value.showOverlay === "boolean" ? { showOverlay: value.showOverlay } : {}),
    ...(typeof value.imageOnly === "boolean" ? { imageOnly: value.imageOnly } : {}),
    ...(typeof value.buttonText === "string" ? { buttonText: value.buttonText } : {}),
    ...(value.layout === "grid" || value.layout === "list" || value.layout === "card" ? { layout: value.layout } : {}),
    ...(Number.isFinite(Number(value.columns)) ? { columns: Number(value.columns) } : {}),
    ...(isIconSize(value.iconSize) ? { iconSize: value.iconSize } : {}),
    ...(isRadiusPreset(value.radiusPreset) ? { radiusPreset: value.radiusPreset } : {}),
    ...(isSpacingPreset(value.spacingPreset) ? { spacingPreset: value.spacingPreset } : {}),
    ...(value.colorMode === "theme" || value.colorMode === "custom" ? { colorMode: value.colorMode } : {}),
    ...(value.buttonStyle === "primary" || value.buttonStyle === "secondary" || value.buttonStyle === "text" ? { buttonStyle: value.buttonStyle } : {}),
    ...(value.cardStyle === "soft" || value.cardStyle === "outline" || value.cardStyle === "plain" ? { cardStyle: value.cardStyle } : {}),
    ...(typeof value.enabled === "boolean" ? { enabled: value.enabled } : {}),
    ...(isLinkType(value.linkType) ? { linkType: value.linkType } : {}),
    ...(typeof value.link === "string" ? { link: value.link } : {}),
    ...(Array.isArray(value.items) ? { items: value.items.map((item, index) => normalizeItem(item, index)).filter((item): item is BusinessModuleItem => Boolean(item)) } : {})
  };
}

function isImageMode(value: unknown): value is BusinessModuleConfig["imageMode"] {
  return value === "scaleToFill" || value === "contain" || value === "aspectFill" || value === "widthFix";
}

function isImageRatio(value: unknown): value is BusinessModuleConfig["imageRatio"] {
  return value === "16:9" || value === "4:3" || value === "1:1" || value === "3:4";
}

function isIconSize(value: unknown): value is BusinessModuleConfig["iconSize"] {
  return value === "small" || value === "large" || value === "xlarge";
}

function isRadiusPreset(value: unknown): value is BusinessModuleConfig["radiusPreset"] {
  return value === "sm" || value === "md" || value === "lg";
}

function isSpacingPreset(value: unknown): value is BusinessModuleConfig["spacingPreset"] {
  return value === "compact" || value === "standard" || value === "relaxed";
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
