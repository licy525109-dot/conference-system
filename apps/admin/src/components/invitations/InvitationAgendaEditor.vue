<template>
  <section class="agenda-quick-editor">
    <header class="agenda-quick-tools">
      <span>{{ modelValue.length }} / 150</span>
      <div>
        <el-button
          :icon="DocumentAdd"
          :disabled="disabled"
          @click="importOpen = true"
          >批量录入</el-button
        ><el-button
          :icon="Plus"
          :disabled="disabled || modelValue.length >= 150"
          @click="add"
          >添加议程</el-button
        >
      </div>
    </header>
    <div class="agenda-day-tools">
      <el-select v-model="day" aria-label="编辑议程日期"
        ><el-option
          v-for="date in dates"
          :key="date"
          :label="date || '未分组'"
          :value="date" /></el-select
      ><el-button
        :icon="EditPen"
        title="修改当前日期"
        aria-label="修改当前日期"
        :disabled="disabled"
        @click="renameDay"
      /><el-button :icon="Plus" :disabled="disabled" @click="addDay"
        >添加日期</el-button
      >
    </div>
    <div class="agenda-column-labels"><span>时段</span><span>议题</span></div>
    <div
      v-for="(row, index) in rows"
      :key="row.id"
      class="agenda-quick-row"
      :data-editor-agenda-id="row.id"
    >
      <div class="agenda-main-fields">
        <el-input
          :model-value="row.time"
          :aria-label="`第${index + 1}条议程时段`"
          placeholder="09:00-10:00"
          maxlength="50"
          :disabled="disabled"
          @update:model-value="edit(row.id, { time: $event })"
        /><el-input
          :model-value="row.title"
          :aria-label="`第${index + 1}条议程议题`"
          placeholder="议题"
          maxlength="300"
          :disabled="disabled"
          @update:model-value="edit(row.id, { title: $event })"
        />
      </div>
      <div class="agenda-row-actions">
        <button
          class="agenda-details-toggle"
          type="button"
          :aria-expanded="expanded.includes(row.id)"
          :aria-label="`第${index + 1}条议程详情`"
          @click="toggle(row.id)"
        >
          <el-icon
            ><ArrowDown v-if="!expanded.includes(row.id)" /><ArrowUp
              v-else /></el-icon
          ><span>{{ row.speaker || row.location || "嘉宾 · 地点 · 头像" }}</span
          ><el-icon v-if="row.imageUrl"><Picture /></el-icon>
        </button>
        <div>
          <el-button
            v-for="action in actions"
            :key="action.name"
            :icon="action.icon"
            :title="action.name"
            :aria-label="`${action.name}第${index + 1}条议程`"
            :disabled="
              disabled ||
              (action.kind === 'up' && index === 0) ||
              (action.kind === 'down' && index === rows.length - 1) ||
              (action.kind === 'copy' && modelValue.length >= 150)
            "
            @click="act(row, action.kind)"
          />
        </div>
      </div>
      <div v-if="expanded.includes(row.id)" class="agenda-detail-fields">
        <el-form-item label="嘉宾"
          ><el-input
            :model-value="row.speaker"
            :aria-label="`第${index + 1}条议程嘉宾`"
            maxlength="200"
            :disabled="disabled"
            @update:model-value="
              edit(row.id, { speaker: $event })
            " /></el-form-item
        ><el-form-item label="地点"
          ><el-input
            :model-value="row.location"
            :aria-label="`第${index + 1}条议程地点`"
            maxlength="200"
            :disabled="disabled"
            @update:model-value="
              edit(row.id, { location: $event })
            " /></el-form-item
        ><el-form-item class="agenda-avatar" label="嘉宾头像"
          ><InvitationImageField
            :model-value="row.imageUrl || ''"
            :campaign-id="campaignId"
            label="议程嘉宾头像"
            compact
            :disabled="disabled"
            @update:model-value="edit(row.id, { imageUrl: $event })"
        /></el-form-item>
      </div>
    </div>
    <el-empty
      v-if="!rows.length"
      description="当前日期暂无议程"
      :image-size="56"
    />
    <InvitationAgendaImport
      v-model="importOpen"
      :date="day"
      :agenda="modelValue"
      :disabled="disabled"
      @import="update"
    />
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import {
  Plus,
  EditPen,
  DocumentAdd,
  ArrowUp,
  ArrowDown,
  Picture,
  Top,
  Bottom,
  CopyDocument,
  Delete,
} from "@element-plus/icons-vue";
import { ElMessageBox } from "element-plus";
import type { InvitationAgendaItem } from "@conference/shared";
import InvitationImageField from "./InvitationImageField.vue";
import InvitationAgendaImport from "./InvitationAgendaImport.vue";
const props = defineProps<{
  modelValue: InvitationAgendaItem[];
  campaignId: string;
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [rows: InvitationAgendaItem[]];
}>();
const day = ref(props.modelValue[0]?.date || "DAY1"),
  emptyDays = ref<string[]>([]),
  expanded = ref<string[]>([]),
  importOpen = ref(false);
