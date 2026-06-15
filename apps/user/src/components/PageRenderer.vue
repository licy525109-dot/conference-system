<template>
  <view class="cms-page" :style="rootStyle">
    <block v-for="component in visibleComponents" :key="component.id">
      <view v-if="component.type === 'hero'" class="cms-hero">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-hero__image" :src="stringConfig(component, 'imageUrl')" mode="aspectFit" />
        <view v-else class="cms-hero__empty">请选择主视觉横幅图片</view>
      </view>

      <view v-else-if="component.type === 'conference-list'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "可报名会议" }}</text>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component)" :key="item.id" :class="conferenceCardClass(component, 'cms-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="booleanConfig(component, 'showCover', true) && item.coverImageUrl"
            :class="conferenceImageClass(component, 'cms-card__image')"
            :style="conferenceImageStyle(component)"
            :src="item.coverImageUrl"
            mode="aspectFit"
          />
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', true)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <button class="cms-card__button" @click.stop="$emit('openConference', item.id)">{{ detailButtonText(component) }}</button>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'conference-tabs'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议分类切换" }}</text>
        <view class="cms-tabs">
          <text v-for="(tab, index) in conferenceTabs(component)" :key="tab" :class="['cms-tab', index === 0 ? 'active' : '']">{{ tab }}</text>
        </view>
        <view v-if="conferences.length === 0" class="cms-empty">暂无可报名会议</view>
        <view v-for="(item, index) in limitedConferences(component).slice(0, 3)" :key="item.id" :class="conferenceCardClass(component, 'cms-mini-card')" :style="conferenceCardStyle(component)">
          <image
            v-if="booleanConfig(component, 'showCover', true) && item.coverImageUrl"
            :class="conferenceImageClass(component, 'cms-mini-card__image')"
            :style="conferenceImageStyle(component)"
            :src="item.coverImageUrl"
            mode="aspectFit"
          />
          <view class="cms-card__body">
            <text class="cms-card__title" :style="conferenceTextStyle(component, 'title')">{{ item.title }}</text>
            <text v-if="booleanConfig(component, 'showSummary', false)" class="cms-card__text" :style="conferenceTextStyle(component, 'summary')">{{ item.summary || summaryFallback(component) }}</text>
            <text v-for="line in conferenceMetaLines(item, component, index)" :key="line" class="cms-card__meta" :style="conferenceTextStyle(component, 'meta')">{{ line }}</text>
            <button class="cms-card__button" @click.stop="$emit('openConference', item.id)">{{ detailButtonText(component) }}</button>
          </view>
        </view>
      </view>

      <view v-else-if="component.type === 'registration-button'" class="cms-register">
        <button class="cms-button" :style="textStyle(component)" @click="$emit('register')">{{ stringConfig(component, "text") || "立即报名" }}</button>
      </view>

      <button v-else-if="component.type === 'floating-registration-button'" class="cms-floating" :style="textStyle(component)" @click="$emit('register')">
        {{ stringConfig(component, "text") || "立即报名" }}
      </button>

      <view v-else-if="component.type === 'rich-text' || component.type === 'safe-html'" class="cms-section" :style="textStyle(component)">
        <rich-text :nodes="stringConfig(component, 'html')" />
      </view>

      <view v-else-if="component.type === 'image-grid'" class="cms-grid">
        <image v-for="image in arrayConfig(component, 'images')" :key="String(image)" class="cms-grid__image" :src="String(image)" mode="aspectFill" />
      </view>

      <view v-else-if="component.type === 'video'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "视频" }}</text>
        <video v-if="stringConfig(component, 'url')" class="cms-video" :src="stringConfig(component, 'url')" />
        <view v-else class="cms-empty">视频地址未配置</view>
      </view>

      <view v-else-if="component.type === 'notice' || component.type === 'promotion-bar'" class="cms-notice" :style="textStyle(component)">
        {{ stringConfig(component, "text") || "报名开放中" }}
      </view>

      <view v-else-if="component.type === 'stats-grid'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "会议亮点" }}</text>
        <view class="cms-stats">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-stat" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'ticket-price-list' || component.type === 'process-steps' || component.type === 'download-list' || component.type === 'testimonial-list' || component.type === 'tag-filter'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || titleFor(component.type) }}</text>
        <view class="cms-list-lines">
          <text v-for="item in arrayConfig(component, 'items')" :key="String(item)" class="cms-list-line" :style="textStyle(component)">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="component.type === 'text-image'" class="cms-section">
        <image v-if="stringConfig(component, 'imageUrl')" class="cms-section__image" :src="stringConfig(component, 'imageUrl')" mode="aspectFill" />
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "大会介绍" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "聚焦行业趋势、案例实践和高质量连接。" }}</text>
      </view>

      <view v-else-if="component.type === 'live-card'" class="cms-section cms-live">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "线上直播" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "无法到场也可预约线上观看" }}</text>
      </view>

      <view v-else-if="component.type === 'traffic-guide'" class="cms-section">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "交通指南" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "address") }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") }}</text>
      </view>

      <view v-else-if="component.type === 'contact-card'" class="cms-section cms-contact">
        <text class="cms-section__title" :style="titleStyle(component)">{{ stringConfig(component, "title") || "咨询报名" }}</text>
        <text class="cms-section__text" :style="textStyle(component)">{{ stringConfig(component, "text") || "如需团体报名，请联系会务组。" }}</text>
        <button v-if="stringConfig(component, 'phone')" class="cms-button">{{ stringConfig(component, "phone") }}</button>
      </view>

      <view v-else-if="component.type === 'title'" class="cms-title" :style="textStyle(component)">{{ stringConfig(component, "text") || "标题" }}</view>

      <view v-else-if="component.type === 'divider'" class="cms-divider" />

      <view v-else-if="component.type === 'spacer'" :style="{ height: `${numberConfig(component, 'height', 24)}rpx` }" />

      <view v-else class="cms-section cms-unknown">
        <text>当前组件暂未支持预览</text>
      </view>
    </block>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, watch } from "vue";
