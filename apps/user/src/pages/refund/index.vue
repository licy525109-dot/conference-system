<template>
  <view class="page ui-page">
    <view class="list-head">
      <view>
        <text class="title">我的退款</text>
        <text class="hint">报名和商城退款均需后台审核，微信退款以回调确认到账状态。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" :loading="loading" @click="load">刷新</button>
    </view>

    <view v-for="refund in refunds" :key="refund.id" class="item ui-card">
      <view class="row">
        <text class="name">{{ refund.refundNo }}</text>
        <text class="status">{{ statusText(refund.status) }}</text>
      </view>
      <text class="muted">{{ sourceText(refund.sourceType) }} · {{ refund.orderNo || "订单号待同步" }}</text>
      <text class="amount">¥{{ formatCent(refund.amountCent) }}</text>
      <text v-if="refund.reason" class="muted">原因：{{ refund.reason }}</text>
      <text v-if="refund.rejectReason" class="warning">驳回原因：{{ refund.rejectReason }}</text>
      <text v-if="refund.failedReason" class="warning">处理说明：{{ refund.failedReason }}</text>
      <text v-else-if="refund.refundNotice" class="muted">处理说明：{{ refund.refundNotice }}</text>
      <text class="muted">申请时间：{{ formatDate(refund.createdAt || refund.requestedAt) }}</text>
    </view>
    <view v-if="!loading && refunds.length === 0" class="ui-card empty">暂无退款记录</view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getMyRefunds, type FinanceRefund } from "@/services/operations";

const loading = ref(false);
const refunds = ref<FinanceRefund[]>([]);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    refunds.value = (await getMyRefunds()).items;
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : "退款记录加载失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

function sourceText(value: string) {
  return value === "MALL" ? "商城" : "报名";
}

function statusText(value: string) {
  return {
    REQUESTED: "待审核",
    APPROVED: "已通过",
    PROCESSING: "处理中",
    SUCCESS: "已退款",
    FAILED: "退款失败",
    REJECTED: "已驳回"
  }[value] || value;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value?: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "-";
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.list-head,
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.item {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 28rpx;
}

.title,
.name {
  color: var(--ui-color-text);
  font-size: 32rpx;
  font-weight: 900;
}

.hint,
.muted {
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.6;
}

.status {
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.amount {
  color: var(--ui-color-text);
  font-size: 34rpx;
  font-weight: 900;
}

.warning {
  color: #b45309;
  font-size: 24rpx;
}

.empty {
  padding: 32rpx;
  color: var(--ui-color-muted);
  text-align: center;
}
</style>
