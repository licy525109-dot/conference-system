<template>
  <section class="admin-page">
    <AdminPageHeader
      title="会议配置详情"
      :subtitle="conference?.title || '请选择会议'"
      eyebrow="会议管理"
      badge="配置中心"
      badge-tone="info"
    >
      <template #actions>
      <div class="inline-actions">
        <el-select v-model="conferenceId" placeholder="选择会议" style="width: 260px" @change="loadAll">
          <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
        </el-select>
        <el-button @click="goBack">返回列表</el-button>
      </div>
      </template>
    </AdminPageHeader>

    <el-tabs v-if="conference" v-model="activeTab" class="data-panel">
      <el-tab-pane label="基础信息" name="basic">
        <el-form :model="conferenceForm" label-width="120px" class="form-panel">
          <el-form-item label="标题"><el-input v-model="conferenceForm.title" /></el-form-item>
          <el-form-item label="副标题"><el-input v-model="conferenceForm.subtitle" /></el-form-item>
          <el-form-item label="封面 URL"><el-input v-model="conferenceForm.coverImage" /></el-form-item>
          <el-form-item label="地点"><el-input v-model="conferenceForm.location" /></el-form-item>
          <el-form-item label="开始时间"><el-date-picker v-model="conferenceForm.startAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
          <el-form-item label="结束时间"><el-date-picker v-model="conferenceForm.endAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.sssZ" /></el-form-item>
          <el-form-item label="需要核销"><el-switch v-model="conferenceForm.checkInEnabled" /></el-form-item>
          <el-form-item label="团体报名"><el-switch v-model="conferenceForm.groupRegistrationEnabled" /></el-form-item>
          <el-form-item label="单单最大票数"><el-input-number v-model="conferenceForm.maxTicketsPerOrder" :min="0" /></el-form-item>
          <el-form-item><el-button type="primary" @click="saveConference">保存基础配置</el-button></el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="票种配置" name="skus">
        <div class="toolbar">
          <el-button type="primary" @click="openSku()">新增票种</el-button>
        </div>
        <el-table :data="skus" empty-text="暂无票种">
          <el-table-column prop="name" label="名称" min-width="160" />
          <el-table-column label="价格" width="120"><template #default="{ row }">¥{{ formatCent(row.priceCent) }}</template></el-table-column>
          <el-table-column prop="stock" label="库存" width="100" />
          <el-table-column prop="soldCount" label="已售" width="100" />
          <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openSku(row)">编辑</el-button></template></el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="报名字段" name="fields">
        <div class="toolbar">
          <el-button type="primary" @click="openField()">新增字段</el-button>
        </div>
        <el-table :data="fields" empty-text="暂无字段">
          <el-table-column prop="label" label="标签" min-width="140" />
          <el-table-column prop="fieldKey" label="字段标识" min-width="140" />
          <el-table-column label="类型" width="120"><template #default="{ row }">{{ fieldTypeText(row.type) }}</template></el-table-column>
          <el-table-column label="必填" width="90"><template #default="{ row }"><AdminStatusBadge :status="row.required" :label="row.required ? '必填' : '选填'" :tone="row.required ? 'warning' : 'neutral'" /></template></el-table-column>
          <el-table-column label="启用" width="90"><template #default="{ row }"><AdminStatusBadge :status="row.enabled" /></template></el-table-column>
          <el-table-column label="操作" width="150">
            <template #default="{ row }">
              <el-button size="small" @click="openField(row)">编辑</el-button>
              <el-button size="small" type="warning" @click="stopField(row.id)">停用</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane label="优惠配置" name="discounts">
        <AdminFeatureBadge label="后端计价已接入" description="优惠券和满减会参与 quote/create order，最终金额仍由后端重新计算并固化快照。" tone="success" />
        <div class="discount-grid">
          <AdminSectionCard title="优惠券" subtitle="固定金额或折扣券，可限定当前会议。">
            <CouponsPage :conference-id="conferenceId" embedded />
          </AdminSectionCard>
          <AdminSectionCard title="满减规则" subtitle="满金额或满张数优惠，可限定当前会议。">
            <PromotionsPage :conference-id="conferenceId" embedded />
          </AdminSectionCard>
        </div>
      </el-tab-pane>

      <el-tab-pane label="页面装修" name="page">
        <section class="form-panel">
          <h3>会议详情页装修</h3>
          <p class="muted-text">进入小程序页面装修，编辑并发布会议详情页组件。会议详情页仍保留当前固定页面作为接口失败兜底。</p>
          <el-button type="primary" @click="openPageBuilder">打开页面装修</el-button>
        </section>
      </el-tab-pane>

      <el-tab-pane label="发布设置" name="publish">
        <section class="form-panel publish-panel">
          <div>
            <h3>当前发布状态</h3>
            <p class="muted-text">会议上下架仍在会议管理列表中操作，避免配置页误触影响用户端报名入口。</p>
          </div>
          <AdminStatusBadge :status="conference.status" />
          <el-button @click="goBack">返回会议管理调整状态</el-button>
        </section>
      </el-tab-pane>
    </el-tabs>

    <section v-else class="data-panel">
      <p class="muted-text">暂无会议，请先创建会议。</p>
    </section>

    <el-dialog v-model="skuDialogVisible" :title="skuForm.id ? '编辑票种' : '新增票种'" width="560px">
      <el-form :model="skuForm" label-width="100px">
        <el-form-item label="名称"><el-input v-model="skuForm.name" /></el-form-item>
        <el-form-item label="说明"><el-input v-model="skuForm.description" /></el-form-item>
        <el-form-item label="价格(元)"><el-input-number v-model="skuForm.priceYuan" :min="0" :precision="2" /></el-form-item>
        <el-form-item label="库存"><el-input-number v-model="skuForm.stock" :min="0" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="skuForm.status"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="INACTIVE" /></el-select></el-form-item>
      </el-form>
      <template #footer><el-button @click="skuDialogVisible = false">取消</el-button><el-button type="primary" @click="saveSku">保存</el-button></template>
    </el-dialog>

    <el-dialog v-model="fieldDialogVisible" :title="fieldForm.id ? '编辑字段' : '新增字段'" width="620px">
      <el-form :model="fieldForm" label-width="110px">
        <el-form-item label="标签"><el-input v-model="fieldForm.label" /></el-form-item>
        <el-form-item label="字段标识"><el-input v-model="fieldForm.fieldKey" placeholder="用于保存数据，建议使用拼音或数字" /></el-form-item>
        <el-form-item label="类型"><el-select v-model="fieldForm.type"><el-option v-for="type in fieldTypes" :key="type" :label="fieldTypeText(type)" :value="type" /></el-select></el-form-item>
        <el-form-item label="必填"><el-switch v-model="fieldForm.required" /></el-form-item>
        <el-form-item label="占位文案"><el-input v-model="fieldForm.placeholder" /></el-form-item>
        <el-form-item label="选项内容"><el-input v-model="fieldForm.optionsText" type="textarea" :rows="3" placeholder="每行一个选项，适用于下拉、单选、多选" /></el-form-item>
        <el-form-item label="排序"><el-input-number v-model="fieldForm.sortOrder" :min="0" /></el-form-item>
        <el-form-item label="启用"><el-switch v-model="fieldForm.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="fieldDialogVisible = false">取消</el-button><el-button type="primary" @click="saveField">保存</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import CouponsPage from "../coupons/index.vue";