import type { CmsComponent, ThemeConfig } from "@/services/cms";
import type { ConferenceDetail, ConferenceListItem } from "@/services/conference";
import { formatDateTime } from "@/utils/date";

defineEmits<{
  openConference: [id: string];
  register: [];
}>();

const props = defineProps<{
  components: CmsComponent[];
  theme: ThemeConfig;
  conferences?: ConferenceListItem[];
  conference?: ConferenceDetail | null;
}>();

const visibleComponents = computed(() => props.components.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder));
const conferences = computed(() => props.conferences ?? []);
const rootStyle = computed(() => ({
  "--cms-primary": props.theme.primaryColor,
  "--cms-secondary": props.theme.secondaryColor,
  "--cms-accent": props.theme.accentColor,
  "--cms-bg": props.theme.backgroundColor,
  "--cms-card": props.theme.cardBackground,
  "--cms-radius": `${props.theme.radius}px`,
  "--cms-title-size": `${props.theme.titleFontSize}rpx`
}));

onMounted(loadCustomFonts);
watch(() => props.components, loadCustomFonts, { deep: true });

function stringConfig(component: CmsComponent, key: string): string {
  const value = component.config?.[key];
  return typeof value === "string" ? value : "";
}

function numberConfig(component: CmsComponent, key: string, fallback: number): number {
  const value = component.config?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanConfig(component: CmsComponent, key: string, fallback = false): boolean {
  const value = component.config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function arrayConfig(component: CmsComponent, key: string): unknown[] {
  const value = component.config?.[key];
  return Array.isArray(value) ? value : [];
}

function limitedConferences(component: CmsComponent): ConferenceListItem[] {
  return conferences.value.slice(0, Math.max(1, numberConfig(component, "limit", 10)));
}

function conferenceTabs(component: CmsComponent): string[] {
  const configured = arrayConfig(component, "tabs").map(String).filter(Boolean);
  if (configured.length > 0) {
    return configured;
  }
  const locations = conferences.value.map((item) => item.location || "其他会议").filter(Boolean);
  const unique = Array.from(new Set(locations));
  return unique.length > 0 ? unique.slice(0, 5) : ["全部"];
}

function summaryFallback(component: CmsComponent): string {
  return stringConfig(component, "summaryFallback") || "点击查看会议详情和报名信息。";
}

function detailButtonText(component: CmsComponent): string {
  return stringConfig(component, "detailButtonText") || "查看详情";
}

function textStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "fontSize", 0);
  const fontFamily = stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "textColor");
  return {
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, "fontAssetUrl") } : {}),
    ...(fontFamily === "bold-sans" ? { fontWeight: "800" } : {})
  };
}

