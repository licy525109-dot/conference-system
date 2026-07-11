export interface CmsCompositionComponent {
  id: string;
  type: string;
  enabled: boolean;
  config: Record<string, unknown>;
}

export interface CmsCompositionSource {
  id: string;
  enabled: boolean;
  sortOrder: number;
  config: Record<string, unknown>;
}

export interface CmsExpandedCompositionComponent extends CmsCompositionComponent {
  sortOrder: number;
}

export interface CmsCompositionDsl {
  schemaVersion: "p9";
  page: string;
  dsl: {
    nodes: Array<{
      id: string;
      type: string;
      enabled: boolean;
      sortOrder: number;
      props: Record<string, unknown>;
      meta: Record<string, unknown>;
    }>;
  };
  meta: Record<string, unknown>;
}

export type CmsCompositionKind = "home" | "schedule" | "registration" | "member-center" | "mall" | "cart";

export function buildCmsPageComposition(kind: CmsCompositionKind, assetRoot = "/static/fixed-templates"): CmsCompositionComponent[] {
  if (kind === "home") return homeComposition(assetRoot);
  if (kind === "schedule") return scheduleComposition(assetRoot);
  if (kind === "registration") return registrationComposition(assetRoot);
  if (kind === "member-center") return memberComposition(assetRoot);
  if (kind === "mall") return mallComposition(assetRoot);
  return cartComposition();
}

export function normalizeCmsCompositionKind(value: string): CmsCompositionKind {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("schedule")) return "schedule";
  if (normalized.includes("registration") || normalized.includes("conference-list")) return "registration";
  if (normalized.includes("member")) return "member-center";
  if (normalized.includes("mall")) return "mall";
  if (normalized.includes("cart")) return "cart";
  return "home";
}

export function expandLegacyCmsTemplate(source: CmsCompositionSource): CmsExpandedCompositionComponent[] {
  const marker = readText(source.config.templateKey || source.config.kind || source.config.pageType || source.config.template);
  const assetRoot = readText(source.config.assetRoot) || "/static/fixed-templates";
  const expanded = buildCmsPageComposition(normalizeCmsCompositionKind(marker), assetRoot).map((item, index) => ({
    ...item,
    id: `${source.id}:${item.id}`,
    enabled: source.enabled && item.enabled,
    sortOrder: source.sortOrder + index / 100,
    config: { ...item.config }
  }));
  applyLegacyOverrides(source.config, expanded);
  return expanded;
}

export function buildCmsCompositionDsl(kind: CmsCompositionKind, page: string, assetRoot = "/static/fixed-templates"): CmsCompositionDsl {
  const components = buildCmsPageComposition(kind, assetRoot).map((item, index) => ({
    ...item,
    sortOrder: index
  }));
  return {
    schemaVersion: "p9",
    page,
    dsl: {
      nodes: components.map((item, index) => ({
        id: item.id,
        type: dsTypeForComposition(item.type),
        enabled: item.enabled,
        sortOrder: index * 10,
        props: { ...item.config },
        meta: {
          source: "shared-page-composition",
          originalType: item.type
        }
      }))
    },
    meta: {
      source: "shared-page-composition",
      editor: "operator-visual",
      editorComponents: components
    }
  };
}

function dsTypeForComposition(type: string): string {
  if (["hero-banner", "member-promo-banner"].includes(type)) return "ds-banner";
  if (["quick-icon-grid", "service-shortcut-card", "stats-grid", "mall-product-grid"].includes(type)) return "ds-grid";
  if (["conference-list", "conference-schedule", "conference-tabs", "event-card-carousel", "membership-benefits"].includes(type)) return "ds-list";
  if (["login-card", "notice", "promotion-bar", "user-profile-card"].includes(type)) return "ds-card";
  if (["registration-button", "floating-registration-button"].includes(type)) return "ds-button";
  return "ds-section";
}

function applyLegacyOverrides(source: Record<string, unknown>, expanded: CmsExpandedCompositionComponent[]): void {
  const heroComponent = expanded.find((item) => item.type === "hero-banner");
  if (heroComponent) {
    copyValue(source, "heroTitle", heroComponent.config, "title");
    copyValue(source, "heroSubtitle", heroComponent.config, "subtitle");
    copyValue(source, "heroImageUrl", heroComponent.config, "imageUrl");
    copyValue(source, "heroImageMode", heroComponent.config, "imageMode");
    copyValue(source, "heroShowTitle", heroComponent.config, "showTitle");
    copyValue(source, "heroShowSubtitle", heroComponent.config, "showSubtitle");
  }
  const noticeComponent = expanded.find((item) => item.type === "notice");
  if (noticeComponent) copyValue(source, "noticeText", noticeComponent.config, "text");
  const entryComponent = expanded.find((item) => item.type === "quick-icon-grid");
  if (entryComponent && Array.isArray(source.items) && source.items.length > 0) {
    entryComponent.config.items = source.items.map((item) => isRecord(item) ? { ...item } : item);
  }
}

