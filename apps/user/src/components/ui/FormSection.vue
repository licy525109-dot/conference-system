<template>
  <view class="section ui-card">
    <view class="head">
      <text v-if="step" class="step">{{ step }}</text>
      <view class="title-box">
        <text class="title">{{ title }}</text>
        <text v-if="description" class="description">{{ description }}</text>
      </view>
    </view>
    <view class="body">
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    description?: string;
    step?: string;
  }>(),
  {
    description: "",
    step: ""
  }
);
</script>

<style scoped>
.section {
  padding: 28rpx;
}

.head {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
}

.step {
  display: grid;
  place-items: center;
  width: 46rpx;
  height: 46rpx;
  border-radius: 50%;
  background: var(--ui-color-primary);
  color: #ffffff;
  font-size: 23rpx;
  font-weight: 900;
}

.title-box {
  flex: 1;
  min-width: 0;
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 31rpx;
  font-weight: 900;
  line-height: 1.35;
}

.description {
  display: block;
  margin-top: 6rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.body {
  margin-top: 24rpx;
}
</style>
