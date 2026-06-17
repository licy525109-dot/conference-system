import { computed, ref, type Component } from "vue";
import DashboardPage from "../pages/dashboard/index.vue";
import ConferencesPage from "../pages/conferences/index.vue";
import ConferenceConfigPage from "../pages/conferences/config.vue";
import OrdersPage from "../pages/orders/index.vue";
import RegistrationsPage from "../pages/registrations/index.vue";
import RegistrationDetailPage from "../pages/registrations/detail.vue";
import CouponsPage from "../pages/coupons/index.vue";
import PromotionsPage from "../pages/promotions/index.vue";
import MaterialsPage from "../pages/materials/index.vue";
import CmsPagesPage from "../pages/cms/pages.vue";
import ThemesPage from "../pages/cms/themes.vue";
import TabbarPage from "../pages/cms/tabbar.vue";
import FinancePage from "../pages/finance/index.vue";
import MallOrdersPage from "../pages/mall/orders.vue";
import MallProductsPage from "../pages/mall/products.vue";
import MemberLevelsPage from "../pages/members/levels.vue";
import MemberUsersPage from "../pages/members/users.vue";
import AuditLogsPage from "../pages/system/audit-logs.vue";
import AccountsPage from "../pages/system/accounts.vue";
import RolesPage from "../pages/system/roles.vue";

export interface AdminRoute {
  path: string;
  title: string;
  menuTitle: string;
  group: string;
  description?: string;
  badge?: "灰度" | "后续" | "辅助" | "高级";
  permission?: string;
  component: Component;
  hidden?: boolean;
}

export const routes: AdminRoute[] = [
  { path: "/dashboard", title: "数据看板", menuTitle: "数据看板", group: "工作台", description: "核心报名、收入和订单指标", permission: "dashboard:view", component: DashboardPage },
  { path: "/conferences", title: "会议管理", menuTitle: "会议管理", group: "会议业务", description: "会议基础信息、上下架和配置入口", permission: "conference:view", component: ConferencesPage },
  {
    path: "/conferences/config",
    title: "会议配置详情",
    menuTitle: "会议配置详情",
    group: "会议业务",
    description: "票种、表单字段、优惠和页面装修",
    permission: "conference:view",
    component: ConferenceConfigPage,
    hidden: true
  },
  { path: "/registrations", title: "报名名单", menuTitle: "报名名单", group: "会议业务", description: "报名记录、参会人、备注和核销", permission: "registration:view", component: RegistrationsPage },
  { path: "/registrations/detail", title: "报名详情", menuTitle: "报名详情", group: "会议业务", description: "报名、订单、支付、表单快照和操作日志", permission: "registration:view", component: RegistrationDetailPage, hidden: true },
  { path: "/orders", title: "订单支付", menuTitle: "订单支付", group: "会议业务", description: "订单金额、支付流水和异常识别", permission: "order:view", component: OrdersPage },
  { path: "/coupons", title: "优惠券", menuTitle: "优惠券", group: "营销配置", badge: "灰度", description: "扩展营销能力，金额仍以后端计算为准", permission: "coupon:view", component: CouponsPage },
  { path: "/promotions", title: "满减规则", menuTitle: "满减规则", group: "营销配置", badge: "灰度", description: "扩展营销能力，金额仍以后端计算为准", permission: "promotion:view", component: PromotionsPage },
  { path: "/pages", title: "页面装修", menuTitle: "页面装修", group: "页面装修", description: "CMS 页面版本、组件和发布预览", permission: "page:view", component: CmsPagesPage },
  { path: "/themes", title: "主题配置", menuTitle: "主题配置", group: "页面装修", description: "小程序/H5 主题色、圆角和卡片风格", permission: "theme:view", component: ThemesPage },
  { path: "/tabbar", title: "底部导航", menuTitle: "底部导航", group: "页面装修", description: "小程序动态底部导航配置", permission: "tabbar:view", component: TabbarPage },
  { path: "/materials", title: "素材管理", menuTitle: "素材管理", group: "页面装修", description: "图片、图标、视频和字体素材", permission: "material:view", component: MaterialsPage },
  { path: "/members/users", title: "会员管理", menuTitle: "会员管理", group: "扩展能力", badge: "后续", description: "会员能力预留，暂不参与会议定价", permission: "member:view", component: MemberUsersPage },
  { path: "/members/levels", title: "会员等级", menuTitle: "会员等级", group: "扩展能力", badge: "后续", description: "会员权益展示预留", permission: "member:view", component: MemberLevelsPage },
  { path: "/mall/products", title: "商城商品", menuTitle: "商城商品", group: "扩展能力", badge: "灰度", description: "商城能力灰度中，商品支付和履约后续完善", permission: "mall:view", component: MallProductsPage },
  { path: "/mall/orders", title: "商城订单", menuTitle: "商城订单", group: "扩展能力", badge: "灰度", description: "商城订单灰度中，不与会议支付混用", permission: "mall:view", component: MallOrdersPage },
  { path: "/finance", title: "财务对账", menuTitle: "财务对账", group: "扩展能力", badge: "辅助", description: "对账辅助，不等同完整财务系统", permission: "finance:view", component: FinancePage },
  { path: "/system/audit-logs", title: "操作日志", menuTitle: "操作日志", group: "系统管理", description: "登录、编辑、导出、核销和异常处理记录", permission: "system:audit", component: AuditLogsPage },
  { path: "/system/accounts", title: "账号管理", menuTitle: "账号管理", group: "系统管理", description: "后台账号和角色分配", permission: "system:account", component: AccountsPage },
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