function titleStyle(component: CmsComponent): Record<string, string> {
  const fontSize = numberConfig(component, "titleFontSize", 0);
  const fontFamily = stringConfig(component, "titleFontFamily") || stringConfig(component, "fontFamily");
  const textAlign = stringConfig(component, "titleTextAlign") || stringConfig(component, "textAlign");
  const textColor = stringConfig(component, "titleTextColor") || stringConfig(component, "textColor");
  const customFontKey = stringConfig(component, "titleFontAssetUrl") ? "titleFontAssetUrl" : "fontAssetUrl";
  return {
    ...(fontSize > 0 ? { fontSize: `${fontSize}rpx` } : {}),
    ...(textColor ? { color: textColor } : {}),
    ...(textAlign ? { textAlign } : {}),
    ...(fontFamily ? { fontFamily: fontFamilyValue(fontFamily, component, customFontKey) } : {}),
    ...(fontFamily === "bold-sans" ? { fontWeight: "800" } : {})
  };
}

function conferenceTextStyle(component: CmsComponent, part: "title" | "summary" | "meta"): Record<string, string> {
  const prefix = part === "title" ? "cardTitle" : part === "summary" ? "cardSummary" : "cardMeta";
  const fallbackSize = part === "title" ? 28 : part === "summary" ? 22 : 21;
  return {
    fontSize: `${numberConfig(component, `${prefix}FontSize`, fallbackSize)}rpx`,
    color: stringConfig(component, `${prefix}Color`) || (part === "title" ? "#172033" : "#637083"),
    textAlign: stringConfig(component, `${prefix}Align`) || "left",
    fontFamily: fontFamilyValue(stringConfig(component, "fontFamily"), component, "fontAssetUrl"),
    ...(part === "title" ? { fontWeight: "800" } : {})
  };
}

function conferenceCardClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full" : ""].filter(Boolean);
}

function conferenceImageClass(component: CmsComponent, baseClass: string): string[] {
  return [baseClass, stringConfig(component, "cardImageLayout") === "full" ? "is-cover-full__image" : ""].filter(Boolean);
}

function conferenceCardStyle(component: CmsComponent): Record<string, string> {
  return {
    marginTop: `${numberConfig(component, "cardMarginTop", 22)}rpx`,
    marginBottom: `${numberConfig(component, "cardMarginBottom", 0)}rpx`,
    marginLeft: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    marginRight: `${numberConfig(component, "cardMarginX", 0)}rpx`,
    padding: `${numberConfig(component, "cardPadding", 26)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`,
    gap: `${numberConfig(component, "cardGap", 18)}rpx`
  };
}

function conferenceImageStyle(component: CmsComponent): Record<string, string> {
  const size = conferenceThumbSize(component);
  if (stringConfig(component, "cardImageLayout") !== "full") {
    return {
      width: `${size.width}rpx`,
      height: `${size.height}rpx`,
      flexBasis: `${size.width}rpx`
    };
  }
  return {
    height: `${numberConfig(component, "cardImageHeight", 240)}rpx`,
    borderRadius: `${numberConfig(component, "cardRadius", 8)}px`
  };
}

