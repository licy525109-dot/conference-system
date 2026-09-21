<template>
  <view v-if="tabbar.enabled && visibleItems.length > 0" class="custom-tabbar">
    <view v-for="item in visibleItems" :key="item.id" class="custom-tabbar__item" :class="{ active: isActive(item) }" hover-class="custom-tabbar__item--pressed" hover-stay-time="100" @click="go(item)">
      <image v-if="iconFor(item)" class="custom-tabbar__icon" :src="iconFor(item)" mode="aspectFit" />
      <wd-icon v-else :name="fallbackIcon(item)" size="24px" />
      <text class="custom-tabbar__label">{{ item.title }}</text>
      <text v-if="item.badgeText" class="custom-tabbar__badge">{{ item.badgeText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { getAppTabbar, type AppTabbar, type TabbarItem } from "@/services/cms";
import { ensureAuthenticatedUser } from "@/services/auth";
import { getToken } from "@/services/session";
import { stringifyQuery } from "@/utils/query";
import { isWechatProfileComplete } from "@/utils/wechatProfilePrompt";
import { getUnreadNotificationCount } from "@/services/user-notifications";

const props = defineProps<{
  activePageKey: string;
}>();

const tabbar = ref<AppTabbar>({ enabled: false, updatedAt: null, items: [] });
const unreadCount = ref(0);
const visibleItems = computed(() => tabbar.value.items
  .filter((item) => item.visible)
  .map((item) => item.pageKey === "notifications"
    ? { ...item, badgeText: unreadCount.value > 99 ? "99+" : unreadCount.value > 0 ? String(unreadCount.value) : null }
    : item)
  .sort((a, b) => a.sortOrder - b.sortOrder));

onMounted(async () => {
  const loaded = await getAppTabbar();
  const hasNotificationItem = loaded.items.some((item) => item.pageKey === "notifications" || item.path.includes("/pages/notifications/"));
  tabbar.value = {
    ...loaded,
    enabled: true,
    items: hasNotificationItem
      ? loaded.items
      : [
          ...loaded.items,
          {
            id: "system-notifications",
            title: "消息",
            iconUrl: null,
            selectedIconUrl: null,
            pageKey: "notifications",
            path: "/pages/notifications/index",
            visible: true,
            sortOrder: 900,
            requireLogin: true,
            badgeText: null
          }
        ]
  };
  await refreshUnreadCount();
  uni.$on("notifications:changed", refreshUnreadCount);
});

onUnmounted(() => {
  uni.$off("notifications:changed", refreshUnreadCount);
});

async function refreshUnreadCount() {
  if (!getToken()) {
    unreadCount.value = 0;
    return;
  }
  try {
    unreadCount.value = (await getUnreadNotificationCount()).count;
  } catch {
    unreadCount.value = 0;
  }
}

function isActive(item: TabbarItem): boolean {
  return item.pageKey === props.activePageKey;
}

function iconFor(item: TabbarItem): string {
  return (isActive(item) ? item.selectedIconUrl : item.iconUrl) || "";
}

function fallbackIcon(item: TabbarItem): string {
  if (item.pageKey === "home") return "home";
  if (item.pageKey === "notifications") return "chat";
  if (item.pageKey === "cart") return "cart";
  if (item.pageKey === "mall") return "shop";
  if (item.pageKey === "my-registrations") return "calendar";
  return "user";
}

async function go(item: TabbarItem) {
  let openProfileAfterNavigate = false;
  if (item.requireLogin) {
    try {
      const wasLoggedOut = !getToken();
      const user = await ensureAuthenticatedUser();
      openProfileAfterNavigate = wasLoggedOut && !isWechatProfileComplete(user);
    } catch {
      uni.showModal({
        title: "需要微信登录",
        content: "登录后才能查看与你有关的报名、消息和会务安排。",
        confirmText: "重新登录",
        cancelText: "取消",
        success: (result) => {
          if (result.confirm) void go(item);
        }
      });
      return;
    }
  }
  const url = item.path.startsWith("/") ? item.path : `/${item.path}`;
  if (url === currentUrl()) {
    if (openProfileAfterNavigate) emitProfilePromptSoon();
    return;
  }
  if (url === "/pages/index/index") {
    uni.reLaunch({ url });
    if (openProfileAfterNavigate) emitProfilePromptSoon();
    return;
  }
  if (isTabbarLikePage(url)) {
    uni.reLaunch({ url });
    if (openProfileAfterNavigate) emitProfilePromptSoon();
    return;
  }
  uni.navigateTo({ url });
  if (openProfileAfterNavigate) emitProfilePromptSoon();
}

function emitProfilePromptSoon() {
  setTimeout(() => uni.$emit("wechat-profile:open"), 260);
}

function currentUrl(): string {
  const pages = getCurrentPages();
  const top = pages[pages.length - 1] as unknown as { route?: string; options?: Record<string, string> };
  const route = top?.route ? `/${top.route}` : "";
  const query = stringifyQuery(top?.options ?? {});
  return query ? `${route}?${query}` : route;
}

function isTabbarLikePage(url: string): boolean {
  const path = url.split("?")[0];
  return [
    "/pages/registrations/my",
    "/pages/notifications/index",
    "/pages/cart/index",
    "/pages/member/center",
    "/pages/mall/index"
  ].includes(path);
}
</script>

<style scoped>
.custom-tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  min-height: calc(68px + env(safe-area-inset-bottom));
  padding: 8px 12px calc(8px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--cms-border);
  background: #ffffff;
  box-shadow: none;
  box-sizing: border-box;
}

.custom-tabbar__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 50px;
  min-width: 0;
  color: var(--ui-color-muted);
  font-size: 14px;
  font-weight: 700;
  transition: transform 140ms ease, color 140ms ease;
}

.custom-tabbar__item--pressed {
  transform: translateY(1rpx) scale(0.98);
}

.custom-tabbar__item.active {
  color: var(--cms-primary-strong);
  font-weight: 900;
}

.custom-tabbar__icon {
  width: 44rpx;
  height: 44rpx;
}

.custom-tabbar__label {
  max-width: 100%;
  line-height: 1.4;
  text-align: center;
  white-space: normal;
  overflow-wrap: anywhere;
}

.custom-tabbar__badge {
  position: absolute;
  top: 4rpx;
  right: 22%;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border-radius: 14rpx;
  background: var(--ui-color-danger);
  color: #ffffff;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
}
</style>
