<template>
  <el-container class="admin-shell" :class="{ 'is-focused-workspace': isFocusedWorkspace }">
    <header v-if="!isFocusedWorkspace" class="admin-topbar">
      <div class="admin-brand" :title="`${brandTitle} · ${brandSubtitle}`">
        <img v-if="brandLogoUrl" class="brand-mark brand-mark--image" :src="brandLogoUrl" alt="" />
        <strong>{{ brandTitle }}</strong>
      </div>
      <nav ref="primaryNavigation" class="admin-primary-navigation" aria-label="后台主导航">
        <a
          v-for="group in visibleMenuGroups"
          :key="group.name"
          :href="`#${group.items[0].path}`"
          class="admin-primary-link"
          :data-nav-group="group.name"
          :class="{ 'is-active': group.name === currentRoute.group }"
          :aria-current="group.name === currentRoute.group ? 'true' : undefined"
          @click.prevent="selectGroup(group.name)"
        >
          {{ group.name }}
        </a>
        <el-dropdown
          v-if="overflowMenuGroups.length"
          ref="overflowDropdown"
          class="admin-nav-more"
          trigger="click"
          placement="bottom-end"
          popper-class="admin-nav-overflow"
          @command="selectGroup"
          @visible-change="overflowMenuOpen = $event"
        >
          <button ref="overflowTrigger" type="button" class="admin-primary-link admin-nav-more__trigger" :class="{ 'is-active': isOverflowGroupActive }" aria-label="更多导航">
            更多<el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item v-for="group in overflowMenuGroups" :key="group.name" :command="group.name" :class="{ 'is-active': group.name === currentRoute.group }">
                {{ group.name }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <div ref="navigationMeasure" class="admin-nav-measure" aria-hidden="true" inert>
          <span v-for="group in menuGroups" :key="group.name" class="admin-primary-link" data-nav-measure-item>{{ group.name }}</span>
          <span class="admin-primary-link admin-nav-more__trigger" data-nav-measure-more>更多<el-icon><ArrowDown /></el-icon></span>
        </div>
      </nav>
      <div class="admin-topbar__tools">
        <el-tooltip content="搜索菜单" placement="bottom">
          <el-button class="admin-topbar__icon" :icon="Search" text aria-label="搜索菜单" @click="menuSearchVisible = true" />
        </el-tooltip>
        <el-tooltip content="菜单配置" placement="bottom">
          <el-button class="admin-topbar__icon" :icon="Setting" text aria-label="菜单配置" @click="menuSettingsVisible = true" />
        </el-tooltip>
        <el-dropdown trigger="click" @command="handleAccountCommand">
          <button type="button" class="admin-user" aria-label="账号菜单">
            <span class="admin-user__avatar" aria-hidden="true">{{ accountName.slice(0, 1) }}</span>
            <span class="admin-user__name">{{ accountName }}</span>
            <el-icon><ArrowDown /></el-icon>
          </button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="settings" :icon="Setting">菜单配置</el-dropdown-item>
              <el-dropdown-item command="logout" :icon="SwitchButton" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </header>
    <nav v-if="!isFocusedWorkspace" class="admin-secondary-navigation" aria-label="当前分组导航">
      <a
        v-for="item in currentGroupRoutes"
        :key="item.path"
        :href="`#${item.path}`"
        :class="{ 'is-active': isActiveMenuRoute(item) }"
        :aria-current="item.path === currentRoute.path ? 'page' : undefined"
        @click.prevent="handleSelect(item.path)"
      >
        {{ item.menuTitle }}
        <small v-if="item.badge">{{ item.badge }}</small>
      </a>
    </nav>
    <nav class="mobile-navigation" aria-label="手机后台导航">
      <el-select :model-value="currentRoute.path" filterable aria-label="后台功能" @change="handleSelect">
        <el-option v-if="!menuRoutes.some(item => item.path === currentRoute.path)" :value="currentRoute.path" :label="currentRoute.title" />
        <el-option-group v-for="group in menuGroups" :key="group.name" :label="group.name">
          <el-option v-for="item in group.items" :key="item.path" :value="item.path" :label="item.menuTitle" />
        </el-option-group>
      </el-select>
      <el-button @click="logout">退出</el-button>
    </nav>
    <el-main class="admin-main" :class="{ 'admin-main--focused': isFocusedWorkspace }">
      <section v-if="!hasPermission(currentRoute.permission)" class="data-panel">
        <h2 class="page-title">无权限访问</h2>
        <p class="page-subtitle">当前账号没有打开该功能的权限，请联系超级管理员调整角色。</p>
      </section>
      <component :is="currentRoute.component" v-else />
    </el-main>
    <el-drawer v-model="menuSearchVisible" title="搜索菜单" size="min(420px, 100vw)" class="admin-menu-drawer" @opened="onSearchOpened">
      <el-input ref="menuSearchInput" v-model="menuSearch" clearable :prefix-icon="Search" placeholder="搜索菜单" aria-label="搜索菜单" />
      <el-scrollbar ref="menuScrollbar" class="admin-menu-scroll" @scroll="saveMenuScroll">
        <nav class="admin-menu" aria-label="菜单搜索结果">
          <div v-for="group in filteredMenuGroups" :key="group.name" class="menu-group">
            <button type="button" class="menu-group-toggle" :aria-expanded="isGroupOpen(group.name) || Boolean(menuSearch.trim())" @click="toggleGroup(group.name)">
              <span class="menu-group-title">{{ group.name }}</span>
              <el-icon class="menu-group-arrow" :class="{ 'is-open': isGroupOpen(group.name) || Boolean(menuSearch.trim()) }"><ArrowDown /></el-icon>
            </button>
            <template v-if="isGroupOpen(group.name) || menuSearch.trim()">
              <a
                v-for="item in group.items"
                :key="item.path"
                :href="`#${item.path}`"
                class="admin-menu__link"
                :class="{ 'is-muted-route': isMutedRoute(item), 'is-active': isActiveMenuRoute(item) }"
                :aria-current="item.path === currentRoute.path ? 'page' : undefined"
                @click.prevent="handleSelect(item.path)"
              >
                <span class="menu-item-copy"><span>{{ item.menuTitle }}</span><small v-if="item.badge">{{ item.badge }}</small></span>
              </a>
            </template>
          </div>
        </nav>
        <div v-if="filteredMenuGroups.length === 0" class="admin-menu-empty" role="status">无匹配菜单</div>
      </el-scrollbar>
    </el-drawer>
    <el-drawer v-model="menuSettingsVisible" title="菜单顺序配置" size="min(460px, 100vw)">
      <el-alert v-if="menuSettingsError" :title="menuSettingsError" type="error" :closable="false" />
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
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ArrowDown, Search, Setting, SwitchButton } from "@element-plus/icons-vue";
import { currentRoute, navigateTo, routes, type AdminRoute } from "../router";
import { getTheme } from "../services/admin";
import { useAdminSession } from "../stores/admin-session";

