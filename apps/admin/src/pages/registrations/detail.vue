<template>
  <section class="admin-page">
    <AdminPageHeader
      title="报名详情"
      eyebrow="会议管理"
      subtitle="串联报名、订单、支付、参会人、表单快照和操作日志。"
    >
      <template #actions>
        <el-button @click="goBack">返回报名名单</el-button>
        <el-button :loading="loading" type="primary" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <el-alert v-if="error" type="error" :title="error" show-icon :closable="false" />
    <section v-else-if="detail" class="detail-grid">
      <AdminSectionCard title="状态总览" subtitle="报名、支付和签到状态">
        <div class="status-grid">
          <div class="status-item"><span>报名状态</span><AdminStatusBadge :status="detail.status" /></div>
          <div class="status-item"><span>订单状态</span><AdminStatusBadge :status="detail.order.status" /></div>
          <div class="status-item"><span>支付状态</span><AdminStatusBadge :status="paymentStatus" /></div>
          <div class="status-item"><span>核销进度</span><strong>{{ checkInProgressText }}</strong></div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="凭证信息" subtitle="用户现场出示的报名凭证">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="报名号">{{ detail.credential.registrationNo }}</el-descriptions-item>
          <el-descriptions-item label="凭证码">{{ detail.credential.credentialCode }}</el-descriptions-item>
          <el-descriptions-item label="二维码内容" :span="2">{{ detail.credential.qrPayload }}</el-descriptions-item>
        </el-descriptions>
      </AdminSectionCard>

      <AdminSectionCard title="参会人信息">
        <el-table :data="detail.attendees" empty-text="暂无参会人">
          <el-table-column prop="skuName" label="票种" min-width="120" />
          <el-table-column prop="name" label="姓名" width="120" />
          <el-table-column prop="phone" label="手机" width="140" />
          <el-table-column prop="company" label="公司" min-width="150" />
          <el-table-column prop="title" label="职位" min-width="120" />
          <el-table-column label="核销" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.checkInStatus" /></template></el-table-column>
        </el-table>
      </AdminSectionCard>

      <AdminSectionCard title="订单与支付">
        <el-descriptions :column="3" border>
          <el-descriptions-item label="订单号">{{ detail.order.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="原价">¥{{ formatCent(detail.order.originAmountCent ?? detail.paidAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="优惠">¥{{ formatCent(detail.order.discountAmountCent ?? 0) }}</el-descriptions-item>
          <el-descriptions-item label="应付">¥{{ formatCent(detail.order.payableAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="实付">{{ detail.order.paidAmountCent === null ? "-" : `¥${formatCent(detail.order.paidAmountCent)}` }}</el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDate(detail.order.paidAt) }}</el-descriptions-item>
        </el-descriptions>
        <el-table class="section-table" :data="detail.order.payments" empty-text="暂无支付流水">
          <el-table-column prop="provider" label="渠道" width="100"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
          <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180" />
          <el-table-column label="金额" width="120"><template #default="{ row }">{{ row.amountCent === undefined ? "-" : `¥${formatCent(row.amountCent)}` }}</template></el-table-column>
          <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
        </el-table>
      </AdminSectionCard>

      <AdminSectionCard title="表单快照" subtitle="按字段展示，原始 JSON 保留在下方用于排查">
        <template #actions>
          <el-button type="primary" @click="openFormEditor">修正报名字段</el-button>
        </template>
        <el-descriptions :column="2" border>
          <el-descriptions-item v-for="item in formSummary" :key="item.label" :label="item.label">{{ item.value }}</el-descriptions-item>
        </el-descriptions>
        <el-collapse class="json-collapse">
          <el-collapse-item title="查看原始表单 JSON" name="form">
            <pre class="json-block">{{ formatJson(detail.formDataJson) }}</pre>
          </el-collapse-item>
        </el-collapse>
      </AdminSectionCard>

      <AdminSectionCard title="操作时间线">
        <el-timeline>
          <el-timeline-item v-for="item in detail.timeline" :key="`${item.type}-${item.createdAt}-${item.description}`" :timestamp="formatDate(item.createdAt)">
            <strong>{{ item.title }}</strong>
            <div class="muted-text">{{ item.description || "-" }}</div>
          </el-timeline-item>
        </el-timeline>
      </AdminSectionCard>
    </section>

    <el-dialog v-model="formDialogVisible" title="修正报名字段" width="680px">
      <el-alert title="仅用于修正客户填写错误。已支付报名允许修正表单字段，但不会修改支付金额、支付状态或订单快照。" type="warning" :closable="false" show-icon />
      <el-input v-model="formJsonText" class="form-json-editor" type="textarea" :rows="14" />
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFormValues">保存修正</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo, routeQuery } from "../../router";
import { getRegistrationDetail, updateRegistrationFormValues } from "../../services/admin";
import type { AdminRegistrationFullDetail } from "../../services/types";

const detail = ref<AdminRegistrationFullDetail | null>(null);
const loading = ref(false);
const error = ref("");
const formDialogVisible = ref(false);
const formJsonText = ref("{}");
const registrationId = computed(() => routeQuery.value.id || "");
const paymentStatus = computed(() => detail.value?.order.payments[0]?.status ?? detail.value?.order.status ?? "-");
const checkInProgressText = computed(() => {
  const progress = detail.value?.credential.checkInProgress;
  if (!progress || progress.total === 0) return "暂无";
  if (progress.notRequired === progress.total) return "无需核销";
  return `${progress.checkedIn}/${progress.total}`;
});
const formSummary = computed(() => {
  const value = detail.value?.formDataJson ?? {};
  return Object.entries(value).map(([label, raw]) => ({
    label,
    value: Array.isArray(raw) ? raw.join("、") : String(raw ?? "")
  }));
});

onMounted(load);

async function load() {
  if (!registrationId.value) {
    error.value = "缺少报名 ID";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    detail.value = await getRegistrationDetail(registrationId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报名详情加载失败";
  } finally {
    loading.value = false;
  }
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}

function openFormEditor() {
  formJsonText.value = formatJson(detail.value?.formDataJson ?? {});
  formDialogVisible.value = true;
}

async function saveFormValues() {
  if (!detail.value) return;
  const parsed = JSON.parse(formJsonText.value || "{}") as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("报名字段必须是 JSON 对象");
  }
  await updateRegistrationFormValues(detail.value.id, parsed as Record<string, unknown>);
  await load();
  formDialogVisible.value = false;
  ElMessage.success("报名字段已修正，签到核验将使用最新字段");
}

function goBack() {
  navigateTo("/registrations");
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "Mock 测试", WECHAT: "微信支付" }[value] ?? value) : "-";
}
</script>

<style scoped>
.detail-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.status-item {
  display: flex;
  min-height: 72px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel-muted);
}

.status-item span {
  color: var(--admin-color-muted);
  font-size: 12px;
}

.section-table,
.json-collapse {
  margin-top: 14px;
}

.form-json-editor {
  margin-top: 14px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

@media (max-width: 1100px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
