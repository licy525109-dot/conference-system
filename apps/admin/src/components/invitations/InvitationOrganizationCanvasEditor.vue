<template>
  <section class="organization-canvas-editor">
    <header class="organization-canvas-tools">
      <div>
        <el-button
          :icon="RefreshLeft"
          title="撤销画布调整"
          aria-label="撤销画布调整"
          :disabled="disabled || !past.length"
          @click="undo"
        /><el-button
          :icon="RefreshRight"
          title="重做画布调整"
          aria-label="重做画布调整"
          :disabled="disabled || !future.length"
          @click="redo"
        /><el-button
          :icon="Plus"
          :disabled="disabled || canvas.labels.length >= 20"
          @click="addText"
          >添加文字</el-button
        >
      </div>
      <div>
        <el-switch
          v-model="grid"
          aria-label="显示辅助网格"
          :disabled="disabled"
        /><el-button :icon="Grid" :disabled="disabled" @click="arrange"
          >一键排齐</el-button
        >
      </div>
    </header>
    <div class="canvas-size-fields">
      <el-form-item label="画布宽度"
        ><el-input-number
          :model-value="canvas.width"
          aria-label="组织画布宽度"
          :min="320"
          :max="1600"
          :step="50"
          :disabled="disabled"
          @update:model-value="
            setCanvas({ width: Number($event) })
          " /></el-form-item
      ><el-form-item label="画布高度"
        ><el-input-number
          :model-value="canvas.height"
          aria-label="组织画布高度"
          :min="200"
          :max="6000"
          :step="50"
          :disabled="disabled"
          @update:model-value="setCanvas({ height: Number($event) })"
      /></el-form-item>
    </div>
    <InvitationOrganizationCanvas
      :module="module"
      :asset-origin="assetOrigin"
      :editable="!disabled"
      :selected-id="selectedId"
      :grid="grid"
      :custom-font-family="font.customFamily.value"
      :font-family="pageDesign?.replaceAllFonts ? font.family.value : undefined"
      :style="{ '--invite-custom-font': font.customFamily.value || undefined }"
      @select="selectedId = $event"
      @start="beginGesture"
      @change="changeFrame"
      @commit="finishGesture"
    />
    <div class="canvas-selection-tools">
      <el-select
        v-model="selectedId"
        aria-label="组织画布选中对象"
        :disabled="disabled"
        ><el-option
          v-for="object in objects"
          :key="object.id"
          :value="object.id"
          :label="object.label"
      /></el-select>
      <div v-if="selectedFrame" class="canvas-align-tools">
        <el-button
          v-for="(icon, align) in alignIcons"
          :key="align"
          :icon="icon"
          :title="alignLabels[align]"
          :aria-label="alignLabels[align]"
          :disabled="disabled"
          @click="alignSelection(align)"
        />
      </div>
    </div>
    <div v-if="selectedFrame" class="canvas-position-fields">
      <el-form-item
        v-for="(label, key) in frameLabels"
        :key="key"
        :label="label"
        ><el-input-number
          :model-value="selectedFrame[key]"
          :aria-label="`选中对象${label}`"
          :min="key === 'width' ? 2 : key === 'height' ? 1 : 0"
          :max="100"
          :step="1"
          :precision="2"
          :disabled="disabled"
          @update:model-value="editFrame(key, Number($event))"
      /></el-form-item>
    </div>
    <div v-if="selectedText" class="canvas-caption-fields">
      <el-form-item label="文字内容"
        ><el-input
          :model-value="selectedText.text"
          aria-label="画布文字内容"
          type="textarea"
          :rows="2"
          maxlength="500"
          :disabled="disabled"
          @update:model-value="editText({ text: $event })"
      /></el-form-item>
      <div class="canvas-text-style">
        <el-input-number
          :model-value="selectedText.fontSize"
          aria-label="画布文字字号"
          :min="12"
          :max="240"
          :disabled="disabled"
          @update:model-value="editText({ fontSize: Number($event) })"
        /><el-select
          :model-value="selectedText.font"
          aria-label="画布文字字体"
          :disabled="disabled"
          @update:model-value="editText({ font: $event })"
          ><el-option
            v-for="(family, key) in INVITATION_FONTS"
            :key="key"
            :label="family.label"
            :value="key" /><el-option
            v-if="pageDesign?.fontUrl"
            :label="pageDesign.fontName || '上传字体'"
            value="custom" /></el-select
        ><el-color-picker
          :model-value="selectedText.color"
          aria-label="画布文字颜色"
          :disabled="disabled"
          @update:model-value="editText({ color: $event || '#8b693b' })"
        /><el-button
          :class="{ active: selectedText.bold }"
          title="文字加粗"
          aria-label="画布文字加粗"
          :disabled="disabled"
          @click="editText({ bold: !selectedText.bold })"
          ><b>B</b></el-button
        ><el-button
          :icon="Delete"
          title="删除画布文字"
          aria-label="删除画布文字"
          :disabled="disabled"
          @click="deleteText"
        />
      </div>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import {
  RefreshLeft,
  RefreshRight,
  Plus,
  Grid,
  Delete,
  DArrowLeft,
  DArrowRight,
  Rank,
  Top,
  Bottom,
} from "@element-plus/icons-vue";
import {
  INVITATION_FONTS,
  arrangeInvitationOrganizations,
  createInvitationLayer,
  normalizeInvitationPageDesign,
  normalizeInvitationFrame,
  normalizeInvitationOrganizationCanvas,
  type InvitationCanvasFrame,
  type InvitationModule,
  type InvitationTextLayer,
  type InvitationPageDesign,
  type InvitationOrganizationCanvas as OrganizationCanvasConfig,
} from "@conference/shared";
import InvitationOrganizationCanvas from "./InvitationOrganizationCanvas.vue";
import { useInvitationFont } from "../../utils/invitation-font";
import { API_BASE_URL } from "../../config";
const props = defineProps<{
  module: InvitationModule;
  pageDesign?: InvitationPageDesign;
  disabled?: boolean;
}>();
const emit = defineEmits<{ patch: [value: Partial<InvitationModule>] }>();
const canvas = computed(() =>
  normalizeInvitationOrganizationCanvas(props.module.organizationCanvas),
);
const assetOrigin = computed(() => new URL(API_BASE_URL).origin);
const font = useInvitationFont(
  computed(() => normalizeInvitationPageDesign(props.pageDesign)),
  assetOrigin,
  computed(() => canvas.value.labels.some((label) => label.font === "custom")),
);
const grid = ref(true),
  selectedId = ref("");
