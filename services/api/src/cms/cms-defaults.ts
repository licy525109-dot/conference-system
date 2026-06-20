import { Prisma } from "@prisma/client";

export const DEFAULT_THEME_CONFIG = {
  visualPreset: "business-blue",
  primaryColor: "#315d7d",
  secondaryColor: "#3a8f79",
  accentColor: "#b58b47",
  backgroundColor: "#f5f7f6",
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
  backgroundGradientFrom: "#fbfcfb",
  backgroundGradientTo: "#edf3f0",
  backgroundImageUrl: "",
  backgroundVideoUrl: "",
  backgroundVideoPosterUrl: "",
  backgroundVideoOverlayMode: "light",
  backgroundVideoOverlayOpacity: 0.08,
  backgroundDynamicDensity: 40,
  backgroundDynamicSpeed: 30,
  backgroundDynamicPattern: "flow",
  backgroundBottomFilter: true,
  splashEnabled: false,
  splashVideoUrl: "",
  splashPosterUrl: "",
  splashCountdownSeconds: 5,
  splashAllowSkip: true,
  splashSkipText: "跳过",
  splashFrequency: "daily",
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
  preset("hero", "主视觉横幅", "基础展示", "页面顶部沉浸式横幅", {
    kicker: "会议报名",
    title: "选择会议，完成报名缴费",
    description: "展示会议定位、关键信息和报名入口，适合作为页面第一屏。",
    buttonText: "立即报名",
    showContent: true,
    showOverlay: true,
    showButton: true,
    imageUrl: "",
    imageOnly: false,
    height: 430,
    imageMode: "scaleToFill",
    fullBleed: true
  }),
  preset("carousel", "轮播图", "基础展示", "多张图片轮播", {
    images: [],
    height: 320,
    imageMode: "scaleToFill",
    fullBleed: true,
    autoplay: true,
    indicatorDots: true
  }),
  preset("conference-list", "会议卡片列表", "会议", "展示可报名会议列表", {
    title: "可报名会议",
    limit: 10,
    showSummary: true,
    showTime: true,
    showLocation: true,
    showRegistrationCount: true,
    detailButtonText: "查看详情",
    cardImageMode: "scaleToFill",
    cardImageLayout: "left",
    cardRadius: 14
  }),
  preset("conference-tabs", "会议分类切换", "会议", "会议分类切换入口", { title: "会议分类", tabs: ["全部", "主论坛", "闭门会", "训练营"], limit: 6 }),
  preset("speaker-cards", "嘉宾卡片", "内容", "展示嘉宾头像和简介", {
    title: "嘉宾阵容",
    speakers: ["行业专家｜主题分享｜趋势观察与案例拆解", "会务主持人｜圆桌引导｜现场互动与答疑"]
  }),
  preset("schedule-timeline", "日程时间轴", "内容", "会议日程列表", {
    title: "会议日程",
    items: ["09:30｜签到入场｜资料领取与会场导览", "10:00｜主题分享｜行业趋势和案例复盘", "14:00｜圆桌交流｜现场答疑与合作连接"]
  }),
  preset("registration-button", "报名按钮", "报名", "普通报名入口", { text: "立即报名" }),
  preset("floating-registration-button", "悬浮报名按钮", "报名", "页面底部固定报名入口", { text: "立即报名" }),
  preset("coupon-card", "优惠券领取卡片", "营销", "展示优惠券信息", { title: "优惠券", description: "领取后报名可用", buttonText: "立即领取", couponCampaignId: "", claimCode: "" }),
  preset("promotion-bar", "满减活动提示条", "营销", "展示满减活动", { text: "满减活动进行中" }),
  preset("rich-text", "图文富文本", "内容", "安全富文本内容", { html: "<p>请输入内容</p>" }),
  preset("safe-html", "安全图文片段", "内容", "白名单图文内容，不执行脚本", { html: "<p>请输入内容</p>" }),
  preset("image-grid", "图片宫格", "媒体", "多图片展示", { images: [] }),
  preset("video", "视频组件", "媒体", "视频播放入口", { title: "视频", url: "", coverUrl: "" }),
  preset("countdown", "倒计时", "内容", "活动倒计时", { title: "距离开始", targetAt: "", endedText: "活动已开始" }),
  preset("notice", "公告栏", "内容", "滚动或静态公告", { text: "报名开放中" }),
  preset("search", "搜索框", "工具", "会议搜索入口", { title: "搜索会议", placeholder: "输入会议关键词", buttonText: "搜索", target: "conference-list", searchScope: "conference" }),
  preset("map-contact", "地图与联系信息", "内容", "地点与联系方式", { title: "会场与联系", contactName: "会务组", address: "", phone: "", mapUrl: "" }),
  preset("sponsor-wall", "赞助商 Logo 墙", "内容", "赞助商展示", { title: "合作伙伴", sponsors: [] }),
  preset("faq", "常见问答", "内容", "常见问题", { title: "常见问题", items: [] }),
  preset("stats-grid", "数字亮点", "运营转化", "展示报名人数、嘉宾数量、席位等核心数字", { title: "会议亮点", items: ["500+ 参会席位", "30+ 行业嘉宾", "12 场主题分享"] }),
  preset("ticket-price-list", "票种价格", "报名", "展示门票规格和价格说明", { title: "报名票种", items: ["早鸟票 ¥299", "标准票 ¥399", "团体票 请联系主办方"] }),
  preset("process-steps", "报名流程", "报名", "展示报名、支付、参会流程", { title: "报名流程", items: ["选择会议和票种", "填写报名信息", "完成支付", "现场签到参会"] }),
  preset("text-image", "图文介绍", "内容", "左文右图或上图下文介绍模块", { title: "大会介绍", text: "聚焦行业趋势、案例实践和高质量连接。", imageUrl: "" }),
  preset("download-list", "资料下载", "内容", "展示会议资料、议程文件、招商资料", { title: "资料下载", items: ["会议议程", "参会指南", "招商手册"] }),
  preset("live-card", "直播入口", "媒体", "展示直播或回放入口", { title: "线上直播", platform: "", startAt: "", endAt: "", text: "无法到场也可预约线上观看", url: "", coverUrl: "", buttonText: "打开直播" }),
  preset("testimonial-list", "参会评价", "内容", "展示往届参会反馈", { title: "参会评价", items: ["内容扎实，嘉宾质量很高", "现场组织流畅，交流效率高"] }),
  preset("traffic-guide", "交通指南", "内容", "展示交通路线和停车说明", { title: "交通指南", address: "请填写会议地址", mapUrl: "", phone: "", text: "建议提前 30 分钟到场签到。" }),
  preset("contact-card", "客服咨询", "转化工具", "展示联系人、电话和咨询入口", { title: "咨询报名", phone: "请填写联系电话", text: "如需团体报名，请联系会务组。" }),
  preset("tag-filter", "快捷标签", "工具", "展示页面快捷筛选标签", { title: "热门主题", items: ["行业趋势", "增长实战", "技术创新", "组织管理"] }),
  preset("membership-benefits", "会员权益卡", "会员", "展示会员权益和会员中心入口", { title: "会员权益", items: ["会员专属权益", "会员价规则以后台配置为准"] }),
  preset("user-profile-card", "用户资料卡", "用户中心", "展示用户资料入口", { title: "我的资料", description: "登录后查看头像、昵称、手机号和会员状态。" }),
  preset("my-order-list", "我的订单列表", "用户中心", "展示报名和商城订单入口", { title: "我的订单" }),
  preset("mall-product-grid", "商城商品宫格", "商城", "展示商城商品入口", { title: "商城商品", items: ["会议资料包", "会务周边"] }),
  preset("title", "标题栏", "基础展示", "分区标题", { text: "标题" }),
  preset("divider", "分割线", "基础展示", "内容分割", { style: "solid" }),
  preset("spacer", "留白", "基础展示", "页面留白", { height: 24 })
] as const;

