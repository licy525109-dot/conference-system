<template>
  <view class="state error-state" :class="{ 'network-state': tone === 'network' }" role="status">
    <view class="mark" aria-hidden="true"><wd-icon :name="tone === 'network' ? 'wifi-error' : 'warning'" size="28px" /></view>
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
    tone?: "network" | "error";
  }>(),
  {
    title: "加载失败",
    primaryText: "重试",
    secondaryText: "",
    tone: "error"
  }
);
</script>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 52px 20px;
  text-align: center;
}

.mark {
  display: grid;
  place-items: center;
  width: 56px;
  height: 56px;
  border-radius: var(--ui-radius);
  background: #fff1ef;
  color: var(--ui-color-danger);
}

.title {
  color: var(--ui-color-text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.network-state .mark {
  background: #f4f0e5;
  color: var(--ui-color-primary);
}

.description {
  max-width: 440px;
  color: var(--ui-color-muted);
  font-size: 18px;
  line-height: 1.55;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 16rpx;
  margin-top: 10rpx;
}

.action {
  min-width: 178rpx;
  max-width: 100%;
  white-space: normal;
}
</style>
