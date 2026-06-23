<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <text class="title">我的优惠券</text>
      <text class="subtitle">会议券用于报名，商品券用于商城，通用券两边都可用。最终抵扣以下单时后端重新计算为准。</text>
    </view>

    <view class="tabs ui-card">
      <button v-for="tab in tabs" :key="tab.key" :class="['tab', activeTab === tab.key ? 'active' : '']" @click="activeTab = tab.key">{{ tab.label }}</button>
    </view>

    <LoadingState v-if="loading" title="加载优惠券" description="正在读取已领取优惠券。" />
    <EmptyState v-else-if="filteredItems.length === 0" title="暂无优惠券" description="领取活动优惠券后会显示在这里。" mark="券" />
    <view v-for="item in filteredItems" v-else :key="item.id" class="coupon ui-card">
      <view class="coupon-main">
        <view>
          <text class="scope">{{ item.scopeText || scopeText(item.coupon.scope) }}</text>
          <text class="name">{{ item.coupon.name }}</text>
          <text class="code">{{ item.coupon.code }}</text>
        </view>
        <text :class="['status', item.usable ? 'usable' : '']">{{ item.statusText || item.status }}</text>
      </view>
      <view class="coupon-meta">
        <text>{{ discountText(item) }}</text>
        <text>{{ thresholdText(item) }}</text>
        <text v-if="item.coupon.endAt">有效期至 {{ shortDate(item.coupon.endAt) }}</text>
      </view>
      <view class="coupon-actions">
        <button class="ui-button-secondary ui-button-compact" @click="copyCode(item.coupon.code)">复制券码</button>
        <button class="ui-button-primary ui-button-compact" :disabled="!item.usable" @click="useCoupon(item)">{{ item.usable ? "去使用" : "不可用" }}</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { getMyCoupons, type CouponScope, type MyCouponItem } from "@/services/operations";
import { formatCent } from "@/utils/money";

const tabs: Array<{ key: "ALL" | CouponScope; label: string }> = [
  { key: "ALL", label: "全部" },
  { key: "CONFERENCE", label: "会议券" },
  { key: "MALL", label: "商品券" },
  { key: "BOTH", label: "通用券" }
];

const loading = ref(false);
const items = ref<MyCouponItem[]>([]);
const activeTab = ref<"ALL" | CouponScope>("ALL");

const filteredItems = computed(() =>
  activeTab.value === "ALL"
    ? items.value
    : items.value.filter((item) => item.coupon.scope === activeTab.value || (activeTab.value !== "BOTH" && item.coupon.scope === "BOTH"))
);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await getMyCoupons()).items;
  } finally {
    loading.value = false;
  }
}

function discountText(item: MyCouponItem) {
  if (item.coupon.type === "AMOUNT") return `立减 ¥${formatCent(item.coupon.discountAmountCent ?? 0)}`;
  return `${((item.coupon.discountPercent ?? 0) / 100).toFixed(2)} 折优惠`;
}

function thresholdText(item: MyCouponItem) {
  const parts = [];
  if (item.coupon.minAmountCent) parts.push(`满 ¥${formatCent(item.coupon.minAmountCent)} 可用`);
  if (item.coupon.minQuantity) parts.push(`满 ${item.coupon.minQuantity} 件/张可用`);
  return parts.length > 0 ? parts.join("，") : "无门槛";
}

function scopeText(scope: CouponScope) {
  if (scope === "MALL") return "商品优惠券";
  if (scope === "BOTH") return "通用券";
  return "会议优惠券";
}

function shortDate(value: string) {
  return value.slice(0, 10);
}

function copyCode(code: string) {
  uni.setClipboardData({ data: code });
}

function useCoupon(item: MyCouponItem) {
  if (!item.usable) return;
  const path = item.usePath || (item.coupon.scope === "MALL" ? "/pages/mall/index" : "/pages/index/index");
  uni.setStorageSync("pendingCouponForUse", { code: item.coupon.code, scope: item.coupon.scope, savedAt: Date.now() });
  if (isTabbarPath(path)) {
    uni.switchTab({ url: path.split("?")[0] });
    return;
  }
  uni.navigateTo({ url: appendCouponQuery(path, item.coupon.code, item.coupon.scope) });
}

function appendCouponQuery(path: string, code: string, scope: CouponScope) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}couponCode=${encodeURIComponent(code)}&couponScope=${encodeURIComponent(scope)}`;
}

function isTabbarPath(path: string) {
  return ["/pages/index/index", "/pages/mall/index", "/pages/member/center"].includes(path.split("?")[0]);
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.topbar,
.tabs,
.coupon {
  padding: 28rpx;
}

.title,
.name {
  display: block;
  color: var(--ui-color-text);
  font-weight: 900;
}

.title {
  font-size: 40rpx;
}

.subtitle {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.55;
}

.tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
}

.tab {
  min-height: 64rpx;
  padding: 0;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.tab.active {
  background: var(--ui-color-primary);
  color: #ffffff;
}

.coupon {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.coupon-main,
.coupon-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.scope,
.status {
  display: inline-flex;
  padding: 8rpx 16rpx;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 22rpx;
  font-weight: 800;
}

.status {
  background: #edf2f7;
  color: var(--ui-color-muted);
}

.status.usable {
  background: var(--ui-color-success-soft);
  color: var(--ui-color-success);
}

.name {
  margin-top: 12rpx;
  font-size: 32rpx;
}

.code {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-primary);
  font-size: 30rpx;
  font-weight: 900;
  letter-spacing: 0;
}

.coupon-meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}
</style>
