<template>
  <section class="conference-rich-editor">
    <header class="conference-rich-editor__header">
      <div>
        <span class="eyebrow">会议详情</span>
        <h3>可视化内容编辑</h3>
        <p>像编辑文档一样输入文字、设置样式并插入图片，保存后同步用于 H5 和小程序。</p>
      </div>
      <div class="header-actions">
        <el-button :icon="FolderOpened" @click="emit('choose-material')">素材库</el-button>
        <el-button :icon="View" @click="previewVisible = true">预览</el-button>
        <el-button type="primary" :icon="Check" :loading="saving" @click="emit('save')">保存详情</el-button>
      </div>
    </header>

    <div class="conference-rich-editor__workspace">
      <div class="editor-label">详情</div>
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
        :title="title"
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
import { Check, FolderOpened, View } from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
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
  modelValue: string;
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
  "update:modelValue": [value: string];
  save: [];
  "choose-material": [];
}>();

const editorRef = shallowRef<IDomEditor | null>(null);
const toolbarRef = shallowRef<ReturnType<typeof createToolbar> | null>(null);
const editorElement = ref<HTMLElement | null>(null);
const toolbarElement = ref<HTMLElement | null>(null);
const draftHtml = ref("");
const previewVisible = ref(false);

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
    if (html !== draftHtml.value) draftHtml.value = html;
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
    if (value !== draftHtml.value) draftHtml.value = value;
    const editor = editorRef.value;
    if (editor && value !== editor.getHtml()) editor.setHtml(value || "<p><br></p>");
  },
  { immediate: true }
);

watch(draftHtml, (value) => {
  if (value !== props.modelValue) emit("update:modelValue", value);
});

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
  .conference-rich-editor__workspace {
    align-items: stretch;
    flex-direction: column;
  }

  .header-actions {
    flex-wrap: wrap;
  }

  .editor-label {
    width: auto;
    padding-top: 0;
    text-align: left;
  }
}
</style>