const objects = computed(() => [
  ...(props.module.items || [])
    .filter((item) => item.imageUrl || item.description.trim())
    .map((item) => ({
      id: `logo:${item.id}`,
      label: `Logo · ${item.description || item.title}`,
    })),
  ...canvas.value.labels.map((label) => ({
    id: `text:${label.id}`,
    label: `文字 · ${label.text || "未命名"}`,
  })),
]);
watch(
  objects,
  (list) => {
    if (!list.some((object) => object.id === selectedId.value))
      selectedId.value = list[0]?.id || "";
  },
  { immediate: true },
);
const selectedText = computed(() =>
  canvas.value.labels.find((label) => `text:${label.id}` === selectedId.value),
);
const selectedFrame = computed(
  () =>
    selectedText.value ||
    (props.module.items || []).find(
      (item) => `logo:${item.id}` === selectedId.value,
    )?.frame ||
    arrangeInvitationOrganizations(props.module).items?.find(
      (item) => `logo:${item.id}` === selectedId.value,
    )?.frame,
);
const frameLabels = {
  x: "X位置（%）",
  y: "Y位置（%）",
  width: "宽度（%）",
  height: "高度（%）",
} as const;
const alignIcons = {
  left: DArrowLeft,
  center: Rank,
  right: DArrowRight,
  top: Top,
  bottom: Bottom,
};
const alignLabels = {
  left: "对象靠左",
  center: "对象水平居中",
  right: "对象靠右",
  top: "对象靠上",
  bottom: "对象靠下",
};
type Snapshot = Pick<InvitationModule, "items" | "organizationCanvas">;
const past = ref<Snapshot[]>([]),
  future = ref<Snapshot[]>([]);
