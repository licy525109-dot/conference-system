<template>
  <view class="cms-stats-module" :class="[`is-${cardStyle}`, { 'has-intro': hasIntro }]">
    <view v-if="title || subtitle" class="cms-stats-module__intro">
      <text v-if="title" class="cms-stats-module__title">{{ title }}</text>
      <text v-if="subtitle" class="cms-stats-module__subtitle">{{ subtitle }}</text>
    </view>
    <view class="cms-stats-module__grid" :style="gridStyle">
      <view v-for="item in items" :key="item.id" class="cms-stats-module__item">
        <text class="cms-stats-module__value">{{ item.value }}</text>
        <text v-if="item.label" class="cms-stats-module__label">{{ item.label }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { normalizeStats, numberConfig, stringConfig } from "./config";

const props = defineProps<{
  component: CmsComponent;
  userContext?: Record<string, unknown> | null;
}>();

const title = computed(() => stringConfig(props.component, "title"));
const subtitle = computed(() => stringConfig(props.component, "subtitle"));
const hasIntro = computed(() => Boolean(title.value || subtitle.value));
const cardStyle = computed(() => stringConfig(props.component, "cardStyle", "split"));
const items = computed(() => normalizeStats(props.component, props.userContext));
const columns = computed(() => Math.min(4, Math.max(2, numberConfig(props.component, "columns", Math.min(4, Math.max(2, items.value.length))))));
const gridStyle = computed(() => ({ gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` }));
</script>

<style scoped>
.cms-stats-module {
  display: block;
  align-items: stretch;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 16rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-md);
}

.cms-stats-module.has-intro {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.4fr);
}

.cms-stats-module__intro {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8rpx;
  padding: 30rpx;
  border-right: 1rpx solid var(--cms-border);
}

.cms-stats-module__title {
  color: var(--cms-text-primary);
  font-size: 32rpx;
  font-weight: 700;
  line-height: 1.3;
}

.cms-stats-module__subtitle,
.cms-stats-module__label {
  color: var(--cms-text-secondary);
  font-size: 21rpx;
  line-height: 1.4;
}

.cms-stats-module__grid {
  display: grid;
  min-width: 0;
}

.cms-stats-module__item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5rpx;
  padding: 26rpx 14rpx;
}

.cms-stats-module__item + .cms-stats-module__item {
  border-left: 1rpx solid var(--cms-border);
}

.cms-stats-module__value {
  max-width: 100%;
  overflow: hidden;
  color: var(--cms-accent);
  font-size: 38rpx;
  font-weight: 700;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-stats-module.is-plain {
  border-color: transparent;
  box-shadow: none;
}

@media (max-width: 430px) {
  .cms-stats-module.has-intro {
    grid-template-columns: 1fr;
  }

  .cms-stats-module__intro {
    border-right: 0;
    border-bottom: 1rpx solid var(--cms-border);
  }
}
</style>
