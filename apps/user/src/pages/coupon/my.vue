<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <text class="title">我的优惠券</text>
      <text class="subtitle">下单时使用优惠码，最终金额以后端重新计价为准。</text>
    </view>
    <LoadingState v-if="loading" title="加载优惠券" description="正在读取已领取优惠券。" />
    <EmptyState v-else-if="items.length === 0" title="暂无优惠券" description="领取活动优惠券后会显示在这里。" mark="券" />
    <view v-for="item in items" v-else :key="String(item.id)" class="coupon ui-card">
      <text class="name">{{ couponName(item) }}</text>
      <text class="code">{{ couponCode(item) }}</text>
      <text class="muted">状态：{{ item.status }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { getMyCoupons } from "@/services/operations";

const loading = ref(false);
const items = ref<Array<Record<string, unknown>>>([]);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await getMyCoupons()).items;
  } finally {
    loading.value = false;
  }
}

function couponName(item: Record<string, unknown>) {
  const coupon = item.coupon as Record<string, unknown> | undefined;
  return String(coupon?.name || "优惠券");
}

function couponCode(item: Record<string, unknown>) {
  const coupon = item.coupon as Record<string, unknown> | undefined;
  return String(coupon?.code || "-");
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.topbar,
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

.name {
  font-size: 30rpx;
}

.subtitle,
.muted {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.code {
  display: block;
  margin-top: 14rpx;
  color: var(--ui-color-primary);
  font-size: 34rpx;
  font-weight: 900;
  letter-spacing: 0;
}
</style>
