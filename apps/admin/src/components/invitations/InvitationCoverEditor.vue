<template>
  <div class="cover-workspace">
    <div class="cover-workspace__stage">
      <div class="cover-stage-bar">
        <strong>封面画布</strong
        ><span
          >{{ modelValue.cover.width }} × {{ modelValue.cover.height }} px</span
        >
      </div>
      <div class="cover-stage-paper">
        <InvitationCoverCanvas
          :cover="modelValue.cover"
          :src="assetUrl(modelValue.coverImageUrl)"
          :name="previewName || '受邀嘉宾'"
          salutation="老师"
          :title="modelValue.title"
          :date="modelValue.dateLabel"
          :location="modelValue.location"
          :organization="matchedPerson?.organization"
          :role="matchedPerson?.role"
          :editable="!disabled"
          :selected-id="selectedId"
          @select="selectedId = $event"
          @change="changeLayer"
        />
      </div>
    </div>
    <aside class="cover-inspector">
      <InvitationImageField
        :model-value="modelValue.coverImageUrl"
        :campaign-id="campaignId"
        label="封面图片"
        recommended="1080 × 1920 px · 9:16"
        compact
        :disabled="disabled"
        @update:model-value="setImage"
        @dimensions="setDimensions"
      />
      <div class="cover-inspector__heading">
        <h3>动态文字</h3>
        <el-dropdown
          trigger="click"
          :disabled="disabled || modelValue.cover.layers.length >= 12"
          @command="addLayer"
          ><el-button
            :icon="Plus"
            title="添加文字"
            aria-label="添加文字"
            :disabled="disabled || modelValue.cover.layers.length >= 12"
          /><template #dropdown
            ><el-dropdown-menu>
              <el-dropdown-item
                v-for="(text, label) in layerOptions"
                :key="label"
                :command="label"
                >{{ label }}</el-dropdown-item
              >
            </el-dropdown-menu></template
          ></el-dropdown
        >
      </div>
      <div class="cover-layer-list">
        <div
          v-for="layer in modelValue.cover.layers"
          :key="layer.id"
          :class="{ active: selectedId === layer.id }"
        >
          <button type="button" @click="selectedId = layer.id">
            <el-icon><EditPen /></el-icon><span>{{ layer.label }}</span>
          </button>
          <el-switch
            :model-value="layer.enabled"
            :disabled="disabled"
            :aria-label="`显示${layer.label}`"
            @update:model-value="
              changeLayer({ ...layer, enabled: Boolean($event) })
            "
          />
        </div>
        <el-empty
          v-if="!modelValue.cover.layers.length"
          description="未添加动态文字"
          :image-size="48"
        />
      </div>
      <template v-if="selected">
        <div class="cover-inspector__heading">
          <h3>{{ selected.label }}</h3>
          <el-button
            text
            :icon="Delete"
            title="删除文字"
            aria-label="删除文字"
            :disabled="disabled"
            @click="removeLayer"
          />
        </div>
        <el-input
          :model-value="selected.text"
          type="textarea"
          :rows="2"
          maxlength="500"
          aria-label="动态文字内容"
          :disabled="disabled"
          @update:model-value="patch({ text: $event })"
        />
        <div class="cover-field-grid">
          <el-form-item label="字体"
            ><el-select
              :model-value="selected.font"
              aria-label="文字字体"
              @update:model-value="patch({ font: $event })"
              ><el-option
                v-for="(font, id) in INVITATION_FONTS"
                :key="id"
                :label="font.label"
                :value="id" /></el-select
          ></el-form-item>
          <el-form-item label="字号 · 原图 px"
            ><el-input-number
              :model-value="selected.fontSize"
              :min="12"
              :max="240"
              controls-position="right"
              aria-label="文字字号"
              @update:model-value="patch({ fontSize: $event || 12 })"
          /></el-form-item>
        </div>
        <div class="cover-type-tools">
          <el-color-picker
            :model-value="selected.color"
            aria-label="文字颜色"
            @update:model-value="$event && patch({ color: $event })"
          />
          <button
            type="button"
            title="加粗"
            aria-label="加粗"
            :aria-pressed="selected.bold"
            :disabled="disabled"
            @click="patch({ bold: !selected.bold })"
          >
            <b>B</b>
          </button>
          <button
            type="button"
            title="斜体"
            aria-label="斜体"
            :aria-pressed="selected.italic"
            :disabled="disabled"
            @click="patch({ italic: !selected.italic })"
          >
            <i>I</i>
          </button>
          <button
            type="button"
            title="下划线"
            aria-label="下划线"
            :aria-pressed="selected.underline"
            :disabled="disabled"
            @click="patch({ underline: !selected.underline })"
          >
            <u>U</u>
          </button>
          <el-select
            :model-value="selected.align"
            aria-label="文字对齐"
            @update:model-value="patch({ align: $event })"
            ><el-option label="左对齐" value="left" /><el-option
              label="居中"
              value="center" /><el-option label="右对齐" value="right"
          /></el-select>
        </div>
        <el-divider />
        <div class="cover-field-grid">
          <el-form-item
            v-for="(label, key) in {
              x: '横向位置 %',
              y: '纵向位置 %',
              width: '文字框宽 %',
              height: '文字框高 %',
            }"
            :key="key"
            :label="label"
          >
            <el-input-number
              :model-value="selected[key]"
              :min="key === 'width' || key === 'height' ? 1 : 0"
              :max="100"
              :step="0.5"
              :precision="2"
              controls-position="right"
              :aria-label="label"
              @update:model-value="patch({ [key]: $event || 0 })"
            />
          </el-form-item>
        </div>
      </template>
    </aside>
  </div>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { Delete, Plus, EditPen } from "@element-plus/icons-vue";
