<template>
  <view v-if="tabbar.enabled && visibleItems.length > 0" class="custom-tabbar">
    <view v-for="item in visibleItems" :key="item.id" class="custom-tabbar__item" :class="{ active: isActive(item) }" @click="go(item)">
      <image v-if="iconFor(item)" class="custom-tabbar__icon" :src="iconFor(item)" mode="aspectFit" />
      <view v-else class="custom-tabbar__dot" />
      <text>{{ item.title }}</text>
      <text v-if="item.badgeText" class="custom-tabbar__badge">{{ item.badgeText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { getAppTabbar, type AppTabbar, type TabbarItem } from "@/services/cms";
import { getToken } from "@/services/session";

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
  uni.navigateTo({ url });
}

function currentUrl(): string {
  const pages = getCurrentPages();
  const top = pages[pages.length - 1] as unknown as { route?: string; options?: Record<string, string> };
  const route = top?.route ? `/${top.route}` : "";
  const params = new URLSearchParams(top?.options ?? {});
  return params.toString() ? `${route}?${params.toString()}` : route;
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
  min-height: 104rpx;
  padding: 10rpx 12rpx calc(10rpx + env(safe-area-inset-bottom));
  border-top: 1px solid #dce3ef;
  background: #ffffff;
  box-shadow: 0 -8rpx 24rpx rgba(15, 23, 42, 0.06);
}

.custom-tabbar__item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: #637083;
  font-size: 22rpx;
}

.custom-tabbar__item.active {
  color: #2452a8;
  font-weight: 800;
}

.custom-tabbar__icon,
.custom-tabbar__dot {
  width: 42rpx;
  height: 42rpx;
}

.custom-tabbar__dot {
  border-radius: 14rpx;
  background: currentColor;
  opacity: 0.2;
}

.custom-tabbar__item.active .custom-tabbar__dot {
  opacity: 1;
}

.custom-tabbar__badge {
  position: absolute;
  top: 4rpx;
  right: 22%;
  min-width: 28rpx;
  height: 28rpx;
  padding: 0 8rpx;
  border-radius: 14rpx;
  background: #ef4444;
  color: #ffffff;
  font-size: 18rpx;
  line-height: 28rpx;
  text-align: center;
}
</style>
