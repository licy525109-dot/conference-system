<template>
  <section class="conference-rich-editor">
    <header class="conference-rich-editor__header">
      <div>
        <span class="eyebrow">会议详情</span>
        <h3>栏目与图文内容</h3>
        <p>按需新增栏目，每个栏目都可以独立编辑文字和图片，保存后同步用于 H5 和小程序。</p>
      </div>
      <div class="header-actions">
        <el-button :icon="FolderOpened" @click="emit('choose-material')">素材库</el-button>
        <el-button :icon="View" @click="previewVisible = true">预览</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="emit('save')">保存详情</el-button>
      </div>
    </header>

    <div class="section-manager">
      <div class="section-manager__tabs" role="tablist" aria-label="详情栏目">
        <button
          v-for="section in sections"
          :key="section.id"
          type="button"
          :class="['section-tab', { 'is-active': section.id === activeSectionId, 'is-disabled': !section.enabled }]"
          @click="selectSection(section.id)"
        >
          {{ section.title }}
        </button>
        <el-button :icon="Plus" @click="addSection">新增栏目</el-button>
      </div>
      <div v-if="activeSection" class="section-manager__settings">
        <el-input
          class="section-title-input"
          :model-value="activeSection.title"
          maxlength="16"
          show-word-limit
          aria-label="栏目名称"
          @update:model-value="renameActiveSection"
        />
        <div class="section-setting-actions">
          <span class="section-status-label">前台显示</span>
          <el-switch :model-value="activeSection.enabled" @update:model-value="setActiveSectionEnabled" />
          <el-button :icon="ArrowLeft" circle title="栏目左移" :disabled="activeSectionIndex <= 0" @click="moveActiveSection(-1)" />
          <el-button :icon="ArrowRight" circle title="栏目右移" :disabled="activeSectionIndex >= sections.length - 1" @click="moveActiveSection(1)" />
          <el-button :icon="Delete" circle title="删除栏目" :disabled="sections.length <= 1" @click="removeActiveSection" />
        </div>
      </div>
    </div>

    <div class="conference-rich-editor__workspace">
      <div class="editor-label">{{ activeSection?.title || "详情" }}</div>
      <div class="editor-shell">
        <div ref="toolbarElement" class="editor-toolbar" />
        <div ref="editorElement" class="editor-canvas" />
        <footer class="editor-footer">
          <span>可直接粘贴图文内容；第三方样式会在发布时自动清理。</span>
          <span>{{ contentLength }} 字</span>
        </footer>
      </div>
    </div>

    <el-drawer v-model="previewVisible" title="会议详情手机预览" size="430px">
      <ConferenceDetailRichTextPreview
        :html="draftHtml"
        :title="`${title || '会议详情'} · ${activeSection?.title || '活动详情'}`"
        :subtitle="subtitle"
        :cover-image="coverImage"
        :long-image-segments="longImageSegments"
      />
    </el-drawer>
  </section>
</template>

<script setup lang="ts">
import "@wangeditor/editor/dist/css/style.css";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { ArrowLeft, ArrowRight, Check, Delete, FolderOpened, Plus, View } from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  createEditor,
  createToolbar,
  type IDomEditor,
  type IEditorConfig,
  type IToolbarConfig
} from "@wangeditor/editor";
import { createMaterial } from "../../services/admin";
import { isConferenceDetailImageAsset } from "../../utils/conferenceDetailImage";
import ConferenceDetailRichTextPreview from "./ConferenceDetailRichTextPreview.vue";

const props = withDefaults(defineProps<{
  modelValue: DetailSectionDraft[];
  title?: string;
  subtitle?: string;
  coverImage?: string;
  saving?: boolean;
  longImageSegments?: Array<{ url: string }>;
}>(), {
  title: "",
  subtitle: "",
  coverImage: "",
  saving: false,
  longImageSegments: () => []
});

const emit = defineEmits<{
  "update:modelValue": [value: DetailSectionDraft[]];
  save: [];
  "choose-material": [];
}>();

const editorRef = shallowRef<IDomEditor | null>(null);
const toolbarRef = shallowRef<ReturnType<typeof createToolbar> | null>(null);
const editorElement = ref<HTMLElement | null>(null);
const toolbarElement = ref<HTMLElement | null>(null);
const sections = ref<DetailSectionDraft[]>([]);
const activeSectionId = ref("");
const draftHtml = ref("");
const previewVisible = ref(false);
const activeSectionIndex = computed(() => sections.value.findIndex((section) => section.id === activeSectionId.value));
const activeSection = computed(() => sections.value[activeSectionIndex.value] ?? sections.value[0] ?? null);

const toolbarConfig: Partial<IToolbarConfig> = {
  toolbarKeys: [
    "headerSelect",
    "fontSize",
    "|",
    "bold",
    "italic",
    "underline",
    "through",
    "color",
    "bgColor",
    "|",
    "justifyLeft",
    "justifyCenter",
    "justifyRight",
    "justifyJustify",
    "|",
    "bulletedList",
    "numberedList",
    "blockquote",
    "insertLink",
    "uploadImage",
    "divider",
    "|",
    "undo",
    "redo",
    "fullScreen"
  ],
  modalAppendToBody: true
};

