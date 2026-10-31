<template>
  <section class="admin-page">
    <AdminPageHeader title="账号管理" eyebrow="系统管理">
      <template #actions>
        <el-tooltip content="刷新账号" placement="top"><el-button :icon="Refresh" aria-label="刷新账号" :disabled="loading || saving" @click="load" /></el-tooltip>
        <el-button type="primary" :icon="Plus" :disabled="loading || saving || Boolean(loadError)" @click="openCreate">新增账号</el-button>
      </template>
    </AdminPageHeader>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <section v-loading="loading" class="table-panel">
      <el-table :data="accounts" empty-text="暂无账号">
        <AdminTableIndex />
        <el-table-column prop="username" label="用户名" min-width="160" />
        <el-table-column prop="displayName" label="显示名" min-width="160" />
        <el-table-column label="角色" min-width="220"><template #default="{ row }">{{ rolesText(row) }}</template></el-table-column>
        <el-table-column label="会议范围" min-width="240"><template #default="{ row }"><span class="conference-scope-text">{{ conferenceScopeText(row) }}</span></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
        <el-table-column label="操作" width="100" fixed="right"><template #default="{ row }"><el-button size="small" :disabled="loading || saving || Boolean(loadError)" @click="openEdit(row)">编辑</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="dialogVisible" :title="form.id ? '编辑账号' : '新增账号'" width="min(640px, calc(100vw - 32px))" destroy-on-close :close-on-click-modal="false" @close="form.password = ''">
      <el-alert v-if="saveError" :title="saveError" type="error" :closable="false" show-icon class="account-alert" />
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="saving" @submit.prevent="save">
        <el-form-item label="用户名" prop="username"><el-input v-model="form.username" :disabled="Boolean(form.id)" autocomplete="off" /></el-form-item>
        <el-form-item label="显示名"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item label="密码" prop="password"><el-input v-model="form.password" type="password" autocomplete="new-password" :placeholder="form.id ? '留空则不修改' : '请输入密码'" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.roleIds" multiple style="width: 100%">
            <el-option v-for="role in roles" :key="role.id" :label="role.enabled ? role.name : `${role.name}（已停用）`" :value="role.id" :disabled="!role.enabled" />
          </el-select>
        </el-form-item>
        <el-form-item label="会议范围">
          <el-radio-group v-model="form.conferenceScopeMode" :disabled="!scopeAvailable">
            <el-radio-button value="ASSIGNED" :disabled="form.id === admin?.id">指定会议</el-radio-button>
            <el-radio-button value="ALL">全部会议</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-alert v-if="!scopeAvailable" title="未返回该账号的会议范围，本次保存将保留原有授权。" type="warning" :closable="false" show-icon class="account-alert" />
        <template v-else-if="form.conferenceScopeMode === 'ASSIGNED'">
          <el-form-item label="授权会议">
            <el-select v-model="form.conferenceIds" multiple filterable collapse-tags collapse-tags-tooltip :max-collapse-tags="3" :loading="choicesLoading" :loading-text="`正在加载会议（已读取 ${choicesLoadedCount} 项）`" :disabled="!choicesReady" placeholder="选择授权会议" style="width: 100%" no-data-text="暂无可授权会议">
              <el-option v-for="item in conferenceOptions" :key="item.id" :label="item.title" :value="item.id" :disabled="item.unavailable" />
            </el-select>
          </el-form-item>
          <div v-if="choicesError" class="choice-error">
            <el-alert :title="choicesError" type="error" :closable="false" show-icon />
            <el-button :icon="Refresh" :disabled="choicesLoading || saving" @click="loadConferenceChoices">重试</el-button>
          </div>
          <p v-else-if="choicesReady" class="muted-text">可授权会议 {{ conferences.length }} 场，已选 {{ form.conferenceIds.length }} 场。</p>
          <el-alert v-if="!form.conferenceIds.length" title="未授权任何会议，该账号不能访问任何会议数据。" type="warning" :closable="false" show-icon class="account-alert" />
        </template>
        <el-alert v-else title="全部会议包含当前及未来新增的会议；可执行的操作仍由角色权限决定。" type="warning" :closable="false" show-icon class="account-alert" />
        <el-form-item label="启用"><el-switch v-model="form.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" :disabled="!canSave" @click="save">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { Plus, Refresh } from "@element-plus/icons-vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { createAccount, listAccounts, listConferences, listRoles, updateAccount } from "../../services/admin";