const { admin, hasPermission, logout } = useAdminSession();
const brandTitle = ref("观潮会集");
const brandSubtitle = ref("报名、支付与页面配置中心");
const brandLogoUrl = ref("");
const menuSearch = ref("");
const menuSearchVisible = ref(false);
const menuSearchInput = ref<{ focus: () => void } | null>(null);
const expandedGroups = ref<Set<string>>(new Set([currentRoute.value.group]));
const menuSettingsVisible = ref(false);
const menuSettingsError = ref("");
const menuScrollbar = ref<{ setScrollTop?: (value: number) => void } | null>(null);
const menuGroupOrder = reactive<Record<string, number>>(loadMenuOrder());
const menuRouteOrder = reactive<Record<string, number>>(loadMenuRouteOrder());
const menuRouteVisibility = reactive<Record<string, boolean>>(loadMenuRouteVisibility());
let menuSettingsSnapshot: { groups: Record<string, number>; routes: Record<string, number>; visibility: Record<string, boolean> } | null = null;
const primaryNavigation = ref<HTMLElement | null>(null);
const navigationMeasure = ref<HTMLElement | null>(null);
const overflowTrigger = ref<HTMLButtonElement | null>(null);
const overflowDropdown = ref<{ handleClose: () => void } | null>(null);
const overflowMenuOpen = ref(false);
const visibleGroupCount = ref(0);
let navigationResizeObserver: ResizeObserver | undefined;

