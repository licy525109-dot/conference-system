<template>
  <el-container class="admin-shell" :class="{ 'is-focused-workspace': isFocusedWorkspace }">
    <el-aside v-if="!isFocusedWorkspace" width="264px" class="admin-aside">
      <div class="admin-brand">
        <img v-if="brandLogoUrl" class="brand-mark brand-mark--image" :src="brandLogoUrl" alt="" />
        <span v-else class="brand-mark">{{ brandMarkText }}</span>
        <div>
          <strong>{{ brandTitle }}</strong>
          <span>{{ brandSubtitle }}</span>
        </div>
      </div>
      <el-scrollbar ref="menuScrollbar" class="admin-menu-scroll" @scroll="saveMenuScroll">
        <div class="admin-menu-tools">
          <el-input v-model="menuSearch" size="small" clearable placeholder="搜索菜单" />
          <el-button size="small" @click="menuSettingsVisible = true">菜单配置</el-button>
        </div>
        <el-menu :default-active="currentRoute.path" class="admin-menu" @select="handleSelect">
          <div v-for="group in filteredMenuGroups" :key="group.name" class="menu-group" :class="group.className">
            <button type="button" class="menu-group-toggle" @click="toggleGroup(group.name)">
              <span class="menu-group-title">
                <span>{{ group.name }}</span>
                <small v-if="group.badge">{{ group.badge }}</small>
              </span>
              <span class="menu-group-arrow" :class="{ 'is-open': isGroupOpen(group.name) || Boolean(menuSearch.trim()) }">⌄</span>
            </button>
            <template v-if="isGroupOpen(group.name) || menuSearch.trim()">
              <el-menu-item v-for="item in group.items" :key="item.path" :index="item.path" :class="{ 'is-muted-route': isMutedRoute(item) }">
              <span class="menu-dot" />
              <span class="menu-item-copy">
                <span>{{ item.menuTitle }}</span>
                <small v-if="item.badge">{{ item.badge }}</small>
              </span>
              </el-menu-item>
            </template>
          </div>
        </el-menu>
        <div v-if="filteredMenuGroups.length === 0" class="admin-menu-empty">无匹配菜单</div>
      </el-scrollbar>
    </el-aside>
    <el-container>
      <el-header v-if="!isFocusedWorkspace" class="admin-header">
        <div class="admin-header__copy">
          <div class="breadcrumb-title">后台管理 / {{ currentRoute.group }} / {{ currentRoute.title }}</div>
          <strong>{{ currentRoute.title }}</strong>
          <span v-if="currentRoute.description">{{ currentRoute.description }}</span>
        </div>
        <div class="admin-header__quick">
          <el-button v-for="item in currentGroupQuickRoutes" :key="item.path" size="small" :type="item.path === currentRoute.path ? 'primary' : 'default'" @click="quickGo(item.path)">
            {{ item.menuTitle }}
          </el-button>
        </div>
        <div class="admin-user">
          <span class="admin-user__role">当前账号</span>
          <span class="admin-user__name">{{ admin?.displayName || admin?.username }}</span>
          <el-button plain @click="logout">退出登录</el-button>
        </div>
      </el-header>
      <el-main class="admin-main" :class="{ 'admin-main--focused': isFocusedWorkspace }">
        <section v-if="!hasPermission(currentRoute.permission)" class="data-panel">
          <h2 class="page-title">无权限访问</h2>
          <p class="page-subtitle">当前账号没有打开该功能的权限，请联系超级管理员调整角色。</p>
        </section>
        <component :is="currentRoute.component" v-else />
      </el-main>
    </el-container>
    <el-drawer v-model="menuSettingsVisible" title="菜单顺序配置" size="420px">
      <p class="menu-settings-hint">支持当前浏览器的一级、二级菜单排序和显示控制；系统管理入口始终显示，防止无法恢复配置。保存后立即生效。</p>
      <div class="menu-order-list">
        <div v-for="group in configurableGroups" :key="group.name" class="menu-order-item">
          <span>{{ group.name }}</span>
          <el-input-number v-model="menuGroupOrder[group.name]" :min="0" :max="999" :step="10" controls-position="right" />
        </div>
      </div>
      <el-divider>二级菜单</el-divider>
      <div class="menu-route-order-list">
        <section v-for="group in configurableRouteGroups" :key="group.name" class="menu-route-group">
          <strong>{{ group.name }}</strong>
          <div v-for="item in group.items" :key="item.path" class="menu-route-order-item">
            <el-switch
              :model-value="isRouteConfigVisible(item)"
              :disabled="isLockedRoute(item)"
              active-text="显示"
              inactive-text="隐藏"
              @update:model-value="setRouteVisibility(item, Boolean($event))"
            />
            <span>{{ item.menuTitle }}</span>
            <el-input-number v-model="menuRouteOrder[item.path]" :min="0" :max="999" :step="10" controls-position="right" />
          </div>
        </section>
      </div>
      <template #footer>
        <el-button @click="resetMenuOrder">恢复默认顺序</el-button>
        <el-button type="primary" @click="saveMenuOrder">保存</el-button>
      </template>
    </el-drawer>
  </el-container>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from "vue";
