<template>
  <section class="invitation-font-editor">
    <header class="font-heading">
      <h2>字体与字号</h2>
      <el-button :icon="Upload" :disabled="disabled" @click="openSource"
        >上传 / 选择字体</el-button
      >
    </header>
    <div class="font-fields">
      <el-form-item label="页面字体">
        <el-select
          :model-value="design.font"
          aria-label="页面字体"
          :disabled="disabled"
          @update:model-value="patch({ font: $event })"
        >
          <el-option label="沿用原有排版" value="default" />
          <el-option
            v-for="(font, key) in INVITATION_FONTS"
            :key="key"
            :label="font.label"
            :value="key"
          />
          <el-option :label="design.fontName || '自定义字体'" value="custom" />
        </el-select>
      </el-form-item>
      <el-form-item label="正文字号">
        <el-input-number
          :model-value="design.bodySize"
          :min="12"
          :max="22"
          aria-label="正文字号"
          :disabled="disabled"
          @update:model-value="patch({ bodySize: Number($event) })"
        />
      </el-form-item>
    </div>
    <div
      class="font-specimen"
      :style="{ fontFamily: pageFont.family.value || undefined }"
      aria-label="字体预览"
    >
      <span>{{
        design.fontName ||
        (design.font === "custom" ? "自定义字体" : "当前页面字体")
      }}</span>
      <strong>{{ modelValue.title || "观潮会集 · 会议邀请函" }}</strong>
      <p :style="{ fontSize: `${design.bodySize}px` }">
        诚挚邀请 {{ previewName || "受邀嘉宾" }}，与同行相聚，共探新的可能。
      </p>
      <small v-if="pageFont.status.value === 'loading'" role="status"
        >字体加载中</small
      >
      <small
        v-if="pageFont.status.value === 'error'"
        class="font-error"
        role="alert"
        >字体加载失败，已使用系统字体</small
      >
    </div>
    <div v-if="design.font === 'custom' || sourceOpen" class="font-source">
      <el-checkbox v-model="fontLicensed" :disabled="disabled"
        >我已取得此字体的网页使用授权</el-checkbox
      >
      <InvitationAssetField
        :model-value="design.fontUrl"
        :campaign-id="campaignId"
        kind="font"
        label="自定义字体"
        :disabled="disabled || !fontLicensed"
        @update:model-value="patch({ fontUrl: $event, fontName: '' })"
        @asset="selectFont"
      />
      <el-form-item
        v-if="design.fontUrl"
        label="字体名称"
        class="font-name-field"
      >
        <el-input
          :model-value="design.fontName"
          aria-label="字体名称"
          maxlength="80"
          :disabled="disabled"
          @update:model-value="patch({ fontName: $event })"
        />
      </el-form-item>
    </div>
    <el-form-item class="font-unify" label="统一封面、正文与模块字体">
      <el-switch
        :model-value="design.replaceAllFonts"
        :disabled="disabled || design.font === 'default'"
        aria-label="一键统一全部字体"
        @update:model-value="patch({ replaceAllFonts: Boolean($event) })"
      />
    </el-form-item>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { Upload } from "@element-plus/icons-vue";
import {
  INVITATION_FONTS,
  normalizeInvitationPageDesign,
  type InvitationContent,
  type InvitationPageDesign,
} from "@conference/shared";
import InvitationAssetField from "./InvitationAssetField.vue";
import { useInvitationFont } from "../../utils/invitation-font";
import { API_BASE_URL } from "../../config";
import type { InvitationAsset } from "../../services/invitations";
const props = defineProps<{
  modelValue: InvitationContent;
  campaignId: string;
  previewName?: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const design = computed(() =>
  normalizeInvitationPageDesign(props.modelValue.design),
);
const fontLicensed = ref(false),
  sourceOpen = ref(false);
const pageFont = useInvitationFont(
  design,
  computed(() => new URL(API_BASE_URL).origin),
);
function patch(value: Partial<InvitationPageDesign>) {
  if (!props.disabled)
    emit("update:modelValue", {
      ...props.modelValue,
      design: { ...design.value, ...value },
    });
}
function openSource() {
  if (props.disabled) return;
  sourceOpen.value = true;
  patch({ font: "custom" });
}
function selectFont(asset: InvitationAsset) {
  patch({
    font: "custom",
    fontUrl: asset.url,
    fontName: asset.name,
    replaceAllFonts: true,
  });
}
</script>
<style scoped>
.invitation-font-editor {
  max-width: 760px;
  min-width: 0;
}
.font-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
}
.font-heading h2 {
  font-size: 17px;
  font-weight: 600;
  margin: 0;
}
.font-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 160px;
  gap: 24px;
}
.font-specimen {
  padding: 24px 0;
  margin: 8px 0 24px;
  border-top: 1px solid #dce3e5;
  border-bottom: 1px solid #dce3e5;
  overflow-wrap: anywhere;
}
.font-specimen > span {
  font:
    12px system-ui,
    sans-serif;
  color: #75808a;
}
.font-specimen strong {
  display: block;
  font-size: 24px;
  line-height: 1.6;
  margin: 12px 0;
  color: #2b343b;
}
.font-specimen p {
  line-height: 1.9;
  color: #52606b;
  margin: 0;
}
.font-specimen small {
  display: block;
  margin-top: 12px;
}
.font-error {
  color: #ad354b;
}
.font-source :deep(.el-checkbox) {
  height: auto;
  min-height: 40px;
}
.font-source :deep(.el-checkbox__label) {
  white-space: normal;
}
.font-name-field,
.font-unify {
  margin-top: 20px;
}
@media (max-width: 600px) {
  .font-fields {
    grid-template-columns: 1fr;
    gap: 0;
  }
  .font-specimen strong {
    font-size: 20px;
  }
}
</style>
