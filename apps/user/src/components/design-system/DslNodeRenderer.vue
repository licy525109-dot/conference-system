<template>
  <view :class="nodeClass">
    <template v-if="node.type === 'ds-banner'">
      <image v-if="imageUrl" class="ds-banner__image" :src="imageUrl" mode="aspectFill" />
      <view class="ds-banner__shade" />
      <view class="ds-banner__copy">
        <text v-if="subtitle" class="ds-kicker">{{ subtitle }}</text>
        <text class="ds-title">{{ title }}</text>
        <text v-if="description" class="ds-text">{{ description }}</text>
        <button v-if="buttonText" class="ds-button" @click="emitAction">{{ buttonText }}</button>
      </view>
    </template>

    <template v-else-if="node.type === 'ds-grid'">
      <text v-if="title" class="ds-title">{{ title }}</text>
      <view class="ds-grid" :style="gridStyle">
        <view v-for="(item, index) in displayItems" :key="itemKey(item, index)" class="ds-grid__item" @click="emitItemAction(item)">
          <image v-if="itemImage(item)" class="ds-grid__icon" :src="itemImage(item)" mode="aspectFill" />
          <view v-else class="ds-grid__icon ds-grid__icon--text">{{ itemTitle(item).slice(0, 1) || "项" }}</view>
          <text class="ds-grid__title">{{ itemTitle(item) }}</text>
          <text v-if="itemSubtitle(item)" class="ds-grid__text">{{ itemSubtitle(item) }}</text>
        </view>
      </view>
    </template>

    <template v-else-if="node.type === 'ds-list'">
      <text v-if="title" class="ds-title">{{ title }}</text>
      <view v-if="displayItems.length === 0" class="ds-empty">{{ emptyText }}</view>
      <view v-for="(item, index) in displayItems" :key="itemKey(item, index)" class="ds-list__item" @click="emitItemAction(item)">
        <image v-if="itemImage(item)" class="ds-list__image" :src="itemImage(item)" mode="aspectFill" />
        <view class="ds-list__body">
          <text class="ds-list__title">{{ itemTitle(item) }}</text>
          <text v-if="itemSubtitle(item)" class="ds-text">{{ itemSubtitle(item) }}</text>
          <text v-if="itemMeta(item)" class="ds-meta">{{ itemMeta(item) }}</text>
        </view>
      </view>
    </template>

    <template v-else-if="node.type === 'ds-carousel'">
      <swiper v-if="images.length > 0" class="ds-carousel" :indicator-dots="true" :autoplay="true" :circular="true">
        <swiper-item v-for="image in images" :key="image">
          <image class="ds-carousel__image" :src="image" mode="aspectFill" />
        </swiper-item>
      </swiper>
      <view v-else class="ds-empty">{{ emptyText }}</view>
    </template>

    <template v-else-if="node.type === 'ds-button'">
      <button class="ds-button" @click="emitAction">{{ buttonText || title || "查看" }}</button>
    </template>

    <template v-else>
      <text v-if="title" class="ds-title">{{ title }}</text>
      <text v-if="description" class="ds-text">{{ description }}</text>
      <image v-if="imageUrl" class="ds-section__image" :src="imageUrl" mode="widthFix" />
      <button v-if="buttonText" class="ds-button" @click="emitAction">{{ buttonText }}</button>
    </template>

    <view v-if="node.children.length > 0" class="ds-children">
      <DslNodeRenderer v-for="child in node.children" :key="child.id" :node="child" @action="emit('action', $event)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { ResolvedDslNode } from "@conference/dsl-runtime";

const props = defineProps<{
  node: ResolvedDslNode;
}>();

const emit = defineEmits<{
  action: [Record<string, unknown>];
}>();

const nodeClass = computed(() => ["ds-node", `ds-node--${props.node.type}`]);
const title = computed(() => readString(props.node.props.title));
const subtitle = computed(() => readString(props.node.props.subtitle));
const description = computed(() => readString(props.node.props.description || props.node.props.text));
const imageUrl = computed(() => readString(props.node.props.imageUrl));
const buttonText = computed(() => readString(props.node.props.buttonText || props.node.props.text));
const emptyText = computed(() => readString(props.node.props.emptyText) || "暂无内容");
const images = computed(() => (Array.isArray(props.node.props.images) ? props.node.props.images.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []));
const displayItems = computed(() => {
  const directItems = Array.isArray(props.node.props.items) ? props.node.props.items : [];
  const dataItems = Array.isArray(props.node.props.data) ? props.node.props.data : [];
  return directItems.length > 0 ? directItems : dataItems;
});
const gridStyle = computed(() => {
  const columns = Number(props.node.props.columns || 4);
  return {
    gridTemplateColumns: `repeat(${Math.min(Math.max(columns, 2), 4)}, minmax(0, 1fr))`
  };
});

