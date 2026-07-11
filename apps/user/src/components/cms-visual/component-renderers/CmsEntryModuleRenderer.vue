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
        <EntryTile v-for="entry in entries" :key="entry.id" :entry="entry" :component="component" @activate="emit('activate', entry)" />
      </view>
    </scroll-view>
    <view v-else class="cms-entry-module__grid" :class="`is-${layoutMode}`" :style="gridStyle">
      <EntryTile v-for="entry in entries" :key="entry.id" :entry="entry" :component="component" @activate="emit('activate', entry)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, type PropType } from "vue";
import type { CmsComponent } from "@/services/cms";
import { booleanConfig, numberConfig, stringConfig, type CmsEntryItem } from "./config";

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

const EntryTile = defineComponent({
  name: "CmsEntryTile",
  props: {
    entry: { type: Object as PropType<CmsEntryItem>, required: true },
    component: { type: Object as PropType<CmsComponent>, required: true }
  },
  emits: ["activate"],
  setup(tileProps, { emit: tileEmit }) {
    return () => {
      const iconUrl = tileProps.entry.dynamicIconUrl || tileProps.entry.iconUrl;
      const style = tileProps.entry.cardStyle || stringConfig(tileProps.component, "cardStyle", "soft");
      const iconSize = stringConfig(tileProps.component, "iconSize", tileProps.component.type === "service-shortcut-card" ? "small" : "large");
      return h("view", {
        class: ["cms-entry-tile", `is-${style}`, `is-${layoutMode.value}`],
        style: {
          ...(tileProps.entry.backgroundColor ? { background: tileProps.entry.backgroundColor } : stringConfig(tileProps.component, "cardBackground") ? { background: stringConfig(tileProps.component, "cardBackground") } : {}),
          ...(tileProps.entry.textColor ? { color: tileProps.entry.textColor } : {}),
          borderRadius: `${Math.min(48, Math.max(0, numberConfig(tileProps.component, "cardRadius", 16)))}rpx`
        },
        onClick: () => tileEmit("activate")
      }, [
        iconUrl
          ? h("image", { class: ["cms-entry-tile__icon", `is-${iconSize}`], src: iconUrl, mode: "aspectFit" })
          : h("view", { class: ["cms-entry-tile__icon", "is-text", `is-${iconSize}`] }, builtinIconLabel(tileProps.entry.builtinIcon, tileProps.entry.title)),
        h("view", { class: "cms-entry-tile__copy" }, [
          h("text", { class: "cms-entry-tile__title" }, tileProps.entry.title),
          tileProps.entry.subtitle && booleanConfig(tileProps.component, "showSubtitle", true)
            ? h("text", { class: "cms-entry-tile__subtitle" }, tileProps.entry.subtitle)
            : null
        ]),
        layoutMode.value === "list" ? h("text", { class: "cms-entry-tile__arrow" }, "›") : null
      ]);
    };
  }
});

function builtinIconLabel(icon: string, title: string): string {
  const labels: Record<string, string> = {
    calendar: "日",
    registration: "报",
    order: "单",
    shop: "商",
    user: "我",
    team: "会",
    location: "址",
    building: "城",
    speaker: "坛",
    invoice: "票",
    service: "服",
    settings: "设"
  };
  return labels[icon] || title.slice(0, 1);
}
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

.cms-entry-tile {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  min-height: 164rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  padding: 22rpx 12rpx;
  border: 1rpx solid transparent;
  color: var(--cms-text-primary);
  background: var(--cms-surface-muted);
}

.cms-entry-tile.is-scroll {
  width: 180rpx;
  flex: none;
}

.cms-entry-tile.is-list {
  min-height: 92rpx;
  flex-direction: row;
  justify-content: flex-start;
  padding: 18rpx 8rpx;
  border-bottom: 1rpx solid var(--cms-border);
  border-radius: 0 !important;
  background: transparent;
}

.cms-entry-tile.is-outline {
  border-color: var(--cms-border);
  background: var(--cms-surface-elevated);
}

.cms-entry-tile.is-plain {
  border-color: transparent;
  background: transparent;
}

.cms-entry-tile__icon {
  width: 64rpx;
  height: 64rpx;
  flex: none;
}

.cms-entry-tile__icon.is-small {
  width: 48rpx;
  height: 48rpx;
}

.cms-entry-tile__icon.is-xlarge {
  width: 78rpx;
  height: 78rpx;
}

.cms-entry-tile__icon.is-text {
  display: grid;
  place-items: center;
  border: 1rpx solid var(--cms-border);
  border-radius: 50%;
  color: var(--cms-accent);
  font-size: 26rpx;
  font-weight: 700;
  background: var(--cms-surface-elevated);
}

.cms-entry-tile__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: inherit;
  gap: 4rpx;
}

.cms-entry-tile__title {
  max-width: 100%;
  overflow: hidden;
  color: inherit;
  font-size: 25rpx;
  font-weight: 650;
  line-height: 1.35;
  text-align: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-entry-tile__subtitle {
  max-width: 100%;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: 18rpx;
  line-height: 1.35;
  text-align: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-entry-tile__arrow {
  flex: none;
  color: var(--cms-text-secondary);
  font-size: 36rpx;
}
</style>