function conferenceThumbSize(component: CmsComponent): { width: number; height: number } {
  const titleSize = numberConfig(component, "cardTitleFontSize", 28);
  const configuredWidth = numberConfig(component, "cardThumbWidth", 0);
  const width = configuredWidth > 0 ? configuredWidth : Math.min(Math.max(Math.round(titleSize * 7), 180), 260);
  const configuredHeight = numberConfig(component, "cardThumbHeight", 0);
  return {
    width,
    height: configuredHeight > 0 ? configuredHeight : Math.round(width * 0.72)
  };
}

function fontFamilyValue(value: string, component?: CmsComponent, key?: string): string {
  if (value === "custom" && component && key && stringConfig(component, key)) return fontFamilyFor(component, key);
  if (value === "serif") return "Songti SC, SimSun, serif";
  if (value === "sans") return "PingFang SC, Microsoft YaHei, sans-serif";
  if (value === "bold-sans") return "Heiti SC, Microsoft YaHei, sans-serif";
  return "inherit";
}

function fontFamilyFor(component: CmsComponent, key: string): string {
  return `cms-font-${component.id.replace(/[^a-zA-Z0-9_-]/g, "-")}-${key}`;
}

function loadCustomFonts() {
  for (const component of props.components) {
    for (const key of ["fontAssetUrl", "titleFontAssetUrl"]) {
      const url = stringConfig(component, key);
      if (!url) continue;
      uni.loadFontFace({
        family: fontFamilyFor(component, key),
        source: `url("${url}")`,
        global: true,
        success: () => undefined,
        fail: () => undefined
      });
    }
  }
}

function conferenceMetaLines(item: ConferenceListItem, component: CmsComponent, index: number): string[] {
  const parts: string[] = [];
  if (booleanConfig(component, "showTime", true)) parts.push(`会议时间：${formatDateTime(item.startsAt)}`);
  if (booleanConfig(component, "showLocation", true) && item.location) parts.push(`会议地点：${item.location}`);
  if (booleanConfig(component, "showRegistrationCount", false)) parts.push(`${registrationCountFor(item, component, index)} 人已报名`);
  return parts;
}

function registrationCountFor(item: ConferenceListItem, component: CmsComponent, index: number): number {
  const actual = typeof item.registrationCount === "number" ? item.registrationCount : 0;
  const virtual = numberConfig(component, "virtualRegistrationBase", 0) + index * numberConfig(component, "virtualRegistrationStep", 0);
  const mode = stringConfig(component, "registrationCountMode") || "actual";
  if (mode === "virtual") return virtual;
  if (mode === "actual-plus-virtual") return actual + virtual;
  return actual;
}

function titleFor(type: string): string {
  const map: Record<string, string> = {
    "ticket-price-list": "报名票种",
    "process-steps": "报名流程",
    "download-list": "资料下载",
    "testimonial-list": "参会评价",
    "tag-filter": "热门主题"
  };
  return map[type] ?? "内容";
}
</script>

<style scoped>
.cms-page {
  min-height: 100vh;
  padding: 28rpx;
  padding-bottom: 140rpx;
  box-sizing: border-box;
  background: var(--cms-bg);
}

.cms-hero,
.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  border-radius: var(--cms-radius);
}

.cms-hero {
  overflow: hidden;
  padding: 0;
  background: #e8eef8;
  color: #637083;
}

.cms-hero__image {
  width: 100%;
  height: 360rpx;
  border-radius: var(--cms-radius);
  background: #fff8e8;
}

.cms-section__title,
.cms-card__title,
.cms-title {
  display: block;
  font-weight: 800;
}

.cms-hero__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 360rpx;
  font-size: 26rpx;
}

.cms-section,
.cms-card,
.cms-notice,
.cms-title {
  margin-top: 22rpx;
  padding: 26rpx;
  background: var(--cms-card);
}

