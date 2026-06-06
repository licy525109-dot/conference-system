<template>
  <main v-if="!admin" class="login-page">
    <el-card class="login-card" shadow="never">
      <h1>会议后台</h1>
      <el-form :model="loginForm" label-position="top" @submit.prevent>
        <el-form-item label="用户名">
          <el-input v-model="loginForm.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" autocomplete="current-password" show-password />
        </el-form-item>
        <el-button type="primary" class="full-button" :loading="loading" @click="submitLogin">登录</el-button>
      </el-form>
    </el-card>
  </main>

  <el-container v-else class="admin-shell">
    <el-aside width="220px" class="aside">
      <div class="brand">会议后台</div>
      <el-menu :default-active="activeView" @select="setView">
        <el-menu-item index="dashboard">Dashboard</el-menu-item>
        <el-menu-item index="conferences">会议管理</el-menu-item>
        <el-menu-item index="skus">报名规格</el-menu-item>
        <el-menu-item index="fields">报名字段</el-menu-item>
        <el-menu-item index="orders">订单列表</el-menu-item>
        <el-menu-item index="registrations">报名名单</el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <span>{{ admin.displayName || admin.username }}</span>
        <el-button @click="logout">退出</el-button>
      </el-header>
      <el-main class="main">
        <section v-if="activeView === 'dashboard'" class="page-section">
          <h2>Dashboard</h2>
          <el-row :gutter="16">
            <el-col :span="8"><el-card shadow="never">会议、规格、字段配置</el-card></el-col>
            <el-col :span="8"><el-card shadow="never">订单只读查看</el-card></el-col>
            <el-col :span="8"><el-card shadow="never">报名名单只读查看</el-card></el-col>
          </el-row>
        </section>

        <section v-if="activeView === 'conferences'" class="page-section">
          <div class="toolbar">
            <h2>会议管理</h2>
            <el-button type="primary" @click="openConferenceCreate">新建会议</el-button>
          </div>
          <el-table :data="conferences" border>
            <el-table-column prop="title" label="标题" min-width="220" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column prop="location" label="地点" width="140" />
            <el-table-column label="时间" min-width="220">
              <template #default="{ row }">{{ formatDate(row.startAt) }} - {{ formatDate(row.endAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="260">
              <template #default="{ row }">
                <el-button size="small" @click="openConferenceEdit(row)">编辑</el-button>
                <el-dropdown @command="(status: string) => changeConferenceStatus(row.id, status)">
                  <el-button size="small">状态</el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="DRAFT">DRAFT</el-dropdown-item>
                      <el-dropdown-item command="PUBLISHED">PUBLISHED</el-dropdown-item>
                      <el-dropdown-item command="CLOSED">CLOSED</el-dropdown-item>
                      <el-dropdown-item command="ARCHIVED">ARCHIVED</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button size="small" @click="selectConference(row, 'skus')">规格</el-button>
                <el-button size="small" @click="selectConference(row, 'fields')">字段</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'skus'" class="page-section">
          <div class="toolbar">
            <h2>报名规格</h2>
            <el-select v-model="selectedConferenceId" placeholder="选择会议" @change="loadSkus">
              <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedConferenceId" @click="openSkuCreate">新增规格</el-button>
          </div>
          <el-table :data="skus" border>
            <el-table-column prop="name" label="名称" min-width="160" />
            <el-table-column label="价格" width="120">
              <template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template>
            </el-table-column>
            <el-table-column prop="stock" label="库存" width="100" />
            <el-table-column prop="soldCount" label="已售" width="100" />
            <el-table-column prop="status" label="状态" width="120" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }"><el-button size="small" @click="openSkuEdit(row)">编辑</el-button></template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'fields'" class="page-section">
          <div class="toolbar">
            <h2>报名字段</h2>
            <el-select v-model="selectedConferenceId" placeholder="选择会议" @change="loadFields">
              <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
            </el-select>
            <el-button type="primary" :disabled="!selectedConferenceId" @click="openFieldCreate">新增字段</el-button>
          </div>
          <el-table :data="fields" border>
            <el-table-column prop="label" label="标签" min-width="140" />
            <el-table-column prop="fieldKey" label="字段 Key" min-width="140" />
            <el-table-column prop="type" label="类型" width="120" />
            <el-table-column prop="required" label="必填" width="90" />
            <el-table-column prop="enabled" label="启用" width="90" />
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button size="small" @click="openFieldEdit(row)">编辑</el-button>
                <el-button size="small" type="warning" @click="disableField(row.id)">停用</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>

        <section v-if="activeView === 'orders'" class="page-section">
          <div class="toolbar">
            <h2>订单列表</h2>
            <el-input v-model="orderKeyword" placeholder="订单号/姓名/手机" class="search" @keyup.enter="loadOrders" />
            <el-button @click="loadOrders">查询</el-button>
          </div>
          <el-table :data="orders" border>
            <el-table-column prop="orderNo" label="订单号" min-width="190" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
            <el-table-column prop="attendeeName" label="姓名" width="120" />
            <el-table-column prop="phone" label="手机" width="140" />
            <el-table-column label="应付" width="110">
              <template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120" />
          </el-table>
        </section>

        <section v-if="activeView === 'registrations'" class="page-section">
          <div class="toolbar">
            <h2>报名名单</h2>
            <el-input v-model="registrationKeyword" placeholder="报名号/姓名/手机/订单" class="search" @keyup.enter="loadRegistrations" />
            <el-button @click="loadRegistrations">查询</el-button>
          </div>
          <el-table :data="registrations" border>
            <el-table-column prop="registrationNo" label="报名号" min-width="190" />
            <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
            <el-table-column prop="skuName" label="规格" width="140" />
            <el-table-column prop="attendeeName" label="姓名" width="120" />
            <el-table-column prop="phone" label="手机" width="140" />
            <el-table-column label="金额" width="110">
              <template #default="{ row }">¥{{ formatCent(row.paidAmountCent) }}</template>
            </el-table-column>
            <el-table-column prop="status" label="状态" width="120" />
          </el-table>
        </section>
      </el-main>
    </el-container>
  </el-container>

  <el-dialog v-model="conferenceDialogVisible" :title="conferenceForm.id ? '编辑会议' : '新建会议'" width="720px">
    <el-form :model="conferenceForm" label-width="110px">
      <el-form-item label="标题"><el-input v-model="conferenceForm.title" /></el-form-item>
      <el-form-item label="副标题"><el-input v-model="conferenceForm.subtitle" /></el-form-item>
      <el-form-item label="封面 URL"><el-input v-model="conferenceForm.coverImage" /></el-form-item>
      <el-form-item label="开始时间"><el-date-picker v-model="conferenceForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
      <el-form-item label="结束时间"><el-date-picker v-model="conferenceForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
      <el-form-item label="地点"><el-input v-model="conferenceForm.location" /></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="conferenceForm.status">
          <el-option label="DRAFT" value="DRAFT" />
          <el-option label="PUBLISHED" value="PUBLISHED" />
          <el-option label="CLOSED" value="CLOSED" />
          <el-option label="ARCHIVED" value="ARCHIVED" />
        </el-select>
      </el-form-item>
      <el-form-item label="排序"><el-input-number v-model="conferenceForm.sortOrder" :min="0" /></el-form-item>
      <el-form-item label="详情 JSON"><el-input v-model="conferenceForm.contentJsonText" type="textarea" :rows="5" /></el-form-item>
      <el-form-item label="样式 JSON"><el-input v-model="conferenceForm.styleJsonText" type="textarea" :rows="3" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="conferenceDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveConference">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="skuDialogVisible" :title="skuForm.id ? '编辑规格' : '新增规格'" width="620px">
    <el-form :model="skuForm" label-width="100px">
      <el-form-item label="名称"><el-input v-model="skuForm.name" /></el-form-item>
      <el-form-item label="说明"><el-input v-model="skuForm.description" /></el-form-item>
      <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
      <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
      <el-form-item label="状态">
        <el-select v-model="skuForm.status">
          <el-option label="ACTIVE" value="ACTIVE" />
          <el-option label="INACTIVE" value="INACTIVE" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="skuDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveSku">保存</el-button>
    </template>
  </el-dialog>

  <el-dialog v-model="fieldDialogVisible" :title="fieldForm.id ? '编辑字段' : '新增字段'" width="620px">
    <el-form :model="fieldForm" label-width="110px">
      <el-form-item label="标签"><el-input v-model="fieldForm.label" /></el-form-item>
      <el-form-item label="字段 Key"><el-input v-model="fieldForm.fieldKey" /></el-form-item>
      <el-form-item label="类型">
        <el-select v-model="fieldForm.type">
          <el-option v-for="type in fieldTypes" :key="type" :label="type" :value="type" />
        </el-select>
      </el-form-item>
      <el-form-item label="必填"><el-switch v-model="fieldForm.required" /></el-form-item>
      <el-form-item label="占位文案"><el-input v-model="fieldForm.placeholder" /></el-form-item>
      <el-form-item label="选项 JSON"><el-input v-model="fieldForm.optionsJsonText" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="校验 JSON"><el-input v-model="fieldForm.validationJsonText" type="textarea" :rows="3" /></el-form-item>
      <el-form-item label="排序"><el-input-number v-model="fieldForm.sortOrder" :min="0" /></el-form-item>
      <el-form-item label="启用"><el-switch v-model="fieldForm.enabled" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="fieldDialogVisible = false">取消</el-button>
      <el-button type="primary" @click="saveField">保存</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  createConference,
  createFormField,
  createSku,
  disableFormField,
  getAdminMe,
  listConferences,
  listFormFields,
  listOrders,
  listRegistrations,
  listSkus,
  loginAdmin,
  updateConference,
  updateConferenceStatus,
  updateFormField,
  updateSku
} from "./services/admin";
import { clearAdminToken, getAdminToken } from "./services/api";
import type { AdminOrder, AdminRegistration, AdminUser, Conference, FormField, Sku } from "./services/types";

