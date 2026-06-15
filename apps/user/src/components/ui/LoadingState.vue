<template>
  <view class="state loading-state">
    <view class="spinner" />
    <text class="title">{{ title }}</text>
    <text v-if="description" class="description">{{ description }}</text>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  {
    title: "加载中...",
    description: ""
  }
);
</script>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14rpx;
  padding: 118rpx 32rpx;
  text-align: center;
}

.spinner {
  width: 44rpx;
  height: 44rpx;
  border: 4rpx solid #d8e4f2;
  border-top-color: var(--ui-color-primary);
  border-radius: 50%;
}

.title {
  color: var(--ui-color-text);
  font-size: 29rpx;
  font-weight: 800;
}

.description {
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}
</style>