import { currentRoute, navigateTo, routes, type AdminRoute } from "../router";
import { getTheme } from "../services/admin";
import { useAdminSession } from "../stores/admin-session";

const { admin, hasPermission, logout } = useAdminSession();
const brandTitle = ref("会务运营平台");
const brandSubtitle = ref("报名、支付与页面配置中心");
const brandLogoUrl = ref("");
const menuSearch = ref("");
const expandedGroups = ref<Set<string>>(new Set([currentRoute.value.group]));
const menuSettingsVisible = ref(false);
const menuScrollbar = ref<{ setScrollTop?: (value: number) => void } | null>(null);
const menuGroupOrder = reactive<Record<string, number>>(loadMenuOrder());
const menuRouteOrder = reactive<Record<string, number>>(loadMenuRouteOrder());
const menuRouteVisibility = reactive<Record<string, boolean>>(loadMenuRouteVisibility());

const brandMarkText = computed(() => brandTitle.value.trim().slice(0, 1) || "会");
const isFocusedWorkspace = computed(() => currentRoute.value.path === "/pages/editor");

const GROUP_META: Record<string, { order: number; badge?: string; className?: string }> = {
  控制台: { order: 0 },
  会议管理: { order: 10 },
  订单交易: { order: 20 },
  营销活动: { order: 30 },
  通知中心: { order: 40 },
  企微客户群: { order: 50 },
  "AI 知识库": { order: 60 },
  用户中心: { order: 70 },
  商城: { order: 80 },
  财务管理: { order: 90 },
  页面装修: { order: 100 },
  平台运营: { order: 110 },
  系统管理: { order: 120 }
};

const menuRoutes = computed(() => routes.filter((route) => !route.hidden && hasPermission(route.permission) && isRouteVisible(route)));
const currentGroupQuickRoutes = computed(() =>
  menuRoutes.value.filter((route) => route.group === currentRoute.value.group).slice(0, 6)
);
const menuGroups = computed(() => {
  const groups = new Map<string, AdminRoute[]>();
  for (const route of menuRoutes.value) {
    groups.set(route.group, sortRoutes([...(groups.get(route.group) ?? []), route]));
  }
  return Array.from(groups.entries())
    .map(([name, items]) => ({
      name,
      items,
      badge: GROUP_META[name]?.badge,
      className: GROUP_META[name]?.className ?? "",
      order: typeof menuGroupOrder[name] === "number" ? menuGroupOrder[name] : GROUP_META[name]?.order ?? 999
    }))
    .sort((a, b) => a.order - b.order);
});
const configurableGroups = computed(() =>
  Array.from(new Set([...Object.keys(GROUP_META), ...menuGroups.value.map((group) => group.name)]))
    .map((name) => ({ name, order: typeof menuGroupOrder[name] === "number" ? menuGroupOrder[name] : GROUP_META[name]?.order ?? 999 }))
    .sort((a, b) => a.order - b.order)
);
const configurableRouteGroups = computed(() => {
  const groups = new Map<string, AdminRoute[]>();
  for (const route of routes.filter((route) => !route.hidden && hasPermission(route.permission))) {
    groups.set(route.group, sortRoutes([...(groups.get(route.group) ?? []), route]));
  }
  return Array.from(groups.entries())
    .map(([name, items]) => ({
      name,
      items,
      order: typeof menuGroupOrder[name] === "number" ? menuGroupOrder[name] : GROUP_META[name]?.order ?? 999
    }))
    .sort((a, b) => a.order - b.order);
});
const filteredMenuGroups = computed(() => {
  const keyword = menuSearch.value.trim().toLowerCase();
  if (!keyword) return menuGroups.value;
  return menuGroups.value
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => routeMatchesSearch(item, group.name, keyword))
    }))
    .filter((group) => group.items.length > 0);
});

onMounted(async () => {
  restoreExpandedGroups();
  expandCurrentGroup();
  restoreMenuScroll();
  try {
    const theme = await getTheme();
    const config = theme.config as Record<string, unknown>;
    brandTitle.value = typeof config.adminBrandTitle === "string" && config.adminBrandTitle.trim() ? config.adminBrandTitle.trim() : brandTitle.value;
    brandSubtitle.value = typeof config.adminBrandSubtitle === "string" && config.adminBrandSubtitle.trim() ? config.adminBrandSubtitle.trim() : brandSubtitle.value;
    brandLogoUrl.value = typeof config.adminBrandLogoUrl === "string" ? config.adminBrandLogoUrl : "";
  } catch {
    // Keep local defaults when theme config is unavailable.
  }
});

watch(() => currentRoute.value.group, expandCurrentGroup);
watch(() => currentRoute.value.path, () => nextTick(scrollActiveMenuIntoView));
watch(expandedGroups, persistExpandedGroups, { deep: true });

function handleSelect(path: string) {
  navigateTo(path);
}

function quickGo(path: string) {
  navigateTo(path);
}