const editorConfig: Partial<IEditorConfig> = {
  placeholder: "请输入会议详情，可直接粘贴排版内容或插入图片……",
  scroll: true,
  onChange: (editor) => {
    const html = editor.getHtml();
    if (html !== draftHtml.value) {
      draftHtml.value = html;
      updateActiveSectionHtml(html);
    }
  },
  MENU_CONF: {
    uploadImage: {
      maxFileSize: 20 * 1024 * 1024,
      maxNumberOfFiles: 20,
      allowedFileTypes: ["image/jpeg", "image/png", "image/webp"],
      customUpload: uploadEditorImage
    }
  }
};

const contentLength = computed(() => draftHtml.value
  .replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ")
  .trim().length);

watch(
  () => props.modelValue,
  (value) => {
    const next = normalizeDraftSections(value);
    if (JSON.stringify(next) !== JSON.stringify(sections.value)) sections.value = next;
    if (!sections.value.some((section) => section.id === activeSectionId.value)) {
      activeSectionId.value = sections.value[0]?.id ?? "";
    }
    syncEditorToActiveSection();
  },
  { immediate: true, deep: true }
);

onMounted(async () => {
  await nextTick();
  if (!editorElement.value || !toolbarElement.value) return;
  const editor = createEditor({
    selector: editorElement.value,
    html: draftHtml.value || "<p><br></p>",
    config: editorConfig,
    mode: "default"
  });
  editorRef.value = editor;
  toolbarRef.value = createToolbar({
    editor,
    selector: toolbarElement.value,
    config: toolbarConfig,
    mode: "default"
  });
});

onBeforeUnmount(() => {
  toolbarRef.value?.destroy();
  editorRef.value?.destroy();
});

async function uploadEditorImage(
  file: File,
  insertFn: (url: string, alt: string, href: string) => void
) {
  if (!isConferenceDetailImageAsset(file.type, file.name)) {
    ElMessage.warning("仅支持 JPG、PNG 或 WebP 图片");
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.warning("图片不能超过 20MB");
    return;
  }

  try {
    const asset = await createMaterial({
      name: file.name,
      usage: "conference_detail_rich_text",
      remark: "会议详情富文本图片",
      file
    });
    insertFn(asset.url, asset.name || file.name, "");
    ElMessage.success("图片已插入详情内容");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "图片上传失败");
  }
}