type ViewName = "dashboard" | "conferences" | "skus" | "fields" | "orders" | "registrations";

const admin = ref<AdminUser | null>(null);
const activeView = ref<ViewName>("dashboard");
const loading = ref(false);
const loginForm = reactive({ username: "admin", password: "" });

const conferences = ref<Conference[]>([]);
const selectedConferenceId = ref("");
const skus = ref<Sku[]>([]);
const fields = ref<FormField[]>([]);
const orders = ref<AdminOrder[]>([]);
const registrations = ref<AdminRegistration[]>([]);
const orderKeyword = ref("");
const registrationKeyword = ref("");

const conferenceDialogVisible = ref(false);
const skuDialogVisible = ref(false);
const fieldDialogVisible = ref(false);
const fieldTypes = ["TEXT", "TEXTAREA", "PHONE", "EMAIL", "SELECT", "RADIO", "CHECKBOX", "DATE"] as const;

const conferenceForm = reactive({
  id: "",
  title: "",
  subtitle: "",
  coverImage: "",
  startAt: "",
  endAt: "",
  location: "",
  status: "DRAFT",
  sortOrder: 0,
  contentJsonText: "{}",
  styleJsonText: "{}"
});

const skuForm = reactive({
  id: "",
  name: "",
  description: "",
  priceYuan: 0,
  stock: 0,
  status: "ACTIVE"
});

