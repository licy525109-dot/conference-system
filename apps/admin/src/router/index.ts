import { computed, ref, type Component } from "vue";
import DashboardPage from "../pages/dashboard/index.vue";
import ConferencesPage from "../pages/conferences/index.vue";
import ConferenceConfigPage from "../pages/conferences/config.vue";
import OrdersPage from "../pages/orders/index.vue";
import RegistrationsPage from "../pages/registrations/index.vue";
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
import AccountsPage from "../pages/system/accounts.vue";
import RolesPage from "../pages/system/roles.vue";

export interface AdminRoute {
  path: string;
  title: string;
  menuTitle: string;
  group: string;
  permission?: string;
  component: Component;
  hidden?: boolean;
}

export const routes: AdminRoute[] = [
  { path: "/dashboard", title: "数据看板", menuTitle: "数据看板", group: "运营概览", permission: "dashboard:view", component: DashboardPage },
  { path: "/conferences", title: "会议管理", menuTitle: "会议配置", group: "会议运营", permission: "conference:view", component: ConferencesPage },
  {
    path: "/conferences/config",
    title: "会议配置详情",
    menuTitle: "会议配置详情",
    group: "会议运营",
    permission: "conference:view",
    component: ConferenceConfigPage,
    hidden: true
  },
  { path: "/orders", title: "订单列表", menuTitle: "订单列表", group: "会议运营", permission: "order:view", component: OrdersPage },
  { path: "/registrations", title: "报名名单", menuTitle: "报名名单", group: "会议运营", permission: "registration:view", component: RegistrationsPage },
  { path: "/coupons", title: "优惠券", menuTitle: "优惠券", group: "营销工具", permission: "coupon:view", component: CouponsPage },
  { path: "/promotions", title: "满减规则", menuTitle: "满减规则", group: "营销工具", permission: "promotion:view", component: PromotionsPage },
  { path: "/pages", title: "小程序页面装修", menuTitle: "页面装修", group: "页面装修", permission: "page:view", component: CmsPagesPage },
  { path: "/themes", title: "主题配置", menuTitle: "主题配置", group: "页面装修", permission: "theme:view", component: ThemesPage },
  { path: "/tabbar", title: "底部导航配置", menuTitle: "底部导航", group: "页面装修", permission: "tabbar:view", component: TabbarPage },
  { path: "/materials", title: "素材管理", menuTitle: "素材管理", group: "页面装修", permission: "material:view", component: MaterialsPage },
  { path: "/members/users", title: "用户与会员", menuTitle: "用户与会员", group: "用户资产", permission: "member:view", component: MemberUsersPage },
  { path: "/members/levels", title: "会员等级", menuTitle: "会员等级", group: "用户资产", permission: "member:view", component: MemberLevelsPage },
  { path: "/finance", title: "财务与对账", menuTitle: "财务与对账", group: "交易财务", permission: "finance:view", component: FinancePage },
  { path: "/mall/products", title: "商城商品", menuTitle: "商城商品", group: "交易财务", permission: "mall:view", component: MallProductsPage },
  { path: "/mall/orders", title: "商城订单", menuTitle: "商城订单", group: "交易财务", permission: "mall:view", component: MallOrdersPage },
  { path: "/system/accounts", title: "账号管理", menuTitle: "账号管理", group: "系统设置", permission: "system:account", component: AccountsPage },
  { path: "/system/roles", title: "角色权限", menuTitle: "角色权限", group: "系统设置", permission: "system:role", component: RolesPage }
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