function insertImage(url: string, alt = "会议详情图片") {
  const editor = editorRef.value;
  if (!editor) return false;
  const safeUrl = url.replace(/"/g, "&quot;");
  const safeAlt = alt.replace(/"/g, "&quot;");
  editor.focus();
  editor.dangerouslyInsertHtml(`<p><img src="${safeUrl}" alt="${safeAlt}" style="width:100%;max-width:100%;height:auto;display:block"></p>`);
  return true;
}

function selectSection(sectionId: string) {
  if (sectionId === activeSectionId.value) return;
  activeSectionId.value = sectionId;
  syncEditorToActiveSection();
}

function addSection() {
  if (sections.value.length >= 12) {
    ElMessage.warning("最多可配置 12 个详情栏目");
    return;
  }
  const section: DetailSectionDraft = {
    id: `detail-section-${Date.now()}`,
    title: `栏目 ${sections.value.length + 1}`,
    enabled: true,
    html: "<p><br></p>"
  };
  sections.value = [...sections.value, section];
  activeSectionId.value = section.id;
  emitSections();
  syncEditorToActiveSection();
}

function renameActiveSection(value: string) {
  updateActiveSection({ title: value.slice(0, 16) });
}

function setActiveSectionEnabled(value: string | number | boolean) {
  updateActiveSection({ enabled: Boolean(value) });
}

function moveActiveSection(offset: number) {
  const from = activeSectionIndex.value;
  const to = from + offset;
  if (from < 0 || to < 0 || to >= sections.value.length) return;
  const next = [...sections.value];
  const [current] = next.splice(from, 1);
  if (!current) return;
  next.splice(to, 0, current);
  sections.value = next;
  emitSections();
}

async function removeActiveSection() {
  if (!activeSection.value || sections.value.length <= 1) return;
  try {
    await ElMessageBox.confirm(`删除栏目“${activeSection.value.title}”及其中内容？`, "删除详情栏目", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  const currentIndex = activeSectionIndex.value;
  sections.value = sections.value.filter((section) => section.id !== activeSectionId.value);
  activeSectionId.value = sections.value[Math.min(currentIndex, sections.value.length - 1)]?.id ?? "";
  emitSections();
  syncEditorToActiveSection();
}

function updateActiveSectionHtml(html: string) {
  const section = activeSection.value;
  if (!section || section.html === html) return;
  updateActiveSection({ html });
}

function updateActiveSection(patch: Partial<DetailSectionDraft>) {
  const activeId = activeSectionId.value;
  sections.value = sections.value.map((section) => section.id === activeId ? { ...section, ...patch } : section);
  emitSections();
}

function emitSections() {
  emit("update:modelValue", sections.value.map((section) => ({ ...section })));
}

function syncEditorToActiveSection() {
  const html = activeSection.value?.html || "<p><br></p>";
  draftHtml.value = html;
  const editor = editorRef.value;
  if (editor && editor.getHtml() !== html) editor.setHtml(html);
}

function normalizeDraftSections(value: DetailSectionDraft[]): DetailSectionDraft[] {
  const source = Array.isArray(value) && value.length > 0 ? value : [{ id: "activity-detail", title: "活动详情", enabled: true, html: "<p><br></p>" }];
  return source.slice(0, 12).map((section, index) => ({
    id: section.id || `detail-section-${index + 1}`,
    title: section.title?.trim() || `栏目 ${index + 1}`,
    enabled: section.enabled !== false,
    html: section.html || "<p><br></p>"
  }));
}

interface DetailSectionDraft {
  id: string;
  title: string;
  enabled: boolean;
  html: string;
}

defineExpose({ insertImage });
</script>

<style scoped>
.conference-rich-editor {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.conference-rich-editor__header,
.header-actions,
.section-manager__tabs,
.section-manager__settings,
.section-setting-actions,
.conference-rich-editor__workspace,
.editor-footer {
  display: flex;
  align-items: center;
}

.conference-rich-editor__header {
  justify-content: space-between;
  gap: 24px;
}

.conference-rich-editor__header h3,
.conference-rich-editor__header p {
  margin: 0;
}

.conference-rich-editor__header h3 {
  margin-top: 4px;
  color: #172236;
  font-size: 20px;
}

.conference-rich-editor__header p {
  margin-top: 6px;
  color: #68758a;
  font-size: 13px;
  line-height: 1.6;
}

.eyebrow {
  color: #2f6484;
  font-size: 12px;
  font-weight: 700;
}

.header-actions {
  flex: 0 0 auto;
  gap: 8px;
}

.header-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.section-manager {
  overflow: hidden;
  border: 1px solid #d7dde5;
  border-radius: 6px;
  background: #f8fafb;
}

.section-manager__tabs {
  gap: 8px;
  overflow-x: auto;
  padding: 10px 12px;
  border-bottom: 1px solid #e2e7ec;
}

.section-tab {
  min-width: 92px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: #5f6c7d;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.section-tab:hover {
  background: #edf3f6;
  color: #2f6484;
}

.section-tab.is-active {
  border-color: #2f6484;
  background: #fff;
  color: #214d68;
}

.section-tab.is-disabled {
  color: #9aa4b2;
  text-decoration: line-through;
}

.section-manager__settings {
  justify-content: space-between;
  gap: 20px;
  padding: 12px;
}

.section-title-input {
  max-width: 360px;
}

.section-setting-actions {
  gap: 8px;
}

.section-setting-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.section-status-label {
  margin-right: 2px;
  color: #667085;
  font-size: 12px;
}

.conference-rich-editor__workspace {
  align-items: flex-start;
  gap: 18px;
}

.editor-label {
  width: 62px;
  flex: 0 0 62px;
  padding-top: 18px;
  color: #344054;
  font-size: 14px;
  font-weight: 700;
  text-align: right;
}

.editor-label::after {
  content: "：";
}

.editor-shell {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border: 1px solid #d7dde5;
  border-radius: 6px;
  background: #fff;
}

.editor-toolbar {
  border-bottom: 1px solid #dfe4ea;
  background: #fff;
}

.editor-canvas {
  min-height: 560px;
  max-height: 720px;
  overflow-y: auto;
}

.editor-footer {
  min-height: 42px;
  justify-content: space-between;
  gap: 16px;
  padding: 0 14px;
  border-top: 1px solid #e4e8ed;
  background: #fafbfc;
  color: #7a8798;
  font-size: 12px;
}

.conference-rich-editor :deep(.w-e-bar) {
  padding: 4px 8px;
  background: #fff;
}

.conference-rich-editor :deep(.w-e-bar-item button) {
  min-width: 32px;
  height: 32px;
  border-radius: 4px;
}

.conference-rich-editor :deep(.w-e-bar-item button:hover),
.conference-rich-editor :deep(.w-e-bar-item .active) {
  background: #eef4f8;
  color: #2f6484;
}

.conference-rich-editor :deep(.w-e-text-container [data-slate-editor]) {
  min-height: 520px;
  padding: 26px 32px 50px;
  color: #253044;
  font-size: 16px;
  line-height: 1.8;
}

.conference-rich-editor :deep(.w-e-text-container [data-slate-editor] img) {
  max-width: 100%;
}

:deep(.el-drawer__body) {
  padding: 0 18px 24px;
  background: #f4f6f8;
}

:deep(.el-drawer__body .rich-preview) {
  position: static;
}

@media (max-width: 900px) {
  .conference-rich-editor__header,
  .section-manager__settings,
  .conference-rich-editor__workspace {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .section-title-input {
    max-width: none;
  }

  .editor-label {
    width: auto;
    padding-top: 0;
    text-align: left;
  }
}
</style>