const accountName = computed(() => admin.value?.displayName || admin.value?.username || "管理员");
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
const currentGroupRoutes = computed(() => sortRoutes(menuRoutes.value.filter((route) => route.group === currentRoute.value.group)));
const activeMenuPath = computed(() => {
  const route = currentRoute.value;
  if (!route.hidden) return route.path;
  return currentGroupRoutes.value
    .filter((item) => route.path.startsWith(`${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path ?? route.path;
});
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
const visibleMenuGroups = computed(() => menuGroups.value.slice(0, visibleGroupCount.value));
const overflowMenuGroups = computed(() => menuGroups.value.slice(visibleGroupCount.value));
const isOverflowGroupActive = computed(() => overflowMenuGroups.value.some((group) => group.name === currentRoute.value.group));
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
  window.addEventListener("resize", updateNavigationOverflow);
  restoreExpandedGroups();
  expandCurrentGroup();
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

onBeforeUnmount(() => {
  navigationResizeObserver?.disconnect();
  window.removeEventListener("resize", updateNavigationOverflow);
});

watch([primaryNavigation, navigationMeasure, menuGroups], ([navigation, measure]) => {
  navigationResizeObserver?.disconnect();
  if (!navigation || !measure) return;
  if (typeof ResizeObserver !== "undefined") {
    navigationResizeObserver = new ResizeObserver(updateNavigationOverflow);
    navigationResizeObserver.observe(navigation);
    for (const item of Array.from(measure.children)) navigationResizeObserver.observe(item);
  }
  void nextTick(updateNavigationOverflow);
}, { flush: "post" });

watch(() => currentRoute.value.group, expandCurrentGroup);
watch(() => currentRoute.value.path, () => nextTick(scrollActiveMenuIntoView));
watch(expandedGroups, persistExpandedGroups, { deep: true });
watch(menuSettingsVisible, (visible) => {
  if (visible) {
    menuSettingsError.value = "";
    menuSettingsSnapshot = { groups: { ...menuGroupOrder }, routes: { ...menuRouteOrder }, visibility: { ...menuRouteVisibility } };
  } else if (menuSettingsSnapshot) {
    clearMenuOrder();
    Object.assign(menuGroupOrder, menuSettingsSnapshot.groups);
    Object.assign(menuRouteOrder, menuSettingsSnapshot.routes);
    Object.assign(menuRouteVisibility, menuSettingsSnapshot.visibility);
    menuSettingsSnapshot = null;
  }
}, { flush: "sync" });

function countVisibleGroups(availableWidth: number, itemWidths: number[], moreWidth: number): number {
  if (availableWidth <= 0) return 0;
  if (itemWidths.reduce((total, width) => total + width, 0) <= availableWidth) return itemWidths.length;
  let usedWidth = moreWidth;
  let count = 0;
  for (const width of itemWidths) {
    if (usedWidth + width > availableWidth) break;
    usedWidth += width;
    count++;
  }
  return count;
}

function updateNavigationOverflow() {
  const navigation = primaryNavigation.value;
  const measure = navigationMeasure.value;
  if (!navigation || !measure) return;
  const availableWidth = Math.floor(navigation.getBoundingClientRect().width);
  const itemWidths = Array.from(measure.querySelectorAll<HTMLElement>("[data-nav-measure-item]"), (item) => Math.ceil(item.getBoundingClientRect().width));
  const moreWidth = Math.ceil(measure.querySelector<HTMLElement>("[data-nav-measure-more]")?.getBoundingClientRect().width ?? 0);
  const nextCount = countVisibleGroups(availableWidth, itemWidths, moreWidth);
  if (nextCount === visibleGroupCount.value) return;
  const activeElement = document.activeElement;
  const focusedGroup = navigation.contains(activeElement) ? activeElement?.getAttribute("data-nav-group") : null;
  const focusMore = activeElement === overflowTrigger.value || overflowMenuOpen.value;
  const firstOverflowName = overflowMenuGroups.value[0]?.name;
  if (overflowMenuOpen.value) overflowDropdown.value?.handleClose();
  visibleGroupCount.value = nextCount;
  // Keep keyboard focus reachable when resizing moves a link into or out of More.
  void nextTick(() => {
    if ((focusedGroup && !visibleMenuGroups.value.some((group) => group.name === focusedGroup)) || (focusMore && overflowMenuGroups.value.length)) {
      overflowTrigger.value?.focus({ preventScroll: true });
    } else if (focusMore) {
      const links = Array.from(navigation.querySelectorAll<HTMLElement>("[data-nav-group]"));
      (links.find((link) => link.dataset.navGroup === firstOverflowName) ?? links[0])?.focus({ preventScroll: true });
    }
  });
}

function handleSelect(path: string) {
  menuSearchVisible.value = false;
  navigateTo(path);
}

function selectGroup(name: string) {
  if (name === currentRoute.value.group) return;
  const firstRoute = menuGroups.value.find((group) => group.name === name)?.items[0];
  if (firstRoute) handleSelect(firstRoute.path);
}

function isActiveMenuRoute(route: AdminRoute): boolean {
  return route.path === activeMenuPath.value;
}

function handleAccountCommand(command: string) {
  if (command === "settings") menuSettingsVisible.value = true;
  if (command === "logout") logout();
}

function onSearchOpened() {
  menuSearchInput.value?.focus();
  restoreMenuScroll();
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
  try {
    window.localStorage.setItem("admin-menu-expanded-groups", JSON.stringify([...expandedGroups.value]));
  } catch {
    // Navigation must remain usable when browser storage is blocked.
  }
}

function routeMatchesSearch(route: AdminRoute, group: string, keyword: string): boolean {
  return [group, route.title, route.menuTitle, route.description, route.badge].some((value) => String(value || "").toLowerCase().includes(keyword));
}

function loadMenuOrder(): Record<string, number> {
  try {
    const saved = JSON.parse(window.localStorage.getItem("admin-menu-group-order") || "{}") as unknown;
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) as Record<string, number>;
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
      return Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === "number" && Number.isFinite(value))) as Record<string, number>;
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
  if (!persistMenuSettings({
    "admin-menu-group-order": JSON.stringify(menuGroupOrder),
    "admin-menu-route-order": JSON.stringify(menuRouteOrder),
    "admin-menu-route-visibility": JSON.stringify(menuRouteVisibility)
  })) return;
  menuSettingsSnapshot = null;
  menuSettingsVisible.value = false;
}

function clearMenuOrder() {
  for (const key of Object.keys(menuGroupOrder)) delete menuGroupOrder[key];
  for (const key of Object.keys(menuRouteOrder)) delete menuRouteOrder[key];
  for (const key of Object.keys(menuRouteVisibility)) delete menuRouteVisibility[key];
}

function resetMenuOrder() {
  if (!persistMenuSettings({
    "admin-menu-group-order": null,
    "admin-menu-route-order": null,
    "admin-menu-route-visibility": null
  })) return;
  clearMenuOrder();
  menuSettingsSnapshot = { groups: {}, routes: {}, visibility: {} };
}

function persistMenuSettings(values: Record<string, string | null>): boolean {
  const previous: Record<string, string | null> = {};
  try {
    for (const key of Object.keys(values)) previous[key] = window.localStorage.getItem(key);
    for (const [key, value] of Object.entries(values)) {
      if (value === null) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    }
    menuSettingsError.value = "";
    return true;
  } catch {
    // Keep the legacy preference keys consistent if a later write fails.
    for (const [key, value] of Object.entries(previous)) {
      try {
        if (value === null) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, value);
      } catch {
        // Some browsers deny both writes and rollback; keep the draft for retry.
      }
    }
    menuSettingsError.value = "菜单配置未能保存，请允许浏览器本地存储后重试。";
    return false;
  }
}

function saveMenuScroll(event: { scrollTop?: number }) {
  try {
    window.localStorage.setItem("admin-menu-scroll-top", String(event.scrollTop ?? 0));
  } catch {
    // Scrolling does not depend on persisted preferences.
  }
}

function restoreMenuScroll() {
  let saved = 0;
  try {
    saved = Number(window.localStorage.getItem("admin-menu-scroll-top") || 0);
  } catch {
    // Start at the active route if browser storage is blocked.
  }
  nextTick(() => {
    menuScrollbar.value?.setScrollTop?.(Number.isFinite(saved) ? saved : 0);
    scrollActiveMenuIntoView();
  });
}

function scrollActiveMenuIntoView() {
  if (!menuSearchVisible.value) return;
  document.querySelector(".admin-menu__link.is-active")?.scrollIntoView({ block: "nearest" });
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
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}

.admin-main--focused {
  width: 100%;
  overflow: auto;
  padding: 0;
  background: var(--admin-color-bg);
}

.admin-main--focused :deep(> .admin-page) {
  width: 100%;
  min-width: 1080px;
  max-width: none;
  margin: 0;
}
</style>
