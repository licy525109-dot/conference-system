<template>
  <view :class="rootClass" :style="rootStyle" @click="emit('activate')">
    <image v-if="iconUrl" class="cms-entry-tile__icon" :class="`is-${iconSize}`" :src="iconUrl" mode="aspectFit" />
    <view v-else class="cms-entry-tile__icon is-wot" :class="`is-${iconSize}`">
      <wd-icon :name="builtinIconName" :size="iconPixelSize" />
    </view>
    <view class="cms-entry-tile__copy">
      <text class="cms-entry-tile__title">{{ entry.title }}</text>
      <text v-if="entry.subtitle && showSubtitle" class="cms-entry-tile__subtitle">{{ entry.subtitle }}</text>
    </view>
    <wd-icon v-if="layoutMode === 'list'" class="cms-entry-tile__arrow" name="chevron-right" size="18px" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { booleanConfig, numberConfig, stringConfig, type CmsEntryItem } from "./config";

const props = defineProps<{
  component: CmsComponent;
  entry: CmsEntryItem;
  layoutMode: "grid" | "scroll" | "list";
}>();
const emit = defineEmits<{ activate: [] }>();

const iconUrl = computed(() => props.entry.dynamicIconUrl || props.entry.iconUrl);
const iconSize = computed(() => stringConfig(props.component, "iconSize", props.component.type === "service-shortcut-card" ? "small" : "large"));
const iconPixelSize = computed(() => iconSize.value === "xlarge" ? "38px" : iconSize.value === "small" ? "24px" : "32px");
const showSubtitle = computed(() => booleanConfig(props.component, "showSubtitle", true));
const builtinIconName = computed(() => builtinIcon(props.entry.builtinIcon));
const rootClass = computed(() => [
  "cms-entry-tile",
  `is-${props.entry.cardStyle || stringConfig(props.component, "cardStyle", "soft")}`,
  `is-${props.layoutMode}`
]);
const rootStyle = computed(() => ({
  ...(props.entry.backgroundColor
    ? { background: props.entry.backgroundColor }
    : stringConfig(props.component, "cardBackground")
      ? { background: stringConfig(props.component, "cardBackground") }
      : {}),
  ...(props.entry.textColor ? { color: props.entry.textColor } : {}),
  borderRadius: `${Math.min(48, Math.max(0, numberConfig(props.component, "cardRadius", 16)))}rpx`
}));

function builtinIcon(value: string): string {
  const icons: Record<string, string> = {
    calendar: "calendar",
    registration: "edit-outline",
    order: "orders",
    shop: "cart",
    user: "user",
    team: "usergroup",
    location: "location",
    building: "home",
    speaker: "view-list",
    invoice: "coupon",
    service: "service",
    settings: "setting"
  };
  return icons[value] || "view-list";
}
</script>

<style scoped>
.cms-entry-tile {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  min-height: 164rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14rpx;
  padding: 24rpx 12rpx;
  border: 1rpx solid transparent;
  color: var(--cms-text-primary);
  background: var(--cms-surface-muted);
  transition: transform 160ms ease-out, border-color 160ms ease-out, background-color 160ms ease-out;
}

.cms-entry-tile:active {
  transform: scale(0.98);
}

.cms-entry-tile.is-scroll {
  width: 180rpx;
  flex: none;
}

.cms-entry-tile.is-list {
  min-height: 104rpx;
  flex-direction: row;
  justify-content: flex-start;
  padding: 20rpx 8rpx;
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

.cms-entry-tile__icon.is-wot {
  display: grid;
  place-items: center;
  border: 1rpx solid rgba(169, 126, 56, 0.34);
  border-radius: 50%;
  color: var(--cms-primary);
  background: var(--cms-accent-soft);
}

.cms-entry-tile__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: inherit;
  gap: 4rpx;
}

.cms-entry-tile__title,
.cms-entry-tile__subtitle {
  max-width: 100%;
  overflow: hidden;
  text-align: inherit;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-entry-tile__title {
  color: inherit;
  font-size: 25rpx;
  font-weight: 650;
  line-height: 1.35;
}

.cms-entry-tile__subtitle {
  color: var(--cms-text-secondary);
  font-size: 18rpx;
  line-height: 1.35;
  letter-spacing: 0;
}

.cms-entry-tile__arrow {
  flex: none;
  color: var(--cms-text-tertiary);
}
</style>