import {
  createInvitationLayer,
  INVITATION_FONTS,
  normalizeInvitationCover,
  matchInvitationInvitee,
  type InvitationContent,
  type InvitationTextLayer,
} from "@conference/shared";
import InvitationCoverCanvas from "./InvitationCoverCanvas.vue";
import InvitationImageField from "./InvitationImageField.vue";
import { API_BASE_URL } from "../../config";
const props = defineProps<{
  modelValue: InvitationContent;
  campaignId: string;
  previewName: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const selectedId = ref(props.modelValue.cover.layers[0]?.id || "");
const selected = computed(() =>
  props.modelValue.cover.layers.find((layer) => layer.id === selectedId.value),
);
const layerOptions: Record<string, string> = {
  受邀人: "{姓名}{称谓}",
  单位: "{单位}",
  职务: "{职务}",
  会议名称: "{会议名称}",
  会议时间: "{会议时间}",
  会议地点: "{会议地点}",
  自定义文字: "诚挚相邀",
};
const matchedPerson = computed(
  () =>
    matchInvitationInvitee(props.modelValue.invitees, {
      name: props.previewName,
      salutation: "老师",
    }).item,
);
const assetUrl = (url: string) =>
  url.startsWith("/uploads/") ? new URL(API_BASE_URL).origin + url : url;
function update(value: Partial<InvitationContent>) {
  if (!props.disabled)
    emit("update:modelValue", { ...props.modelValue, ...value });
}
function changeLayer(layer: InvitationTextLayer) {
  update({
    cover: normalizeInvitationCover({
      ...props.modelValue.cover,
      layers: props.modelValue.cover.layers.map((item) =>
        item.id === layer.id ? layer : item,
      ),
    }),
  });
}
function patch(value: Partial<InvitationTextLayer>) {
  if (selected.value) changeLayer({ ...selected.value, ...value });
}
function addLayer(label: string) {
  if (props.disabled || props.modelValue.cover.layers.length >= 12) return;
  const layer = {
    ...createInvitationLayer(crypto.randomUUID(), layerOptions[label]),
    label,
  };
  update({
    cover: {
      ...props.modelValue.cover,
      layers: [...props.modelValue.cover.layers, layer],
    },
  });
  selectedId.value = layer.id;
}
function removeLayer() {
  update({
    cover: {
      ...props.modelValue.cover,
      layers: props.modelValue.cover.layers.filter(
        (layer) => layer.id !== selectedId.value,
      ),
    },
  });
  selectedId.value = "";
}
function setImage(url: string) {
  update({ coverImageUrl: url, visualPreset: "custom" });
}
function setDimensions(size: { width: number; height: number }) {
  if (
    size.width !== props.modelValue.cover.width ||
    size.height !== props.modelValue.cover.height
  )
    update({ cover: { ...props.modelValue.cover, ...size } });
}
</script>
<style scoped>
.cover-workspace {
  scroll-margin-top: 200px;
  display: grid;
  grid-template-columns: minmax(280px, 1fr) 300px;
  border: 1px solid #e2e5e8;
  border-radius: 6px;
  overflow: hidden;
}
.cover-workspace__stage {
  background: #edf0f2;
  min-width: 0;
  padding: 16px 24px 30px;
}
.cover-stage-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: #717981;
  margin-bottom: 18px;
  gap: 12px;
}
.cover-stage-bar strong {
  color: #364047;
  font-weight: 500;
}
.cover-stage-paper {
  max-width: 420px;
  margin: auto;
  box-shadow: 0 8px 28px #1a27341c;
}
.cover-inspector {
  min-width: 0;
  background: #fff;
  border-left: 1px solid #e2e5e8;
  padding: 20px;
}
.cover-inspector__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 20px 0 10px;
}
.cover-inspector h3 {
  font-size: 13px;
  margin: 0;
}
.cover-layer-list > div:not(.el-empty) {
  display: flex;
  gap: 8px;
  padding: 5px 8px;
  align-items: center;
  border-radius: 4px;
}
.cover-layer-list > div.active {
  background: #edf6f5;
}
.cover-layer-list button {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: 0;
  text-align: left;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 7px 0;
}
.cover-field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 12px;
  margin-top: 16px;
}
.cover-field-grid :deep(.el-input-number) {
  width: 100%;
}
.cover-type-tools {
  display: flex;
  align-items: center;
  gap: 6px;
}
.cover-type-tools > button {
  width: 30px;
  height: 30px;
  border: 1px solid #e0e3e5;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  flex: 0 0 30px;
}
.cover-type-tools > button[aria-pressed="true"] {
  background: #e1f1ee;
  border-color: #4f9083;
}
.cover-type-tools :deep(.el-select) {
  min-width: 0;
  flex: 1;
}
@media (max-width: 950px) {
  .cover-workspace {
    grid-template-columns: minmax(230px, 1fr) 260px;
  }
  .cover-inspector {
    padding: 14px;
  }
}
@media (max-width: 700px) {
  .cover-workspace {
    grid-template-columns: 1fr;
    scroll-margin-top: 228px;
  }
  .cover-stage-paper {
    max-width: 310px;
  }
  .cover-inspector {
    border-left: 0;
    border-top: 1px solid #e2e5e8;
  }
}
</style>