let gesture: Snapshot | undefined;
const snapshot = (): Snapshot => ({
  items: (props.module.items || []).map((item) => ({
    ...item,
    ...(item.frame ? { frame: { ...item.frame } } : {}),
  })),
  organizationCanvas: {
    ...canvas.value,
    labels: canvas.value.labels.map((label) => ({ ...label })),
  },
});
function patch(value: Partial<InvitationModule>, remember = true) {
  if (props.disabled) return;
  if (remember) {
    past.value = [...past.value.slice(-49), snapshot()];
    future.value = [];
  }
  emit("patch", value);
}
function beginGesture() {
  gesture = snapshot();
}
function finishGesture() {
  if (gesture && JSON.stringify(gesture) !== JSON.stringify(snapshot())) {
    past.value = [...past.value.slice(-49), gesture];
    future.value = [];
  }
  gesture = undefined;
}
function undo() {
  const value = past.value[past.value.length - 1];
  if (!value || props.disabled) return;
  future.value.push(snapshot());
  past.value = past.value.slice(0, -1);
  patch(value, false);
}
function redo() {
  const value = future.value[future.value.length - 1];
  if (!value || props.disabled) return;
  past.value.push(snapshot());
  future.value = future.value.slice(0, -1);
  patch(value, false);
}
watch(
  () =>
    (props.module.items || []).map((item) => [
      item.id,
      item.title,
      item.imageUrl,
      item.description,
      item.href,
    ]),
  (value, previous) => {
    if (JSON.stringify(value) !== JSON.stringify(previous)) {
      past.value = [];
      future.value = [];
      gesture = undefined;
    }
  },
  { deep: true },
);
function changeFrame(
  id: string,
  frame: InvitationCanvasFrame,
  remember = false,
) {
  if (id.startsWith("text:"))
    patch(
      {
        organizationCanvas: {
          ...canvas.value,
          labels: canvas.value.labels.map((label) =>
            `text:${label.id}` === id ? { ...label, ...frame } : label,
          ),
        },
      },
      remember,
    );
  else
    patch(
      {
        items: (props.module.items || []).map((item) =>
          `logo:${item.id}` === id ? { ...item, frame } : item,
        ),
      },
      remember,
    );
}
function editFrame(key: keyof InvitationCanvasFrame, value: number) {
  if (selectedFrame.value)
    changeFrame(
      selectedId.value,
      normalizeInvitationFrame({ ...selectedFrame.value, [key]: value }),
      true,
    );
}
function setCanvas(value: Partial<OrganizationCanvasConfig>) {
  patch({
    organizationCanvas: normalizeInvitationOrganizationCanvas({
      ...canvas.value,
      ...value,
    }),
  });
}
function editText(value: Partial<InvitationTextLayer>) {
  patch({
    organizationCanvas: {
      ...canvas.value,
      labels: canvas.value.labels.map((label) =>
        label.id === selectedText.value?.id ? { ...label, ...value } : label,
      ),
    },
  });
}
function addText() {
  if (canvas.value.labels.length >= 20) return;
  const id = crypto.randomUUID();
  const initialItems = (props.module.items || []).map((item) => ({
    ...item,
    frame:
      item.frame ||
      arrangeInvitationOrganizations(props.module).items?.find(
        (unit) => unit.id === item.id,
      )?.frame,
  }));
  const bottom = Math.max(
    0,
    ...canvas.value.labels.map((label) => label.y + label.height),
    ...initialItems.map((item) =>
      item.frame ? item.frame.y + item.frame.height : 0,
    ),
  );
  const position = (bottom / 100) * canvas.value.height + 24;
  const height = Math.ceil(
    Math.min(6000, Math.max(canvas.value.height, position + 66)),
  );
  const factor = canvas.value.height / height;
  patch({
    items: initialItems.map((item) => ({
      ...item,
      ...(item.frame
        ? {
            frame: {
              ...item.frame,
              y: item.frame.y * factor,
              height: item.frame.height * factor,
            },
          }
        : {}),
    })),
    organizationCanvas: {
      ...canvas.value,
      height,
      labels: [
        ...canvas.value.labels.map((label) => ({
          ...label,
          y: label.y * factor,
          height: label.height * factor,
        })),
        {
          ...createInvitationLayer(id, "分组标题"),
          label: "分组标题",
          x: 4,
          y: Math.min(92, (position / height) * 100),
          width: 60,
          height: (42 / height) * 100,
          fontSize: 28,
          align: "left",
        },
      ],
    },
  });
  selectedId.value = `text:${id}`;
}
function deleteText() {
  if (selectedText.value)
    patch({
      organizationCanvas: {
        ...canvas.value,
        labels: canvas.value.labels.filter(
          (label) => label.id !== selectedText.value!.id,
        ),
      },
    });
}
function alignSelection(value: keyof typeof alignIcons) {
  const frame = selectedFrame.value;
  if (!frame) return;
  changeFrame(
    selectedId.value,
    {
      ...frame,
      x:
        value === "left"
          ? 0
          : value === "center"
            ? (100 - frame.width) / 2
            : value === "right"
              ? 100 - frame.width
              : frame.x,
      y:
        value === "top" ? 0 : value === "bottom" ? 100 - frame.height : frame.y,
    },
    true,
  );
}
async function arrange() {
  try {
    await ElMessageBox.confirm(
      "重新排列当前组织画布？单位素材会保留，自由位置与文字排版将重新生成。",
      "重新排列",
      {
        confirmButtonText: "重新排列",
        cancelButtonText: "取消",
        type: "warning",
      },
    );
    patch(arrangeInvitationOrganizations(props.module));
  } catch {}
}
</script>
<style scoped>
.organization-canvas-editor {
  padding: 16px 0 24px;
  min-width: 0;
}
.organization-canvas-tools,
.organization-canvas-tools > div {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.organization-canvas-tools {
  justify-content: space-between;
  margin-bottom: 18px;
}
.organization-canvas-tools :deep(.el-button + .el-button),
.canvas-align-tools :deep(.el-button + .el-button) {
  margin: 0;
}
.canvas-size-fields,
.canvas-position-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.canvas-size-fields :deep(.el-input-number),
.canvas-position-fields :deep(.el-input-number) {
  width: 100%;
}
.canvas-selection-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin: 20px 0;
}
.canvas-selection-tools > .el-select {
  flex: 1;
  min-width: 180px;
}
.canvas-align-tools,
.canvas-text-style {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.canvas-caption-fields {
  padding-top: 8px;
}
.canvas-text-style > .el-select {
  width: 110px;
}
.canvas-text-style > .el-input-number {
  width: 120px;
}
.canvas-text-style .active {
  color: #087a8b;
  border-color: #087a8b;
}
@media (max-width: 600px) {
  .organization-canvas-tools > div {
    gap: 4px;
  }
  .canvas-size-fields,
  .canvas-position-fields {
    gap: 0 10px;
  }
}
</style>
