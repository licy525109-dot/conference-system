<template>
  <el-dialog
    :model-value="modelValue"
    title="批量生成邀请函"
    width="min(94vw, 880px)"
    top="5vh"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
    @update:model-value="close"
  >
    <div class="batch-invitation">
      <template v-if="!result">
        <el-tabs v-if="!pending" v-model="source" class="batch-source-tabs">
          <el-tab-pane label="粘贴名单" name="paste" />
          <el-tab-pane label="上传表格" name="file" />
          <el-tab-pane label="公开名单" name="roster" />
        </el-tabs>
        <fieldset v-if="!pending" :disabled="submitting" class="batch-source">
          <template v-if="source === 'paste'">
            <el-input
              v-model="paste"
              type="textarea"
              :rows="6"
              maxlength="60000"
              aria-label="批量受邀人名单"
              placeholder="每行一位嘉宾，也可粘贴 Excel 的多列名单"
            />
            <el-button :icon="List" :loading="reading" @click="parseText"
              >预览名单</el-button
            >
          </template>
          <template v-else-if="source === 'file'">
            <input
              ref="fileInput"
              type="file"
              accept=".xlsx,.xls,.csv,.tsv"
              aria-label="上传受邀人表格"
              hidden
              @change="readUpload"
            />
            <div class="batch-file-row">
              <el-button
                :icon="Upload"
                :loading="reading"
                @click="fileInput?.click()"
                >上传 Excel / CSV</el-button
              ><span>{{ filename || "最多 200 位 · 5MB 以内" }}</span>
            </div>
          </template>
          <template v-else>
            <el-select
              v-model="rosterIds"
              multiple
              filterable
              collapse-tags
              :max-collapse-tags="3"
              aria-label="选择公开名单嘉宾"
              placeholder="选择已发布名单中的嘉宾"
              :multiple-limit="200"
            >
              <el-option
                v-for="person in roster"
                :key="person.id"
                :value="person.id"
                :label="`${person.name} · ${person.organization || '未填写单位'}`"
              />
            </el-select>
            <div class="batch-roster-actions">
              <el-button
                :disabled="!roster.length || roster.length > 200"
                @click="rosterIds = roster.map((person) => person.id)"
                >全选</el-button
              ><el-button
                :icon="List"
                :disabled="!rosterIds.length"
                @click="useRoster"
                >预览名单</el-button
              >
            </div>
          </template>
          <el-form label-position="top">
            <el-form-item label="默认称谓"
              ><el-input
                v-model="defaultSalutation"
                maxlength="40"
                aria-label="批量默认称谓"
            /></el-form-item>
            <template v-if="sheets.length && source !== 'roster'">
              <div class="batch-mapping">
                <el-form-item label="工作表"
                  ><el-select v-model="sheetIndex" aria-label="批量工作表"
                    ><el-option
                      v-for="(sheet, index) in sheets"
                      :key="index"
                      :value="index"
                      :label="sheet.name" /></el-select
                ></el-form-item>
                <el-form-item label="跳过表头行数"
                  ><el-input-number
                    v-model="mapping.start"
                    :min="0"
                    :max="Math.max(0, (sheet?.rows.length || 1) - 1)"
                    aria-label="批量跳过表头行数"
                /></el-form-item>
                <el-form-item
                  v-for="(label, key) in {
                    name: '姓名列',
                    salutation: '称谓列',
                    organization: '单位列',
                  }"
                  :key="key"
                  :label="label"
                >
                  <el-select v-model="mapping[key]" :aria-label="`批量${label}`"
                    ><el-option
                      v-if="key !== 'name'"
                      :value="-1"
                      label="不导入" /><el-option
                      v-for="(label, index) in columns"
                      :key="index"
                      :value="index"
                      :label="label"
                  /></el-select>
                </el-form-item>
              </div>
            </template>
          </el-form>
        </fieldset>
        <el-alert
          v-if="error"
          :title="error"
          type="error"
          show-icon
          :closable="false"
          class="batch-alert"
        />
        <template v-if="rows.length">
          <div class="batch-summary">
            <strong>{{ rows.length }} 位受邀人</strong
            ><span v-if="duplicates"
              >已去除 {{ duplicates }} 条完全重复的行</span
            >
          </div>
          <div class="batch-preview" role="list" aria-label="待生成受邀人">
            <div
              v-for="(row, index) in rows"
              :key="row.row"
              class="batch-preview-row"
              role="listitem"
            >
              <span class="batch-row-number">{{ row.row }}</span>
              <div class="batch-person">
                <strong>{{ row.name || "未填写姓名" }}</strong
                ><span class="batch-meta"
                  >{{ row.organization }} {{ row.salutation }}</span
                >
              </div>
              <div class="batch-match">
                <span v-if="row.issue" class="batch-error">{{
                  row.issue
                }}</span>
                <el-select
                  v-else-if="row.candidates.length > 1"
                  v-model="row.publicInviteeId"
                  :disabled="Boolean(pending)"
                  :aria-label="`第${row.row}行名单匹配`"
                  placeholder="同名嘉宾，请确认单位"
                >
                  <el-option
                    v-for="person in row.candidates"
                    :key="person.id"
                    :value="person.id"
                    :label="`${person.organization || '未填写单位'} · ${person.role || '未填写职务'}`"
                  />
                </el-select>
                <span v-else>{{
                  row.candidates.length === 1
                    ? `已匹配 · ${row.candidates[0].organization || row.name}`
                    : "不在公开名单 · 仍可生成"
                }}</span>
              </div>
              <el-button
                text
                :icon="Delete"
                :disabled="Boolean(pending)"
                :aria-label="`移除第${row.row}行`"
                @click="rows.splice(index, 1)"
              />
            </div>
          </div>
        </template>
      </template>
      <template v-else>
        <div class="batch-result-heading">
          <el-icon><CircleCheck /></el-icon
          ><strong>{{ result.items.length }} 份邀请已就绪</strong
          ><span
            >新生成 {{ result.created }} 份，复用已有
            {{ result.reused }} 份</span
          >
        </div>
        <div class="batch-results" role="list" aria-label="批量邀请结果">
          <div
            v-for="row in result.items"
            :key="row.id"
            class="batch-result-row"
            role="listitem"
          >
            <strong
              >{{ row.name }}<small>{{ row.salutation }}</small></strong
            >
            <a :href="row.shareUrl" target="_blank" rel="noopener noreferrer">{{
              row.shareUrl
            }}</a>
            <span>{{ row.reused ? "复用已有" : "新生成" }}</span>
          </div>
        </div>
        <el-input
          v-if="copyFallback"
          :model-value="copyFallback"
          readonly
          type="textarea"
          :rows="4"
          aria-label="批量邀请地址"
        />
      </template>
    </div>
    <template #footer>
      <template v-if="result"
        ><el-button :icon="CopyDocument" @click="copyAll">复制全部</el-button
        ><el-button type="primary" :icon="Download" @click="download"
          >导出链接表格</el-button
        ></template
      >
      <template v-else
        ><el-button :disabled="submitting" @click="close(false)">取消</el-button
        ><el-button v-if="pending" :disabled="submitting" @click="resetPending"
          >重新准备</el-button
        ><el-button
          type="primary"
          :icon="Promotion"
          :loading="submitting"
          :disabled="!canGenerate || reading"
          @click="generate"
          >{{
            pending ? "重试同一批次" : `生成 ${rows.length || ""} 份邀请函`
          }}</el-button
        ></template
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  CircleCheck,
  CopyDocument,
  Delete,
  Download,
  List,
  Promotion,
  Upload,
} from "@element-plus/icons-vue";
import { ElMessage } from "element-plus";
import type { InvitationInvitee } from "@conference/shared";
import {
  createInvitationBatch,
  type InvitationBatchRecipient,
  type InvitationBatchResult,
} from "../../services/invitations";
import {
  detectRosterMapping,
  type RosterSheet,
} from "../../utils/invitation-roster";
import {
  prepareInvitationBatch,
  invitationBatchCsv,
  type BatchMapping,
  type BatchPreviewRow,
} from "../../utils/invitation-batch";
const props = defineProps<{
  modelValue: boolean;
  campaignId: string;
  roster: InvitationInvitee[];
}>();
const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  generated: [];
}>();
const source = ref("paste"),
  paste = ref(""),
  filename = ref(""),
  defaultSalutation = ref("老师");
