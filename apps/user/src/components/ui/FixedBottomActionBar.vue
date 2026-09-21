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
  background: #ffffff;
  box-shadow: none;
  box-sizing: border-box;
}

.with-tabbar {
  bottom: calc(var(--ui-tabbar-height, 68px) + env(safe-area-inset-bottom));
  padding-bottom: 18rpx;
}

.summary {
  min-width: 0;
}

.label,
.note {
  display: block;
  color: var(--ui-color-muted);
  font-size: 14px;
  line-height: 1.35;
}

.amount {
  display: block;
  color: var(--cms-primary-strong);
  font-size: 23px;
  font-weight: 700;
  overflow-wrap: anywhere;
  line-height: 1.25;
}

.actions {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.button {
  min-width: 188rpx;
  border-radius: var(--cms-radius-md);
}

.secondary {
  min-width: 170rpx;
}

.primary {
  min-width: 210rpx;
}
</style>