const fieldForm = reactive({
  id: "",
  label: "",
  fieldKey: "",
  type: "TEXT",
  required: false,
  placeholder: "",
  optionsJsonText: "[]",
  validationJsonText: "{}",
  sortOrder: 0,
  enabled: true
});

const selectedConference = computed(() => conferences.value.find((item) => item.id === selectedConferenceId.value) ?? null);

onMounted(async () => {
  if (!getAdminToken()) {
    return;
  }

  try {
    const me = await getAdminMe();
    admin.value = me.admin;
    await loadConferences();
  } catch {
    clearAdminToken();
  }
});

async function submitLogin() {
  loading.value = true;
  try {
    admin.value = await loginAdmin(loginForm.username, loginForm.password);
    await loadConferences();
    ElMessage.success("登录成功");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "登录失败");
  } finally {
    loading.value = false;
  }
}

function logout() {
  clearAdminToken();
  admin.value = null;
}

async function setView(index: string) {
  activeView.value = index as ViewName;
  if (activeView.value === "conferences") await loadConferences();
  if (activeView.value === "skus") await loadSkus();
  if (activeView.value === "fields") await loadFields();
  if (activeView.value === "orders") await loadOrders();
  if (activeView.value === "registrations") await loadRegistrations();
}

async function loadConferences() {
  const data = await listConferences({ page: 1, pageSize: 50 });
  conferences.value = data.items;
  if (!selectedConferenceId.value && conferences.value[0]) {
    selectedConferenceId.value = conferences.value[0].id;
  }
}

async function loadSkus() {
  await loadConferences();
  if (!selectedConferenceId.value) return;
  skus.value = (await listSkus(selectedConferenceId.value)).items;
}

async function loadFields() {
  await loadConferences();
  if (!selectedConferenceId.value) return;
  fields.value = (await listFormFields(selectedConferenceId.value)).items;
}

async function loadOrders() {
  orders.value = (await listOrders({ page: 1, pageSize: 50, keyword: orderKeyword.value })).items;
}

async function loadRegistrations() {
  registrations.value = (await listRegistrations({ page: 1, pageSize: 50, keyword: registrationKeyword.value })).items;
}

function selectConference(row: Conference, view: ViewName) {
  selectedConferenceId.value = row.id;
  void setView(view);
}

function openConferenceCreate() {
  Object.assign(conferenceForm, {
    id: "",
    title: "",
    subtitle: "",
    coverImage: "",
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + 86400000).toISOString(),
    location: "",
    status: "DRAFT",
    sortOrder: 0,
    contentJsonText: "{}",
    styleJsonText: "{}"
  });
  conferenceDialogVisible.value = true;
}