const fileInput = ref<HTMLInputElement>(),
  sheets = ref<RosterSheet[]>([]),
  sheetIndex = ref(0),
  rosterIds = ref<string[]>([]);
const mapping = ref<BatchMapping>({
  start: 0,
  name: 0,
  salutation: -1,
  organization: -1,
});
const rows = ref<BatchPreviewRow[]>([]),
  duplicates = ref(0),
  error = ref(""),
  reading = ref(false),
  submitting = ref(false);
const pending = ref<{
    key: string;
    rows: InvitationBatchRecipient[];
    campaignId: string;
  }>(),
  result = ref<InvitationBatchResult>(),
  copyFallback = ref("");
const sheet = computed(() => sheets.value[sheetIndex.value]);
const columns = computed(() =>
  Array.from(
    {
      length: Math.max(
        1,
        ...(sheet.value?.rows || []).slice(0, 20).map((row) => row.length),
      ),
    },
    (_, i) =>
      `${i + 1} · ${mapping.value.start ? sheet.value?.rows[mapping.value.start - 1]?.[i] || "未命名" : "第 " + (i + 1) + " 列"}`,
  ),
);
const canGenerate = computed(() =>
  Boolean(
    rows.value.length &&
    rows.value.every(
      (row) =>
        !row.issue && (row.candidates.length <= 1 || row.publicInviteeId),
    ),
  ),
);
let worker: Worker | undefined,
  timer: ReturnType<typeof setTimeout> | undefined,
  generation = 0,
  disposed = false;