function emitAction(): void {
  const action = isRecord(props.node.props.action) ? props.node.props.action : actionFromProps(props.node.props);
  emit("action", action);
}

function emitItemAction(item: unknown): void {
  if (!isRecord(item)) return;
  emit("action", actionFromProps(item));
}

function actionFromProps(source: Record<string, unknown>): Record<string, unknown> {
  const targetType = readString(source.actionTargetType || source.targetType || source.type);
  return {
    type: normalizeActionType(targetType),
    pageKey: readString(source.targetPageKey || source.pageKey),
    conferenceId: readString(source.targetConferenceId || source.conferenceId || source.id),
    productId: readString(source.targetProductId || source.productId),
    url: readString(source.externalUrl || source.url)
  };
}

function normalizeActionType(value: string): string {
  if (value === "registration") return "registration";
  if (value === "conference") return "conference";
  if (value === "external-h5") return "url";
  if (value === "page") return "page";
  return value || "none";
}

function itemKey(item: unknown, index: number): string {
  return isRecord(item) && typeof item.id === "string" ? item.id : `item-${index}`;
}

function itemTitle(item: unknown): string {
  return isRecord(item) ? readString(item.title || item.name || item.label) || "内容" : String(item || "内容");
}

function itemSubtitle(item: unknown): string {
  return isRecord(item) ? readString(item.subtitle || item.summary || item.description) : "";
}

function itemMeta(item: unknown): string {
  if (!isRecord(item)) return "";
  return readString(item.location || item.meta || item.startsAt);
}

function itemImage(item: unknown): string {
  return isRecord(item) ? readString(item.imageUrl || item.coverImageUrl || item.iconUrl) : "";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
</script>

<style scoped>
.ds-node {
  overflow: hidden;
  padding: var(--cms-space-card-padding);
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-lg);
  background: var(--cms-gradient-card);
  box-shadow: var(--cms-shadow-md);
}

.ds-node--ds-banner {
  position: relative;
  min-height: 360rpx;
  padding: 0;
  background: var(--cms-gradient-hero);
}

.ds-banner__image,
.ds-carousel__image {
  width: 100%;
  height: 100%;
}

.ds-banner__image {
  position: absolute;
  inset: 0;
}

.ds-banner__shade {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.24);
}

.ds-banner__copy {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 360rpx;
  flex-direction: column;
  justify-content: flex-end;
  gap: 14rpx;
  padding: 40rpx;
}

.ds-title {
  display: block;
  color: var(--cms-text-primary);
  font-size: var(--cms-section-title-size);
  font-weight: 700;
  line-height: 1.3;
}

.ds-node--ds-banner .ds-title,
.ds-node--ds-banner .ds-text,
.ds-node--ds-banner .ds-kicker {
  color: var(--cms-text-inverse);
}

.ds-kicker,
.ds-meta {
  color: var(--cms-text-secondary);
  font-size: 24rpx;
  line-height: 34rpx;
}

.ds-text {
  display: block;
  color: var(--cms-text-secondary);
  font-size: 28rpx;
  line-height: 42rpx;
}

.ds-button {
  width: fit-content;
  min-width: 168rpx;
  margin: 0;
  padding: 0 32rpx;
  border: 0;
  border-radius: var(--cms-radius-full);
  background: var(--cms-gradient-cta);
  color: var(--cms-text-inverse);
  font-size: 26rpx;
  line-height: 72rpx;
}

.ds-grid {
  display: grid;
  gap: 18rpx;
  margin-top: 22rpx;
}

.ds-grid__item {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 20rpx 12rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.ds-grid__icon {
  display: flex;
  width: 72rpx;
  height: 72rpx;
  align-items: center;
  justify-content: center;
  border-radius: var(--cms-radius-full);
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
  font-weight: 700;
}

.ds-grid__title,
.ds-list__title {
  color: var(--cms-text-primary);
  font-size: 28rpx;
  font-weight: 700;
  line-height: 38rpx;
}

.ds-grid__text {
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  line-height: 30rpx;
  text-align: center;
}

.ds-list__item {
  display: flex;
  gap: 20rpx;
  margin-top: 20rpx;
  padding: 20rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.ds-list__image {
  width: 168rpx;
  height: 128rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-muted);
}

.ds-list__body {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}

.ds-carousel {
  height: 320rpx;
  border-radius: var(--cms-radius-lg);
}

.ds-section__image {
  width: 100%;
  margin-top: 18rpx;
  border-radius: var(--cms-radius-md);
}

.ds-empty {
  padding: 28rpx;
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
  color: var(--cms-text-secondary);
  text-align: center;
}

.ds-children {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 20rpx;
}
</style>