import type { AdminAccount, Conference, Role } from "../../services/types";
import { useAdminSession } from "../../stores/admin-session";

const { admin, hasPermission } = useAdminSession();
const accounts = ref<AdminAccount[]>([]);
const roles = ref<Role[]>([]);
const conferences = ref<Conference[]>([]);
const existingGrants = ref<NonNullable<AdminAccount['conferenceGrants']>>([]);
const dialogVisible = ref(false);
const loading = ref(false);
const saving = ref(false);
const loadError = ref("");
const saveError = ref("");
const choicesLoading = ref(false);
const choicesReady = ref(false);
const choicesError = ref("");
const choicesLoadedCount = ref(0);
const scopeAvailable = ref(true);
const initialScope = ref("");
const formRef = ref<FormInstance>();
const form = reactive({ id: "", username: "", displayName: "", password: "", roleIds: [] as string[], enabled: true, conferenceScopeMode: "ASSIGNED" as "ALL" | "ASSIGNED", conferenceIds: [] as string[] });
let choicesRequest = 0;
let disposed = false;
const rules: FormRules = {
  username: [{ required: true, whitespace: true, message: "请输入用户名", trigger: "blur" }],
  password: [{ validator: (_rule, value: string, callback) => callback(form.id || value.trim() ? undefined : new Error("请输入新账号密码")), trigger: "blur" }]
};
const scopeChanged = computed(() => scopeAvailable.value && (!form.id || initialScope.value !== scopeKey()));
const canSave = computed(() => !saving.value && (!scopeChanged.value || form.conferenceScopeMode === "ALL" || !form.conferenceIds.length || choicesReady.value));
const conferenceOptions = computed(() => {
  const items = conferences.value.map(item => ({ id: item.id, title: item.title, unavailable: false }));
  const ids = new Set(items.map(item => item.id));
  for (const id of form.conferenceIds) {
    if (!ids.has(id)) items.push({ id, title: `${existingGrants.value.find(grant => grant.conferenceId === id)?.conference.title ?? id}（当前不可选）`, unavailable: true });
  }
  return items;
});

onMounted(() => void load());
onBeforeUnmount(() => { disposed = true; choicesRequest++; form.password = ""; });

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    roles.value = (await listRoles()).items;
    accounts.value = (await listAccounts()).items;
  } catch (cause) { loadError.value = cause instanceof Error ? cause.message : "账号加载失败，请重试"; }
  finally { loading.value = false; }
}

async function loadConferenceChoices() {
  const request = ++choicesRequest;
  choicesReady.value = false;
  choicesError.value = "";
  choicesLoadedCount.value = 0;
  conferences.value = [];
  if (!hasPermission("conference:view")) {
    choicesError.value = "当前账号无权读取会议列表，无法新增会议授权";
    choicesLoading.value = false;
    return;
  }
  choicesLoading.value = true;
  try {
    const items = new Map<string, Conference>();
    for (let page = 1; ; page++) {
      const result = await listConferences({ page, pageSize: 100 });
      if (request !== choicesRequest) return;
      const previousSize = items.size;
      for (const item of result.items) items.set(item.id, item);
      choicesLoadedCount.value = items.size;
      if (items.size >= result.total) break;
      // Reject incomplete or repeated pages instead of presenting a silently truncated grant list.
      if (!result.items.length || items.size === previousSize || result.page !== page) throw new Error("会议列表未完整加载，请重试后再授权");
    }
    conferences.value = [...items.values()];
    choicesReady.value = true;
  } catch (cause) {
    if (request === choicesRequest) choicesError.value = cause instanceof Error ? cause.message : "会议列表加载失败，请重试";
  } finally {
    if (request === choicesRequest) choicesLoading.value = false;
  }
}

