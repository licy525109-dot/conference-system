<template>
  <aside class="rich-preview">
    <div class="rich-preview__heading">
      <div>
        <strong>手机预览</strong>
        <span>与 H5、小程序使用同一份安全内容</span>
      </div>
      <el-tag size="small" effect="plain">实时</el-tag>
    </div>

    <div class="preview-phone">
      <div class="preview-phone__status"><span>9:41</span><span>● ● 63</span></div>
      <div class="preview-phone__nav">{{ title || "会议详情" }}</div>
      <div class="preview-phone__scroll">
        <div v-if="coverImage" class="preview-cover" :style="{ backgroundImage: `url(${coverImage})` }" />
        <div class="preview-summary">
          <span>报名中</span>
          <h4>{{ title || "会议标题" }}</h4>
          <p v-if="subtitle">{{ subtitle }}</p>
        </div>
        <div v-if="safeHtml" class="preview-rich-text" v-html="safeHtml" />
        <div v-for="segment in longImageSegments" :key="segment.url" class="preview-long-image">
          <img :src="segment.url" alt="详情长图" />
        </div>
        <div v-if="!safeHtml && longImageSegments.length === 0" class="preview-empty">
          <strong>还没有详情内容</strong>
          <span>在左侧编辑文字或插入图片后，这里会立即显示。</span>
        </div>
      </div>
      <div class="preview-phone__action">
        <span>报名费用</span>
        <strong>立即报名</strong>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { createConferenceDetailRichText, isConferenceDetailEditorEmpty } from "../../utils/conferenceDetailRichText";

const props = withDefaults(defineProps<{
  html: string;
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

const safeHtml = computed(() => isConferenceDetailEditorEmpty(props.html)
  ? ""
  : createConferenceDetailRichText(props.html).html);
</script>

<style scoped>
.rich-preview {
  position: sticky;
  top: 84px;
  padding: 16px;
  border: 1px solid #dce3ea;
  border-radius: 8px;
  background: #eef2f5;
}

.rich-preview__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.rich-preview__heading strong,
.rich-preview__heading span {
  display: block;
}

.rich-preview__heading strong {
  color: #172236;
  font-size: 14px;
}

.rich-preview__heading span {
  margin-top: 3px;
  color: #718096;
  font-size: 11px;
}

.preview-phone {
  width: 100%;
  overflow: hidden;
  border: 1px solid #cbd4de;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 16px 36px rgba(23, 34, 54, 0.12);
}

.preview-phone__status,
.preview-phone__nav,
.preview-phone__action {
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.preview-phone__status {
  height: 28px;
  justify-content: space-between;
  padding: 0 14px;
  color: #172236;
  font-size: 10px;
  font-weight: 800;
}

.preview-phone__nav {
  height: 44px;
  justify-content: center;
  border-bottom: 1px solid #edf0f3;
  color: #172236;
  font-size: 13px;
  font-weight: 800;
}

.preview-phone__scroll {
  height: 600px;
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
  line-height: 1.4;
}

.preview-summary p {
  margin: 8px 0 0;
  color: #677286;
  font-size: 12px;
  line-height: 1.55;
}

.preview-rich-text {
  padding: 22px 18px 28px;
  background: #fff;
  color: #344054;
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.preview-rich-text :deep(h1),
.preview-rich-text :deep(h2),
.preview-rich-text :deep(h3),
.preview-rich-text :deep(h4) {
  margin: 24px 0 10px;
  color: #132033;
  line-height: 1.45;
}

.preview-rich-text :deep(h1:first-child),
.preview-rich-text :deep(h2:first-child),
.preview-rich-text :deep(h3:first-child),
.preview-rich-text :deep(h4:first-child) {
  margin-top: 0;
}

.preview-rich-text :deep(h1) { font-size: 23px; }
.preview-rich-text :deep(h2) { font-size: 20px; }
.preview-rich-text :deep(h3) { font-size: 17px; }
.preview-rich-text :deep(h4) { font-size: 15px; }

.preview-rich-text :deep(p),
.preview-rich-text :deep(blockquote),
.preview-rich-text :deep(ul),
.preview-rich-text :deep(ol),
.preview-rich-text :deep(pre) {
  margin: 0 0 16px;
}

.preview-rich-text :deep(blockquote) {
  padding: 12px 14px;
  border-left: 3px solid #a9863d;
  background: #faf7ef;
}

.preview-rich-text :deep(ul),
.preview-rich-text :deep(ol) {
  padding-left: 22px;
}

.preview-rich-text :deep(img),
.preview-long-image img {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
}

.preview-rich-text :deep(a) {
  color: #2f6484;
}

.preview-rich-text :deep(hr) {
  margin: 22px 0;
  border: 0;
  border-top: 1px solid #e1e5e9;
}

.preview-empty {
  display: flex;
  min-height: 260px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 24px;
  color: #7a8798;
  font-size: 12px;
  text-align: center;
}

.preview-empty strong {
  color: #172236;
  font-size: 14px;
}

.preview-phone__action {
  height: 58px;
  justify-content: space-between;
  padding: 0 14px;
  border-top: 1px solid #e5e9e6;
  color: #69758a;
  font-size: 11px;
}

.preview-phone__action strong {
  min-width: 112px;
  padding: 10px 16px;
  border-radius: 6px;
  background: #10243e;
  color: #fff;
  font-size: 13px;
  text-align: center;
}
</style>
