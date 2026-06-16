import { Prisma } from "@prisma/client";

export const DEFAULT_THEME_CONFIG = {
  primaryColor: "#2452a8",
  secondaryColor: "#14b8a6",
  accentColor: "#f59e0b",
  backgroundColor: "#f5f7fb",
  cardBackground: "#ffffff",
  radius: 8,
  buttonStyle: "solid",
  shadow: "soft",
  titleFontSize: 42,
  bannerStyle: "clean",
  adminBrandTitle: "会务运营平台",
  adminBrandSubtitle: "报名、支付与页面配置中心",
  adminBrandLogoUrl: "",
  browserTitle: "会务运营平台",
  browserIconUrl: "",
  backgroundMode: "solid",
  backgroundGradientFrom: "#f5f7fb",
  backgroundGradientTo: "#eef7f5",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 18,
  backgroundBottomFilter: true,
  backgroundApplyTo: "body",
  themeApplyMode: "all",
  themeApplyPageKeys: [] as string[]
} satisfies Prisma.InputJsonObject;

export const DEFAULT_TABBAR_ITEMS = [
  {
    title: "首页",
    pageKey: "home",
    path: "/pages/index/index",
    visible: true,
    sortOrder: 0,
    requireLogin: false
  },
  {
    title: "我的报名",
    pageKey: "my-registrations",
    path: "/pages/registrations/my",
    visible: true,
    sortOrder: 10,
    requireLogin: true
  },
  {
    title: "购物车",
    pageKey: "cart",
    path: "/pages/cart/index",
    visible: false,
    sortOrder: 20,
    requireLogin: true
  },
  {
    title: "会员",
    pageKey: "member-center",
    path: "/pages/member/center",
    visible: false,
    sortOrder: 30,
    requireLogin: true
  },
  {
    title: "商城",
    pageKey: "mall",
    path: "/pages/mall/index",
    visible: false,
    sortOrder: 40,
    requireLogin: false
  }
] as const;

