<template>
  <view v-if="renderableBlocks.length" class="detail-content" aria-label="会议详情内容">
    <template v-for="block in renderableBlocks" :key="block.id">
      <view
        v-if="block.type === 'heading'"
        :class="blockClass(block)"
        :style="alignStyle(block)"
        @click="triggerAction(block)"
      >
        <text class="heading-mark" />
        <text class="heading-text">{{ block.title }}</text>
      </view>

      <view
        v-else-if="block.type === 'paragraph'"
        :class="blockClass(block)"
        :style="alignStyle(block)"
        @click="triggerAction(block)"
      >
        <text class="paragraph-text">{{ block.text }}</text>
      </view>

      <view
        v-else-if="block.type === 'quote'"
        :class="blockClass(block)"
        :style="alignStyle(block)"
        @click="triggerAction(block)"
      >
        <text class="quote-mark">“</text>
        <text class="quote-text">{{ block.text }}</text>
      </view>

      <view v-else-if="block.type === 'list'" :class="blockClass(block)">
        <view v-for="(item, index) in block.items" :key="`${block.id}-${index}`" class="list-item">
          <text class="list-bullet">{{ index + 1 }}</text>
          <text class="list-text">{{ item }}</text>
        </view>
      </view>

      <view v-else-if="block.type === 'image'" :class="blockClass(block)" @click="triggerAction(block)">
        <image
          class="content-image"
          :class="{ 'is-fixed-ratio': block.imageMode !== 'widthFix' && block.imageRatio !== 'auto' }"
          :src="block.imageUrl"
          :mode="block.imageMode"
          :style="imageStyle(block)"
          lazy-load
        />
        <text v-if="block.caption" class="image-caption">{{ block.caption }}</text>
      </view>

      <view v-else-if="block.type === 'divider'" class="detail-block is-divider">
        <text class="divider-line" />
        <text class="divider-diamond">◇</text>
        <text class="divider-line" />
      </view>

      <view v-else class="detail-block is-button">
        <button
          :class="['content-button', `is-${block.buttonStyle}`]"
          @click.stop="triggerAction(block)"
        >
          {{ block.buttonText }}
        </button>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  isConferenceDetailBlockRenderable,
  type ConferenceDetailContentBlock
} from "@conference/shared";

const props = defineProps<{
  blocks: ConferenceDetailContentBlock[];
}>();

const emit = defineEmits<{
  action: [block: ConferenceDetailContentBlock];
}>();

const renderableBlocks = computed(() => props.blocks.filter(isConferenceDetailBlockRenderable));

function triggerAction(block: ConferenceDetailContentBlock) {
  if (!block.actionTargetType || block.actionTargetType === "none") return;
  emit("action", block);
}

function blockClass(block: ConferenceDetailContentBlock) {
  return [
    "detail-block",
    `is-${block.type}`,
    `is-tone-${block.tone}`,
    { "is-clickable": block.actionTargetType !== "none" }
  ];
}

function alignStyle(block: ConferenceDetailContentBlock) {
  return { textAlign: block.align };
}

function imageStyle(block: ConferenceDetailContentBlock) {
  if (block.imageMode === "widthFix" || block.imageRatio === "auto") return {};
  const ratio = { "16:9": 9 / 16, "4:3": 3 / 4, "1:1": 1 }[block.imageRatio];
  return ratio ? { height: `${Math.round(686 * ratio)}rpx` } : {};
}
</script>

<style scoped>
.detail-content {
  padding: 44rpx 32rpx 54rpx;
  border-top: 12rpx solid #f2f3f1;
  background: #ffffff;
  box-sizing: border-box;
}

.detail-block {
  margin: 0 0 30rpx;
  color: #293445;
  box-sizing: border-box;
}

.detail-block:last-child {
  margin-bottom: 0;
}

.is-heading {
  display: flex;
  align-items: center;
  gap: 14rpx;
  margin-top: 48rpx;
  margin-bottom: 22rpx;
}

.is-heading:first-child {
  margin-top: 0;
}

.heading-mark {
  width: 8rpx;
  height: 38rpx;
  flex: 0 0 8rpx;
  border-radius: 4rpx;
  background: #a9863d;
}

.heading-text {
  color: #122036;
  font-size: 34rpx;
  font-weight: 800;
  line-height: 1.45;
}

.paragraph-text,
.quote-text {
  color: inherit;
  font-size: 28rpx;
  line-height: 1.85;
  white-space: pre-wrap;
}

.is-quote {
  position: relative;
  padding: 28rpx 30rpx 28rpx 40rpx;
  border-left: 6rpx solid #a9863d;
  border-radius: 12rpx;
  background: #faf7ef;
}

.quote-mark {
  position: absolute;
  top: 6rpx;
  left: 14rpx;
  color: rgba(169, 134, 61, 0.34);
  font-size: 58rpx;
  font-family: serif;
  line-height: 1;
}

.is-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.list-item {
  display: flex;
  align-items: flex-start;
  gap: 18rpx;
}

.list-bullet {
  display: flex;
  width: 40rpx;
  height: 40rpx;
  flex: 0 0 40rpx;
  align-items: center;
  justify-content: center;
  border-radius: 10rpx;
  background: #10243e;
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 40rpx;
  text-align: center;
}

.list-text {
  padding-top: 2rpx;
  color: inherit;
  font-size: 28rpx;
  line-height: 1.65;
}

.is-image {
  overflow: hidden;
}

.content-image {
  display: block;
  width: 100%;
  background: #edf0ee;
}

.content-image.is-fixed-ratio {
  border-radius: 12rpx;
}

.image-caption {
  display: block;
  margin-top: 14rpx;
  color: #7d8780;
  font-size: 23rpx;
  line-height: 1.55;
  text-align: center;
}

.is-divider {
  display: flex;
  align-items: center;
  gap: 14rpx;
  padding: 16rpx 0;
}

.divider-line {
  height: 1px;
  flex: 1;
  background: #dfe3df;
}

.divider-diamond {
  color: #a9863d;
  font-size: 24rpx;
}

.is-button {
  display: flex;
  justify-content: center;
  padding: 8rpx 0 16rpx;
}

.content-button {
  min-width: 300rpx;
  min-height: 84rpx;
  margin: 0;
  padding: 0 44rpx;
  border: 1px solid #10243e;
  border-radius: 14rpx;
  background: #10243e;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 82rpx;
}

.content-button.is-secondary {
  background: #ffffff;
  color: #10243e;
}

.content-button.is-text {
  border-color: transparent;
  background: transparent;
  color: #9a752d;
}

.content-button::after {
  border: 0;
}

.is-tone-accent {
  color: #8c681f;
  font-weight: 600;
}

.is-tone-muted {
  color: #768179;
}

.is-clickable {
  cursor: pointer;
}
</style>
