<template>
  <view class="state empty-state">
    <view class="mark">{{ mark }}</view>
    <text class="title">{{ title }}</text>
    <text v-if="description" class="description">{{ description }}</text>
    <button v-if="actionText" class="ui-button-primary action" @click="$emit('action')">{{ actionText }}</button>
  </view>
</template>

<script setup lang="ts">
defineEmits<{
  action: [];
}>();

withDefaults(
  defineProps<{
    title: string;
    description?: string;
    actionText?: string;
    mark?: string;
  }>(),
  {
    description: "",
    actionText: "",
    mark: "空"
  }
);
</script>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 104rpx 36rpx;
  text-align: center;
}

.mark {
  display: grid;
  place-items: center;
  width: 92rpx;
  height: 92rpx;
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 26rpx;
  font-weight: 900;
}

.title {
  color: var(--ui-color-text);
  font-size: 32rpx;
  font-weight: 800;
}

.description {
  max-width: 560rpx;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.55;
}

.action {
  margin-top: 12rpx;
  min-width: 220rpx;
}
</style>
