<template>
  <div class="module-style-editor">
    <el-form-item v-if="moduleType === 'richtext'" label="文字展示形式">
      <el-radio-group
        :model-value="agendaSettings.textPresentation"
        :disabled="disabled"
        aria-label="文字展示形式"
        @update:model-value="
          patchAgenda({
            textPresentation:
              $event as InvitationModuleSettings['textPresentation'],
          })
        "
      >
        <el-radio-button value="auto">跟随模块</el-radio-button
        ><el-radio-button value="prose">正文</el-radio-button
        ><el-radio-button value="keywords">关键词陈列</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <div v-if="moduleType === 'agenda'" class="agenda-type-controls">
      <h3>议程排版</h3>
      <div class="agenda-type-fields">
        <el-form-item label="议程标题字号">
          <el-input-number
            :model-value="agendaSettings.agendaTitleSize"
            :min="12"
            :max="24"
            :disabled="disabled"
            aria-label="议程标题字号"
            @update:model-value="
              patchAgenda({ agendaTitleSize: Number($event) })
            "
          />
        </el-form-item>
        <el-form-item label="时间与嘉宾字号">
          <el-input-number
            :model-value="agendaSettings.agendaMetaSize"
            :min="10"
            :max="18"
            :disabled="disabled"
            aria-label="时间与嘉宾字号"
            @update:model-value="
              patchAgenda({ agendaMetaSize: Number($event) })
            "
          />
        </el-form-item>
        <el-form-item label="标题字重">
          <el-select
            :model-value="agendaSettings.agendaWeight"
            :disabled="disabled"
            aria-label="议程标题字重"
            @update:model-value="patchAgenda({ agendaWeight: Number($event) })"
          >
            <el-option
              v-for="(label, weight) in {
                400: '常规',
                500: '中等',
                600: '半粗',
                700: '加粗',
              }"
              :key="weight"
              :label="label"
              :value="Number(weight)"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="行距">
          <el-input-number
            :model-value="agendaSettings.agendaLineHeight"
            :min="1.2"
            :max="2.2"
            :step="0.1"
            :precision="1"
            :disabled="disabled"
            aria-label="议程行距"
            @update:model-value="
              patchAgenda({ agendaLineHeight: Number($event) })
            "
          />
        </el-form-item>
      </div>
      <el-form-item label="条目间距">
        <el-slider
          :model-value="agendaSettings.agendaPadding"
          :min="8"
          :max="28"
          :step="2"
          :disabled="disabled"
          aria-label="议程条目间距"
          @update:model-value="patchAgenda({ agendaPadding: Number($event) })"
        />
      </el-form-item>
      <el-form-item label="日期展示">
        <el-radio-group
          :model-value="agendaSettings.agendaLayout"
          :disabled="disabled"
          aria-label="议程日期展示"
          @update:model-value="
            patchAgenda({
              agendaLayout: $event as InvitationModuleSettings['agendaLayout'],
            })
          "
        >
          <el-radio-button value="auto">跟随模板</el-radio-button>
          <el-radio-button value="tabs">按天切换</el-radio-button>
          <el-radio-button value="continuous">连续展示</el-radio-button>
        </el-radio-group>
      </el-form-item>
    </div>
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
      @click="reset"
      >恢复主题样式</el-button
    >
  </div>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { RefreshLeft } from "@element-plus/icons-vue";
import {
  normalizeInvitationModuleStyle,
  normalizeInvitationModuleSettings,
  type InvitationModuleSettings,
  type InvitationModuleType,
  type InvitationModuleStyle,
} from "@conference/shared";
import InvitationImageField from "./InvitationImageField.vue";
const props = defineProps<{
  modelValue?: InvitationModuleStyle;
  campaignId: string;
  disabled?: boolean;
  moduleType?: InvitationModuleType;
  settings?: InvitationModuleSettings;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationModuleStyle];
  "update:settings": [value: InvitationModuleSettings];
  reset: [
    value: {
      style: InvitationModuleStyle;
      settings?: InvitationModuleSettings;
    },
  ];
}>();
const style = computed(() => normalizeInvitationModuleStyle(props.modelValue));
const agendaSettings = computed(() =>
  normalizeInvitationModuleSettings(props.settings),
);
function patchAgenda(value: Partial<InvitationModuleSettings>) {
  if (!props.disabled)
    emit("update:settings", { ...agendaSettings.value, ...value });
}
function reset() {
  if (props.disabled) return;
  const value: {
    style: InvitationModuleStyle;
    settings?: InvitationModuleSettings;
  } = { style: normalizeInvitationModuleStyle(null) };
  if (props.moduleType === "agenda") {
    const defaults = normalizeInvitationModuleSettings(null);
    value.settings = {
      ...agendaSettings.value,
      agendaTitleSize: defaults.agendaTitleSize,
      agendaMetaSize: defaults.agendaMetaSize,
      agendaLineHeight: defaults.agendaLineHeight,
      agendaWeight: defaults.agendaWeight,
      agendaPadding: defaults.agendaPadding,
      agendaLayout: defaults.agendaLayout,
    };
  } else if (props.moduleType === "richtext") {
    value.settings = { ...agendaSettings.value, textPresentation: "auto" };
  }
  emit("reset", value);
}
function patch(value: Partial<InvitationModuleStyle>) {
  if (!props.disabled) emit("update:modelValue", { ...style.value, ...value });
}
</script>
<style scoped>
.agenda-type-controls {
  padding-bottom: 16px;
  margin-bottom: 24px;
  border-bottom: 1px solid #dce3e5;
}
.agenda-type-controls h3 {
  font-size: 15px;
  margin: 0 0 20px;
  font-weight: 600;
}
.agenda-type-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
}
.agenda-type-fields :deep(.el-select),
.agenda-type-fields :deep(.el-input-number) {
  width: 100%;
}
@media (max-width: 600px) {
  .agenda-type-fields {
    grid-template-columns: 1fr;
  }
}
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
