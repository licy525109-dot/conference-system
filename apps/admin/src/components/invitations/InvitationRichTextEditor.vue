<template>
  <div
    class="invitation-rich-editor"
    :class="{
      'is-disabled': disabled,
      'is-unified-font': design.replaceAllFonts && !!pageFont.family.value,
    }"
    :style="{
      '--invite-custom-font':
        pageFont.customFamily.value || INVITATION_FONTS.sans.family,
      '--invite-editor-font': pageFont.family.value,
    }"
  >
    <div ref="toolbarElement" class="invitation-rich-toolbar" />
    <div ref="editorElement" class="invitation-rich-canvas" />
    <div class="invitation-rich-status">
      <span>图文正文</span><span>{{ length }} 字</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import "@wangeditor/editor/dist/css/style.css";
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import {
  createEditor,
  createToolbar,
  SlateEditor,
  SlateTransforms,
  SlateText,
  type IDomEditor,
} from "@wangeditor/editor";
import { ElMessage } from "element-plus";
import {
  INVITATION_FONTS,
  INVITATION_CUSTOM_FONT,
  normalizeInvitationPageDesign,
  invitationRichTextHtml,
  type InvitationRichNode,
  type InvitationPageDesign,
} from "@conference/shared";
import { invitationNodesFromHtml } from "../../utils/invitation-richtext";
import { uploadInvitationImage } from "../../services/invitations";
import { API_BASE_URL } from "../../config";
import { useInvitationFont } from "../../utils/invitation-font";
const props = defineProps<{
  modelValue: InvitationRichNode[];
  campaignId: string;
  disabled?: boolean;
  pageDesign?: InvitationPageDesign;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationRichNode[]];
}>();
const design = computed(() => normalizeInvitationPageDesign(props.pageDesign));
const pageFont = useInvitationFont(
  design,
  computed(() => new URL(API_BASE_URL).origin),
  computed(() => !!design.value.fontUrl),
);
const editorElement = ref<HTMLElement>(),
  toolbarElement = ref<HTMLElement>();
const editor = shallowRef<IDomEditor>(),
  toolbar = shallowRef<ReturnType<typeof createToolbar>>();
const length = ref(0),
  origin = new URL(API_BASE_URL).origin;
let lastValue = "",
  applying = false;
