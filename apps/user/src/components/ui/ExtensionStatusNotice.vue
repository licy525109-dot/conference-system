<template>
  <view :class="['notice', `notice-${tone}`]">
    <view class="notice-head">
      <StatusTag :label="status" :tone="tone" />
      <text class="title">{{ title }}</text>
    </view>
    <text class="description">{{ description }}</text>
  </view>
</template>

<script setup lang="ts">
import StatusTag from "./StatusTag.vue";

withDefaults(
  defineProps<{
    status: string;
    title: string;
    description: string;
    tone?: "info" | "success" | "warning" | "danger" | "neutral";
  }>(),
  {
    tone: "info"
  }
);
</script>

<style scoped>
.notice {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.notice-info {
  border-color: #cfe0f7;
  background: #f7fbff;
}

.notice-success {
  border-color: #cdece0;
  background: #f6fcf9;
}

.notice-warning {
  border-color: #f4dfb8;
  background: #fffbf1;
}

.notice-danger {
  border-color: #f4cac4;
  background: #fff8f7;
}

.notice-neutral {
  background: var(--ui-color-surface-muted);
}

.notice-head {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.title {
  min-width: 0;
  color: var(--ui-color-text);
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
}

.description {
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.55;
}
</style>
