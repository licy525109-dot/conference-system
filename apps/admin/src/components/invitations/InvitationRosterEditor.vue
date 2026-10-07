<template>
  <section class="roster-editor">
    <header class="roster-toolbar">
      <div>
        <h2>公开拟邀名单</h2>
        <span>{{ modelValue.length }} 位嘉宾</span>
      </div>
      <div class="roster-commands">
        <el-button
          :icon="Plus"
          :disabled="disabled || modelValue.length >= 500"
          @click="add"
          >添加</el-button
        ><el-button
          type="primary"
          :icon="Upload"
          :disabled="disabled"
          :loading="reading"
          @click="fileInput?.click()"
          >上传表格</el-button
        >
      </div>
    </header>
    <el-form-item
      v-if="note !== undefined"
      label="名单提示"
      class="roster-note-field"
    >
      <el-input
        :model-value="note"
        type="textarea"
        :autosize="{ minRows: 2, maxRows: 5 }"
        maxlength="2000"
        show-word-limit
        aria-label="拟邀名单提示文案"
        :disabled="disabled"
        @update:model-value="!disabled && $emit('update:note', $event)"
      />
    </el-form-item>
    <div v-if="modelValue.length" class="roster-order">
      <el-select
        :model-value="sortRule.key"
        aria-label="名单排序规则"
        :disabled="disabled"
        @update:model-value="setSort(String($event))"
      >
        <el-option label="手动排序 / 导入顺序" value="manual" /><el-option
          label="按姓名拼音"
          value="name"
        /><el-option label="按单位名称" value="organization" /><el-option
          label="按职务"
          value="role"
        />
      </el-select>
      <el-radio-group
        v-if="sortRule.key !== 'manual'"
        :model-value="sortRule.direction"
        :disabled="disabled"
        aria-label="排序方向"
        @update:model-value="
          $emit('update:sort', {
            ...sortRule,
            direction: $event === 'desc' ? 'desc' : 'asc',
          })
        "
        ><el-radio-button value="asc">升序</el-radio-button
        ><el-radio-button value="desc">降序</el-radio-button></el-radio-group
      >
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".xlsx,.xls,.csv,.tsv"
      hidden
      aria-label="上传公开名单表格"
      @change="readFile"
    />
    <el-input
      v-if="modelValue.length"
      v-model="query"
      :prefix-icon="Search"
      placeholder="查找姓名、单位或职务"
      clearable
      aria-label="搜索公开名单"
    />
    <el-empty v-if="!modelValue.length" description="尚未添加公开名单"
      ><el-button
        :icon="Upload"
        :disabled="disabled"
        @click="fileInput?.click()"
        >上传 Excel / CSV</el-button
      ></el-empty
    >
    <el-table v-else :data="visibleRows" row-key="id" class="roster-table">
      <el-table-column label="顺序" width="90"
        ><template #default="{ row }"
          ><el-input-number
            :model-value="
              orderedRows.findIndex((item) => item.id === row.id) + 1
            "
            :min="1"
            :max="modelValue.length"
            :controls="false"
            :disabled="disabled"
            :aria-label="`调整${row.name || '嘉宾'}顺序`"
            @change="reorder(row.id, Number($event))" /></template
      ></el-table-column>
      <el-table-column label="姓名" min-width="110"
        ><template #default="{ row }"
          ><el-input
            :model-value="row.name"
            :disabled="disabled"
            maxlength="80"
            aria-label="名单姓名"
            @update:model-value="edit(row.id, 'name', $event)" /></template
      ></el-table-column>
      <el-table-column label="单位 / 机构" min-width="150"
        ><template #default="{ row }"
          ><el-input
            :model-value="row.organization"
            :disabled="disabled"
            maxlength="200"
            aria-label="名单单位"
            @update:model-value="
              edit(row.id, 'organization', $event)
            " /></template
      ></el-table-column>
      <el-table-column label="职务" min-width="100"
        ><template #default="{ row }"
          ><el-input
            :model-value="row.role"
            :disabled="disabled"
            maxlength="100"
            aria-label="名单职务"
            @update:model-value="edit(row.id, 'role', $event)" /></template
      ></el-table-column>
      <el-table-column width="116" fixed="right"
        ><template #default="{ row }"
          ><div class="roster-row-actions">
            <el-button
              :icon="Top"
              text
              :disabled="disabled || orderedRows[0]?.id === row.id"
              title="名单上移"
              aria-label="名单上移"
              @click="
                reorder(
                  row.id,
                  orderedRows.findIndex((item) => item.id === row.id),
                )
              "
            /><el-button
              :icon="Bottom"
              text
              :disabled="disabled || orderedRows.at(-1)?.id === row.id"
              title="名单下移"
              aria-label="名单下移"
              @click="
                reorder(
                  row.id,
                  orderedRows.findIndex((item) => item.id === row.id) + 2,
                )
              "
            /><el-button
              :icon="Delete"
              text
              :disabled="disabled"
              title="删除此行"
              aria-label="删除此行"
              @click="remove(row.id)"
            /></div></template
      ></el-table-column>
    </el-table>
    <el-pagination
      v-if="filtered.length > 20"
      v-model:current-page="page"
      :page-size="20"
      :total="filtered.length"
      layout="prev, pager, next, total"
    />
    <el-drawer
      v-model="importing"
      title="导入公开名单"
      size="min(96vw, 760px)"
      :close-on-click-modal="false"
      @closed="clearImport"
    >
      <div class="roster-import-meta">
        <strong>{{ filename }}</strong
        ><span>{{ sheets.length }} 个工作表</span>
      </div>
      <div class="roster-mapping">
        <el-form-item label="工作表"
          ><el-select v-model="sheetIndex" aria-label="选择工作表"
            ><el-option
              v-for="(sheet, index) in sheets"
              :key="sheet.name"
              :value="index"
              :label="sheet.name" /></el-select
        ></el-form-item>
        <el-form-item label="表头行"
          ><el-input-number
            v-model="headerRow"
            :min="1"
            :max="Math.min(sheets[sheetIndex]?.rows.length || 1, 20)"
            aria-label="表头行"
        /></el-form-item>
        <el-form-item
          v-for="field in mappingFields"
          :key="field.key"
          :label="field.label"
          :required="field.key === 'name'"
          ><el-select
            v-model="mapping[field.key]"
            :aria-label="`${field.label}对应列`"
            ><el-option label="不导入" :value="-1" /><el-option
              v-for="(label, index) in headers"
              :key="index"
              :label="`${index + 1}. ${label || '未命名列'}`"
              :value="index" /></el-select
        ></el-form-item>
      </div>
      <el-alert
        v-if="importError"
        :title="importError"
        type="error"
        :closable="false"
      />
      <div v-else class="roster-import-count">
        <el-tag type="success">有效 {{ prepared.items.length }} 行</el-tag
        ><el-tag v-if="prepared.duplicates" type="warning"
          >合并重复 {{ prepared.duplicates }} 行</el-tag
        ><el-tag v-if="prepared.issues.length" type="warning"
          >未导入 {{ prepared.issues.length }} 行</el-tag
        >
      </div>
      <div v-if="prepared.issues.length" class="roster-issues">
        <span v-for="issue in prepared.issues.slice(0, 8)" :key="issue.row"
          >第 {{ issue.row }} 行：{{ issue.reason }}</span
        >
      </div>
      <el-table :data="prepared.items.slice(0, 8)" size="small"
        ><el-table-column prop="name" label="姓名" /><el-table-column
          prop="organization"
          label="单位 / 机构" /><el-table-column prop="role" label="职务"
      /></el-table>
      <el-radio-group v-model="mode" class="roster-import-mode"
        ><el-radio value="merge">合并到现有名单</el-radio
        ><el-radio value="replace">替换现有名单</el-radio></el-radio-group
      >
      <template #footer
        ><el-button @click="importing = false">取消</el-button
        ><el-button
          type="primary"
          :loading="preparing"
          :disabled="disabled || !prepared.items.length || !!importError"
          @click="confirmImport"
          >导入 {{ prepared.items.length }} 行</el-button
        ></template
      >
    </el-drawer>
  </section>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Delete,
  Plus,
  Search,
  Upload,
  Top,
  Bottom,
} from "@element-plus/icons-vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  sortInvitationInvitees,
  normalizeInvitationRosterSort,
  type InvitationInvitee,
  type InvitationRosterSort,
} from "@conference/shared";
import {
  detectRosterMapping,
  mergeRosterRows,
  prepareRosterRows,
  type RosterSheet,
} from "../../utils/invitation-roster";
const props = defineProps<{
  modelValue: InvitationInvitee[];
  disabled?: boolean;
  sort?: InvitationRosterSort;
  note?: string;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: InvitationInvitee[]];
  "update:sort": [value: InvitationRosterSort];
  "update:note": [value: string];
}>();
const sortRule = computed(() => normalizeInvitationRosterSort(props.sort));
const orderedRows = computed(() =>
  sortInvitationInvitees(props.modelValue, sortRule.value),
);
function setSort(key: string) {
  if (!props.disabled)
    emit(
      "update:sort",
      normalizeInvitationRosterSort({ ...sortRule.value, key }),
    );
}
function reorder(id: string, position: number) {
  if (props.disabled || !Number.isFinite(position)) return;
  const rows = [...orderedRows.value],
    index = rows.findIndex((row) => row.id === id);
  if (index < 0) return;
  const target = Math.max(
    0,
    Math.min(rows.length - 1, Math.round(position) - 1),
  );
  rows.splice(target, 0, rows.splice(index, 1)[0]);
  emit("update:sort", { key: "manual", direction: "asc" });
  emit("update:modelValue", rows);
}
const query = ref(""),
  page = ref(1),
  reading = ref(false),
  importing = ref(false),
  preparing = ref(false),
  filename = ref("");