function stopWorker() {
  worker?.terminate();
  worker = undefined;
  clearTimeout(timer);
  reading.value = false;
}
function close(value: boolean) {
  if (!submitting.value) {
    ++generation;
    stopWorker();
    emit("update:modelValue", value);
  }
}
function resetPending() {
  pending.value = undefined;
  error.value = "";
}
function detect() {
  const found = detectRosterMapping(sheet.value?.rows || []);
  const header = found.name >= 0 ? found.header : -1;
  const cells = sheet.value?.rows[header] || [];
  mapping.value = {
    start: header + 1,
    name: found.name >= 0 ? found.name : 0,
    organization: found.organization,
    salutation: cells.findIndex((cell) =>
      ["称谓", "称呼", "salutation"].includes(cell.trim().toLowerCase()),
    ),
  };
}
function prepare() {
  if (pending.value || source.value === "roster" || !sheet.value) return;
  try {
    const prepared = prepareInvitationBatch(
      sheet.value,
      mapping.value,
      props.roster,
      defaultSalutation.value,
    );
    rows.value = prepared.rows;
    duplicates.value = prepared.duplicates;
    error.value = "";
  } catch (cause) {
    rows.value = [];
    error.value = cause instanceof Error ? cause.message : "无法准备名单";
  }
}
async function parseBytes(bytes: ArrayBuffer, name: string) {
  if (pending.value || submitting.value || disposed || !props.modelValue)
    return;
  stopWorker();
  const request = ++generation;
  reading.value = true;
  error.value = "";
  rows.value = [];
  worker = new Worker(
    new URL("../../utils/invitation-roster.worker.ts", import.meta.url),
    { type: "module" },
  );
  const fail = (message: string) => {
    if (request !== generation) return;
    stopWorker();
    error.value = message;
  };
  timer = setTimeout(() => fail("表格解析超时，请缩小文件后重试"), 15000);
  worker.onerror = () => fail("无法解析表格，请检查文件格式");
  worker.onmessage = async (event) => {
    if (request !== generation) return;
    stopWorker();
    if (event.data.error) {
      error.value = event.data.error;
      return;
    }
    sheets.value = event.data.sheets;
    sheetIndex.value = Math.max(
      0,
      sheets.value.findIndex(
        (item) => detectRosterMapping(item.rows).name >= 0,
      ),
    );
    await nextTick();
    detect();
    prepare();
  };
  worker.postMessage({ bytes, filename: name }, [bytes]);
}
function parseText() {
  if (paste.value.trim())
    void parseBytes(
      new TextEncoder().encode(paste.value).buffer,
      "粘贴名单.tsv",
    );
}
async function readUpload(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file || pending.value || submitting.value) return;
  if (
    !/\.(xlsx|xls|csv|tsv)$/i.test(file.name) ||
    file.size > 5 * 1024 * 1024
  ) {
    rows.value = [];
    error.value = "请选择 5MB 以内的 Excel 或 CSV 表格";
    return;
  }
  try {
    filename.value = file.name;
    await parseBytes(await file.arrayBuffer(), file.name);
  } catch {
    error.value = "无法读取文件";
  }
}
function useRoster() {
  rows.value = props.roster
    .filter((person) => rosterIds.value.includes(person.id))
    .map((person, index) => ({
      row: index + 1,
      name: person.name,
      salutation: defaultSalutation.value.trim(),
      organization: person.organization || "",
      publicInviteeId: person.id,
      candidates: [person],
      issue: !person.name ? "缺少姓名" : "",
    }));
  duplicates.value = 0;
  error.value = "";
}
async function generate() {
  if (submitting.value || !canGenerate.value) return;
  if (!pending.value) {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    pending.value = {
      key,
      campaignId: props.campaignId,
      rows: rows.value.map((row) => ({
        name: row.name,
        salutation: row.salutation,
        publicInviteeId: row.publicInviteeId || undefined,
      })),
    };
  }
  submitting.value = true;
  error.value = "";
  try {
    result.value = await createInvitationBatch(
      pending.value.campaignId,
      pending.value.key,
      pending.value.rows,
    );
    emit("generated");
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "批量生成失败，请重试同一批次";
  } finally {
    submitting.value = false;
  }
}
function download() {
  if (!result.value) return;
  const url = URL.createObjectURL(
    new Blob([invitationBatchCsv(result.value.items)], {
      type: "text/csv;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "专属邀请链接.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function copyAll() {
  if (!result.value) return;
  const text = result.value.items
    .map((row) => `${row.name}${row.salutation}\t${row.shareUrl}`)
    .join("\n");
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success("已复制全部邀请链接");
  } catch {
    copyFallback.value = text;
  }
}
watch(sheetIndex, detect);
watch(paste, () => {
  if (!pending.value && source.value === "paste") {
    sheets.value = [];
    rows.value = [];
  }
});
watch([mapping, defaultSalutation], prepare, { deep: true });
watch(defaultSalutation, () => {
  if (source.value === "roster" && rows.value.length && !pending.value)
    useRoster();
});
watch(
  rosterIds,
  () => {
    if (!pending.value && source.value === "roster" && rows.value.length)
      useRoster();
  },
  { deep: true },
);
watch(source, () => {
  if (!pending.value) {
    ++generation;
    stopWorker();
    rows.value = [];
    sheets.value = [];
    error.value = "";
    if (source.value !== "roster") prepare();
  }
});
watch(
  () => props.modelValue,
  (value) => {
    if (value) {
      source.value = "paste";
      paste.value = "";
      sheets.value = [];
      rows.value = [];
      pending.value = undefined;
      result.value = undefined;
      filename.value = "";
      error.value = "";
      rosterIds.value = [];
      copyFallback.value = "";
    }
  },
);
onBeforeUnmount(() => {
  disposed = true;
  ++generation;
  stopWorker();
});
</script>
<style scoped>
.batch-source {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.batch-source > .el-button,
.batch-source .el-form {
  margin-top: 16px;
}
.batch-source :deep(.el-select),
.batch-source :deep(.el-input-number) {
  width: 100%;
}
.batch-source .el-form {
  max-width: 100%;
}
.batch-source .el-form > .el-form-item {
  max-width: 260px;
}
.batch-file-row,
.batch-roster-actions,
.batch-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}
.batch-file-row span,
.batch-summary span,
.batch-meta,
.batch-mapping small {
  font-size: 12px;
  color: #68737b;
}
.batch-roster-actions {
  margin-top: 12px;
}
.batch-mapping {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 20px;
}
.batch-mapping small {
  margin-top: 6px;
}
.batch-summary {
  margin: 20px 0 12px;
}
.batch-summary strong {
  font-size: 15px;
}
.batch-alert {
  margin-top: 16px;
}
.batch-meta {
  display: block;
  overflow-wrap: anywhere;
}
.batch-error {
  color: #b53040;
}
.batch-preview :deep(.el-select) {
  width: 100%;
}
.batch-preview,
.batch-results {
  max-height: 340px;
  overflow-y: auto;
}
.batch-preview-row {
  display: grid;
  grid-template-columns: 28px minmax(120px, 1fr) minmax(180px, 1.5fr) 32px;
  align-items: center;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid #e2e7e9;
}
.batch-row-number {
  color: #859096;
  font-size: 12px;
}
.batch-person strong,
.batch-result-row strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.batch-match {
  min-width: 0;
  font-size: 12px;
  color: #68737b;
}
.batch-preview-row > .el-button {
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
}
.batch-result-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 3fr) 70px;
  gap: 12px;
  padding: 16px 0;
  border-top: 1px solid #e2e7e9;
  align-items: start;
}
.batch-result-row small {
  font-size: 12px;
  font-weight: 400;
  color: #68737b;
  margin-left: 6px;
}
.batch-result-row > span {
  font-size: 12px;
  color: #68737b;
  text-align: right;
}
.batch-result-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 12px 0 24px;
}
.batch-result-heading .el-icon {
  color: #287b70;
  font-size: 22px;
}
.batch-result-heading strong {
  font-size: 18px;
}
.batch-result-heading span {
  color: #68737b;
  font-size: 13px;
}
.batch-results a {
  color: #287b70;
  overflow-wrap: anywhere;
}
@media (max-width: 600px) {
  .batch-preview-row {
    grid-template-columns: 24px minmax(0, 1fr) 32px;
    gap: 6px 10px;
  }
  .batch-match {
    grid-column: 2 / 3;
    grid-row: 2;
  }
  .batch-preview-row > .el-button {
    grid-column: 3;
    grid-row: 1;
  }
  .batch-result-row {
    grid-template-columns: minmax(0, 1fr) 70px;
    gap: 10px;
  }
  .batch-result-row a {
    grid-column: 1 / -1;
    grid-row: 2;
    font-size: 12px;
  }
  .batch-mapping {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0 12px;
  }
  .batch-result-heading span {
    flex-basis: 100%;
  }
}
</style>