const dates = computed(() => [
  ...new Set([
    ...props.modelValue.map((row) => row.date),
    ...emptyDays.value,
    day.value,
  ]),
]);
const rows = computed(() =>
  props.modelValue.filter((row) => row.date === day.value),
);
const actions = [
  { name: "上移", icon: Top, kind: "up" },
  { name: "下移", icon: Bottom, kind: "down" },
  { name: "复制", icon: CopyDocument, kind: "copy" },
  { name: "删除", icon: Delete, kind: "delete" },
] as const;
watch(
  () => props.modelValue,
  (value) => {
    expanded.value = expanded.value.filter((id) =>
      value.some((row) => row.id === id),
    );
  },
);
function update(value: InvitationAgendaItem[]) {
  if (!props.disabled) emit("update:modelValue", value);
}
function edit(id: string, value: Partial<InvitationAgendaItem>) {
  update(
    props.modelValue.map((row) => (row.id === id ? { ...row, ...value } : row)),
  );
}
function toggle(id: string) {
  expanded.value = expanded.value.includes(id)
    ? expanded.value.filter((item) => item !== id)
    : [...expanded.value, id];
}
async function add() {
  if (props.disabled || props.modelValue.length >= 150) return;
  const id = crypto.randomUUID();
  update([
    ...props.modelValue,
    {
      id,
      date: day.value,
      time: "",
      title: "",
      speaker: "",
      imageUrl: "",
      location: "",
    },
  ]);
  await nextTick();
  document
    .querySelector<HTMLInputElement>(`[data-editor-agenda-id="${id}"] input`)
    ?.focus();
}
function act(
  row: InvitationAgendaItem,
  kind: (typeof actions)[number]["kind"],
) {
  if (props.disabled) return;
  const all = [...props.modelValue],
    index = all.findIndex((item) => item.id === row.id),
    local = rows.value.findIndex((item) => item.id === row.id);
  if (kind === "delete") all.splice(index, 1);
  if (kind === "copy" && all.length < 150)
    all.splice(index + 1, 0, { ...row, id: crypto.randomUUID() });
  if (kind === "up" || kind === "down") {
    const target = rows.value[local + (kind === "up" ? -1 : 1)];
    if (!target) return;
    const other = all.findIndex((item) => item.id === target.id);
    [all[index], all[other]] = [all[other], all[index]];
  }
  update(all);
}
async function askDate(title: string, value: string) {
  try {
    const result = await ElMessageBox.prompt("日期名称", title, {
      inputValue: value,
      inputValidator: (text) =>
        (!!text?.trim() && text.trim().length <= 40) || "请输入 1–40 个字",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });
    return result.value.trim();
  } catch {
    return undefined;
  }
}
async function addDay() {
  const date = await askDate("添加日期", `DAY${dates.value.length + 1}`);
  if (date && !props.disabled) {
    emptyDays.value.push(date);
    day.value = date;
  }
}
async function renameDay() {
  const previous = day.value,
    date = await askDate("修改当前日期", previous);
  if (!date || date === previous || props.disabled) return;
  if (dates.value.includes(date)) {
    try {
      await ElMessageBox.confirm(
        "该日期已存在，是否将当前议程合并到该日期？",
        "合并日期",
        { confirmButtonText: "合并", cancelButtonText: "取消" },
      );
    } catch {
      return;
    }
  }
  if (props.disabled) return;
  update(
    props.modelValue.map((row) =>
      row.date === previous ? { ...row, date } : row,
    ),
  );
  emptyDays.value = emptyDays.value.filter((value) => value !== previous);
  day.value = date;
}
</script>
<style scoped>
.agenda-quick-editor {
  padding: 12px 0 24px;
  min-width: 0;
}
.agenda-quick-tools,
.agenda-quick-tools > div,
.agenda-day-tools,
.agenda-row-actions,
.agenda-row-actions > div {
  display: flex;
  align-items: center;
  gap: 8px;
}
.agenda-quick-tools {
  justify-content: space-between;
  flex-wrap: wrap;
  margin-bottom: 20px;
}
.agenda-quick-tools > span {
  color: #69756e;
  font-size: 12px;
}
.agenda-quick-tools :deep(.el-button + .el-button),
.agenda-day-tools :deep(.el-button + .el-button),
.agenda-row-actions :deep(.el-button + .el-button) {
  margin: 0;
}
.agenda-day-tools {
  margin-bottom: 22px;
}
.agenda-day-tools > .el-select {
  flex: 1;
  min-width: 0;
}
.agenda-column-labels,
.agenda-main-fields {
  display: grid;
  grid-template-columns: 132px minmax(0, 1fr);
  gap: 10px;
}
.agenda-column-labels {
  color: #66766e;
  font-size: 12px;
  margin-bottom: 8px;
}
.agenda-quick-row {
  padding: 12px 0;
  border-bottom: 1px solid #e2e8e4;
}
.agenda-row-actions {
  justify-content: space-between;
  margin-top: 8px;
  min-width: 0;
}
.agenda-row-actions > div {
  gap: 2px;
  flex-shrink: 0;
}
.agenda-row-actions :deep(.el-button) {
  padding: 7px;
  height: 30px;
}
.agenda-details-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: #68786f;
  background: none;
  border: 0;
  padding: 6px 0;
  text-align: left;
  cursor: pointer;
  font-size: 12px;
}
.agenda-details-toggle span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agenda-details-toggle .el-icon {
  flex-shrink: 0;
}
.agenda-detail-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
  padding-top: 16px;
}
.agenda-detail-fields :deep(.el-form-item) {
  min-width: 0;
  margin-bottom: 14px;
}
.agenda-avatar {
  grid-column: 1/-1;
}
@media (max-width: 600px) {
  .agenda-column-labels,
  .agenda-main-fields {
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 8px;
  }
  .agenda-detail-fields {
    grid-template-columns: 1fr;
  }
}
</style>