.cms-section__title,
.cms-title {
  color: #172033;
  font-size: 32rpx;
}

.cms-section__text {
  display: block;
  margin-top: 12rpx;
  color: #637083;
  font-size: 26rpx;
  line-height: 1.55;
}

.cms-section__image {
  width: 100%;
  height: 260rpx;
  margin-bottom: 18rpx;
  border-radius: var(--cms-radius);
}

.cms-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  border: 1px solid #e3e9f2;
}

.cms-mini-card {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
  padding: 18rpx;
  border-radius: var(--cms-radius);
  background: #f7faff;
}

.cms-card.is-cover-full,
.cms-mini-card.is-cover-full {
  flex-direction: column;
  align-items: stretch;
}

.cms-card__image {
  width: 180rpx;
  height: 136rpx;
  flex: 0 0 180rpx;
  border-radius: var(--cms-radius);
  background: #f8fafc;
}

.cms-card__image.is-cover-full__image,
.cms-mini-card__image.is-cover-full__image {
  width: 100%;
  flex: none;
  background: #f8fafc;
}

.cms-mini-card__image {
  width: 150rpx;
  height: 112rpx;
  flex: 0 0 150rpx;
  border-radius: var(--cms-radius);
  background: #f8fafc;
}

.cms-card__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: stretch;
}

.cms-card__title {
  color: #172033;
  font-size: 28rpx;
  line-height: 1.35;
  white-space: normal;
  word-break: break-word;
}

.cms-card__text,
.cms-card__meta,
.cms-empty,
.cms-unknown {
  color: #637083;
  font-size: 23rpx;
  line-height: 1.45;
}

.cms-card__text,
.cms-card__meta {
  display: block;
  margin-top: 6rpx;
  white-space: normal;
  word-break: break-word;
}

.cms-card__button {
  align-self: flex-start;
  min-width: 132rpx;
  height: 52rpx;
  line-height: 52rpx;
  margin: 14rpx 0 0;
  padding: 0 20rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--cms-primary);
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
}

.cms-button,
.cms-floating {
  border-radius: var(--cms-radius);
  background: var(--cms-primary);
  color: #ffffff;
  font-weight: 800;
}

.cms-tabs {
  display: flex;
  gap: 12rpx;
  margin-top: 18rpx;
  overflow-x: auto;
  white-space: nowrap;
}

.cms-tab {
  flex: 0 0 auto;
  padding: 12rpx 22rpx;
  border-radius: 999rpx;
  background: #eef4ff;
  color: #2452a8;
  font-size: 24rpx;
  font-weight: 700;
}

.cms-tab.active {
  background: var(--cms-primary);
  color: #ffffff;
}

.cms-register {
  margin-top: 24rpx;
}

.cms-floating {
  position: fixed;
  left: 32rpx;
  right: 32rpx;
  bottom: 108rpx;
  z-index: 20;
}

.cms-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 22rpx;
}

.cms-grid__image {
  width: 100%;
  height: 160rpx;
  border-radius: var(--cms-radius);
}

.cms-video {
  width: 100%;
  margin-top: 16rpx;
}

.cms-notice {
  color: #8a4b00;
  background: #fff7ed;
}

.cms-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-stat,
.cms-list-line {
  border-radius: var(--cms-radius);
  background: #f4f8ff;
  color: #2d3f58;
  font-size: 25rpx;
  line-height: 1.45;
}

.cms-stat {
  min-height: 86rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12rpx;
  text-align: center;
  font-weight: 800;
}

.cms-list-lines {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 18rpx;
}

.cms-list-line {
  padding: 18rpx;
}

.cms-live {
  border: 1px solid rgb(36 82 168 / 22%);
}

.cms-contact .cms-button {
  margin-top: 18rpx;
}

.cms-divider {
  height: 1px;
  margin: 26rpx 0;
  background: #dce3ef;
}
</style>