function copyValue(source: Record<string, unknown>, sourceKey: string, target: Record<string, unknown>, targetKey: string): void {
  if (Object.prototype.hasOwnProperty.call(source, sourceKey)) target[targetKey] = source[sourceKey];
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function component(id: string, type: string, config: Record<string, unknown>): CmsCompositionComponent {
  return { id, type, enabled: true, config };
}

function entry(
  title: string,
  subtitle: string,
  builtinIcon: string,
  actionTargetType: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: `${title.toLowerCase().replace(/\s+/g, "-")}-${actionTargetType}`,
    enabled: true,
    title,
    subtitle,
    iconUrl: "",
    dynamicIconUrl: "",
    builtinIcon,
    cardStyle: "",
    backgroundColor: "",
    textColor: "",
    actionTargetType,
    ...extra
  };
}

function hero(
  id: string,
  title: string,
  subtitle: string,
  imageFile: string,
  assetRoot: string,
  config: Record<string, unknown> = {}
): CmsCompositionComponent {
  return component(id, "hero-banner", {
    title,
    subtitle,
    description: "",
    imageUrl: `${assetRoot}/heroes/${imageFile}`,
    imageMode: "aspectFill",
    imageRatio: "16:9",
    imageOnly: false,
    showTitle: true,
    showDescription: false,
    showOverlay: true,
    contentAlign: "left",
    verticalAlign: "bottom",
    backgroundColor: "#10233d",
    textColor: "#ffffff",
    height: 430,
    radius: 0,
    fullBleed: true,
    ...config
  });
}

function homeComposition(assetRoot: string): CmsCompositionComponent[] {
  return [
    hero("home-hero", "潮起谋局  潮落定势", "行业会议与创始人社群平台", "hero_home_bg.png", assetRoot, {
      buttonText: "",
      secondaryButtonText: ""
    }),
    component("home-notice", "notice", {
      text: "欢迎来到观潮会集",
      iconText: "播",
      displayStyle: "elegant",
      showIcon: true,
      textAlign: "center"
    }),
    component("home-login", "login-card", {
      logoUrl: `${assetRoot}/brand/logo_gc_mark.png`,
      title: "欢迎来到观潮会集",
      subtitle: "登录后查看会议排期、报名权益和会员信息",
      buttonText: "立即登录",
      loggedInTitle: "",
      loggedInSubtitle: "查看报名、订单、待参会和会员权益",
      loggedInButtonText: "个人中心",
      actionTargetType: "member",
      cardStyle: "elevated",
      radius: 18
    }),
    component("home-quick-entry", "quick-icon-grid", {
      title: "",
      showTitle: false,
      columns: 3,
      layoutMode: "grid",
      iconSize: "large",
      cardStyle: "outline",
      cardRadius: 18,
      cardGap: 14,
      showSubtitle: true,
      items: [
        entry("年度排期", "SCHEDULE", "calendar", "page", { iconUrl: `${assetRoot}/icons/calendar.svg`, targetPageKey: "custom:about-paiqi" }),
        entry("会议报名", "REGISTRATION", "registration", "page", { iconUrl: `${assetRoot}/icons/registration.svg`, targetPageKey: "conference-list" }),
        entry("赛道生态", "ECOSYSTEM", "team", "page", { iconUrl: `${assetRoot}/icons/user.svg`, targetPageKey: "custom:ecosystem" })
      ]
    }),
    component("home-track-guide", "promotion-bar", {
      iconText: "层",
      title: "五大增量生态 × 五大垂类赛道",
      buttonText: "查看详情",
      showArrow: true,
      actionTargetType: "page",
      targetPageKey: "custom:ecosystem",
      displayStyle: "elegant"
    }),
    component("home-stats", "stats-grid", {
      title: "观潮会集",
      subtitle: "行业会议与创始人社群平台",
      columns: 2,
      items: ["1500+｜头部创始人", "20+｜覆盖城市业态"]
    }),
    component("home-models", "quick-icon-grid", {
      title: "核心会议模型",
      showTitle: true,
      columns: 5,
      layoutMode: "scroll",
      iconSize: "small",
      cardStyle: "plain",
      cardRadius: 14,
      showSubtitle: false,
      items: [
        entry("行业论坛", "", "speaker", "page", { iconUrl: `${assetRoot}/icons/speaker.svg`, targetPageKey: "conference-list" }),
        entry("闭门会", "", "team", "page", { iconUrl: `${assetRoot}/icons/user.svg`, targetPageKey: "conference-list" }),
        entry("城市沙龙", "", "location", "page", { iconUrl: `${assetRoot}/icons/address.svg`, targetPageKey: "conference-list" }),
        entry("案例参访", "", "building", "page", { iconUrl: `${assetRoot}/icons/home.svg`, targetPageKey: "conference-list" }),
        entry("私董会", "", "user", "page", { iconUrl: `${assetRoot}/icons/user.svg`, targetPageKey: "conference-list" })
      ]
    }),
    component("home-tags", "dual-track-tags", {
      primaryTitle: "五大增量生态",
      primaryItems: ["自然", "银发", "赛事", "研学", "情绪"],
      secondaryTitle: "五大垂类赛道",
      secondaryItems: ["学前", "科创", "舞蹈", "美术", "自主学习"]
    })
  ];
}

