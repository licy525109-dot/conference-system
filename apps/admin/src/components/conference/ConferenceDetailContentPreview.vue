<template>
  <aside class="preview-column">
    <div class="preview-column__heading">
      <strong>手机实时预览</strong>
      <span>{{ renderableBlocks.length }} 个内容块</span>
    </div>
    <div class="phone-preview">
      <div class="phone-preview__status"><span>9:41</span><span>● ● 63</span></div>
      <div class="phone-preview__nav">{{ title || "会议详情" }}</div>
      <div class="phone-preview__scroll">
        <div v-if="coverImage" class="preview-cover" :style="{ backgroundImage: `url(${coverImage})` }" />
        <div class="preview-summary">
          <span>报名中</span>
          <h4>{{ title || "会议标题" }}</h4>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="renderableBlocks.length" class="preview-content">
          <template v-for="block in renderableBlocks" :key="block.id">
            <h5 v-if="block.type === 'heading'" :class="toneClass(block)" :style="textAlignStyle(block)">{{ block.title }}</h5>
            <p v-else-if="block.type === 'paragraph'" :class="toneClass(block)" :style="textAlignStyle(block)">{{ block.text }}</p>
            <blockquote v-else-if="block.type === 'quote'" :class="toneClass(block)" :style="textAlignStyle(block)">{{ block.text }}</blockquote>
            <ul v-else-if="block.type === 'list'" :class="toneClass(block)">
              <li v-for="item in block.items" :key="item">{{ item }}</li>
            </ul>
            <figure v-else-if="block.type === 'image'">
              <img :src="block.imageUrl" :alt="block.caption" :style="previewImageStyle(block)" />
              <figcaption v-if="block.caption">{{ block.caption }}</figcaption>
            </figure>
            <hr v-else-if="block.type === 'divider'" />
            <button v-else :class="['preview-button', `is-${block.buttonStyle}`]">{{ block.buttonText }}</button>
          </template>
        </div>
        <div v-for="segment in longImageSegments" :key="segment.url" class="preview-long-image">
          <img :src="segment.url" alt="详情长图" />
        </div>
      </div>
      <div class="phone-preview__action"><span>报名费用</span><strong>立即报名</strong></div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from "vue";
import {
  isConferenceDetailBlockRenderable,
  type ConferenceDetailContentBlock
} from "@conference/shared";

const props = withDefaults(defineProps<{
  blocks: ConferenceDetailContentBlock[];
  title?: string;
  subtitle?: string;
  coverImage?: string;
  longImageSegments?: Array<{ url: string }>;
}>(), {
  title: "",
  subtitle: "",
  coverImage: "",
  longImageSegments: () => []
});

const renderableBlocks = computed(() => props.blocks.filter(isConferenceDetailBlockRenderable));

function textAlignStyle(block: ConferenceDetailContentBlock): CSSProperties {
  return { textAlign: block.align };
}

function toneClass(block: ConferenceDetailContentBlock) {
  return `is-tone-${block.tone}`;
}

function previewImageStyle(block: ConferenceDetailContentBlock): CSSProperties {
  if (block.imageMode === "widthFix" || block.imageRatio === "auto") return {};
  const ratio = { "16:9": "16 / 9", "4:3": "4 / 3", "1:1": "1 / 1" }[block.imageRatio];
  return { aspectRatio: ratio, objectFit: block.imageMode === "aspectFit" ? "contain" : "cover" };
}
</script>

<style scoped>
.preview-column {
  position: sticky;
  top: 84px;
  padding: 14px;
  border: 1px solid #dfe5ec;
  border-radius: 8px;
  background: #eef2f5;
}

.preview-column__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  color: #172236;
  font-size: 13px;
}

.preview-column__heading span {
  color: #7a8798;
  font-size: 12px;
}

.phone-preview {
  width: 100%;
  overflow: hidden;
  border: 1px solid #cdd5de;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 34px rgba(23, 34, 54, 0.13);
}

.phone-preview__status,
.phone-preview__nav,
.phone-preview__action {
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.phone-preview__status {
  height: 28px;
  justify-content: space-between;
  padding: 0 14px;
  color: #172236;
  font-size: 10px;
  font-weight: 800;
}

.phone-preview__nav {
  height: 44px;
  justify-content: center;
  border-bottom: 1px solid #edf0f3;
  color: #172236;
  font-size: 13px;
  font-weight: 800;
}

.phone-preview__scroll {
  height: 590px;
  overflow-y: auto;
  background: #f4f5f3;
}

.preview-cover {
  height: 170px;
  background-position: center;
  background-size: cover;
}

.preview-summary {
  padding: 20px 18px;
  border-bottom: 1px solid #e5e9e6;
  background: #fff;
}

.preview-summary span {
  color: #178054;
  font-size: 10px;
  font-weight: 800;
}

.preview-summary h4 {
  margin: 8px 0 0;
  color: #132033;
  font-size: 20px;
  line-height: 1.35;
}

.preview-summary p {
  margin: 8px 0 0;
  color: #677286;
  font-size: 12px;
  line-height: 1.55;
}

.preview-content {
  padding: 20px 18px;
  background: #fff;
}

.preview-content h5 {
  margin: 26px 0 10px;
  color: #132033;
  font-size: 18px;
  line-height: 1.4;
}

.preview-content h5:first-child {
  margin-top: 0;
}

.preview-content p,
.preview-content blockquote,
.preview-content ul {
  margin: 0 0 16px;
  color: #364257;
  font-size: 13px;
  line-height: 1.8;
  white-space: pre-wrap;
}

.preview-content blockquote {
  padding: 12px 14px;
  border-left: 3px solid #b59143;
  background: #faf7ef;
}

.preview-content ul {
  padding-left: 20px;
}

.preview-content figure {
  margin: 16px 0;
}

.preview-content img,
.preview-long-image img {
  display: block;
  width: 100%;
  height: auto;
}

.preview-content figcaption {
  margin-top: 7px;
  color: #7a8798;
  font-size: 11px;
  line-height: 1.5;
  text-align: center;
}

.preview-content hr {
  margin: 22px 0;
  border: 0;
  border-top: 1px solid #e1e5e9;
}

.is-tone-accent {
  color: #8b6822 !important;
  font-weight: 700;
}

.is-tone-muted {
  color: #7a8798 !important;
}

.preview-button {
  min-height: 38px;
  margin: 8px 0 16px;
  padding: 0 18px;
  border: 1px solid #10243e;
  border-radius: 6px;
  background: #10243e;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
}

.preview-button.is-secondary {
  background: #fff;
  color: #10243e;
}

.preview-button.is-text {
  border-color: transparent;
  background: transparent;
  color: #8b6822;
}

.phone-preview__action {
  min-height: 58px;
  justify-content: space-between;
  padding: 9px 14px;
  border-top: 1px solid #e3e7ea;
  background: #fff;
  color: #68758a;
  font-size: 11px;
}

.phone-preview__action strong {
  padding: 10px 22px;
  border-radius: 6px;
  background: #10243e;
  color: #fff;
  font-size: 12px;
}

@media (max-width: 1180px) {
  .preview-column {
    position: static;
    max-width: 388px;
  }
}
</style>
