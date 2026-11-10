<template>
  <el-dialog :model-value="true" :title="mode === 'manual' ? '手动添加名单' : '导入外部会议名单'" width="min(1280px, calc(100vw - 24px))" :close-on-click-modal="false" :close-on-press-escape="!busy" :show-close="!busy" @close="$emit('close')">
    <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
    <template v-if="mode === 'manual'">
      <p class="entry-hint">填写当前会议的名单资料。用于核验的字段必填，其他字段可补充；已有签到记录不会因资料更新而清除。</p>
      <el-form label-position="top" :disabled="busy" class="manual-fields">
        <el-form-item v-for="field in fields" :key="field.key" :required="field.match"><template #label>{{ field.label }} <el-tag v-if="field.match" size="small" type="info">用于核验</el-tag></template><el-input v-model="manualValues[field.key]" :aria-label="field.label" :maxlength="300" :placeholder="`请输入${field.label}`" /></el-form-item>
      </el-form>
    </template>
    <template v-else>
      <p class="entry-hint">Excel / CSV 首行需为列名。每批最多 5,000 人、10 MB。手机号和编号请使用文本格式，保留前导零。</p>
      <div class="entry-toolbar"><label class="file-button" :class="{ disabled: busy }">选择名单文件<input type="file" accept=".xlsx,.xls,.csv,.tsv" :disabled="busy" @change="readFile" /></label><el-button :disabled="busy" @click="downloadTemplate">下载当前字段模板</el-button><span class="file-name">{{ fileName }}</span><el-select v-if="sheets.length > 1" v-model="sheetIndex" aria-label="选择工作表" :disabled="busy" @change="mapHeaders"><el-option v-for="(item, index) in sheets" :key="index" :value="index" :label="item.name" /></el-select></div>
      <template v-if="sheet.length">
        <p class="entry-hint">读取 {{ fileRowCount }} 行有效资料，请确认列对应关系。空白行不导入，来源行号按原文件显示。</p>
        <el-form label-position="top" :disabled="busy" class="mapping-grid"><el-form-item v-for="field in fields" :key="field.key" :label="field.label + (field.match ? '（用于核验）' : '')"><el-select v-model="mapping[field.key]" clearable :aria-label="`${field.label}对应名单列`" placeholder="选择名单列" @change="invalidate"><el-option v-for="(header, index) in sheet[0]" :key="index" :value="String(index)" :label="header || `第 ${index + 1} 列`" /></el-select></el-form-item></el-form>
        <el-table :data="rawPreviewRows" max-height="220"><el-table-column prop="row" label="文件行号" width="95" /><el-table-column v-for="(header, index) in sheet[0]" :key="index" :label="header || `第 ${index + 1} 列`" min-width="140"><template #default="{ row }">{{ row.cells[index] }}</template></el-table-column></el-table>
        <p class="entry-hint">上方展示前 5 条有效记录。预检后会列出所有重复组，选择保留记录后再确认导入。</p><el-button :loading="busy" :disabled="busy" @click="preview">{{ plan ? '重新预检' : '预检导入' }}</el-button>
      </template>
    </template>
    <section v-if="reviewed" class="review-summary" aria-label="名单预检结果">
      <strong>新增 {{ reviewed.added }} 人 · 更新 {{ reviewed.updated }} 人 · 跳过 {{ reviewed.skipped }} 条 · 待处理 {{ reviewed.unresolved }} 组 · 格式错误 {{ reviewed.errors.length }} 条</strong>
      <p v-if="reviewed.unresolved" class="entry-hint">请在下方为每组重复记录选择保留哪条。</p>
      <el-table v-if="reviewed.errors.length" :data="reviewed.errors" max-height="230"><el-table-column v-if="mode === 'file'" prop="row" label="文件行号" width="100" /><el-table-column prop="message" label="需修正的问题" /></el-table>
      <p v-if="reviewed.errors.length" class="entry-hint">格式错误和重复组全部处理完后才会写入。{{ mode === 'file' ? '请修正文件后重新选择并预检。' : '请修改上方资料后重新保存。' }}</p>
    </section>
    <CheckinDuplicateReview v-if="reviewed" :plan="reviewed" :fields="fields" :mode="mode" :busy="busy" :source-columns="sourceColumns" @select="selectCandidate" />
    <template #footer><el-button :disabled="busy" @click="$emit('close')">取消</el-button><el-button type="primary" :loading="busy" :disabled="submitDisabled" @click="save">{{ mode === 'file' ? '确认导入' : plan?.duplicates.length ? '确认保留并保存' : '保存名单' }}</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { resolveExternalCheckinDuplicates, type ExternalCheckinValues } from "@conference/shared";
