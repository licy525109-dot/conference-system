<template>
  <el-dialog
    :model-value="modelValue"
    title="批量录入议程"
    width="760px"
    class="agenda-import-dialog"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="agenda-import-source">
      <el-button
        :icon="Upload"
        :disabled="disabled || reading"
        @click="fileInput?.click()"
        >上传表格</el-button
      ><input
        ref="fileInput"
        hidden
        type="file"
        accept=".xlsx,.xls,.csv,.tsv"
        @change="upload"
      /><span>Excel / CSV / TSV · 最大 5MB</span>
    </div>
    <el-input
      v-model="paste"
      type="textarea"
      :rows="4"
      aria-label="粘贴议程表格"
      placeholder="时间　议题　嘉宾（可选）"
      :disabled="disabled || reading"
    />
    <el-button
      class="agenda-parse"
      :icon="Document"
      :loading="reading"
      :disabled="disabled || !paste.trim()"
      @click="parseText"
      >识别粘贴内容</el-button
    >
    <template v-if="sheet">
      <div class="agenda-import-mapping">
        <el-form-item label="工作表"
          ><el-select v-model="sheetIndex" aria-label="议程工作表"
            ><el-option
              v-for="(item, index) in sheets"
              :key="index"
              :label="item.name"
              :value="index" /></el-select></el-form-item
        ><el-form-item label="表头行"
          ><el-select v-model="mapping.header" aria-label="议程表头行"
            ><el-option label="无表头" :value="-1" /><el-option
              v-for="(_, index) in sheet.rows.slice(0, 20)"
              :key="index"
              :label="`第 ${index + 1} 行`"
              :value="index" /></el-select></el-form-item
        ><el-form-item
          v-for="(label, key) in AGENDA_FIELDS"
          :key="key"
          :label="label"
          ><el-select v-model="mapping[key]" :aria-label="`议程${label}列`"
            ><el-option label="不使用" :value="-1" /><el-option
              v-for="(_, index) in columns"
              :key="index"
              :label="columnLabel(index)"
              :value="index" /></el-select
        ></el-form-item>
      </div>
      <div class="agenda-import-target">
        <el-form-item label="缺省日期"
          ><el-input
            v-model="defaultDate"
            aria-label="导入缺省日期"
            maxlength="40" /></el-form-item
        ><el-radio-group v-model="mode" aria-label="议程导入方式"
          ><el-radio-button value="append">追加议程</el-radio-button
          ><el-radio-button value="replace"
            >替换当前日期</el-radio-button
          ></el-radio-group
        >
      </div>
      <el-table
        :data="prepared.rows"
        max-height="280"
        size="small"
        aria-label="议程导入预览"
        ><el-table-column prop="date" label="日期" width="90" /><el-table-column
          prop="time"
          label="时段"
          width="110" /><el-table-column
          prop="title"
          label="议题"
          min-width="180" /><el-table-column
          prop="speaker"
          label="嘉宾"
          width="120"
      /></el-table>
      <p v-if="prepared.issues.length" class="agenda-error" role="alert">
        {{
          prepared.issues
            .map((item) => `第 ${item.row} 行：${item.reason}`)
            .join("；")
        }}
      </p>
    </template>
    <p v-if="error || preparationError" class="agenda-error" role="alert">
      {{ error || preparationError }}
    </p>
    <template #footer
      ><span class="agenda-import-count">{{ prepared.rows.length }} 条议程</span
      ><el-button @click="$emit('update:modelValue', false)">取消</el-button
      ><el-button
        type="primary"
        :disabled="
          disabled ||
          reading ||
          !prepared.rows.length ||
          !!preparationError ||
          !!error ||
          !!prepared.issues.length
        "
        @click="confirm"
        >导入议程</el-button
      ></template
    >
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { Upload, Document } from "@element-plus/icons-vue";
import type { InvitationAgendaItem } from "@conference/shared";
import {
  AGENDA_FIELDS,
  detectAgendaMapping,
  prepareAgendaRows,
  applyAgendaImport,
} from "../../utils/invitation-agenda";
import type { RosterSheet } from "../../utils/invitation-roster";
const props = defineProps<{
  modelValue: boolean;
  date: string;
  agenda: InvitationAgendaItem[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  import: [rows: InvitationAgendaItem[]];
}>();
const fileInput = ref<HTMLInputElement>(),
  paste = ref(""),
  sheets = ref<RosterSheet[]>([]),
  sheetIndex = ref(0),
  reading = ref(false),
  error = ref("");
const defaultDate = ref(props.date),
  mode = ref("append"),
  mapping = ref(detectAgendaMapping([]));
const sheet = computed(() => sheets.value[sheetIndex.value]);
const columns = computed(() =>
  Array.from({
    length: Math.max(0, ...(sheet.value?.rows.map((row) => row.length) || [])),
  }),
);
const result = computed(() => {
  try {
    return {
      ...(sheet.value
        ? prepareAgendaRows(sheet.value, mapping.value, defaultDate.value)
        : { rows: [], issues: [] }),
      error: "",
    };
  } catch (cause) {
    return {
      rows: [],
      issues: [],
      error: cause instanceof Error ? cause.message : "无法读取议程",
    };
  }
});
const prepared = computed(() => result.value);
const preparationError = computed(
  () =>
    result.value.error ||
    (mode.value === "replace" &&
    prepared.value.rows.some((row) => row.date !== props.date)
      ? "替换当前日期时，导入的日期需与当前日期一致"
      : (mode.value === "append"
            ? props.agenda.length
            : props.agenda.filter((row) => row.date !== props.date).length) +
            prepared.value.rows.length >
          150
        ? "合计超过 150 条议程"
        : ""),
);
const columnLabel = (index: number) =>
  `${index + 1} · ${sheet.value?.rows[Math.max(0, mapping.value.header)]?.[index] || "未命名"}`;
watch(sheet, (value) => {
  mapping.value = detectAgendaMapping(value?.rows || []);
});
let worker: Worker | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0;
function stop() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timer);
  reading.value = false;
}
watch(
  () => props.modelValue,
  (visible) => {
    generation++;
    stop();
    if (visible) {
      defaultDate.value = props.date;
      mode.value = "append";
      sheets.value = [];
      paste.value = "";
      error.value = "";
    }
  },
);
onBeforeUnmount(() => {
  generation++;
  stop();
});
function parse(bytes: ArrayBuffer, filename: string) {
  if (props.disabled || reading.value || !props.modelValue) return;
  const current = ++generation;
  sheets.value = [];
  error.value = "";
  reading.value = true;
  worker = new Worker(
    new URL("../../utils/invitation-roster.worker.ts", import.meta.url),
    { type: "module" },
  );
  const fail = (message: string) => {
    if (current !== generation) return;
    stop();
    error.value = message;
  };
  timer = setTimeout(() => fail("表格解析超时，请缩小文件后重试"), 15000);
  worker.onerror = () => fail("无法解析表格，请检查文件格式");
  worker.onmessage = (event) => {
    if (current !== generation) return;
    stop();
    if (event.data.error) {
      error.value = event.data.error;
      return;
    }
    sheets.value = event.data.sheets;
    sheetIndex.value = Math.max(
      0,
      sheets.value.findIndex(
        (item) => detectAgendaMapping(item.rows).header >= 0,
      ),
    );
  };
  worker.postMessage({ bytes, filename }, [bytes]);
}
function parseText() {
  if (paste.value.trim())
    parse(new TextEncoder().encode(paste.value).buffer, "议程.tsv");
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || props.disabled || reading.value) return;
  if (
    !/\.(xlsx|xls|csv|tsv)$/i.test(file.name) ||
    file.size > 5 * 1024 * 1024
  ) {
    sheets.value = [];
    error.value = "请选择 5MB 以内的 Excel / CSV / TSV 表格";
    return;
  }
  const current = generation;
  try {
    const bytes = await file.arrayBuffer();
    if (current === generation && props.modelValue) parse(bytes, file.name);
  } catch {
    error.value = "文件读取失败";
  }
}
async function confirm() {
  if (
    props.disabled ||
    reading.value ||
    error.value ||
    preparationError.value ||
    prepared.value.issues.length ||
    !prepared.value.rows.length
  )
    return;
  const selectedDate = props.date,
    selectedMode = mode.value;
  const rows = prepared.value.rows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
  }));
  if (selectedMode === "replace") {
    try {
      await ElMessageBox.confirm(
        `替换“${selectedDate || "未分组"}”的现有议程？其他日期保持不变。`,
        "替换当前日期",
        {
          type: "warning",
          confirmButtonText: "替换",
          cancelButtonText: "取消",
        },
      );
    } catch {
      return;
    }
  }
  if (props.disabled || !props.modelValue) return;
  const result = applyAgendaImport(
    props.agenda,
    rows,
    selectedDate,
    selectedMode === "replace",
  );
  if (result.length > 150) return;
  emit("import", result);
  emit("update:modelValue", false);
}
</script>
<style scoped>
.agenda-import-source {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.agenda-import-source span,
.agenda-import-count {
  font-size: 12px;
  color: #69756e;
}
.agenda-parse {
  margin: 12px 0 20px;
}
.agenda-import-mapping {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}
.agenda-import-mapping :deep(.el-form-item),
.agenda-import-target :deep(.el-form-item) {
  min-width: 0;
}
.agenda-import-target {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
  margin: 8px 0 18px;
}
.agenda-import-target :deep(.el-form-item) {
  margin: 0;
  flex: 1;
  min-width: 180px;
}
.agenda-error {
  color: #b53647;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.agenda-import-count {
  margin-right: auto;
}
@media (max-width: 600px) {
  .agenda-import-mapping {
    gap: 0 10px;
  }
}
</style>
<style>
.agenda-import-dialog {
  max-width: calc(100vw - 24px);
}
.agenda-import-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.agenda-import-dialog .el-dialog__footer .el-button + .el-button {
  margin: 0;
}
</style>
