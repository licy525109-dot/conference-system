<template>
  <view v-if="segments.length" class="long-image" aria-label="会议图文详情">
    <view v-for="(segment, index) in segments" :key="`${segment.url}-${retryVersion}`" class="segment">
      <view v-if="!loaded[index] && !failed[index]" class="loading" :style="placeholderStyle(segment)">
        <view class="loading-line" />
      </view>
      <image
        v-show="!failed[index]"
        class="image"
        :src="segment.url"
        mode="widthFix"
        lazy-load
        @load="markLoaded(index)"
        @error="markFailed(index)"
      />
      <view v-if="failed[index]" class="error">
        <text>详情图片加载失败</text>
        <button class="retry" @click="retry(index)">重新加载</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import type { ConferenceDetailImageSegment } from "@/utils/conferenceDetail";

const props = defineProps<{
  segments: ConferenceDetailImageSegment[];
}>();

const loaded = reactive<Record<number, boolean>>({});
const failed = reactive<Record<number, boolean>>({});
const retryVersion = ref(0);

watch(
  () => props.segments,
  () => resetState(),
  { deep: true }
);

function markLoaded(index: number) {
  loaded[index] = true;
  failed[index] = false;
}

function markFailed(index: number) {
  failed[index] = true;
  loaded[index] = false;
}

function retry(index: number) {
  failed[index] = false;
  loaded[index] = false;
  retryVersion.value += 1;
}

function resetState() {
  for (const key of Object.keys(loaded)) delete loaded[Number(key)];
  for (const key of Object.keys(failed)) delete failed[Number(key)];
}

function placeholderStyle(segment: ConferenceDetailImageSegment) {
  if (!segment.width || !segment.height) return {};
  const heightRpx = Math.min(2400, Math.max(320, Math.round((segment.height / segment.width) * 750)));
  return { height: `${heightRpx}rpx` };
}
</script>

<style scoped>
.long-image,
.segment,
.image {
  display: block;
  width: 100%;
}

.segment {
  position: relative;
  min-height: 2rpx;
  overflow: hidden;
  background: #f4f5f3;
}

.image {
  margin: 0;
  padding: 0;
}

.loading {
  display: flex;
  min-height: 360rpx;
  align-items: center;
  justify-content: center;
  background: #f4f5f3;
}

.loading-line {
  width: 180rpx;
  height: 12rpx;
  border-radius: 6rpx;
  background: #dde1de;
}

.error {
  display: flex;
  min-height: 320rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
  color: #68716b;
  font-size: 26rpx;
}

.retry {
  min-width: 176rpx;
  height: 64rpx;
  padding: 0 28rpx;
  border: 1px solid #cfd5d1;
  border-radius: 32rpx;
  background: #fff;
  color: #142132;
  font-size: 24rpx;
  line-height: 62rpx;
}

.retry::after {
  border: 0;
}
</style>