function openConferenceEdit(row: Conference) {
  Object.assign(conferenceForm, {
    id: row.id,
    title: row.title,
    subtitle: row.subtitle ?? "",
    coverImage: row.coverImage ?? "",
    startAt: row.startAt,
    endAt: row.endAt,
    location: row.location ?? "",
    status: row.status,
    sortOrder: row.sortOrder,
    contentJsonText: JSON.stringify(row.contentJson ?? {}, null, 2),
    styleJsonText: JSON.stringify(row.styleJson ?? {}, null, 2)
  });
  conferenceDialogVisible.value = true;
}

async function saveConference() {
  try {
    const payload = {
      title: conferenceForm.title,
      subtitle: conferenceForm.subtitle,
      coverImage: conferenceForm.coverImage,
      startAt: conferenceForm.startAt,
      endAt: conferenceForm.endAt,
      location: conferenceForm.location,
      status: conferenceForm.status,
      sortOrder: conferenceForm.sortOrder,
      contentJson: parseJsonObject(conferenceForm.contentJsonText),
      styleJson: parseJsonObject(conferenceForm.styleJsonText)
    };
    if (conferenceForm.id) {
      await updateConference(conferenceForm.id, payload);
    } else {
      await createConference(payload);
    }
    conferenceDialogVisible.value = false;
    await loadConferences();
    ElMessage.success("会议已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function changeConferenceStatus(id: string, status: string) {
  try {
    await updateConferenceStatus(id, status);
    await loadConferences();
    ElMessage.success("状态已更新");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "状态更新失败");
  }
}

function openSkuCreate() {
  Object.assign(skuForm, { id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuDialogVisible.value = true;
}

function openSkuEdit(row: Sku) {
  Object.assign(skuForm, {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    priceYuan: row.priceCent / 100,
    stock: row.stock,
    status: row.status
  });
  skuDialogVisible.value = true;
}

async function saveSku() {
  if (!selectedConference.value) return;
  try {
    const payload = {
      name: skuForm.name,
      description: skuForm.description,
      priceCent: Math.round(skuForm.priceYuan * 100),
      stock: skuForm.stock,
      status: skuForm.status
    };
    if (skuForm.id) {
      await updateSku(skuForm.id, payload);
    } else {
      await createSku(selectedConference.value.id, payload);
    }
    skuDialogVisible.value = false;
    await loadSkus();
    ElMessage.success("规格已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

function openFieldCreate() {
  Object.assign(fieldForm, {
    id: "",
    label: "",
    fieldKey: "",
    type: "TEXT",
    required: false,
    placeholder: "",
    optionsJsonText: "[]",
    validationJsonText: "{}",
    sortOrder: 0,
    enabled: true
  });
  fieldDialogVisible.value = true;
}

function openFieldEdit(row: FormField) {
  Object.assign(fieldForm, {
    id: row.id,
    label: row.label,
    fieldKey: row.fieldKey,
    type: row.type,
    required: row.required,
    placeholder: row.placeholder ?? "",
    optionsJsonText: JSON.stringify(row.optionsJson ?? [], null, 2),
    validationJsonText: JSON.stringify(row.validationJson ?? {}, null, 2),
    sortOrder: row.sortOrder,
    enabled: row.enabled
  });
  fieldDialogVisible.value = true;
}

async function saveField() {
  if (!selectedConference.value) return;
  try {
    const payload = {
      label: fieldForm.label,
      fieldKey: fieldForm.fieldKey,
      type: fieldForm.type,
      required: fieldForm.required,
      placeholder: fieldForm.placeholder,
      optionsJson: parseJsonArray(fieldForm.optionsJsonText),
      validationJson: parseJsonObject(fieldForm.validationJsonText),
      sortOrder: fieldForm.sortOrder,
      enabled: fieldForm.enabled
    };
    if (fieldForm.id) {
      await updateFormField(fieldForm.id, payload);
    } else {
      await createFormField(selectedConference.value.id, payload);
    }
    fieldDialogVisible.value = false;
    await loadFields();
    ElMessage.success("字段已保存");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "保存失败");
  }
}

async function disableField(id: string) {
  try {
    await disableFormField(id);
    await loadFields();
    ElMessage.success("字段已停用");
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : "停用失败");
  }
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value = JSON.parse(text || "{}") as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("JSON 必须是对象");
  }
  return value as Record<string, unknown>;
}

function parseJsonArray(text: string): unknown[] {
  const value = JSON.parse(text || "[]") as unknown;
  if (!Array.isArray(value)) {
    throw new Error("选项 JSON 必须是数组");
  }
  return value;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}
</script>
