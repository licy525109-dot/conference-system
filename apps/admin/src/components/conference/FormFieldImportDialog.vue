<template>
  <el-dialog :model-value="modelValue" title="引用其他会议的报名字段" width="min(960px, calc(100vw - 24px))" class="field-import-dialog" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @update:model-value="close">
    <el-form label-position="top">
      <el-form-item label="来源会议">
        <el-select v-model="sourceId" clearable filterable remote :remote-method="searchConferences" :loading="searching" :disabled="saving" placeholder="搜索会议名称" style="width: 100%" @change="loadSourceFields">
          <el-option v-for="item in conferences" :key="item.id" :value="item.id" :label="item.title" />
        </el-select>
      </el-form-item>
    </el-form>
    <el-alert v-if="searchError" :title="searchError" type="error" :closable="false" show-icon>
      <el-button link :icon="Refresh" @click="searchConferences(searchKeyword)">重试搜索</el-button>
    </el-alert>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon>
      <el-button v-if="sourceId && !sourceFields.length" link :icon="Refresh" @click="loadSourceFields">重新加载字段</el-button>
    </el-alert>
    <div v-if="sourceId" class="field-import-summary" role="status">
      <span>共 {{ sourceFields.length }} 项</span>
      <span>已选 {{ selectedFields.length }} 项</span>
      <span v-if="duplicateCount">已存在 {{ duplicateCount }} 项</span>
    </div>
    <el-table v-loading="loading" :data="sourceFields" :max-height="360" :empty-text="loading ? '正在加载字段' : sourceId ? '来源会议暂无报名字段' : '尚未选择来源会议'">
      <AdminTableIndex />
      <el-table-column width="48" align="center">
        <template #header><el-checkbox :model-value="allSelected" :indeterminate="selectedFields.length > 0 && !allSelected" :disabled="saving || loading || !availableFields.length" aria-label="全选可引用字段" @change="toggleAll" /></template>
        <template #default="{ row }"><el-checkbox :model-value="selectedIds.includes(row.id)" :disabled="saving || loading || isDuplicate(row)" :aria-label="`引用${row.label}`" @change="toggleField(row.id, Boolean($event))" /></template>
      </el-table-column>
      <el-table-column prop="label" label="字段名称" min-width="140" />
      <el-table-column prop="fieldKey" label="字段标识" min-width="125" />
      <el-table-column label="类型" width="105"><template #default="{ row }">{{ typeLabel(row.type) }}</template></el-table-column>
      <el-table-column label="必填" width="70"><template #default="{ row }">{{ row.required ? '必填' : '选填' }}</template></el-table-column>
      <el-table-column label="状态" width="90"><template #default="{ row }">{{ isDuplicate(row) ? '已存在' : row.enabled ? '启用' : '停用' }}</template></el-table-column>
      <el-table-column label="选项 / 提示" min-width="180"><template #default="{ row }"><span class="field-import-options">{{ optionLabel(row) }}</span></template></el-table-column>
    </el-table>
    <p class="field-import-note">同标识字段不覆盖；引用后独立保存，历史报名资料不变。</p>
    <template #footer>
      <el-button :disabled="saving" @click="close">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!canImport || loading || !selectedFields.length" @click="submit">确认引用 {{ selectedFields.length }} 项</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import AdminTableIndex from "../AdminTableIndex.vue";
import { importFormFields, listConferences, listFormFields } from "../../services/admin";
import type { Conference, FormField } from "../../services/types";
import { useAdminSession } from "../../stores/admin-session";

const props = defineProps<{ modelValue: boolean; conferenceId: string; fields: FormField[] }>();
const emit = defineEmits<{ "update:modelValue": [value: boolean]; imported: [conferenceId: string, fields: FormField[]] }>();
const { hasPermission } = useAdminSession();
const canImport = computed(() => hasPermission("conference:view") && hasPermission("conference:write"));
const conferences = ref<Conference[]>([]);
const sourceId = ref("");
const sourceFields = ref<FormField[]>([]);
const selectedIds = ref<string[]>([]);
const searching = ref(false);
const loading = ref(false);
const saving = ref(false);
const searchKeyword = ref("");
const searchError = ref("");
const error = ref("");
let searchVersion = 0;
let fieldVersion = 0;
let sessionVersion = 0;
let disposed = false;
const targetKeys = computed(() => new Set(props.fields.map(field => field.fieldKey)));
const availableFields = computed(() => sourceFields.value.filter(field => !isDuplicate(field)));
const selectedFields = computed(() => availableFields.value.filter(field => selectedIds.value.includes(field.id)));
const allSelected = computed(() => availableFields.value.length > 0 && selectedFields.value.length === availableFields.value.length);
const duplicateCount = computed(() => sourceFields.value.length - availableFields.value.length);

