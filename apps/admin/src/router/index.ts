import { computed, defineAsyncComponent, ref, type Component } from "vue";

const DashboardPage = defineAsyncComponent(() => import("../pages/dashboard/index.vue"));
const ConferencesPage = defineAsyncComponent(() => import("../pages/conferences/index.vue"));
const ConferenceConfigPage = defineAsyncComponent(() => import("../pages/conferences/config.vue"));
const OrdersPage = defineAsyncComponent(() => import("../pages/orders/index.vue"));
const RegistrationsPage = defineAsyncComponent(() => import("../pages/registrations/index.vue"));
const RegistrationDetailPage = defineAsyncComponent(() => import("../pages/registrations/detail.vue"));
const CouponsPage = defineAsyncComponent(() => import("../pages/coupons/index.vue"));
const CouponCampaignsPage = defineAsyncComponent(() => import("../pages/coupon-campaigns/index.vue"));
const PromotionsPage = defineAsyncComponent(() => import("../pages/promotions/index.vue"));
const NotificationsPage = defineAsyncComponent(() => import("../pages/notifications/index.vue"));
const WecomPage = defineAsyncComponent(() => import("../pages/wecom/index.vue"));
const AiKnowledgePage = defineAsyncComponent(() => import("../pages/ai/index.vue"));
const MaterialsPage = defineAsyncComponent(() => import("../pages/materials/index.vue"));
const CmsPagesPage = defineAsyncComponent(() => import("../pages/cms/page-manager.vue"));
const CmsPageEditorPage = defineAsyncComponent(() => import("../pages/cms/pages.vue"));
const CmsTemplateLibraryPage = defineAsyncComponent(() => import("../pages/cms/template-library.vue"));
const ThemesPage = defineAsyncComponent(() => import("../pages/cms/themes.vue"));
const TabbarPage = defineAsyncComponent(() => import("../pages/cms/tabbar.vue"));
const OperationalWorkflowsPage = defineAsyncComponent(() => import("../pages/common/OperationalWorkflowsPage.vue"));
const FinancePage = defineAsyncComponent(() => import("../pages/finance/index.vue"));
const MallOrdersPage = defineAsyncComponent(() => import("../pages/mall/orders.vue"));
const MallProductsPage = defineAsyncComponent(() => import("../pages/mall/products.vue"));
const MallWorkflowsPage = defineAsyncComponent(() => import("../pages/mall/workflows.vue"));
const MemberLevelsPage = defineAsyncComponent(() => import("../pages/members/levels.vue"));
const MemberUsersPage = defineAsyncComponent(() => import("../pages/members/users.vue"));
const MemberBenefitsPage = defineAsyncComponent(() => import("../pages/members/benefits.vue"));
const MemberPricingRulesPage = defineAsyncComponent(() => import("../pages/members/pricing-rules.vue"));
const AuditLogsPage = defineAsyncComponent(() => import("../pages/system/audit-logs.vue"));
const AccountsPage = defineAsyncComponent(() => import("../pages/system/accounts.vue"));
const RolesPage = defineAsyncComponent(() => import("../pages/system/roles.vue"));
const PlatformPage = defineAsyncComponent(() => import("../pages/platform/index.vue"));

export interface AdminRoute {
  path: string;
  title: string;
  menuTitle: string;
  group: string;
  description?: string;
  badge?: "灰度" | "预留" | "后续" | "辅助" | "高级";
  permission?: string;
  component: Component;
  hidden?: boolean;
}