function isMutedRoute(route: AdminRoute): boolean {
  return route.badge === "预留" || route.badge === "后续" || route.badge === "辅助" || route.badge === "高级";
}

function toggleGroup(name: string) {
  const next = new Set(expandedGroups.value);
  if (next.has(name)) next.delete(name);
  else next.add(name);
  expandedGroups.value = next;
}

function isGroupOpen(name: string): boolean {
  return expandedGroups.value.has(name);
}

function expandCurrentGroup() {
  expandedGroups.value = new Set([...expandedGroups.value, currentRoute.value.group]);
}

function restoreExpandedGroups() {
  try {
    const saved = JSON.parse(window.localStorage.getItem("admin-menu-expanded-groups") || "[]") as unknown;
    if (Array.isArray(saved) && saved.every((item) => typeof item === "string")) {
      expandedGroups.value = new Set([...saved, currentRoute.value.group]);
    }
  } catch {
    expandCurrentGroup();
  }
}

function persistExpandedGroups() {
  window.localStorage.setItem("admin-menu-expanded-groups", JSON.stringify([...expandedGroups.value]));
}

function routeMatchesSearch(route: AdminRoute, group: string, keyword: string): boolean {
  return [group, route.title, route.menuTitle, route.description, route.badge].some((value) => String(value || "").toLowerCase().includes(keyword));
}

function loadMenuOrder(): Record<string, number> {
  try {
    const saved = JSON.parse(window.localStorage.getItem("admin-menu-group-order") || "{}") as unknown;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "number")) as Record<string, number>;
    }
  } catch {
    // Use default group metadata.
  }
  return {};
}

function loadMenuRouteOrder(): Record<string, number> {
  try {
    const saved = JSON.parse(window.localStorage.getItem("admin-menu-route-order") || "{}") as unknown;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "number")) as Record<string, number>;
    }
  } catch {
    // Use router order.
  }
  return {};
}

function loadMenuRouteVisibility(): Record<string, boolean> {
  try {
    const saved = JSON.parse(window.localStorage.getItem("admin-menu-route-visibility") || "{}") as unknown;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "boolean")) as Record<string, boolean>;
    }
  } catch {
    // Show every route by default.
  }
  return {};
}

function saveMenuOrder() {
  window.localStorage.setItem("admin-menu-group-order", JSON.stringify(menuGroupOrder));
  window.localStorage.setItem("admin-menu-route-order", JSON.stringify(menuRouteOrder));
  window.localStorage.setItem("admin-menu-route-visibility", JSON.stringify(menuRouteVisibility));
  menuSettingsVisible.value = false;
}

function resetMenuOrder() {
  for (const key of Object.keys(menuGroupOrder)) delete menuGroupOrder[key];
  for (const key of Object.keys(menuRouteOrder)) delete menuRouteOrder[key];
  for (const key of Object.keys(menuRouteVisibility)) delete menuRouteVisibility[key];
  window.localStorage.removeItem("admin-menu-group-order");
  window.localStorage.removeItem("admin-menu-route-order");
  window.localStorage.removeItem("admin-menu-route-visibility");
}

function saveMenuScroll(event: { scrollTop?: number }) {
  window.localStorage.setItem("admin-menu-scroll-top", String(event.scrollTop ?? 0));
}

function restoreMenuScroll() {
  const saved = Number(window.localStorage.getItem("admin-menu-scroll-top") || 0);
  nextTick(() => {
    menuScrollbar.value?.setScrollTop?.(Number.isFinite(saved) ? saved : 0);
    scrollActiveMenuIntoView();
  });
}

function scrollActiveMenuIntoView() {
  document.querySelector(".admin-menu .el-menu-item.is-active")?.scrollIntoView({ block: "nearest" });
}

function sortRoutes(items: AdminRoute[]): AdminRoute[] {
  return [...items].sort((a, b) => routeOrder(a) - routeOrder(b));
}

function routeOrder(route: AdminRoute): number {
  return typeof menuRouteOrder[route.path] === "number" ? menuRouteOrder[route.path] : routes.findIndex((item) => item.path === route.path) * 10;
}

function isLockedRoute(route: AdminRoute): boolean {
  return route.group === "系统管理";
}

function isRouteConfigVisible(route: AdminRoute): boolean {
  return isLockedRoute(route) ? true : menuRouteVisibility[route.path] !== false;
}

function isRouteVisible(route: AdminRoute): boolean {
  return currentRoute.value.path === route.path || isRouteConfigVisible(route);
}

function setRouteVisibility(route: AdminRoute, visible: boolean) {
  if (isLockedRoute(route)) {
    menuRouteVisibility[route.path] = true;
    return;
  }
  menuRouteVisibility[route.path] = visible;
}
</script>

<style scoped>
.admin-shell.is-focused-workspace {
  min-width: 1080px;
  height: 100vh;
  overflow: hidden;
}

.admin-main--focused {
  width: 100%;
  height: 100vh;
  overflow: hidden;
  padding: 0;
  background: var(--admin-color-bg);
}

.admin-main--focused :deep(> .admin-page) {
  width: 100%;
  max-width: none;
  margin: 0;
}
</style>