const fileInput = ref<HTMLInputElement>();
const sheets = ref<RosterSheet[]>([]),
  sheetIndex = ref(0),
  headerRow = ref(1);
const mapping = ref({ name: -1, organization: -1, role: -1 });
const mode = ref<"merge" | "replace">("merge"),
  importError = ref("");
const prepared = ref<{
  items: InvitationInvitee[];
  issues: Array<{ row: number; reason: string }>;
  duplicates: number;
}>({ items: [], issues: [], duplicates: 0 });
const mappingFields = [
  { key: "name", label: "姓名" },
  { key: "organization", label: "单位" },
  { key: "role", label: "职务" },
] as const;
const headers = computed(
  () => sheets.value[sheetIndex.value]?.rows[headerRow.value - 1] || [],
);
const filtered = computed(() =>
  orderedRows.value.filter((row) =>
    `${row.name} ${row.organization} ${row.role || ""}`
      .toLowerCase()
      .includes(query.value.trim().toLowerCase()),
  ),
);
const visibleRows = computed(() =>
  filtered.value.slice((page.value - 1) * 20, page.value * 20),
);
watch(query, () => {
  page.value = 1;
});
let worker: Worker | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0;
let destroyed = false,
  fileGeneration = 0;
function edit(
  id: string,
  key: "name" | "organization" | "role",
  value: string,
) {
  emit(
    "update:modelValue",
    props.modelValue.map((row) =>
      row.id === id ? { ...row, [key]: value } : row,
    ),
  );
}
function add() {
  query.value = "";
  emit("update:modelValue", [
    ...props.modelValue,
    {
      id: `roster_${crypto.randomUUID()}`,
      name: "",
      organization: "",
      role: "",
    },
  ]);
  page.value = Math.floor(props.modelValue.length / 20) + 1;
}
function remove(id: string) {
  emit(
    "update:modelValue",
    props.modelValue.filter((row) => row.id !== id),
  );
  page.value = Math.min(
    page.value,
    Math.max(1, Math.ceil((filtered.value.length - 1) / 20)),
  );
}
function stopWorker() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timer);
  reading.value = false;
}
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled) return;
  if (
    !/\.(xlsx|xls|csv|tsv)$/i.test(file.name) ||
    file.size > 5 * 1024 * 1024
  ) {
    ElMessage.error("请选择 5MB 以内的 Excel 或 CSV 表格");
    return;
  }
  stopWorker();
  reading.value = true;
  filename.value = file.name;
  const request = ++fileGeneration;
  try {
    const bytes = await file.arrayBuffer();
    if (destroyed || request !== fileGeneration) return;
    worker = new Worker(
      new URL("../../utils/invitation-roster.worker.ts", import.meta.url),
      { type: "module" },
    );
    timer = setTimeout(() => {
      stopWorker();
      ElMessage.error("表格解析超时，请缩小文件后重试");
    }, 15000);
    worker.onerror = () => {
      stopWorker();
      ElMessage.error("无法解析表格，请检查文件格式");
    };
    worker.onmessage = (event) => {
      stopWorker();
      if (event.data.error) {
        ElMessage.error(event.data.error);
        return;
      }
      sheets.value = event.data.sheets;
      sheetIndex.value = Math.max(
        0,
        sheets.value.findIndex(
          (sheet) => detectRosterMapping(sheet.rows).name >= 0,
        ),
      );
      mode.value = "merge";
      detect();
      importing.value = true;
    };
    worker.postMessage({ bytes, filename: file.name }, [bytes]);
  } catch {
    stopWorker();
    ElMessage.error("无法读取文件，请重试");
  }
}
function detect() {
  const found = detectRosterMapping(sheets.value[sheetIndex.value]?.rows || []);
  headerRow.value = found.header + 1;
  mapping.value = {
    name: found.name,
    organization: found.organization,
    role: found.role,
  };
}
watch(sheetIndex, detect);
watch(
  [headers, mapping],
  async () => {
    const current = ++generation,
      sheet = sheets.value[sheetIndex.value];
    if (!sheet) return;
    preparing.value = true;
    importError.value = "";
    try {
      const result = await prepareRosterRows(
        sheet,
        { ...mapping.value, header: headerRow.value - 1 },
        props.modelValue,
      );
      if (current === generation) prepared.value = result;
    } catch (error) {
      if (current === generation) {
        importError.value = error instanceof Error ? error.message : "识别失败";
        prepared.value = { items: [], issues: [], duplicates: 0 };
      }
    } finally {
      if (current === generation) preparing.value = false;
    }
  },
  { deep: true },
);
async function confirmImport() {
  if (props.disabled || preparing.value || importError.value) return;
  if (mode.value === "replace" && props.modelValue.length) {
    try {
      await ElMessageBox.confirm(
        `将替换现有 ${props.modelValue.length} 行名单，发布后对所有邀请生效。`,
        "替换公开名单",
        { confirmButtonText: "替换", cancelButtonText: "取消" },
      );
    } catch {
      return;
    }
  }
  try {
    emit(
      "update:modelValue",
      mergeRosterRows(props.modelValue, prepared.value.items, mode.value),
    );
    importing.value = false;
    query.value = "";
    page.value = 1;
    ElMessage.success("名单已导入草稿");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "导入失败");
  }
}
function clearImport() {
  ++generation;
  sheets.value = [];
  prepared.value = { items: [], issues: [], duplicates: 0 };
}
onBeforeUnmount(() => {
  destroyed = true;
  ++generation;
  ++fileGeneration;
  stopWorker();
});
</script>
<style scoped>
.roster-note-field {
  margin-top: 18px;
}
.roster-order {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 18px 0;
}
.roster-order .el-select {
  width: 220px;
  max-width: 100%;
}
.roster-row-actions {
  display: flex;
  gap: 0;
}
.roster-row-actions :deep(.el-button) {
  padding: 6px;
  margin: 0;
}
.roster-table :deep(.el-input-number) {
  width: 64px;
}
.roster-toolbar,
.roster-commands,
.roster-import-meta,
.roster-import-count {
  display: flex;
  align-items: center;
  gap: 12px;
}
.roster-toolbar {
  justify-content: space-between;
  margin-bottom: 20px;
}
.roster-toolbar h2 {
  font-size: 18px;
  margin: 0 0 5px;
}
.roster-toolbar span,
.roster-import-meta span {
  font-size: 12px;
  color: #758078;
}
.roster-commands {
  flex-shrink: 0;
}
.roster-table {
  margin: 18px 0;
}
.roster-table :deep(.el-input__wrapper) {
  box-shadow: none;
  background: transparent;
  padding: 0;
}
.roster-table :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--el-color-primary);
}
.roster-import-meta {
  justify-content: space-between;
  margin-bottom: 28px;
  overflow-wrap: anywhere;
}
.roster-mapping {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 20px;
}
.roster-mapping :deep(.el-form-item) {
  display: block;
  min-width: 0;
}
.roster-mapping :deep(.el-select) {
  width: 100%;
}
.roster-import-count {
  margin: 16px 0;
}
.roster-issues {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: #98622f;
  margin: 12px 0;
}
.roster-import-mode {
  margin-top: 24px;
}
.el-pagination {
  justify-content: flex-end;
  margin-top: 20px;
}
@media (max-width: 600px) {
  .roster-toolbar {
    align-items: flex-start;
    gap: 12px;
  }
  .roster-commands {
    gap: 4px;
  }
  .roster-commands .el-button {
    margin: 0;
    padding: 9px;
  }
  .roster-mapping {
    grid-template-columns: 1fr;
  }
  .roster-import-meta {
    align-items: flex-start;
  }
  .roster-import-mode {
    display: flex;
    align-items: flex-start;
    flex-direction: column;
  }
  .el-pagination :deep(.el-pagination__total) {
    display: none;
  }
}
</style>
