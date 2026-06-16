<template>
  <view :class="['bar', { 'with-tabbar': tabbarOffset }]">
    <view v-if="amountLabel || amountValue || note" class="summary">
      <text v-if="amountLabel" class="label">{{ amountLabel }}</text>
      <text v-if="amountValue" class="amount">{{ amountValue }}</text>
      <text v-if="note" class="note">{{ note }}</text>
    </view>
    <view class="actions">
      <button
        v-if="secondaryText"
        class="ui-button-secondary button secondary"
        :disabled="secondaryDisabled"
        @click="$emit('secondary')"
      >
        {{ secondaryText }}
      </button>
      <button class="ui-button-primary button primary" :disabled="primaryDisabled" @click="$emit('primary')">
        {{ loading ? loadingText : primaryText }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
defineEmits<{
  primary: [];
  secondary: [];
}>();

withDefaults(
  defineProps<{
    amountLabel?: string;
    amountValue?: string;
    note?: string;
    primaryText: string;
    secondaryText?: string;
    loading?: boolean;
    loadingText?: string;
    primaryDisabled?: boolean;
    secondaryDisabled?: boolean;
    tabbarOffset?: boolean;
  }>(),
  {
    amountLabel: "",
    amountValue: "",
    note: "",
    secondaryText: "",
    loading: false,
    loadingText: "处理中...",
    primaryDisabled: false,
    secondaryDisabled: false,
    tabbarOffset: false
  }
);
</script>

<style scoped>
.bar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 28;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18rpx;
  align-items: center;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 1px solid var(--cms-border);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: var(--ui-shadow-bottom);
  box-sizing: border-box;
}

.with-tabbar {
  bottom: 112rpx;
}

.summary {
  min-width: 0;
}

.label,
.note {
  display: block;
  color: var(--ui-color-muted);
  font-size: 22rpx;
  line-height: 1.35;
}

.amount {
  display: block;
  color: var(--cms-primary-strong);
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.25;
}

.actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.button {
  min-width: 188rpx;
  border-radius: var(--cms-radius-full);
}

.secondary {
  min-width: 170rpx;
}

.primary {
  min-width: 210rpx;
}
</style>