import PromotionsPage from "../promotions/index.vue";
import { navigateTo, routeQuery } from "../../router";
import {
  createFormField,
  createSku,
  disableFormField,
  listConferences,
  listFormFields,
  listSkus,
  updateConference,
  updateConferenceCheckInConfig,
  updateFormField,
  updateSku
} from "../../services/admin";
import type { Conference, FormField, Sku } from "../../services/types";

const conferences = ref<Conference[]>([]);
const conferenceId = ref("");
const conference = computed(() => conferences.value.find((item) => item.id === conferenceId.value) ?? null);
const skus = ref<Sku[]>([]);
const fields = ref<FormField[]>([]);
const activeTab = ref("basic");
const skuDialogVisible = ref(false);
const fieldDialogVisible = ref(false);
const fieldTypes = ["TEXT", "TEXTAREA", "PHONE", "EMAIL", "SELECT", "RADIO", "CHECKBOX", "DATE"] as const;

const conferenceForm = reactive({
  title: "",
  subtitle: "",
  coverImage: "",
  location: "",
  startAt: "",
  endAt: "",
  checkInEnabled: false,
  groupRegistrationEnabled: true,
  maxTicketsPerOrder: 0,
  contentJsonText: "{}",
  styleJsonText: "{}"
});
const skuForm = reactive({ id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
const fieldForm = reactive({
  id: "",
  label: "",
  fieldKey: "",
  type: "TEXT",
  required: false,
  placeholder: "",
  optionsText: "",
  sortOrder: 0,
  enabled: true
});

onMounted(async () => {
  conferenceId.value = routeQuery.value.id ?? "";
  await loadAll();
});

async function loadAll() {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
  if (!conferenceId.value && conferences.value[0]) {
    conferenceId.value = conferences.value[0].id;
  }
  syncConferenceForm();
  if (conferenceId.value) {
    skus.value = (await listSkus(conferenceId.value)).items;
    fields.value = (await listFormFields(conferenceId.value)).items;
  }
}

function syncConferenceForm() {
  if (!conference.value) return;
  Object.assign(conferenceForm, {
    title: conference.value.title,
    subtitle: conference.value.subtitle ?? "",
    coverImage: conference.value.coverImage ?? "",
    location: conference.value.location ?? "",
    startAt: conference.value.startAt,
    endAt: conference.value.endAt,
    checkInEnabled: conference.value.checkInEnabled,
    groupRegistrationEnabled: conference.value.groupRegistrationEnabled,
    maxTicketsPerOrder: conference.value.maxTicketsPerOrder ?? 0,
    contentJsonText: JSON.stringify(conference.value.contentJson ?? {}, null, 2),
    styleJsonText: JSON.stringify(conference.value.styleJson ?? {}, null, 2)
  });
}

async function saveConference() {
  if (!conferenceId.value) return;
  await updateConference(conferenceId.value, {
    title: conferenceForm.title,
    subtitle: conferenceForm.subtitle,
    coverImage: conferenceForm.coverImage,
    location: conferenceForm.location,
    startAt: conferenceForm.startAt,
    endAt: conferenceForm.endAt,
    groupRegistrationEnabled: conferenceForm.groupRegistrationEnabled,
    maxTicketsPerOrder: conferenceForm.maxTicketsPerOrder > 0 ? conferenceForm.maxTicketsPerOrder : null,
    contentJson: parseJsonObject(conferenceForm.contentJsonText),
    styleJson: parseJsonObject(conferenceForm.styleJsonText)
  });
  await updateConferenceCheckInConfig(conferenceId.value, conferenceForm.checkInEnabled);
  await loadAll();
  ElMessage.success("会议配置已保存");
}

function openSku(row?: Sku) {
  Object.assign(skuForm, row ? {
    id: row.id,
    name: row.name,
    description: row.description ?? "",
    priceYuan: row.priceCent / 100,
    stock: row.stock,
    status: row.status
  } : { id: "", name: "", description: "", priceYuan: 0, stock: 0, status: "ACTIVE" });
  skuDialogVisible.value = true;
}

async function saveSku() {
  if (!conferenceId.value) return;
  const payload = {
    name: skuForm.name,
    description: skuForm.description,
    priceCent: Math.round(skuForm.priceYuan * 100),
    stock: skuForm.stock,
    status: skuForm.status
  };
  if (skuForm.id) await updateSku(skuForm.id, payload);
  else await createSku(conferenceId.value, payload);
  skuDialogVisible.value = false;
  skus.value = (await listSkus(conferenceId.value)).items;
}

function openField(row?: FormField) {
  Object.assign(fieldForm, row ? {
    id: row.id,
    label: row.label,
    fieldKey: row.fieldKey,
    type: row.type,
    required: row.required,
    placeholder: row.placeholder ?? "",
    optionsText: optionsToText(row.optionsJson),
    sortOrder: row.sortOrder,
    enabled: row.enabled
  } : {
    id: "",
    label: "",
    fieldKey: "",
    type: "TEXT",
    required: false,
    placeholder: "",
    optionsText: "",
    sortOrder: 0,
    enabled: true
  });
  fieldDialogVisible.value = true;
}

async function saveField() {
  if (!conferenceId.value) return;
  const payload = {
    label: fieldForm.label,
    fieldKey: fieldForm.fieldKey,
    type: fieldForm.type,
    required: fieldForm.required,
    placeholder: fieldForm.placeholder,
    optionsJson: textToOptions(fieldForm.optionsText),
    validationJson: {},
    sortOrder: fieldForm.sortOrder,
    enabled: fieldForm.enabled
  };
  if (fieldForm.id) await updateFormField(fieldForm.id, payload);
  else await createFormField(conferenceId.value, payload);
  fieldDialogVisible.value = false;
  fields.value = (await listFormFields(conferenceId.value)).items;
}

async function stopField(id: string) {
  await ElMessageBox.confirm("确认停用该报名字段？已提交的历史报名数据不会被删除。", "停用报名字段", {
    confirmButtonText: "确认停用",
    cancelButtonText: "取消",
    type: "warning"
  });
  await disableFormField(id);
  if (conferenceId.value) fields.value = (await listFormFields(conferenceId.value)).items;
}

function goBack() {
  navigateTo("/conferences");
}

function openPageBuilder() {
  navigateTo("/pages", { pageKey: "conference-detail", conferenceId: conferenceId.value });
}

function parseJsonObject(text: string): Record<string, unknown> {
  const value = JSON.parse(text || "{}") as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("JSON 必须是对象");
  return value as Record<string, unknown>;
}

function parseJsonArray(text: string): unknown[] {
  const value = JSON.parse(text || "[]") as unknown;
  if (!Array.isArray(value)) throw new Error("选项 JSON 必须是数组");
  return value;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function skuStatusText(value: string) {
  return { ACTIVE: "启用", INACTIVE: "停用" }[value] ?? value;
}

function fieldTypeText(value: string) {
  return {
    TEXT: "单行文本",
    TEXTAREA: "多行文本",
    PHONE: "手机号",
    EMAIL: "邮箱",
    SELECT: "下拉选择",
    RADIO: "单选",
    CHECKBOX: "多选",
    DATE: "日期"
  }[value] ?? value;
}

function optionsToText(value: unknown[] | null) {
  return Array.isArray(value) ? value.map((item) => (typeof item === "string" ? item : String((item as { label?: unknown }).label ?? ""))).filter(Boolean).join("\n") : "";
}

function textToOptions(value: string) {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}
</script>

<style scoped>
.discount-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-top: 14px;
}

.publish-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.publish-panel h3 {
  margin: 0;
}
</style>