export const ENABLED_COMPONENT_PRESETS = [
  preset("hero", "主视觉横幅", "基础展示", "页面顶部纯图片横幅", { imageUrl: "" }),
  preset("carousel", "轮播图", "基础展示", "多张图片轮播", { images: [] }),
  preset("conference-list", "会议卡片列表", "会议", "展示可报名会议列表", { title: "可报名会议", limit: 10 }),
  preset("conference-tabs", "会议分类切换", "会议", "会议分类切换入口", { tabs: ["全部"] }),
  preset("speaker-cards", "嘉宾卡片", "内容", "展示嘉宾头像和简介", { title: "嘉宾阵容", speakers: [] }),
  preset("schedule-timeline", "日程时间轴", "内容", "会议日程列表", { title: "会议日程", items: [] }),
  preset("registration-button", "报名按钮", "报名", "普通报名入口", { text: "立即报名" }),
  preset("floating-registration-button", "悬浮报名按钮", "报名", "页面底部固定报名入口", { text: "立即报名" }),
  preset("coupon-card", "优惠券领取卡片", "营销", "展示优惠券信息", { title: "优惠券", description: "领取后报名可用" }),
  preset("promotion-bar", "满减活动提示条", "营销", "展示满减活动", { text: "满减活动进行中" }),
  preset("rich-text", "图文富文本", "内容", "安全富文本内容", { html: "<p>请输入内容</p>" }),
  preset("safe-html", "安全图文片段", "内容", "白名单图文内容，不执行脚本", { html: "<p>请输入内容</p>" }),
  preset("image-grid", "图片宫格", "媒体", "多图片展示", { images: [] }),
  preset("video", "视频组件", "媒体", "视频播放入口", { title: "视频", url: "" }),
  preset("countdown", "倒计时", "内容", "活动倒计时", { title: "距离开始", targetAt: "" }),
  preset("notice", "公告栏", "内容", "滚动或静态公告", { text: "报名开放中" }),
  preset("search", "搜索框", "工具", "会议搜索入口", { placeholder: "搜索会议" }),
  preset("map-contact", "地图与联系信息", "内容", "地点与联系方式", { address: "", phone: "" }),
  preset("sponsor-wall", "赞助商 Logo 墙", "内容", "赞助商展示", { title: "合作伙伴", sponsors: [] }),
  preset("faq", "常见问答", "内容", "常见问题", { title: "常见问题", items: [] }),
  preset("stats-grid", "数字亮点", "运营转化", "展示报名人数、嘉宾数量、席位等核心数字", { title: "会议亮点", items: ["500+ 参会席位", "30+ 行业嘉宾", "12 场主题分享"] }),
  preset("ticket-price-list", "票种价格", "报名", "展示门票规格和价格说明", { title: "报名票种", items: ["早鸟票 ¥299", "标准票 ¥399", "团体票 请联系主办方"] }),
  preset("process-steps", "报名流程", "报名", "展示报名、支付、参会流程", { title: "报名流程", items: ["选择会议和票种", "填写报名信息", "完成支付", "现场签到参会"] }),
  preset("text-image", "图文介绍", "内容", "左文右图或上图下文介绍模块", { title: "大会介绍", text: "聚焦行业趋势、案例实践和高质量连接。", imageUrl: "" }),
  preset("download-list", "资料下载", "内容", "展示会议资料、议程文件、招商资料", { title: "资料下载", items: ["会议议程", "参会指南", "招商手册"] }),
  preset("live-card", "直播入口", "媒体", "展示直播或回放入口", { title: "线上直播", text: "无法到场也可预约线上观看", url: "" }),
  preset("testimonial-list", "参会评价", "内容", "展示往届参会反馈", { title: "参会评价", items: ["内容扎实，嘉宾质量很高", "现场组织流畅，交流效率高"] }),
  preset("traffic-guide", "交通指南", "内容", "展示交通路线和停车说明", { title: "交通指南", address: "请填写会议地址", text: "建议提前 30 分钟到场签到。" }),
  preset("contact-card", "客服咨询", "转化工具", "展示联系人、电话和咨询入口", { title: "咨询报名", phone: "请填写联系电话", text: "如需团体报名，请联系会务组。" }),
  preset("tag-filter", "快捷标签", "工具", "展示页面快捷筛选标签", { title: "热门主题", items: ["行业趋势", "增长实战", "技术创新", "组织管理"] }),
  preset("title", "标题栏", "基础展示", "分区标题", { text: "标题" }),
  preset("divider", "分割线", "基础展示", "内容分割", { style: "solid" }),
  preset("spacer", "留白", "基础展示", "页面留白", { height: 24 })
] as const;

export const RESERVED_COMPONENT_PRESETS = [
  preset("membership-benefits", "会员权益卡", "后续开放", "会员功能后续开放", { title: "会员权益" }, false),
  preset("user-profile-card", "用户资料卡", "后续开放", "用户中心后续增强", { title: "用户资料" }, false),
  preset("my-order-list", "我的订单列表", "后续开放", "订单中心后续开放", { title: "我的订单" }, false),
  preset("mall-product-grid", "商城商品宫格", "后续开放", "商城功能后续开放", { title: "商品推荐" }, false)
] as const;

export const ALL_COMPONENT_PRESETS = [...ENABLED_COMPONENT_PRESETS, ...RESERVED_COMPONENT_PRESETS] as const;
export const ENABLED_COMPONENT_TYPES = new Set(ENABLED_COMPONENT_PRESETS.map((item) => item.type));
export const ALL_COMPONENT_TYPES = new Set(ALL_COMPONENT_PRESETS.map((item) => item.type));

export function defaultPageComponents(pageKey: string): Prisma.InputJsonArray {
  if (pageKey === "home" || pageKey === "conference-list") {
    return [
      {
        id: "conference-list-default",
        type: "conference-list",
        enabled: true,
        config: {
          title: "可报名会议",
          limit: 10,
          showSummary: true,
          showTime: true,
          showLocation: true,
          showRegistrationCount: true,
          detailButtonText: "查看详情",
          cardImageLayout: "left"
        }
      }
    ];
  }

  if (pageKey === "conference-detail") {
    return [
      { id: "hero-default", type: "hero", enabled: true, config: { imageUrl: "" } },
      { id: "registration-button-default", type: "registration-button", enabled: true, config: { text: "立即报名" } }
    ];
  }

  return [{ id: "title-default", type: "title", enabled: true, config: { text: "自定义页面" } }];
}