function openCreate() {
  const operator = roles.value.find(role => role.code === "CONFERENCE_OPERATOR" && role.enabled);
  Object.assign(form, { id: "", username: "", displayName: "", password: "", roleIds: operator ? [operator.id] : [], enabled: true, conferenceScopeMode: "ASSIGNED", conferenceIds: [] });
  scopeAvailable.value = true;
  existingGrants.value = [];
  saveError.value = "";
  dialogVisible.value = true;
  void loadConferenceChoices();
}

function openEdit(row: AdminAccount) {
  Object.assign(form, {
    id: row.id,
    username: row.username,
    displayName: row.displayName ?? "",
    password: "",
    roleIds: row.roles.map((role) => role.id),
    enabled: row.enabled,
    conferenceScopeMode: row.conferenceScopeMode ?? "ASSIGNED",
    conferenceIds: [...(row.conferenceIds ?? row.conferenceGrants?.map(grant => grant.conferenceId) ?? [])]
  });
  existingGrants.value = row.conferenceGrants ?? [];
  scopeAvailable.value = row.conferenceScopeMode !== undefined;
  initialScope.value = scopeKey();
  saveError.value = "";
  dialogVisible.value = true;
  void loadConferenceChoices();
}

async function save() {
  if (!canSave.value || !await formRef.value?.validate().catch(() => false)) return;
  if (saving.value || !dialogVisible.value) return;
  saving.value = true;
  saveError.value = "";
  try {
    if (scopeChanged.value && form.conferenceScopeMode === "ALL") {
      const confirmed = await ElMessageBox.confirm("确认授权该账号访问全部会议，包括未来新增会议？", "全部会议授权", {
        type: "warning", confirmButtonText: "确认授权", cancelButtonText: "取消"
      }).then(() => true, () => false);
      if (!confirmed || disposed || !dialogVisible.value) return;
    }
    const payload = {
      username: form.username.trim(), displayName: form.displayName.trim() || null, password: form.password,
      roleIds: [...form.roleIds], enabled: form.enabled,
      ...(scopeChanged.value ? { conferenceScopeMode: form.conferenceScopeMode, conferenceIds: form.conferenceScopeMode === "ALL" ? [] : [...form.conferenceIds] } : {})
    };
    const request = form.id ? updateAccount(form.id, payload) : createAccount(payload);
    form.password = "";
    await request;
    dialogVisible.value = false;
    ElMessage.success("账号已保存");
    await load();
  } catch (cause) { saveError.value = cause instanceof Error ? cause.message : "账号保存失败"; }
  finally { saving.value = false; form.password = ""; }
}

function rolesText(row: AdminAccount) {
  return row.roles.map((role) => role.name).join("、") || "-";
}

function scopeKey() { return JSON.stringify([form.conferenceScopeMode, form.conferenceScopeMode === "ALL" ? [] : [...new Set(form.conferenceIds)].sort()]); }
function conferenceScopeText(row: AdminAccount) {
  if (!row.conferenceScopeMode) return "会议范围待同步";
  if (row.conferenceScopeMode === "ALL") return "全部会议";
  const ids = row.conferenceIds ?? row.conferenceGrants?.map(grant => grant.conferenceId) ?? [];
  if (!ids.length) return "未授权任何会议";
  return ids.map(id => row.conferenceGrants?.find(grant => grant.conferenceId === id)?.conference.title ?? id).join("、");
}
</script>

<style scoped>
.account-alert { margin-bottom: 18px; }
.choice-error { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 18px; }
.choice-error .el-alert { min-width: 0; }
.conference-scope-text { overflow-wrap: anywhere; }
</style>
