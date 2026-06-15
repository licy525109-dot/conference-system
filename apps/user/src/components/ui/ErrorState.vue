<template>
  <view class="state error-state">
    <view class="mark">!</view>
    <text class="title">{{ title }}</text>
    <text class="description">{{ message }}</text>
    <view class="actions">
      <button v-if="primaryText" class="ui-button-primary action" @click="$emit('retry')">{{ primaryText }}</button>
      <button v-if="secondaryText" class="ui-button-secondary action" @click="$emit('secondary')">{{ secondaryText }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
defineEmits<{
  retry: [];
  secondary: [];
}>();

withDefaults(
  defineProps<{
    title?: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
  }>(),
  {
    title: "加载失败",
    primaryText: "重试",
    secondaryText: ""
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
  background: #fff1ef;
  color: var(--ui-color-danger);
  font-size: 42rpx;
  font-weight: 900;
}

.title {
  color: var(--ui-color-text);
  font-size: 32rpx;
  font-weight: 800;
}

.description {
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.55;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 10rpx;
}

.action {
  min-width: 178rpx;
}
</style>