export const SYSTEM_PAGE_LIBRARY_TEMPLATES = [
  {
    pageKey: "template:conference-launch",
    title: "峰会报名模板",
    description: "主会场风格，强调报名转化和会议信息呈现。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      templateMeta: {
        category: "会议主会场",
        summary: "适合会议首页、活动主会场和报名导流页。"
      }
    },
    components: [
      { id: "launch-notice", type: "notice", enabled: true, config: { text: "报名通道已开启，名额有限，建议尽早锁定席位。" } },
      {
        id: "launch-stats",
        type: "stats-grid",
        enabled: true,
        config: { title: "大会亮点", items: ["300+ 行业从业者", "20+ 嘉宾分享", "6 大报名方向"] }
      },
      {
        id: "launch-list",
        type: "conference-list",
        enabled: true,
        config: {
          title: "精选会议",
          limit: 6,
          showSummary: true,
          showTime: true,
          showLocation: true,
          showRegistrationCount: true,
          detailButtonText: "查看详情",
          cardImageLayout: "left"
        }
      }
    ]
  },
  {
    pageKey: "template:speaker-agenda",
    title: "嘉宾议程模板",
    description: "突出嘉宾阵容、议程安排和会务联络信息。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      templateMeta: {
        category: "嘉宾议程",
        summary: "适合大会详情页、专题会场页和分论坛介绍页。"
      }
    },
    components: [
      { id: "agenda-title", type: "title", enabled: true, config: { text: "会议亮点与议程安排" } },
      {
        id: "agenda-speakers",
        type: "speaker-cards",
        enabled: true,
        config: {
          title: "嘉宾阵容",
          speakers: ["主论坛嘉宾｜行业负责人｜分享增长实践", "闭门圆桌｜会务总监｜深聊组织协同"]
        }
      },
      {
        id: "agenda-timeline",
        type: "schedule-timeline",
        enabled: true,
        config: {
          title: "日程安排",
          items: ["09:30｜签到入场｜会场暖场与资料领取", "10:00｜主论坛开场｜趋势观察与案例分享", "14:00｜分论坛讨论｜圆桌交流与答疑"]
        }
      },
      {
        id: "agenda-contact",
        type: "contact-card",
        enabled: true,
        config: { title: "会务咨询", phone: "请填写联系电话", text: "需要团体报名或商务合作，可直接联系会务组。" }
      }
    ]
  },
  {
    pageKey: "template:editorial-showcase",
    title: "内容导览模板",
    description: "更适合资讯型首页，强调分类、亮点和列表阅读节奏。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      templateMeta: {
        category: "内容导览",
        summary: "适合资讯首页、专题合集页和导览型活动页。"
      }
    },
    components: [
      {
        id: "editorial-tabs",
        type: "conference-tabs",
        enabled: true,
        config: {
          title: "分会场速览",
          tabs: ["全部", "主论坛", "闭门会", "训练营"],
          limit: 4,
          showSummary: false,
          showTime: true,
          showLocation: true,
          showRegistrationCount: true,
          detailButtonText: "进入会场",
          cardImageLayout: "full"
        }
      },
      {
        id: "editorial-process",
        type: "process-steps",
        enabled: true,
        config: {
          title: "报名路径",
          items: ["挑选会场", "填写信息", "确认支付", "收到报名结果"]
        }
      },
      {
        id: "editorial-downloads",
        type: "download-list",
        enabled: true,
        config: { title: "参会资料", items: ["报名须知", "会场导览", "合作手册"] }
      }
    ]
  }
] as const;

function preset(
  type: string,
  name: string,
  group: string,
  description: string,
  defaultConfigJson: Prisma.InputJsonObject,
  enabled = true
) {
  return {
    type,
    name,
    group,
    description,
    schemaJson: {
      type: "object",
      additionalProperties: true
    },
    defaultConfigJson,
    enabled,
    system: true
  };
}