watch(() => [props.modelValue, props.conferenceId] as const, ([visible]) => {
  sessionVersion++;
  searchVersion++;
  fieldVersion++;
  sourceId.value = "";
  sourceFields.value = [];
  selectedIds.value = [];
  conferences.value = [];
  loading.value = false;
  saving.value = false;
  searching.value = false;
  error.value = "";
  searchError.value = "";
  if (visible && props.conferenceId && canImport.value) void searchConferences("");
}, { immediate: true, flush: "sync" });

onBeforeUnmount(() => { disposed = true; sessionVersion++; searchVersion++; fieldVersion++; });

function isDuplicate(field: FormField) { return targetKeys.value.has(field.fieldKey); }
function close() { if (!saving.value) emit("update:modelValue", false); }
function toggleAll(checked: unknown) {
  if (!canImport.value || saving.value || loading.value) return;
  selectedIds.value = checked ? availableFields.value.map(field => field.id) : [];
}
function toggleField(id: string, checked: boolean) {
  if (!canImport.value || saving.value || loading.value || !availableFields.value.some(field => field.id === id)) return;
  selectedIds.value = selectedIds.value.filter(value => value !== id);
  if (checked) selectedIds.value.push(id);
}

async function searchConferences(keyword: string) {
  if (disposed || !props.modelValue || !canImport.value || saving.value) return;
  const version = ++searchVersion;
  searchKeyword.value = keyword;
  searching.value = true;
  searchError.value = "";
  try {
    const result = await listConferences({ page: 1, pageSize: 100, keyword });
    if (version !== searchVersion || disposed) return;
    conferences.value = result.items.filter(item => item.id !== props.conferenceId);
  } catch {
    if (version === searchVersion && !disposed) { conferences.value = []; searchError.value = "会议搜索失败，请重试"; }
  } finally {
    if (version === searchVersion && !disposed) searching.value = false;
  }
}

async function loadSourceFields() {
  if (disposed || !props.modelValue || !canImport.value || saving.value) return;
  const version = ++fieldVersion;
  const id = sourceId.value;
  sourceFields.value = [];
  selectedIds.value = [];
  error.value = "";
  loading.value = false;
  if (!id || id === props.conferenceId) return;
  loading.value = true;
  try {
    const result = await listFormFields(id);
    if (version !== fieldVersion || disposed) return;
    sourceFields.value = result.items;
    selectedIds.value = availableFields.value.filter(field => field.enabled).map(field => field.id);
  } catch {
    if (version === fieldVersion && !disposed) error.value = "来源会议的报名字段加载失败，请重试";
  } finally {
    if (version === fieldVersion && !disposed) loading.value = false;
  }
}

async function submit() {
  if (disposed || !props.modelValue || !canImport.value || saving.value || loading.value || !props.conferenceId || !sourceId.value || sourceId.value === props.conferenceId || !selectedFields.value.length) return;
  if (selectedFields.value.length > 200) { error.value = "每次最多引用 200 个字段，请减少选择后重试"; return; }
  const version = sessionVersion;
  const targetId = props.conferenceId;
  saving.value = true;
  error.value = "";
  try {
    const result = await importFormFields(targetId, { sourceConferenceId: sourceId.value, fieldIds: selectedFields.value.map(field => field.id) });
    if (version !== sessionVersion || disposed) return;
    emit("imported", targetId, result.items);
    emit("update:modelValue", false);
    ElMessage.success(`已引用 ${result.copiedCount} 项字段${result.skippedFieldKeys.length ? `，${result.skippedFieldKeys.length} 项已存在，未覆盖` : ""}`);
  } catch (cause) {
    if (version === sessionVersion && !disposed) error.value = cause instanceof Error ? cause.message : "引用失败，请重试";
  } finally {
    if (version === sessionVersion && !disposed) saving.value = false;
  }
}

function typeLabel(type: FormField["type"]) {
  return { TEXT: "单行文本", TEXTAREA: "多行文本", PHONE: "手机号", EMAIL: "邮箱", SELECT: "下拉", RADIO: "单选", CHECKBOX: "多选", DATE: "日期" }[type];
}
function optionLabel(field: FormField) {
  const options = (field.optionsJson || []).map(option => {
    if (typeof option === "string" || typeof option === "number") return String(option);
    if (option && typeof option === "object") { const value = option as Record<string, unknown>; return String(value.label ?? value.value ?? ""); }
    return "";
  }).filter(Boolean);
  return options.length ? options.join("、") : field.placeholder || "-";
}
</script>

<style scoped>
.field-import-summary { display: flex; flex-wrap: wrap; gap: 16px; margin: 12px 0; color: var(--admin-color-muted, #626973); }
.field-import-options { white-space: normal; overflow-wrap: anywhere; }
.field-import-note { margin: 16px 0 0; color: var(--admin-color-muted, #626973); font-size: 14px; line-height: 1.6; }
</style>
