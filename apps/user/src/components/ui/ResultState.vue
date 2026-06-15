<template>
  <view :class="['result', `result-${tone}`]">
    <view class="icon">{{ iconText }}</view>
    <text class="title">{{ title }}</text>
    <text v-if="description" class="description">{{ description }}</text>
    <view v-if="orderNo || timeText" class="meta ui-card">
      <view v-if="orderNo" class="line">
        <text>订单号</text>
        <text>{{ orderNo }}</text>
      </view>
      <view v-if="timeText" class="line">
        <text>支付时间</text>
        <text>{{ timeText }}</text>
      </view>
    </view>
    <view class="actions">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    tone?: "success" | "warning" | "danger" | "info";
    title: string;
    description?: string;
    orderNo?: string;
    timeText?: string;
  }>(),
  {
    tone: "info",
    description: "",
    orderNo: "",
    timeText: ""
  }
);

const iconText = computed(() => {
  if (props.tone === "success") return "✓";
  if (props.tone === "danger") return "!";
  if (props.tone === "warning") return "…";
  return "i";
});
</script>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18rpx;
  padding: 72rpx 0 36rpx;
  text-align: center;
}

.icon {
  display: grid;
  place-items: center;
  width: 112rpx;
  height: 112rpx;
  border-radius: 50%;
  color: #ffffff;
  font-size: 56rpx;
  font-weight: 900;
}

.result-success .icon {
  background: var(--ui-color-success);
}

.result-warning .icon {
  background: var(--ui-color-warning);
}

.result-danger .icon {
  background: var(--ui-color-danger);
}

.result-info .icon {
  background: var(--ui-color-primary);
}

.title {
  color: var(--ui-color-text);
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.25;
}

.description {
  max-width: 610rpx;
  color: var(--ui-color-muted);
  font-size: 27rpx;
  line-height: 1.6;
}

.meta {
  width: 100%;
  margin-top: 16rpx;
  padding: 24rpx;
  box-sizing: border-box;
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.45;
  text-align: left;
}

.line + .line {
  margin-top: 12rpx;
}

.line text:last-child {
  flex: 1;
  color: var(--ui-color-text);
  font-weight: 800;
  text-align: right;
  word-break: break-all;
}

.actions {
  width: 100%;
  margin-top: 8rpx;
}
</style>