function scheduleComposition(assetRoot: string): CmsCompositionComponent[] {
  return [
    hero("schedule-hero", "年度排期", "查看观潮会集全年会议安排", "hero_schedule_bg.png", assetRoot, { buttonText: "" }),
    component("schedule-list", "conference-schedule", {
      title: "",
      categories: ["全部", "闭门会", "论坛", "沙龙", "参访", "私董会"],
      limit: 12,
      showHeroMonths: true,
      showCalendarButton: true,
      showItemCalendarButton: false,
      calendarText: "日历",
      detailButtonText: "查看详情",
      showAppointmentButton: true,
      appointmentButtonText: "提前预约",
      contentBackgroundStyle: "transparent",
      cardImageMode: "aspectFill",
      cardStyle: "elevated"
    })
  ];
}

function registrationComposition(assetRoot: string): CmsCompositionComponent[] {
  return [
    hero("registration-hero", "会议报名", "选择感兴趣的会议，快速报名参与", "hero_registration_bg.png", assetRoot, { buttonText: "" }),
    component("registration-tabs", "conference-tabs", {
      title: "",
      tabs: ["全部", "推荐", "即将开始", "闭门会", "论坛", "沙龙", "参访"],
      limit: 10,
      showSummary: true,
      showTime: true,
      showLocation: true,
      showRegistrationCount: true,
      detailButtonText: "查看详情",
      cardImageMode: "aspectFill",
      cardImageLayout: "left",
      cardRadius: 18
    })
  ];
}

function memberComposition(assetRoot: string): CmsCompositionComponent[] {
  return [
    component("member-profile", "user-profile-card", {
      title: "个人资料",
      description: "登录后展示头像、昵称、手机号和会员等级",
      buttonText: "编辑资料",
      imageUrl: `${assetRoot}/brand/member_card_bg.png`,
      cardStyle: "brand",
      showStats: true
    }),
    component("member-stats", "stats-grid", {
      title: "",
      columns: 4,
      dataSource: "current-user",
      items: ["我的报名", "我的订单", "待参会", "优惠券"]
    }),
    component("member-benefits", "membership-benefits", {
      title: "观潮会集会员权益",
      subtitle: "尊享会员专属特权",
      buttonText: "查看权益",
      imageUrl: `${assetRoot}/brand/member_benefit_bg.png`,
      items: ["优先获取会议排期", "会员专享报名通道", "尊享活动与服务特权"]
    }),
    component("member-services", "service-shortcut-card", {
      title: "我的服务",
      columns: 2,
      layoutMode: "list",
      cardStyle: "plain",
      showSubtitle: true,
      items: [
        entry("我的会议", "报名与凭证", "calendar", "page", { iconUrl: `${assetRoot}/icons/calendar.svg`, targetPageKey: "my-registrations" }),
        entry("商城订单", "订单与物流", "order", "page", { iconUrl: `${assetRoot}/icons/order.svg`, targetPageKey: "mall-orders" }),
        entry("收货地址", "常用收货信息", "location", "page", { iconUrl: `${assetRoot}/icons/address.svg`, targetPageKey: "member-center" }),
        entry("发票信息", "抬头与开票记录", "invoice", "invoice", { iconUrl: `${assetRoot}/icons/ticket.svg` }),
        entry("客服帮助", "联系会务服务", "service", "copy", { iconUrl: `${assetRoot}/icons/service.svg`, copyText: "请联系会务组" }),
        entry("设置", "账号与个人资料", "settings", "page", { iconUrl: `${assetRoot}/icons/settings.svg`, targetPageKey: "member-center" })
      ]
    })
  ];
}

function mallComposition(assetRoot: string): CmsCompositionComponent[] {
  return [
    hero("mall-hero", "会议周边商城", "精选会议周边与品牌物料", "hero_mall_bg.png", assetRoot, { buttonText: "" }),
    component("mall-products", "mall-product-grid", {
      title: "精选商品",
      categories: ["全部", "文创周边", "办公用品", "伴手礼", "限量礼盒"],
      columns: 2,
      limit: 12,
      showPrice: true,
      showCartButton: true,
      imageRatio: "1:1",
      cardStyle: "elevated"
    })
  ];
}

function cartComposition(): CmsCompositionComponent[] {
  return [
    component("cart-notice", "notice", {
      text: "商品、优惠券和结算信息可在页面设置中控制显示与顺序",
      displayStyle: "subtle",
      showIcon: true
    }),
    component("cart-recommendations", "mall-product-grid", {
      title: "为你推荐",
      columns: 4,
      limit: 4,
      showPrice: true,
      showCartButton: true,
      layoutMode: "scroll",
      imageRatio: "1:1",
      cardStyle: "plain"
    })
  ];
}
