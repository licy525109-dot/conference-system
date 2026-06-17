<template>
  <view v-if="tabbar.enabled && visibleItems.length > 0" class="custom-tabbar">
    <view v-for="item in visibleItems" :key="item.id" class="custom-tabbar__item" :class="{ active: isActive(item) }" hover-class="custom-tabbar__item--pressed" hover-stay-time="100" @click="go(item)">
      <image v-if="iconFor(item)" class="custom-tabbar__icon" :src="iconFor(item)" mode="aspectFit" />
      <view v-else class="custom-tabbar__glyph">{{ fallbackGlyph(item) }}</view>
      <text class="custom-tabbar__label">{{ item.title }}</text>
      <text v-if="item.badgeText" class="custom-tabbar__badge">{{ item.badgeText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getAppTabbar, type AppTabbar, type TabbarItem } from "@/services/cms";
import { getToken } from "@/services/session";
import { stringifyQuery } from "@/utils/query";

const props = defineProps<{
  activePageKey: string;
}>();

const tabbar = ref<AppTabbar>({ enabled: false, updatedAt: null, items: [] });
const visibleItems = computed(() => tabbar.value.items.filter((item) => item.visible).sort((a, b) => a.sortOrder - b.sortOrder));

onMounted(async () => {
  tabbar.value = await getAppTabbar();
});

function isActive(item: TabbarItem): boolean {
  return item.pageKey === props.activePageKey;
}

function iconFor(item: TabbarItem): string {
  return (isActive(item) ? item.selectedIconUrl : item.iconUrl) || "";
}

function fallbackGlyph(item: TabbarItem): string {
  const title = item.title.trim();
  if (!title) return "•";
  if (title.includes("报名")) return "票";
  if (title.includes("购物") || title.includes("车")) return "购";
  if (title.includes("会员")) return "会";
  if (title.includes("商城")) return "商";
  return title.slice(0, 1);
}

function go(item: TabbarItem) {
  if (item.requireLogin && !getToken()) {
    uni.showToast({ title: "请先授权登录", icon: "none" });
    return;
  }
  const url = item.path.startsWith("/") ? item.path : `/${item.path}`;
  if (url === currentUrl()) {
    return;
  }
  if (url === "/pages/index/index") {
    uni.reLaunch({ url });
    return;
  }
  if (isTabbarLikePage(url)) {
    uni.reLaunch({ url });
    return;
  }
  uni.navigateTo({ url });
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
  min-height: 124rpx;
  padding: 14rpx 18rpx calc(14rpx + env(safe-area-inset-bottom));
  border-top: 1px solid var(--cms-border);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--ui-shadow-bottom);
  backdrop-filter: blur(12px);
}

.custom-tabbar__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7rpx;
  min-width: 0;
  color: var(--ui-color-muted);
  font-size: 22rpx;
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

.custom-tabbar__icon,
.custom-tabbar__glyph {
  width: 44rpx;
  height: 44rpx;
}

.custom-tabbar__glyph {
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
  font-size: 20rpx;
  font-weight: 900;
  line-height: 1;
}

.custom-tabbar__item.active .custom-tabbar__glyph {
  background: var(--cms-gradient-cta);
  color: #ffffff;
  box-shadow: 0 8rpx 18rpx rgba(49, 93, 125, 0.22);
}

.custom-tabbar__label {
  max-width: 132rpx;
  overflow: hidden;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
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
