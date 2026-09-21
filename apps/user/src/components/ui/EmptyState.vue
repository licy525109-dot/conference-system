<template>
  <view class="state empty-state">
    <view class="mark" aria-hidden="true"><wd-icon :name="mark === '讯' ? 'notification' : 'info-circle'" size="28px" /></view>
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
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
}

.title {
  color: var(--ui-color-text);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.description {
  max-width: 100%;
  color: var(--ui-color-muted);
  font-size: 18px;
  line-height: 1.55;
}

.action {
  margin-top: 12rpx;
  min-width: 220rpx;
}
</style>
