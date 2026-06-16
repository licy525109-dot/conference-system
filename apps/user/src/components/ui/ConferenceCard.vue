<template>
  <view class="card ui-card" @click="$emit('open')">
    <view class="head">
      <view class="title-box">
        <text class="title">{{ title }}</text>
        <text class="summary">{{ summary || "会议报名已开放，查看详情后选择报名规格。" }}</text>
      </view>
      <StatusTag :label="statusLabel" :tone="statusTone" />
    </view>
    <view class="meta-grid">
      <view class="meta">
        <text class="meta-label">会议时间</text>
        <text class="meta-value">{{ formatDateTime(startsAt) }}</text>
      </view>
      <view class="meta">
        <text class="meta-label">会议地点</text>
        <text class="meta-value">{{ location || "待公布" }}</text>
      </view>
      <view class="meta">
        <text class="meta-label">报名截止</text>
        <text class="meta-value">{{ deadlineText || "以详情页为准" }}</text>
      </view>
      <view class="meta">
        <text class="meta-label">报名费用</text>
        <text class="price">{{ priceText || "查看票种" }}</text>
      </view>
    </view>
    <view class="foot">
      <text class="foot-note">{{ registrationCountText }}</text>
      <button class="ui-button-primary ui-button-compact action" @click.stop="$emit('open')">查看详情</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StatusTag from "./StatusTag.vue";
import { formatDateTime } from "@/utils/date";

const props = withDefaults(
  defineProps<{
    title: string;
    summary?: string | null;
    startsAt: string;
    endsAt?: string;
    location?: string | null;
    priceText?: string;
    deadlineText?: string;
    registrationCount?: number;
    statusLabel?: string;
    statusTone?: "info" | "success" | "warning" | "danger" | "neutral";
  }>(),
  {
    summary: "",
    endsAt: "",
    location: "",
    priceText: "",
    deadlineText: "",
    registrationCount: 0,
    statusLabel: "报名中",
    statusTone: "success"
  }
);

defineEmits<{
  open: [];
}>();

const registrationCountText = computed(() =>
  props.registrationCount > 0 ? `${props.registrationCount} 人已报名` : "名额以提交订单时系统校验为准"
);
</script>

<style scoped>
.card {
  position: relative;
  overflow: hidden;
  padding: 30rpx;
  background: var(--cms-gradient-card);
}

.card::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  width: 10rpx;
  height: 100%;
  background: var(--cms-gradient-cta);
}

.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
}

.title-box {
  flex: 1;
  min-width: 0;
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 35rpx;
  font-weight: 900;
  line-height: 1.35;
}

.summary {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.55;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-top: 24rpx;
  padding: 20rpx;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.meta {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.meta-label {
  color: var(--ui-color-subtle);
  font-size: 22rpx;
}

.meta-value,
.price {
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1.35;
}

.price {
  color: var(--cms-primary-strong);
}

.foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
  margin-top: 24rpx;
}

.foot-note {
  flex: 1;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.45;
}

.action {
  min-width: 172rpx;
  box-shadow: 0 14rpx 28rpx rgba(31, 77, 122, 0.18);
}
</style>
