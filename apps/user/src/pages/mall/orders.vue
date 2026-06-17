<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <text class="title">我的商城订单</text>
      <text class="subtitle">商城订单与会议报名订单分开管理。</text>
    </view>
    <LoadingState v-if="loading" title="加载商城订单" description="正在读取订单和履约状态。" />
    <EmptyState v-else-if="orders.length === 0" title="暂无商城订单" description="购买商品后会显示在这里。" mark="商" />
    <view v-for="order in orders" v-else :key="String(order.id)" class="order ui-card">
      <text class="name">{{ order.orderNo }}</text>
      <text class="muted">状态：{{ order.status }} · 金额：¥{{ formatCent(Number(order.payableAmountCent || 0)) }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { getMyMallOrders } from "@/services/operations";
import { formatCent } from "@/utils/money";

const loading = ref(false);
const orders = ref<Array<Record<string, unknown>>>([]);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    orders.value = (await getMyMallOrders()).items;
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.topbar,
.order {
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
</style>
