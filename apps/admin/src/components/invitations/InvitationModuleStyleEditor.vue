<template>
  <div class="module-style-editor">
    <div class="style-color-row">
      <el-form-item label="背景颜色"
        ><el-color-picker
          :model-value="style.backgroundColor"
          :disabled="disabled"
          @update:model-value="patch({ backgroundColor: $event || '' })"
      /></el-form-item>
      <el-form-item label="文字颜色"
        ><el-color-picker
          :model-value="style.textColor"
          :disabled="disabled"
          @update:model-value="patch({ textColor: $event || '' })"
      /></el-form-item>
      <el-form-item label="强调颜色"
        ><el-color-picker
          :model-value="style.accentColor"
          :disabled="disabled"
          @update:model-value="patch({ accentColor: $event || '' })"
      /></el-form-item>
    </div>
    <el-form-item label="内容间距"
      ><el-radio-group
        :model-value="style.spacing"
        :disabled="disabled"
        @update:model-value="
          patch({ spacing: $event as InvitationModuleStyle['spacing'] })
        "
        ><el-radio-button value="compact">紧凑</el-radio-button
        ><el-radio-button value="comfortable">适中</el-radio-button
        ><el-radio-button value="spacious"
          >宽松</el-radio-button
        ></el-radio-group
      ></el-form-item
    >
    <el-form-item label="标题对齐"
      ><el-radio-group
        :model-value="style.align"
        :disabled="disabled"
        @update:model-value="patch({ align: $event as 'left' | 'center' })"
        ><el-radio-button value="left">左对齐</el-radio-button
        ><el-radio-button value="center">居中</el-radio-button></el-radio-group
      ></el-form-item
    >
    <el-collapse
      ><el-collapse-item title="背景图片" name="background"
        ><InvitationImageField
          :model-value="style.backgroundImage"
          :campaign-id="campaignId"
          label="模块背景图片"
          :disabled="disabled"
          @update:model-value="
            patch({ backgroundImage: $event })
          " /></el-collapse-item
    ></el-collapse>
    <el-button
      class="style-reset"
      :icon="RefreshLeft"
      :disabled="disabled"
      @click="$emit('update:modelValue', normalizeInvitationModuleStyle(null))"
      >恢复主题样式</el-button
    >
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RefreshLeft } from "@element-plus/icons-vue";
import {
  normalizeInvitationModuleStyle,
  type InvitationModuleStyle,
} from "@conference/shared";
import InvitationImageField from "./InvitationImageField.vue";
const props = defineProps<{
  modelValue?: InvitationModuleStyle;
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationModuleStyle];
}>();
const style = computed(() => normalizeInvitationModuleStyle(props.modelValue));
function patch(value: Partial<InvitationModuleStyle>) {
  if (!props.disabled) emit("update:modelValue", { ...style.value, ...value });
}
</script>
<style scoped>
.module-style-editor {
  max-width: 680px;
  padding: 12px 0;
}
.style-color-row {
  display: flex;
  gap: 40px;
  flex-wrap: wrap;
}
.style-reset {
  margin-top: 24px;
}
</style>
