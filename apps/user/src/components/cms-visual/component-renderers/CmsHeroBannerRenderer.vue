<template>
  <view :class="rootClass" :style="rootStyle">
    <image v-if="imageUrl" class="cms-hero-banner__image" :src="imageUrl" :mode="imageMode" />
    <view v-else class="cms-hero-banner__image cms-hero-banner__image--empty" />
    <view v-if="showOverlay" class="cms-hero-banner__shade" />
    <view v-if="showCopy" class="cms-hero-banner__copy" :style="copyStyle">
      <text v-if="showSubtitle && subtitle" class="cms-hero-banner__subtitle">{{ subtitle }}</text>
      <text v-if="showTitle && title" class="cms-hero-banner__title">{{ title }}</text>
      <text v-if="showDescription && description" class="cms-hero-banner__description">{{ description }}</text>
      <view v-if="buttonText || secondaryButtonText" class="cms-hero-banner__actions" :class="`is-${contentAlign}`">
        <wd-button v-if="buttonText" size="small" :round="false" :custom-style="primaryButtonStyle" @click.stop="emit('primary')">{{ buttonText }}</wd-button>
        <wd-button v-if="secondaryButtonText" size="small" plain :round="false" :custom-style="secondaryButtonStyle" @click.stop="emit('secondary')">{{ secondaryButtonText }}</wd-button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { booleanConfig, numberConfig, stringConfig } from "./config";

const props = defineProps<{ component: CmsComponent }>();
const emit = defineEmits<{ primary: []; secondary: [] }>();

const imageUrl = computed(() => stringConfig(props.component, "imageUrl"));
const title = computed(() => stringConfig(props.component, "title"));
const subtitle = computed(() => stringConfig(props.component, "subtitle"));
const description = computed(() => stringConfig(props.component, "description"));
const buttonText = computed(() => stringConfig(props.component, "buttonText"));
const secondaryButtonText = computed(() => stringConfig(props.component, "secondaryButtonText"));
const imageOnly = computed(() => booleanConfig(props.component, "imageOnly", false));
const showTitle = computed(() => booleanConfig(props.component, "showTitle", true));
const showSubtitle = computed(() => booleanConfig(props.component, "showSubtitle", true));
const showDescription = computed(() => booleanConfig(props.component, "showDescription", Boolean(description.value)));
const showCopy = computed(() => !imageOnly.value && ((showTitle.value && title.value) || (showSubtitle.value && subtitle.value) || (showDescription.value && description.value) || buttonText.value || secondaryButtonText.value));
const showOverlay = computed(() => showCopy.value && booleanConfig(props.component, "showOverlay", true));
const contentAlign = computed(() => normalizeAlign(stringConfig(props.component, "contentAlign", "left")));
const verticalAlign = computed(() => normalizeVertical(stringConfig(props.component, "verticalAlign", "bottom")));
const imageMode = computed(() => normalizeImageMode(stringConfig(props.component, "imageMode", "aspectFill")));

const rootClass = computed(() => [
  "cms-hero-banner",
  booleanConfig(props.component, "fullBleed", true) ? "is-full-bleed" : "",
  imageOnly.value ? "is-image-only" : ""
]);
const rootStyle = computed(() => ({
  height: `${Math.min(760, Math.max(220, numberConfig(props.component, "height", 430)))}rpx`,
  borderRadius: `${Math.min(48, Math.max(0, numberConfig(props.component, "radius", 0)))}rpx`,
  background: stringConfig(props.component, "backgroundColor", "var(--cms-primary)")
}));
const copyStyle = computed(() => ({
  alignItems: contentAlign.value === "center" ? "center" : contentAlign.value === "right" ? "flex-end" : "flex-start",
  justifyContent: verticalAlign.value === "top" ? "flex-start" : verticalAlign.value === "center" ? "center" : "flex-end",
  textAlign: contentAlign.value,
  color: stringConfig(props.component, "textColor", "#f9faf8")
}));
const primaryButtonStyle = "min-height:72rpx;padding:0 30rpx;border-radius:12rpx;background:var(--cms-primary);color:#f8faf8;border:0;";
const secondaryButtonStyle = "min-height:72rpx;padding:0 30rpx;border-radius:12rpx;background:rgba(18,35,59,.28);color:#f8faf8;border-color:rgba(248,250,248,.58);";

function normalizeAlign(value: string): "left" | "center" | "right" {
  return value === "center" || value === "right" ? value : "left";
}

function normalizeVertical(value: string): "top" | "center" | "bottom" {
  return value === "top" || value === "center" ? value : "bottom";
}

function normalizeImageMode(value: string): "aspectFill" | "aspectFit" | "scaleToFill" | "widthFix" {
  if (value === "contain" || value === "aspectFit") return "aspectFit";
  if (value === "scaleToFill") return "scaleToFill";
  if (value === "widthFix") return "widthFix";
  return "aspectFill";
}
</script>

<style scoped>
.cms-hero-banner {
  position: relative;
  min-width: 0;
  overflow: hidden;
  isolation: isolate;
}

.cms-hero-banner.is-full-bleed {
  margin-right: calc(var(--cms-space-page-x, 24rpx) * -1);
  margin-left: calc(var(--cms-space-page-x, 24rpx) * -1);
}

.cms-hero-banner__image,
.cms-hero-banner__shade,
.cms-hero-banner__copy {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.cms-hero-banner__image--empty {
  background: var(--cms-primary);
}

.cms-hero-banner__shade {
  z-index: 1;
  background: linear-gradient(180deg, rgba(12, 27, 46, 0.04), rgba(12, 27, 46, 0.82));
}

.cms-hero-banner__copy {
  z-index: 2;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 42rpx 40rpx;
}

.cms-hero-banner__subtitle {
  font-size: 24rpx;
  line-height: 1.4;
  opacity: 0.88;
}

.cms-hero-banner__title {
  max-width: 92%;
  font-size: 48rpx;
  font-weight: 700;
  line-height: 1.22;
}

.cms-hero-banner__description {
  max-width: 88%;
  font-size: 26rpx;
  line-height: 1.6;
  opacity: 0.9;
}

.cms-hero-banner__actions {
  display: flex;
  width: 100%;
  gap: 14rpx;
  margin-top: 8rpx;
}

.cms-hero-banner__actions.is-center {
  justify-content: center;
}

.cms-hero-banner__actions.is-right {
  justify-content: flex-end;
}

.cms-hero-banner__button {
  min-height: 72rpx;
  margin: 0;
  padding: 0 30rpx;
  border: 1rpx solid transparent;
  border-radius: 12rpx;
  color: #f8faf8;
  font-size: 26rpx;
  line-height: 70rpx;
  background: var(--cms-primary);
}

.cms-hero-banner__button::after {
  border: 0;
}

.cms-hero-banner__button.is-secondary {
  border-color: rgba(248, 250, 248, 0.62);
  color: #f8faf8;
  background: rgba(18, 35, 59, 0.26);
}
</style>