import { externalCheckins as api, type ExternalCheckinEvent, type ImportPlan } from "../../services/external-checkin";
import { downloadExternalCheckinSheet, mapExternalCheckinSheetWithRows, readExternalCheckinWorkbook } from "../../utils/external-checkin-sheet";
import CheckinDuplicateReview from "./CheckinDuplicateReview.vue";
const props = defineProps<{ event: ExternalCheckinEvent; mode: "file" | "manual" }>();
const emit = defineEmits<{ (event: "saved", value: ExternalCheckinEvent): void; (event: "close"): void }>();
const fields = props.event.fields.map(field => ({ ...field }));
const busy = ref(false), error = ref(""), plan = ref<ImportPlan | null>(null), choices = ref<Record<string, string>>({});
const sheets = ref<{ name: string; rows: string[][] }[]>([]), sheetIndex = ref(0), fileName = ref(""), mapping = reactive<Record<string, string>>({});
const manualValues = reactive<ExternalCheckinValues>(Object.fromEntries(fields.map(field => [field.key, ""])));
const sheet = computed(() => sheets.value[sheetIndex.value]?.rows || []);
const fileRows = computed(() => sheet.value.slice(1).map((cells, index) => ({ cells, row: index + 2 })).filter(row => row.cells.some(value => value.trim())));
const fileRowCount = computed(() => fileRows.value.length), rawPreviewRows = computed(() => fileRows.value.slice(0, 5));
const sourceColumns = computed(() => Object.fromEntries(fields.map(field => [field.key, mapping[field.key] ? sheet.value[0]?.[Number(mapping[field.key])] || "" : ""])));
const decisions = computed(() => Object.entries(choices.value).map(([groupId, keepCandidateId]) => ({ groupId, keepCandidateId })));
const reviewed = computed(() => {
  if (!plan.value) return null;
  const result = resolveExternalCheckinDuplicates(plan.value.duplicates, fields, decisions.value);
  return { ...plan.value, ...result, added: plan.value.added + result.added };
});
const submitDisabled = computed(() => busy.value || (props.mode === "file" && !reviewed.value) || !!reviewed.value?.errors.length || !!reviewed.value?.unresolved);
let payload: { rows: ExternalCheckinValues[]; rowNumbers: number[]; revision: number; source: "file" | "manual" } | null = null;
function invalidate() { plan.value = null; payload = null; choices.value = {}; error.value = ""; }
watch(manualValues, () => { if (!busy.value) invalidate(); }, { deep: true });
function selectCandidate(groupId: string, candidateId: string | null) { if (busy.value) return; if (candidateId) choices.value[groupId] = candidateId; else delete choices.value[groupId]; }
async function run(fn: () => Promise<void>) { if (busy.value) return; busy.value = true; error.value = ""; try { await fn(); } catch (e) { error.value = e instanceof Error ? e.message : "操作失败，请重试"; } finally { busy.value = false; } }
function mapHeaders() { invalidate(); for (const key of Object.keys(mapping)) delete mapping[key]; for (const field of fields) { const index = sheet.value[0]?.findIndex(header => header.normalize("NFKC").trim() === field.label); mapping[field.key] = index === undefined || index < 0 ? "" : String(index); } }
async function readFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; if (!file || busy.value) return;
  invalidate(); sheets.value = []; fileName.value = "";
  await run(async () => { sheets.value = await readExternalCheckinWorkbook(file); sheetIndex.value = 0; mapHeaders(); fileName.value = file.name; });
  input.value = "";
}
async function prepare() {
  invalidate();
  const latest = await api.detail(props.event.id);
  if (JSON.stringify(latest.fields) !== JSON.stringify(fields)) throw new Error("会议字段已变化，请关闭窗口、刷新会议后重新录入");
  const data = props.mode === "manual" ? { rows: [{ ...manualValues }], rowNumbers: [1] } : mapExternalCheckinSheetWithRows(sheet.value, mapping, fields);
  const body = { ...data, revision: latest.revision, source: props.mode };
  if (new Blob([JSON.stringify(body)]).size > 3_900_000) throw new Error("名单内容较大，请拆分为更小批次导入");
  const result = await api.preview(props.event.id, body);
  payload = body; plan.value = result;
}
const preview = () => run(prepare);
const save = () => run(async () => {
  if (!plan.value && props.mode === "manual") await prepare();
  if (!payload || !plan.value || !reviewed.value || reviewed.value.errors.length || reviewed.value.unresolved) return;
  const summary = reviewed.value;
  let saved: ExternalCheckinEvent;
  try { saved = await api.import(props.event.id, { ...payload, digest: plan.value.digest, decisions: decisions.value }); }
  catch (e) { invalidate(); throw e; }
  ElMessage.success(summary.updated ? "名单资料已更新，签到记录已保留" : summary.added ? props.mode === "manual" ? "名单已添加" : "名单已导入" : "已保留现有名单");
  emit("saved", saved);
});
const downloadTemplate = () => run(async () => { await downloadExternalCheckinSheet(`${props.event.title}-名单模板`, [fields.map(field => field.label)]); });
</script>

<style scoped>
.entry-hint{font-size:13px;line-height:1.8;color:#65756b;margin:12px 0}.entry-toolbar{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.entry-toolbar .el-select{width:220px}.file-name{font-size:13px;color:#3c5144;overflow-wrap:anywhere}.manual-fields,.mapping-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:0 20px;margin:20px 0}.mapping-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.manual-fields :deep(.el-form-item__label){display:flex;align-items:center;gap:8px}.mapping-grid .el-select{width:100%}.review-summary{margin-top:20px;padding:18px 20px;background:#f2f6f3;border-radius:6px}.review-summary>strong{font-size:15px;line-height:1.8}.review-summary .el-table{margin-top:12px}.file-button{position:relative;display:inline-block;background:#eef4ef;border:1px solid #c7d9ce;border-radius:4px;padding:8px 16px;color:#2b6e4e;cursor:pointer}.file-button input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.file-button.disabled{opacity:.5}.el-alert{margin-bottom:16px}@media(max-width:800px){.mapping-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:540px){.manual-fields,.mapping-grid{grid-template-columns:1fr}.review-summary{padding:14px}}
</style>
