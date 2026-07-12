<template>
  <view :class="rootClass" :style="panelStyle">
    <view v-if="showTitle && (title || subtitle || showMore)" class="cms-entry-module__head">
      <view class="cms-entry-module__heading">
        <text v-if="title" class="cms-entry-module__title">{{ title }}</text>
        <text v-if="subtitle" class="cms-entry-module__subtitle">{{ subtitle }}</text>
      </view>
      <text v-if="showMore" class="cms-entry-module__more" @click.stop="emit('more')">{{ moreText }}</text>
    </view>

    <scroll-view v-if="layoutMode === 'scroll'" scroll-x class="cms-entry-module__scroll">
      <view class="cms-entry-module__grid is-scroll" :style="gridStyle">
        <CmsEntryTile v-for="entry in entries" :key="entry.id" :entry="entry" :component="component" :layout-mode="layoutMode" @activate="emit('activate', entry)" />
      </view>
    </scroll-view>
    <view v-else class="cms-entry-module__grid" :class="`is-${layoutMode}`" :style="gridStyle">
      <CmsEntryTile v-for="entry in entries" :key="entry.id" :entry="entry" :component="component" :layout-mode="layoutMode" @activate="emit('activate', entry)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { booleanConfig, numberConfig, stringConfig, type CmsEntryItem } from "./config";
import CmsEntryTile from "./CmsEntryTile.vue";

const props = defineProps<{
  component: CmsComponent;
  entries: CmsEntryItem[];
}>();
const emit = defineEmits<{ activate: [entry: CmsEntryItem]; more: [] }>();

const title = computed(() => stringConfig(props.component, "title"));
const subtitle = computed(() => stringConfig(props.component, "subtitle"));
const showTitle = computed(() => booleanConfig(props.component, "showTitle", true));
const showMore = computed(() => booleanConfig(props.component, "showMore", false));
const moreText = computed(() => stringConfig(props.component, "moreText", "查看更多"));
const layoutMode = computed<"grid" | "scroll" | "list">(() => {
  const value = stringConfig(props.component, "layoutMode", "grid");
  return value === "scroll" || value === "list" ? value : "grid";
});
const columns = computed(() => Math.min(5, Math.max(2, numberConfig(props.component, "columns", props.component.type === "service-shortcut-card" ? 2 : 3))));
const gap = computed(() => Math.min(48, Math.max(4, numberConfig(props.component, "cardGap", 14))));
const rootClass = computed(() => ["cms-entry-module", `is-${stringConfig(props.component, "cardStyle", "soft")}`]);
const panelStyle = computed(() => ({
  ...(stringConfig(props.component, "backgroundColor") ? { background: stringConfig(props.component, "backgroundColor") } : {}),
  borderRadius: `${Math.min(48, Math.max(0, numberConfig(props.component, "radius", 16)))}rpx`
}));
const gridStyle = computed(() => layoutMode.value === "scroll"
  ? { gap: `${gap.value}rpx` }
  : layoutMode.value === "list"
    ? { gap: `${gap.value}rpx` }
    : { gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))`, gap: `${gap.value}rpx` });

</script>

<style scoped>
.cms-entry-module {
  min-width: 0;
  padding: 28rpx;
  border: 1rpx solid var(--cms-border);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-md);
}

.cms-entry-module__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
}

.cms-entry-module__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4rpx;
}

.cms-entry-module__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.3;
}

.cms-entry-module__subtitle,
.cms-entry-module__more {
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  line-height: 1.4;
}

.cms-entry-module__more {
  flex: none;
  padding-top: 4rpx;
  color: var(--cms-accent);
}

.cms-entry-module__grid {
  display: grid;
  min-width: 0;
}

.cms-entry-module__grid.is-scroll {
  display: flex;
  width: max-content;
  min-width: 100%;
}

.cms-entry-module__scroll {
  width: 100%;
  white-space: nowrap;
}
</style>