export const RESERVED_COMPONENT_PRESETS = [] as const;

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
          cardImageMode: "scaleToFill",
          cardImageLayout: "left"
        }
      }
    ];
  }

  if (pageKey === "conference-detail") {
    return [
      { id: "hero-default", type: "hero", enabled: true, config: { imageUrl: "", imageMode: "scaleToFill", height: 430, showContent: true, showOverlay: true } },
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
      visualPreset: "business-blue",
      templateMeta: {
        category: "会议主会场",
        summary: "适合会议首页、活动主会场和报名导流页。"
      }
    },
    components: [
      { id: "launch-hero", type: "hero", enabled: true, config: { kicker: "峰会报名", title: "高质量会议报名入口", description: "集中展示会议价值、报名场次和关键信息，让用户快速完成报名决策。", buttonText: "立即报名", fullBleed: true } },
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
          cardImageMode: "scaleToFill",
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
      visualPreset: "fresh-green",
      templateMeta: {
        category: "嘉宾议程",
        summary: "适合大会详情页、专题会场页和分论坛介绍页。"
      }
    },
    components: [
      { id: "agenda-hero", type: "hero", enabled: true, config: { kicker: "嘉宾议程", title: "从嘉宾到议程，一屏看清会议价值", description: "突出嘉宾阵容、议程安排和会务联络，适合会议详情和专题分会场。", buttonText: "查看报名", fullBleed: true } },
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
      visualPreset: "education-vitality",
      templateMeta: {
        category: "内容导览",
        summary: "适合资讯首页、专题合集页和导览型活动页。"
      }
    },
    components: [
      { id: "editorial-hero", type: "hero", enabled: true, config: { kicker: "内容导览", title: "把会议内容组织成清晰入口", description: "适合资讯型首页、专题合集页和多分会场导览。", buttonText: "浏览内容", fullBleed: true } },
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
          cardImageMode: "scaleToFill",
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
  },
  {
    pageKey: "template:premium-conference-home",
    title: "高转化会议首页模板",
    description: "完整首页结构，覆盖主视觉、亮点、会议列表、票种、流程和咨询。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "business-blue",
      backgroundColor: "#f3f7ff",
      cardBackground: "#ffffff",
      primaryColor: "#1f5fff",
      secondaryColor: "#12b8a6",
      accentColor: "#f59e0b",
      templateMeta: {
        category: "会议首页",
        summary: "适合正式会议首页，信息完整、报名转化明确。"
      },
      pageMeta: {
        pageTitle: "会议报名",
        shareTitle: "会议报名通道已开启"
      }
    },
    components: [
      { id: "premium-notice", type: "notice", enabled: true, config: { text: "限时开放报名，完成缴费后系统自动生成参会记录。" } },
      { id: "premium-title", type: "title", enabled: true, config: { text: "选择会议，完成报名缴费", fontSize: 34, textAlign: "center" } },
      {
        id: "premium-stats",
        type: "stats-grid",
        enabled: true,
        config: { title: "活动亮点", items: ["500+ 参会席位", "30+ 行业嘉宾", "8 场闭门交流"] }
      },
      {
        id: "premium-list",
        type: "conference-list",
        enabled: true,
        config: {
          title: "可报名会议",
          limit: 6,
          showSummary: true,
          showTime: true,
          showLocation: true,
          showRegistrationCount: true,
          registrationCountMode: "actual-plus-virtual",
          virtualRegistrationBase: 86,
          virtualRegistrationStep: 18,
          detailButtonText: "查看详情",
          cardImageMode: "scaleToFill",
          cardImageLayout: "left",
          cardPadding: 24,
          cardGap: 18,
          cardRadius: 10
        }
      },
      { id: "premium-price", type: "ticket-price-list", enabled: true, config: { title: "报名票种", items: ["标准参会票｜以详情页实时价格为准", "团体报名｜联系会务组确认席位", "闭门会名额｜审核通过后参与"] } },
      { id: "premium-steps", type: "process-steps", enabled: true, config: { title: "报名流程", items: ["选择会议与票种", "填写报名信息", "确认订单并支付", "查看我的报名"] } },
      { id: "premium-contact", type: "contact-card", enabled: true, config: { title: "会务咨询", phone: "请填写联系电话", text: "团体报名、商务合作或特殊参会需求，可联系会务组处理。" } }
    ]
  },
  {
    pageKey: "template:closed-door-salon",
    title: "闭门会转化模板",
    description: "适合小规模高端沙龙、闭门圆桌和定向邀请报名。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "fresh-green",
      backgroundColor: "#f7f3ea",
      cardBackground: "#fffaf0",
      primaryColor: "#9a6b2f",
      secondaryColor: "#1f4ba7",
      accentColor: "#d9a441",
      templateMeta: {
        category: "闭门沙龙",
        summary: "强调席位稀缺、嘉宾可信度和报名转化。"
      },
      pageMeta: {
        pageTitle: "闭门会报名",
        shareTitle: "闭门会席位开放申请"
      }
    },
    components: [
      { id: "salon-notice", type: "promotion-bar", enabled: true, config: { text: "定向席位有限，报名成功后请以系统记录为准。" } },
      { id: "salon-title", type: "title", enabled: true, config: { text: "行业决策人闭门会", fontSize: 36, textAlign: "center", textColor: "#2d2415" } },
      { id: "salon-text", type: "text-image", enabled: true, config: { title: "为什么值得参加", text: "围绕关键议题、真实案例和同业交流，帮助参会者建立高质量连接。", imageUrl: "" } },
      { id: "salon-speakers", type: "speaker-cards", enabled: true, config: { title: "拟邀嘉宾", speakers: ["行业观察员｜趋势分享｜拆解年度机会", "企业增长负责人｜案例复盘｜分享实战路径", "会务主持人｜圆桌引导｜促进深度交流"] } },
      { id: "salon-agenda", type: "schedule-timeline", enabled: true, config: { title: "闭门流程", items: ["14:00｜签到入场｜身份确认与资料领取", "14:30｜主题分享｜趋势观察与案例拆解", "15:40｜圆桌讨论｜问题共创与答疑", "17:00｜自由交流｜建立合作连接"] } },
      { id: "salon-list", type: "conference-list", enabled: true, config: { title: "可申请场次", limit: 3, showSummary: true, showTime: true, showLocation: true, detailButtonText: "申请席位", cardImageMode: "scaleToFill", cardImageLayout: "full", cardImageHeight: 190 } },
      { id: "salon-faq", type: "faq", enabled: true, config: { title: "常见问题", items: ["报名后是否立即确认｜请以支付状态和我的报名记录为准", "是否支持团体参加｜可联系会务组确认席位", "现场需要携带什么｜请携带报名记录和有效证件"] } }
    ]
  },
  {
    pageKey: "template:speaker-detail",
    title: "嘉宾议程详情模板",
    description: "用于会议详情页或专题页，突出嘉宾、日程、交通和咨询。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "fresh-green",
      backgroundColor: "#f4f8fb",
      cardBackground: "#ffffff",
      primaryColor: "#0f766e",
      secondaryColor: "#2563eb",
      accentColor: "#fb7185",
      templateMeta: {
        category: "会议详情",
        summary: "适合详情页，内容全面、层次清楚。"
      },
      pageMeta: {
        pageTitle: "会议详情",
        shareTitle: "查看会议详情与报名安排"
      }
    },
    components: [
      { id: "detail-intro", type: "text-image", enabled: true, config: { title: "大会介绍", text: "聚焦趋势、案例、资源连接和落地方法，让参会者快速判断是否报名。", imageUrl: "" } },
      { id: "detail-speakers", type: "speaker-cards", enabled: true, config: { title: "嘉宾阵容", speakers: ["李老师｜主论坛嘉宾｜增长策略与组织实践", "王老师｜圆桌嘉宾｜AI 场景落地经验", "赵老师｜主持人｜议程串联与现场互动"] } },
      { id: "detail-schedule", type: "schedule-timeline", enabled: true, config: { title: "会议日程", items: ["09:00｜签到入场｜领取会议资料", "10:00｜主题演讲｜行业趋势观察", "13:30｜案例分享｜实践路径拆解", "16:00｜圆桌交流｜现场答疑与合作对接"] } },
      { id: "detail-traffic", type: "traffic-guide", enabled: true, config: { title: "交通指南", address: "请填写会议地址", text: "建议提前 30 分钟到达现场，按报名记录完成签到。" } },
      { id: "detail-contact", type: "contact-card", enabled: true, config: { title: "联系会务组", phone: "请填写联系电话", text: "报名、缴费和参会问题可联系会务组。" } }
    ]
  },
  {
    pageKey: "template:attendee-guide",
    title: "参会指南模板",
    description: "适合发布报名须知、交通、资料下载和常见问题。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "business-blue",
      backgroundColor: "#f6f8fb",
      cardBackground: "#ffffff",
      primaryColor: "#334155",
      secondaryColor: "#14b8a6",
      accentColor: "#f59e0b",
      templateMeta: {
        category: "参会指南",
        summary: "适合补充报名须知、现场说明和资料信息。"
      },
      pageMeta: {
        pageTitle: "参会指南",
        shareTitle: "参会指南与报名须知"
      }
    },
    components: [
      { id: "guide-title", type: "title", enabled: true, config: { text: "参会指南", fontSize: 34, textAlign: "center" } },
      { id: "guide-process", type: "process-steps", enabled: true, config: { title: "到场流程", items: ["打开我的报名记录", "现场核对报名信息", "领取资料和胸牌", "进入对应会场"] } },
      { id: "guide-download", type: "download-list", enabled: true, config: { title: "资料清单", items: ["会议议程", "交通指引", "参会须知", "合作手册"] } },
      { id: "guide-map", type: "traffic-guide", enabled: true, config: { title: "交通与签到", address: "请填写会议地址", text: "建议预留路程时间，签到高峰可能排队。" } },
      { id: "guide-faq", type: "faq", enabled: true, config: { title: "常见问题", items: ["支付后在哪里查看报名｜进入底部导航“我的报名”", "报名信息能否修改｜请联系会务组处理", "是否支持多人报名｜以会议详情页票种规则为准"] } }
    ]
  },
  {
    pageKey: "template:sponsor-partner",
    title: "赞助合作模板",
    description: "适合招商合作、合作伙伴展示和商务咨询。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "education-vitality",
      backgroundColor: "#f3f6ff",
      cardBackground: "#ffffff",
      primaryColor: "#4338ca",
      secondaryColor: "#06b6d4",
      accentColor: "#f97316",
      templateMeta: {
        category: "商务合作",
        summary: "用于赞助招商页、合作伙伴页和商务咨询页。"
      },
      pageMeta: {
        pageTitle: "赞助合作",
        shareTitle: "会议赞助与商务合作"
      }
    },
    components: [
      { id: "sponsor-title", type: "title", enabled: true, config: { text: "赞助合作与品牌曝光", fontSize: 34, textAlign: "center" } },
      { id: "sponsor-stats", type: "stats-grid", enabled: true, config: { title: "合作价值", items: ["精准行业人群", "现场品牌曝光", "会后线索沉淀"] } },
      { id: "sponsor-wall", type: "sponsor-wall", enabled: true, config: { title: "合作伙伴", sponsors: ["主办单位", "平台协同", "生态伙伴", "媒体支持"] } },
      { id: "sponsor-text", type: "text-image", enabled: true, config: { title: "合作形式", text: "支持会场冠名、展位展示、资料入袋、专场分享和定向邀约等合作方式。", imageUrl: "" } },
      { id: "sponsor-download", type: "download-list", enabled: true, config: { title: "合作资料", items: ["赞助方案", "会场资源", "往届案例"] } },
      { id: "sponsor-contact", type: "contact-card", enabled: true, config: { title: "商务咨询", phone: "请填写联系电话", text: "欢迎联系会务组获取合作方案。" } }
    ]
  },
  {
    pageKey: "template:expo-recruitment",
    title: "展会招商模板",
    description: "用于展会招商、展位报名和合作招募，强调资源、权益和咨询转化。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "summit-red",
      backgroundColor: "#fff8f3",
      cardBackground: "#ffffff",
      primaryColor: "#b4232a",
      secondaryColor: "#c78b37",
      accentColor: "#d8582f",
      templateMeta: {
        category: "招商展会",
        summary: "适合招商合作、展位招募和商务资源发布。"
      },
      pageMeta: {
        pageTitle: "展会招商",
        shareTitle: "展会招商与报名通道"
      }
    },
    components: [
      { id: "expo-hero", type: "hero", enabled: true, config: { kicker: "展会招商", title: "链接精准人群，释放品牌增长机会", description: "展示参展权益、合作资源和报名入口，适合招商会与展会合作页。", buttonText: "咨询合作", fullBleed: true } },
      { id: "expo-stats", type: "stats-grid", enabled: true, config: { title: "招商价值", items: ["精准客群触达", "现场展位曝光", "会后线索沉淀"] } },
      { id: "expo-process", type: "process-steps", enabled: true, config: { title: "合作流程", items: ["提交合作意向", "会务组确认资源", "完成订单支付", "获取展位与物料安排"] } },
      { id: "expo-download", type: "download-list", enabled: true, config: { title: "招商资料", items: ["招商手册", "展位示意", "参展须知", "品牌权益清单"] } },
      { id: "expo-sponsor", type: "sponsor-wall", enabled: true, config: { title: "合作伙伴", sponsors: ["主办单位", "承办单位", "生态伙伴", "媒体支持"] } },
      { id: "expo-contact", type: "contact-card", enabled: true, config: { title: "招商咨询", phone: "请填写联系电话", text: "商务合作、展位资源和招商权益，请联系会务组确认。" } }
    ]
  },
  {
    pageKey: "template:product-launch",
    title: "新品发布模板",
    description: "用于产品发布、路线图说明和报名预约，视觉更现代、转化更直接。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "tech-black-gold",
      backgroundColor: "#090b10",
      cardBackground: "#111722",
      primaryColor: "#d6b56d",
      secondaryColor: "#6ca8ff",
      accentColor: "#b88cff",
      templateMeta: {
        category: "产品发布",
        summary: "适合新品发布会、技术发布和路线图公开活动。"
      },
      pageMeta: {
        pageTitle: "新品发布会",
        shareTitle: "新品发布会报名预约"
      }
    },
    components: [
      { id: "launch-hero", type: "hero", enabled: true, config: { kicker: "新品发布", title: "见证下一阶段的产品能力", description: "适合发布产品亮点、演示安排、参会福利和报名预约。", buttonText: "预约参会", fullBleed: true } },
      { id: "launch-countdown", type: "countdown", enabled: true, config: { title: "发布倒计时", targetAt: "" } },
      { id: "launch-text", type: "text-image", enabled: true, config: { title: "发布亮点", text: "围绕产品价值、关键能力和真实场景，帮助参会者快速理解发布会重点。", imageUrl: "" } },
      { id: "launch-agenda", type: "schedule-timeline", enabled: true, config: { title: "发布议程", items: ["14:00｜开场致辞｜发布主题介绍", "14:30｜产品演示｜核心能力与场景", "15:30｜客户案例｜实践反馈与答疑", "16:20｜报名交流｜现场咨询与预约"] } },
      { id: "launch-list", type: "conference-list", enabled: true, config: { title: "可预约场次", limit: 4, showSummary: true, showTime: true, showLocation: true, detailButtonText: "预约详情", cardImageMode: "scaleToFill", cardImageLayout: "full", cardImageHeight: 220 } }
    ]
  },
  {
    pageKey: "template:brand-annual-meeting",
    title: "品牌年会模板",
    description: "用于品牌大会、年度论坛和客户答谢会，结构覆盖亮点、议程、嘉宾和报名。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "business-blue",
      backgroundColor: "#f4f7fb",
      cardBackground: "#ffffff",
      primaryColor: "#1f4d7a",
      secondaryColor: "#4d8dd9",
      accentColor: "#c7923e",
      templateMeta: {
        category: "品牌大会",
        summary: "适合年度大会、客户答谢会和行业品牌活动。"
      },
      pageMeta: {
        pageTitle: "品牌年会",
        shareTitle: "品牌年会报名开启"
      }
    },
    components: [
      { id: "annual-hero", type: "hero", enabled: true, config: { kicker: "年度大会", title: "共赴年度相聚，沉淀合作与增长", description: "适合展示品牌主张、年度议程、嘉宾阵容和参会报名入口。", buttonText: "立即报名", fullBleed: true } },
      { id: "annual-stats", type: "stats-grid", enabled: true, config: { title: "大会规模", items: ["800+ 参会嘉宾", "40+ 合作伙伴", "12 场主题议程"] } },
      { id: "annual-speakers", type: "speaker-cards", enabled: true, config: { title: "年度嘉宾", speakers: ["品牌负责人｜年度分享｜战略与产品方向", "客户代表｜案例分享｜合作成果复盘", "行业嘉宾｜趋势观察｜生态共建机会"] } },
      { id: "annual-schedule", type: "schedule-timeline", enabled: true, config: { title: "年会议程", items: ["13:30｜签到入场｜嘉宾接待", "14:00｜年度主题｜品牌与业务复盘", "15:20｜案例分享｜客户与伙伴共创", "17:30｜交流晚宴｜自由交流与答谢"] } },
      { id: "annual-list", type: "conference-list", enabled: true, config: { title: "报名入口", limit: 3, showSummary: true, showTime: true, showLocation: true, detailButtonText: "报名参会", cardImageMode: "scaleToFill", cardImageLayout: "left" } }
    ]
  },
  {
    pageKey: "template:online-summit",
    title: "线上峰会模板",
    description: "用于直播峰会、线上课程和混合参会，突出直播入口、日程和提醒。",
    pageType: "SYSTEM_TEMPLATE",
    themeJson: {
      visualPreset: "education-vitality",
      backgroundColor: "#f7faff",
      cardBackground: "#ffffff",
      primaryColor: "#3b82f6",
      secondaryColor: "#22c55e",
      accentColor: "#f59e0b",
      templateMeta: {
        category: "线上峰会",
        summary: "适合线上直播、课程活动和混合参会页面。"
      },
      pageMeta: {
        pageTitle: "线上峰会",
        shareTitle: "线上峰会报名预约"
      }
    },
    components: [
      { id: "online-hero", type: "hero", enabled: true, config: { kicker: "线上峰会", title: "线上预约，准时加入直播议程", description: "清晰展示直播安排、报名入口和资料获取方式。", buttonText: "预约直播", fullBleed: true } },
      { id: "online-live", type: "live-card", enabled: true, config: { title: "直播入口", text: "报名成功后，可在我的报名中查看参会记录和直播提醒。", url: "" } },
      { id: "online-tabs", type: "conference-tabs", enabled: true, config: { title: "直播场次", tabs: ["全部", "主会场", "训练营", "回放"], limit: 5, showSummary: true, showTime: true, showLocation: false, detailButtonText: "查看场次", cardImageMode: "scaleToFill" } },
      { id: "online-download", type: "download-list", enabled: true, config: { title: "学习资料", items: ["直播议程", "课件资料", "报名须知", "回放说明"] } },
      { id: "online-faq", type: "faq", enabled: true, config: { title: "线上参会问题", items: ["如何观看直播｜报名成功后查看我的报名记录", "是否提供回放｜以主办方后续发布为准", "资料在哪里领取｜请关注页面资料下载区"] } }
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
