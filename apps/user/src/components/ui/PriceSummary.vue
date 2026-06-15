<template>
  <view class="summary ui-card">
    <view class="head">
      <text class="title">{{ title }}</text>
      <text v-if="loading" class="loading">计算中</text>
    </view>
    <view v-if="error" class="error">{{ error }}</view>
    <view v-else class="lines">
      <view class="line">
        <text>原价金额</text>
        <text>¥{{ formatCent(originAmountCent) }}</text>
      </view>
      <view v-if="discountAmountCent > 0" class="line discount">
        <text>优惠金额</text>
        <text>-¥{{ formatCent(discountAmountCent) }}</text>
      </view>
      <view v-for="item in discounts" :key="`${item.type}-${item.title}`" class="message">{{ item.title }}</view>
      <view v-for="message in messages" :key="message" class="message">{{ message }}</view>
      <view class="line total">
        <text>应付金额</text>
        <text class="price">¥{{ formatCent(payableAmountCent) }}</text>
      </view>
    </view>
    <text v-if="note" class="note">{{ note }}</text>
  </view>
</template>

<script setup lang="ts">
import { formatCent } from "@/utils/money";

interface DiscountItem {
  type: string;
  title: string;
}

withDefaults(
  defineProps<{
    title?: string;
    originAmountCent: number;
    discountAmountCent?: number;
    payableAmountCent: number;
    discounts?: DiscountItem[];
    messages?: string[];
    loading?: boolean;
    error?: string;
    note?: string;
  }>(),
  {
    title: "费用确认",
    discountAmountCent: 0,
    discounts: () => [],
    messages: () => [],
    loading: false,
    error: "",
    note: ""
  }
);
</script>

<style scoped>
.summary {
  padding: 26rpx;
}

.head,
.line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.title {
  color: var(--ui-color-text);
  font-size: 30rpx;
  font-weight: 900;
}

.loading {
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.lines {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 20rpx;
  color: var(--ui-color-muted);
  font-size: 26rpx;
}

.discount,
.message {
  color: var(--ui-color-success);
}

.message {
  font-size: 24rpx;
  line-height: 1.45;
}

.total {
  margin-top: 8rpx;
  padding-top: 18rpx;
  border-top: 1px solid var(--ui-color-border);
  color: var(--ui-color-text);
  font-weight: 900;
}

.price {
  color: var(--ui-color-primary);
  font-size: 38rpx;
  font-weight: 900;
}

.note,
.error {
  display: block;
  margin-top: 18rpx;
  font-size: 24rpx;
  line-height: 1.5;
}

.note {
  color: var(--ui-color-subtle);
}

.error {
  color: var(--ui-color-danger);
}
</style>
