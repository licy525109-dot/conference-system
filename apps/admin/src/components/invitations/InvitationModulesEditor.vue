<template>
  <div class="invitation-modules-workspace">
    <nav class="invitation-module-rail" aria-label="内容模块">
      <header>
        <h2>内容模块</h2>
        <el-dropdown
          trigger="click"
          :disabled="disabled || modelValue.modules.length >= 24"
          @command="addModule"
        >
          <el-button
            :icon="Plus"
            title="添加模块"
            aria-label="添加模块"
            :disabled="disabled || modelValue.modules.length >= 24"
          /><template #dropdown
            ><el-dropdown-menu>
              <el-dropdown-item
                v-for="(label, type) in INVITATION_MODULE_LABELS"
                :key="type"
                :command="type"
                :disabled="
                  !invitationModuleRepeatable(type) &&
                  modelValue.modules.some((item) => item.type === type)
                "
                >{{ label }}</el-dropdown-item
              >
            </el-dropdown-menu></template
          ></el-dropdown
        >
      </header>
      <button
        v-for="(module, index) in modelValue.modules"
        :key="module.id"
        type="button"
        class="invitation-module-tab"
        :class="{ active: selectedId === module.id, hidden: !module.enabled }"
        :aria-pressed="selectedId === module.id"
        @click="selectedId = module.id"
      >
        <span>{{ String(index + 1).padStart(2, "0") }}</span
        ><strong>{{
          module.title || INVITATION_MODULE_LABELS[module.type]
        }}</strong
        ><el-icon v-if="!module.enabled"><Hide /></el-icon>
      </button>
      <el-empty
        v-if="!modelValue.modules.length"
        description="暂无模块"
        :image-size="48"
      />
    </nav>
    <section v-if="active" class="invitation-module-editor">
      <header class="invitation-module-toolbar">
        <el-input
          :model-value="active.title"
          placeholder="模块标题（可留空）"
          aria-label="模块标题"
          :disabled="disabled"
          maxlength="80"
          @update:model-value="patch({ title: $event })"
        />
        <el-switch
          :model-value="active.enabled"
          aria-label="显示当前模块"
          :disabled="disabled"
          @update:model-value="patch({ enabled: Boolean($event) })"
        />
        <el-button
          :icon="ArrowUp"
          title="模块上移"
          aria-label="模块上移"
          :disabled="disabled || activeIndex === 0"
          @click="move(-1)"
        />
        <el-button
          :icon="ArrowDown"
          title="模块下移"
          aria-label="模块下移"
          :disabled="disabled || activeIndex === modelValue.modules.length - 1"
          @click="move(1)"
        />
        <el-button
          :icon="Delete"
          title="删除模块"
          aria-label="删除模块"
          :disabled="disabled"
          @click="remove"
        />
      </header>
      <el-tabs v-model="editorTab" class="module-inspector-tabs"
        ><el-tab-pane label="内容" name="content" /><el-tab-pane
          label="样式"
          name="style"
      /></el-tabs>
      <InvitationModuleStyleEditor
        v-if="editorTab === 'style'"
        :model-value="active.style"
        :module-type="active.type"
        :settings="active.settings"
        :campaign-id="campaignId"
        :disabled="disabled"
        @update:model-value="patch({ style: $event })"
        @update:settings="patch({ settings: $event })"
        @reset="patch($event)"
      />
      <template v-else>
        <InvitationExtraModuleEditor
          v-if="active.type === 'guests'"
          :module="active"
          :page-design="modelValue.design"
          :campaign-id="campaignId"
          :disabled="disabled"
          @patch="patch"
        />
        <InvitationRichTextEditor
          v-if="active.type === 'richtext' || active.type === 'letter'"
          :key="active.id"
          :model-value="letterBody"
          :page-design="modelValue.design"
          :campaign-id="campaignId"
          :disabled="disabled"
          @update:model-value="patch({ body: $event })"
        />
        <InvitationImageField
          v-else-if="active.type === 'image'"
          :model-value="active.imageUrl"
          :campaign-id="campaignId"
          label="模块图片"
          :disabled="disabled"
          @update:model-value="patch({ imageUrl: $event })"
        />
        <InvitationAgendaEditor
          v-else-if="active.type === 'agenda'"
          :key="active.id"
          :model-value="modelValue.agenda"
          :campaign-id="campaignId"
          :disabled="disabled"
          @update:model-value="update({ agenda: $event })"
        />
        <InvitationRowsEditor
          v-else-if="active.type === 'guests' || active.type === 'highlights'"
          :title="INVITATION_MODULE_LABELS[active.type]"
          :model-value="modelValue[active.type]"
          :fields="fields[active.type]"
          :campaign-id="campaignId"
          :max="active.type === 'guests' ? 100 : 12"
          :disabled="disabled"
          @update:model-value="setRows"
        />
        <InvitationRosterEditor
          v-else-if="active.type === 'invitees'"
          :model-value="modelValue.invitees"
          :sort="modelValue.inviteeSort"
          :note="active.settings?.inviteeNote"
          :disabled="disabled"
          @update:model-value="update({ invitees: $event })"
          @update:sort="update({ inviteeSort: $event })"
          @update:note="
            patch({ settings: { ...active.settings!, inviteeNote: $event } })
          "
        />
        <InvitationVenueEditor
          v-else-if="active.type === 'venue'"
          :model-value="modelValue"
          :module="active"
          :disabled="disabled"
          @update:model-value="update($event)"
        />
        <InvitationExtraModuleEditor
          v-else-if="invitationModuleRepeatable(active.type)"
          :key="active.id"
          :module="active"
          :page-design="modelValue.design"
          :campaign-id="campaignId"
          :disabled="disabled"
          @patch="patch"
        />
      </template>
    </section>
    <aside v-if="previewDocument" class="module-live-preview">
      <header>
        <span>嘉宾视角</span><small>{{ previewDocument.recipient.name }}</small>
      </header>
      <div ref="previewScreen" class="module-preview-screen">
        <InvitationRuntime :document="previewDocument" preview />
      </div>
    </aside>
  </div>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  ArrowUp,
  ArrowDown,
  Delete,
  Hide,
  Plus,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import {
  INVITATION_MODULE_LABELS,
  type InvitationContent,
  type InvitationModule,
  type InvitationModuleType,
  type InvitationRichNode,
  type PublicInvitation,
  invitationModuleRepeatable,
  createInvitationModule,
} from "@conference/shared";
import InvitationRichTextEditor from "./InvitationRichTextEditor.vue";
import InvitationImageField from "./InvitationImageField.vue";
import InvitationRowsEditor from "./InvitationRowsEditor.vue";
import InvitationRosterEditor from "./InvitationRosterEditor.vue";
import InvitationModuleStyleEditor from "./InvitationModuleStyleEditor.vue";
import InvitationExtraModuleEditor from "./InvitationExtraModuleEditor.vue";
import InvitationRuntime from "./InvitationRuntime.vue";
import InvitationVenueEditor from "./InvitationVenueEditor.vue";
import InvitationAgendaEditor from "./InvitationAgendaEditor.vue";
const props = defineProps<{
  modelValue: InvitationContent;
  campaignId: string;
  disabled?: boolean;
  previewDocument?: PublicInvitation;
}>();
const editorTab = ref("content");
const previewScreen = ref<HTMLElement>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const selectedId = ref(props.modelValue.modules[0]?.id || "");
const activeIndex = computed(() =>
  props.modelValue.modules.findIndex(
    (module) => module.id === selectedId.value,
  ),
);
const active = computed(() => props.modelValue.modules[activeIndex.value]);
watch(selectedId, async () => {
  editorTab.value = "content";
  await nextTick();
  const target = Array.from(
    previewScreen.value?.querySelectorAll<HTMLElement>("[data-module-id]") ||
      [],
  ).find((el) => el.dataset.moduleId === selectedId.value);
  if (target && previewScreen.value)
    previewScreen.value.scrollTop +=
      target.getBoundingClientRect().top -
      previewScreen.value.getBoundingClientRect().top;
});
watch(
  () => props.modelValue.modules,
  (modules) => {
    if (!modules.some((item) => item.id === selectedId.value))
      selectedId.value = modules[0]?.id || "";
  },
);
const letterBody = computed<InvitationRichNode[]>(() =>
  active.value?.body.length || active.value?.type !== "letter"
    ? active.value?.body || []
    : props.modelValue.introduction
        .split("\n")
        .filter(Boolean)
        .map((text) => ({ tag: "p", attrs: {}, children: [{ text }] })),
);
const fields = {
  agenda: [
    { key: "date", label: "日期" },
    { key: "time", label: "时段" },
    { key: "title", label: "议程标题", wide: true },
    { key: "speaker", label: "分享嘉宾" },
    { key: "imageUrl", label: "嘉宾头像", wide: true, image: true },
    { key: "location", label: "地点" },
  ],
  highlights: [
    { key: "title", label: "亮点标题", wide: true },
    { key: "description", label: "内容", wide: true, multiline: true },
  ],
  guests: [
    { key: "name", label: "姓名" },
    { key: "organization", label: "单位" },
    { key: "role", label: "职务" },
    { key: "imageUrl", label: "嘉宾照片", wide: true, image: true },
    { key: "biography", label: "嘉宾介绍", wide: true, multiline: true },
    {
      key: "status",
      label: "邀请状态",
      options: [
        { label: "拟邀嘉宾", value: "INVITED" },
        { label: "确认出席", value: "CONFIRMED" },
      ],
    },
  ],
};
function update(value: Partial<InvitationContent>) {
  if (!props.disabled)
    emit("update:modelValue", { ...props.modelValue, ...value });
}
function patch(value: Partial<InvitationModule>) {
  if (active.value)
    update({
      modules: props.modelValue.modules.map((item) =>
        item.id === active.value.id ? { ...item, ...value } : item,
      ),
    });
}
function addModule(type: InvitationModuleType) {
  if (
    props.disabled ||
    props.modelValue.modules.length >= 24 ||
    (!invitationModuleRepeatable(type) &&
      props.modelValue.modules.some((item) => item.type === type))
  )
    return;
  const id = crypto.randomUUID();
  update({
    modules: [...props.modelValue.modules, createInvitationModule(type, id)],
  });
  selectedId.value = id;
}
function move(delta: number) {
  const modules = [...props.modelValue.modules],
    i = activeIndex.value,
    j = i + delta;
  if (i < 0 || j < 0 || j >= modules.length) return;
  [modules[i], modules[j]] = [modules[j], modules[i]];
  update({ modules });
}
async function remove() {
  if (!active.value || props.disabled) return;
  const id = active.value.id;
  try {
    await ElMessageBox.confirm(
      "删除当前模块？未发布前不会影响已发送的邀请。",
      "删除模块",
      { type: "warning" },
    );
    update({
      modules: props.modelValue.modules.filter((item) => item.id !== id),
    });
  } catch {
    /* canceled */
  }
}
function setRows(rows: Array<{ id: string }>) {
  if (active.value) update({ [active.value.type]: rows });
}
</script>
<style scoped>
.invitation-modules-workspace {
  display: grid;
  grid-template-columns: 190px minmax(0, 1fr);
  gap: 24px;
  min-height: 650px;
}
.module-live-preview {
  display: none;
  min-width: 0;
  position: sticky;
  top: 20px;
  align-self: start;
  border-left: 1px solid #e5e8eb;
  padding-left: 20px;
}
.module-live-preview > header {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: center;
  font-size: 13px;
  padding: 0 0 14px;
  color: #53646c;
}
.module-live-preview small {
  font-size: 11px;
}
.module-preview-screen {
  height: 680px;
  overflow: auto;
  border: 1px solid #e0e6e7;
  border-radius: 6px;
  background: #f6f8f7;
  overscroll-behavior: contain;
  scroll-behavior: auto;
}
.module-inspector-tabs {
  margin-bottom: 20px;
}
@media (min-width: 1280px) {
  .invitation-modules-workspace {
    grid-template-columns: 160px minmax(340px, 1fr) 320px;
    gap: 24px;
  }
  .module-live-preview {
    display: block;
  }
}
.invitation-module-rail {
  border-right: 1px solid #e5e8eb;
  padding-right: 18px;
}
.invitation-module-rail header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 18px;
}
.invitation-module-rail h2 {
  font-size: 14px;
  margin: 0;
}
.invitation-module-tab {
  width: 100%;
  border: 0;
  border-radius: 4px;
  background: transparent;
  display: flex;
  align-items: center;
  text-align: left;
  gap: 10px;
  padding: 14px 10px;
  margin-bottom: 4px;
  cursor: pointer;
  color: #59636c;
  font: inherit;
  font-size: 13px;
}
.invitation-module-tab > span {
  color: #87949d;
  font-size: 11px;
}
.invitation-module-tab strong {
  font-weight: 500;
  flex: 1;
  overflow-wrap: anywhere;
}
.invitation-module-tab.active {
  background: #eaf4f2;
  color: #256156;
}
.invitation-module-tab.hidden {
  opacity: 0.5;
}
.invitation-module-editor {
  min-width: 0;
}
.invitation-module-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.invitation-module-toolbar > .el-input {
  flex: 1;
  min-width: 100px;
  margin-right: 10px;
}
.invitation-module-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}
.invitation-venue-form {
  max-width: 700px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 24px;
}
@media (max-width: 800px) {
  .invitation-modules-workspace {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .invitation-module-rail {
    display: flex;
    gap: 6px;
    border-right: 0;
    padding: 0 0 10px;
    overflow-x: auto;
  }
  .invitation-module-rail header {
    margin: 0;
    flex-shrink: 0;
    gap: 8px;
  }
  .invitation-module-tab {
    width: auto;
    flex-shrink: 0;
    max-width: 170px;
    margin: 0;
  }
  .invitation-venue-form {
    grid-template-columns: 1fr;
  }
}
</style>