function syncContent(instance: IDomEditor) {
  length.value = instance.getText().length;
  if (applying || props.disabled) return;
  const nodes = invitationNodesFromHtml(instance.getHtml(), origin);
  const serialized = JSON.stringify(nodes);
  if (serialized === lastValue) return;
  lastValue = serialized;
  emit("update:modelValue", nodes);
}
onMounted(() => {
  lastValue = JSON.stringify(props.modelValue);
  editor.value = createEditor({
    selector: editorElement.value!,
    html: invitationRichTextHtml(props.modelValue, origin) || "<p><br></p>",
    mode: "default",
    config: {
      placeholder: "请输入正文",
      readOnly: props.disabled,
      maxLength: 30000,
      MENU_CONF: {
        fontFamily: {
          fontFamilyList: [
            ...Object.values(INVITATION_FONTS).map((font) => ({
              name: font.label,
              value: font.family.replaceAll('"', ""),
            })),
            ...(design.value.fontUrl
              ? [
                  {
                    name: design.value.fontName || "自定义字体",
                    value: INVITATION_CUSTOM_FONT,
                  },
                ]
              : []),
          ],
        },
        fontSize: {
          fontSizeList: [
            "12px",
            "14px",
            "16px",
            "18px",
            "20px",
            "24px",
            "28px",
            "32px",
            "40px",
            "48px",
          ],
        },
        uploadImage: {
          async customUpload(
            file: File,
            insert: (url: string, alt: string, href: string) => void,
          ) {
            if (props.disabled) return;
            if (
              file.size > 2 * 1024 * 1024 ||
              !["image/jpeg", "image/png", "image/webp"].includes(file.type)
            ) {
              ElMessage.error("请上传 2MB 以内的 JPG、PNG 或 WebP 图片");
              return;
            }
            try {
              const result = await uploadInvitationImage(
                props.campaignId,
                file,
              );
              if (!props.disabled && editor.value && !editor.value.isDestroyed)
                insert(origin + result.url, file.name, "");
            } catch (error) {
              ElMessage.error(
                error instanceof Error ? error.message : "上传失败",
              );
            }
          },
        },
      },
      onChange: syncContent,
      onBlur: syncContent,
    },
  });
  // WangEditor 5 interpolates font names into HTML attributes without escaping quotes.
  // Normalize its text marks, while keeping the shared document's safe canonical font list.
  const instance = editor.value;
  const normalizeNode = instance.normalizeNode;
  instance.normalizeNode = (entry) => {
    const [node, path] = entry;
    const family = (node as { fontFamily?: unknown }).fontFamily;
    if (
      SlateText.isText(node) &&
      typeof family === "string" &&
      /["']/.test(family)
    ) {
      SlateTransforms.setNodes(
        instance,
        { fontFamily: family.replace(/["']/g, "") } as Partial<typeof node>,
        { at: path },
      );
      return;
    }
    normalizeNode(entry);
  };
  SlateEditor.normalize(instance, { force: true });
  toolbar.value = createToolbar({
    editor: editor.value,
    selector: toolbarElement.value!,
    mode: "default",
    config: {
      toolbarKeys: [
        "headerSelect",
        "fontFamily",
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
        "bulletedList",
        "numberedList",
        "blockquote",
        "insertLink",
        "uploadImage",
        "divider",
        "|",
        "undo",
        "redo",
        "fullScreen",
      ],
    },
  });
  length.value = editor.value.getText().length;
});
watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value || JSON.stringify(value) === lastValue) return;
    applying = true;
    editor.value.setHtml(
      invitationRichTextHtml(value, origin) || "<p><br></p>",
    );
    lastValue = JSON.stringify(value);
    applying = false;
  },
  { deep: true },
);
watch(
  () => props.disabled,
  (disabled) => (disabled ? editor.value?.disable() : editor.value?.enable()),
);
onBeforeUnmount(() => {
  toolbar.value?.destroy();
  editor.value?.destroy();
  editor.value = undefined;
});
</script>
<style scoped>
.invitation-rich-editor.is-unified-font
  :deep(.invitation-rich-canvas [contenteditable] *) {
  font-family: var(--invite-editor-font) !important;
}
.invitation-rich-editor {
  border: 1px solid #dce1e4;
  border-radius: 4px;
  background: white;
  --w-e-toolbar-active-bg-color: #e6f2ef;
  --w-e-toolbar-active-color: #27645a;
}
.invitation-rich-toolbar {
  border-bottom: 1px solid #e1e5e8;
  position: sticky;
  top: 60px;
  z-index: 5;
  background: white;
}
.invitation-rich-canvas {
  min-height: 540px;
  height: min(64vh, 760px);
  font-size: 16px;
  color: #2d3438;
}
.invitation-rich-canvas :deep(.w-e-text-container) {
  min-height: inherit;
}
.invitation-rich-canvas :deep(.w-e-scroll) {
  padding: 20px 24px;
}
.invitation-rich-status {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #879099;
  border-top: 1px solid #edf0f2;
  padding: 10px 16px;
}
.invitation-rich-editor :deep(.w-e-full-screen-container) {
  z-index: 5000;
}
.is-disabled :deep(.w-e-bar) {
  pointer-events: none;
  opacity: 0.6;
}
@media (max-width: 700px) {
  .invitation-rich-canvas {
    min-height: 400px;
  }
  .invitation-rich-canvas :deep(.w-e-scroll) {
    padding: 12px;
  }
}
</style>