export const routes: AdminRoute[] = [
  { path: "/dashboard", title: "数据看板", menuTitle: "数据看板", group: "控制台", description: "核心报名、收入和订单指标", permission: "dashboard:view", component: DashboardPage },
  { path: "/conferences", title: "会议管理", menuTitle: "会议管理", group: "会议管理", description: "会议基础信息、上下架和配置入口", permission: "conference:view", component: ConferencesPage },
  {
    path: "/conferences/config",
    title: "会议配置详情",
    menuTitle: "会议配置详情",
    group: "会议管理",
    description: "票种、表单字段、优惠和页面装修",
    permission: "conference:view",
    component: ConferenceConfigPage,
    hidden: true
  },
  { path: "/registrations", title: "报名名单", menuTitle: "报名名单", group: "会议管理", description: "报名记录、参会人、备注和核销", permission: "registration:view", component: RegistrationsPage },
  { path: "/registrations/detail", title: "报名详情", menuTitle: "报名详情", group: "会议管理", description: "报名、订单、支付、表单快照和操作日志", permission: "registration:view", component: RegistrationDetailPage, hidden: true },
  { path: "/inventory-alerts", title: "库存预警", menuTitle: "库存预警", group: "会议管理", description: "会议库存阈值、扫描任务和预警日志入口。", permission: "inventory:view", component: OperationalWorkflowsPage },
  { path: "/checkin/verify", title: "签到核销", menuTitle: "签到核销", group: "会议管理", description: "工作人员扫码、客户自助和后台应急补签入口。", permission: "checkin:view", component: OperationalWorkflowsPage },
  { path: "/checkin/logs", title: "签到记录", menuTitle: "签到记录", group: "会议管理", description: "签到核销日志、方式、操作人和失败原因。", permission: "checkin:view", component: OperationalWorkflowsPage },
  { path: "/checkin/stats", title: "签到统计", menuTitle: "签到统计", group: "会议管理", description: "会议签到率、票种签到率和方式统计入口。", permission: "checkin:view", component: OperationalWorkflowsPage },
  { path: "/orders", title: "订单支付", menuTitle: "订单支付", group: "订单交易", description: "订单金额、支付流水和异常识别", permission: "order:view", component: OrdersPage },
  { path: "/payment-exceptions", title: "支付异常", menuTitle: "支付异常", group: "订单交易", badge: "辅助", description: "支付异常审核、处理备注和异常闭环入口。", permission: "order:view", component: OperationalWorkflowsPage },
  { path: "/payment-records", title: "支付记录", menuTitle: "支付记录", group: "订单交易", description: "支付流水查询和支付渠道记录入口。", permission: "payment:view", component: FinancePage },
  { path: "/coupons", title: "优惠券", menuTitle: "优惠券", group: "营销活动", description: "优惠码、用券限制和后端计价规则。", permission: "coupon:view", component: CouponsPage },
  { path: "/coupon-campaigns", title: "券活动", menuTitle: "券活动", group: "营销活动", description: "优惠券活动批次、领取二维码和领取记录入口。", permission: "coupon:view", component: CouponCampaignsPage },
  { path: "/promotions", title: "满减规则", menuTitle: "满减规则", group: "营销活动", description: "满金额或满张数优惠，金额以后端计算为准。", permission: "promotion:view", component: PromotionsPage },
  { path: "/notifications", title: "通知中心", menuTitle: "通知中心", group: "通知中心", description: "通知模板、发送任务和发送日志", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/config", title: "通道配置", menuTitle: "通道配置", group: "通知中心", description: "通知中心总开关、微信订阅和短信供应商配置。", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/templates", title: "通知模板", menuTitle: "通知模板", group: "通知中心", description: "微信订阅消息、短信和 mock 通知模板。", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/tasks", title: "通知任务", menuTitle: "通知任务", group: "通知中心", description: "按任务表发送并记录跳过、失败和成功结果。", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/logs", title: "发送日志", menuTitle: "发送日志", group: "通知中心", description: "通知发送明细、失败原因和跳过原因。", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/wechat-subscribe", title: "微信订阅消息", menuTitle: "微信订阅消息", group: "通知中心", badge: "辅助", description: "微信订阅消息模板映射和发送开关入口。", permission: "notification:view", component: NotificationsPage },
  { path: "/notifications/sms", title: "短信配置", menuTitle: "短信配置", group: "通知中心", badge: "辅助", description: "短信供应商、签名、模板和发送开关入口。", permission: "sms:view", component: NotificationsPage },
  { path: "/wecom/config", title: "企微接入配置", menuTitle: "接入配置", group: "企微客户群", description: "企业微信接口配置、连接测试、回调地址和同步入口", permission: "wecom:view", component: WecomPage },
  { path: "/wecom/groups", title: "客户群列表", menuTitle: "客户群列表", group: "企微客户群", description: "同步和管理企业微信外部客户群", permission: "wecom:view", component: WecomPage },
  { path: "/wecom/bindings", title: "群绑定会议", menuTitle: "群绑定会议", group: "企微客户群", description: "将客户群绑定到会议和入群入口", permission: "wecom:write", component: WecomPage },
  { path: "/wecom/welcome", title: "入群欢迎语", menuTitle: "入群欢迎语", group: "企微客户群", description: "维护会议客户群欢迎语素材", permission: "wecom:view", component: WecomPage },
  { path: "/wecom/tasks", title: "群发任务", menuTitle: "群发任务", group: "企微客户群", description: "按企业微信规则创建待成员确认的群发任务", permission: "wecom:view", component: WecomPage },
  { path: "/wecom/logs", title: "群发日志", menuTitle: "群发日志", group: "企微客户群", description: "查看成员确认、发送结果和失败原因", permission: "wecom:view", component: WecomPage },
  { path: "/wecom/callback-events", title: "回调事件", menuTitle: "回调事件", group: "企微客户群", description: "查看客户联系和应用回调事件", permission: "wecom:view", component: WecomPage },
  { path: "/ai/knowledge-bases", title: "知识库列表", menuTitle: "知识库列表", group: "AI 知识库", description: "会议知识库总览、启停、文档数、分块数和问答数。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/ai/conference-knowledge", title: "会议知识库", menuTitle: "会议知识库", group: "AI 知识库", description: "单会议资料、回答范围、引用来源和兜底规则。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/ai/documents", title: "文档管理", menuTitle: "文档管理", group: "AI 知识库", description: "知识文档录入、启停、分块和重建索引。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/ai/suggestions", title: "推荐问题", menuTitle: "推荐问题", group: "AI 知识库", description: "按会议维护用户端推荐问题。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/ai/question-logs", title: "问答日志", menuTitle: "问答日志", group: "AI 知识库", description: "用户提问、命中资料、兜底回复和错误原因。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/ai/config", title: "AI 配置", menuTitle: "AI 配置", group: "AI 知识库", badge: "辅助", description: "AI provider、模型和功能开关入口；密钥通过服务器环境变量配置。", permission: "ai-kb:view", component: AiKnowledgePage },
  { path: "/users", title: "用户列表", menuTitle: "用户列表", group: "用户中心", description: "微信用户、会员状态和人工授予入口。", permission: "member:view", component: MemberUsersPage },
  { path: "/members/users", title: "会员管理", menuTitle: "会员管理", group: "用户中心", description: "用户会员状态、等级授予、续期、停用、调级和权益发放记录", permission: "member:view", component: MemberUsersPage },
  { path: "/members/levels", title: "会员等级", menuTitle: "会员等级", group: "用户中心", description: "会员等级、默认有效期、会员价参与状态和人数统计", permission: "member:view", component: MemberLevelsPage },
  { path: "/members/benefits", title: "会员权益", menuTitle: "会员权益", group: "用户中心", description: "会员权益、自动发放、用户端展示和发放记录。", permission: "member:view", component: MemberBenefitsPage },
  { path: "/members/pricing-rules", title: "会员价规则", menuTitle: "会员价规则", group: "用户中心", description: "会员价已参与报名 quote/create order，订单保存计价快照。", permission: "member:view", component: MemberPricingRulesPage },
  { path: "/mall/products", title: "商品管理", menuTitle: "商品管理", group: "商城", description: "商城商品、封面、状态和规格入口", permission: "mall:view", component: MallProductsPage },
  { path: "/mall/categories", title: "商品分类", menuTitle: "商品分类", group: "商城", description: "商城商品分类、排序和展示入口。", permission: "mall:view", component: MallWorkflowsPage },
  { path: "/mall/skus", title: "SKU 库存", menuTitle: "SKU 库存", group: "商城", description: "SKU 库存、锁定库存和库存流水入口。", permission: "mall:view", component: MallWorkflowsPage },
  { path: "/mall/orders", title: "商城订单", menuTitle: "商城订单", group: "商城", description: "商城订单查询，不与会议报名订单混用", permission: "mall:order", component: MallOrdersPage },
  { path: "/mall/payment-config", title: "商城支付配置", menuTitle: "支付配置", group: "商城", description: "商城支付模式、微信支付回调地址和测试支付开关。", permission: "mall:view", component: MallOrdersPage },
  { path: "/mall/fulfillment", title: "发货核销", menuTitle: "发货核销", group: "商城", description: "商城发货、到店核销和履约日志入口。", permission: "mall:shipment", component: MallWorkflowsPage },
  { path: "/mall/aftersales", title: "商城售后", menuTitle: "商城售后", group: "商城", description: "售后申请、处理记录和退款联动入口。", permission: "mall:aftersale", component: MallWorkflowsPage },
  { path: "/finance", title: "财务管理", menuTitle: "财务管理", group: "财务管理", description: "实收、退款、净收入、待处理退款和对账差异概览。", permission: "finance:view", component: FinancePage },
  { path: "/finance/payments", title: "支付流水", menuTitle: "支付流水", group: "财务管理", description: "报名支付和商城支付统一只读查询。", permission: "finance:view", component: FinancePage },
  { path: "/finance/refunds", title: "退款管理", menuTitle: "退款管理", group: "财务管理", description: "报名退款与商城退款审批、处理和失败原因追踪。", permission: "refund:view", component: FinancePage },
  { path: "/finance/invoices", title: "发票申请", menuTitle: "发票申请", group: "财务管理", description: "报名和商城发票申请审核、驳回和人工开票记录。", permission: "invoice:view", component: FinancePage },
  { path: "/finance/reconciliation", title: "财务对账", menuTitle: "财务对账", group: "财务管理", description: "微信账单、报名支付和商城支付差异核查。", permission: "reconciliation:view", component: FinancePage },
  { path: "/finance/wechat-bills", title: "微信账单", menuTitle: "微信账单", group: "财务管理", description: "微信账单创建、手动导入、可选下载和对账。", permission: "wechat-bill:view", component: FinancePage },
  { path: "/pages", title: "页面装修", menuTitle: "页面装修", group: "页面装修", description: "DIY 页面、发布状态与装修入口", permission: "page:view", component: CmsPagesPage },
  { path: "/pages/editor", title: "装修页面", menuTitle: "装修页面", group: "页面装修", description: "组件、手机预览和参数配置", permission: "page:view", component: CmsPageEditorPage, hidden: true },
  { path: "/page-templates", title: "页面模板", menuTitle: "页面模板", group: "页面装修", description: "会议、商城与会员场景页面模板", permission: "page:view", component: CmsTemplateLibraryPage },
  { path: "/themes", title: "主题配置", menuTitle: "主题配置", group: "页面装修", description: "小程序/H5 主题色、圆角和卡片风格", permission: "theme:view", component: ThemesPage },
  { path: "/tabbar", title: "底部导航", menuTitle: "底部导航", group: "页面装修", description: "小程序动态底部导航配置", permission: "tabbar:view", component: TabbarPage },
  { path: "/materials", title: "素材管理", menuTitle: "素材管理", group: "页面装修", description: "图片、图标、视频和字体素材", permission: "material:view", component: MaterialsPage },
  { path: "/platform", title: "SaaS 平台控制台", menuTitle: "平台控制台", group: "平台运营", description: "租户、工作区、套餐、API 接入和生产能力就绪度", permission: "platform:view", component: PlatformPage },
  { path: "/system/audit-logs", title: "操作日志", menuTitle: "操作日志", group: "系统管理", description: "登录、编辑、导出、核销和异常处理记录", permission: "system:audit", component: AuditLogsPage },
  { path: "/system/accounts", title: "管理员账号", menuTitle: "管理员账号", group: "系统管理", description: "后台账号和角色分配", permission: "system:account", component: AccountsPage },
  { path: "/system/roles", title: "角色权限", menuTitle: "角色权限", group: "系统管理", badge: "高级", description: "高级权限配置，谨慎调整", permission: "system:role", component: RolesPage }
];

const currentPath = ref(normalizePath(window.location.hash.replace(/^#/, "")));

export const currentRoute = computed(() => findRoute(currentPath.value));
export const routeQuery = computed(() => {
  void currentPath.value;
  return parseQuery(window.location.hash);
});

export function installHashRouter() {
  window.addEventListener("hashchange", () => {
    currentPath.value = normalizePath(window.location.hash.replace(/^#/, ""));
  });
  if (!window.location.hash) {
    navigateTo("/dashboard");
  }
}

export function navigateTo(path: string, query?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value) {
      params.set(key, value);
    }
  }
  window.location.hash = `${path}${params.toString() ? `?${params.toString()}` : ""}`;
}

function findRoute(pathWithQuery: string): AdminRoute {
  const path = normalizePath(pathWithQuery).split("?")[0] || "/dashboard";
  return routes.find((route) => route.path === path) ?? routes[0];
}

function normalizePath(path: string): string {
  const normalized = path.trim() || "/dashboard";
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function parseQuery(hash: string): Record<string, string> {
  const [, queryText] = hash.split("?");
  return Object.fromEntries(new URLSearchParams(queryText ?? "").entries());
}
