<template>
  <section class="theme-editor">
    <h2>全局主题</h2>
    <div class="theme-palette-list" aria-label="主题配色">
      <button
        v-for="palette in palettes"
        :key="palette.name"
        type="button"
        :disabled="disabled"
        :aria-label="`应用${palette.name}配色`"
        @click="applyPalette(palette)"
      >
        <span class="theme-palette-swatches"
          ><i
            v-for="color in [
              palette.primary,
              palette.accent,
              palette.background,
              palette.text,
            ]"
            :key="color"
            :style="{ background: color }" /></span
        ><strong>{{ palette.name }}</strong>
      </button>
    </div>
    <div class="theme-color-fields">
      <el-form-item
        v-for="(label, key) in {
          primaryColor: '主题色',
          accentColor: '点缀色',
          backgroundColor: '页面底色',
        }"
        :key="key"
        :label="label"
        ><el-color-picker
          :model-value="modelValue[key]"
          :disabled="disabled"
          @update:model-value="
            set({ [key]: $event || modelValue[key] })
          " /></el-form-item
      ><el-form-item label="正文颜色"
        ><el-color-picker
          :model-value="design.textColor"
          :disabled="disabled"
          @update:model-value="patch({ textColor: $event || '#26362f' })"
      /></el-form-item>
    </div>
    <el-collapse v-model="openGroups">
      <el-collapse-item title="字体与字号" name="font">
        <InvitationFontEditor
          :model-value="modelValue"
          :campaign-id="campaignId"
          :disabled="disabled"
          @update:model-value="$emit('update:modelValue', $event)"
        />
      </el-collapse-item>
      <el-collapse-item title="背景与动态背景" name="background">
        <InvitationImageField
          :model-value="design.backgroundImage"
          :campaign-id="campaignId"
          label="页面背景图片"
          :disabled="disabled"
          @update:model-value="patch({ backgroundImage: $event })"
        />
        <el-form-item v-if="design.backgroundImage" label="背景不透明度"
          ><el-slider
            :model-value="design.backgroundOpacity"
            :min="5"
            :max="100"
            :disabled="disabled"
            @update:model-value="patch({ backgroundOpacity: Number($event) })"
        /></el-form-item>
        <el-form-item label="背景动效" class="theme-background-motion"
          ><el-radio-group
            :model-value="design.backgroundMotion"
            :disabled="disabled || !design.backgroundImage"
            @update:model-value="
              patch({
                backgroundMotion:
                  $event as InvitationPageDesign['backgroundMotion'],
              })
            "
            ><el-radio-button value="none">静态</el-radio-button
            ><el-radio-button value="pan">缓慢平移</el-radio-button
            ><el-radio-button value="breathe"
              >轻柔缩放</el-radio-button
            ></el-radio-group
          ></el-form-item
        >
      </el-collapse-item>
    </el-collapse>
  </section>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import {
  normalizeInvitationPageDesign,
  type InvitationContent,
  type InvitationPageDesign,
} from "@conference/shared";
import InvitationFontEditor from "./InvitationFontEditor.vue";
import InvitationImageField from "./InvitationImageField.vue";
const props = defineProps<{
  modelValue: InvitationContent;
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const design = computed(() =>
  normalizeInvitationPageDesign(props.modelValue.design),
);
const openGroups = ref<string[]>([]);
const palettes = [
  {
    name: "青玉朱砂",
    primary: "#205b4b",
    accent: "#aa473c",
    background: "#f2f6f3",
    text: "#273b35",
  },
  {
    name: "典礼金红",
    primary: "#765925",
    accent: "#9d3545",
    background: "#faf8f2",
    text: "#352f29",
  },
  {
    name: "当代艺文",
    primary: "#343840",
    accent: "#bd383e",
    background: "#f4f5f7",
    text: "#30343c",
  },
  {
    name: "湖光琉璃",
    primary: "#216d78",
    accent: "#aa4560",
    background: "#f1f7f9",
    text: "#293940",
  },
];
function set(value: Partial<InvitationContent>) {
  if (!props.disabled)
    emit("update:modelValue", { ...props.modelValue, ...value });
}
function patch(value: Partial<InvitationPageDesign>) {
  set({ design: { ...design.value, ...value } });
}
function applyPalette(value: (typeof palettes)[number]) {
  set({
    primaryColor: value.primary,
    accentColor: value.accent,
    backgroundColor: value.background,
    design: { ...design.value, textColor: value.text },
  });
}
</script>
<style scoped>
.theme-editor {
  padding: 0 0 30px;
  margin-bottom: 30px;
  border-bottom: 1px solid #e0e6e8;
}
.theme-editor h2 {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 20px;
}
.theme-palette-list {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 24px;
}
.theme-palette-list button {
  border: 1px solid #e1e6e9;
  border-radius: 6px;
  padding: 12px;
  background: #fcfdfd;
  text-align: left;
  cursor: pointer;
  color: #45535b;
}
.theme-palette-list button:hover {
  border-color: #47786b;
}
.theme-palette-list strong {
  display: block;
  font-size: 12px;
  font-weight: 500;
  margin-top: 10px;
}
.theme-palette-swatches {
  display: flex;
  height: 24px;
  overflow: hidden;
  border-radius: 3px;
}
.theme-palette-swatches i {
  flex: 1;
}
.theme-color-fields {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}
.theme-background-motion {
  margin-top: 20px;
}
.theme-editor :deep(.el-collapse-item__header) {
  font-size: 14px;
}
.theme-editor :deep(.el-checkbox) {
  white-space: normal;
  height: auto;
  min-height: 40px;
}
.theme-editor :deep(.el-checkbox__label) {
  white-space: normal;
}
@media (max-width: 600px) {
  .theme-palette-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .theme-color-fields {
    gap: 22px;
  }
}
</style>
