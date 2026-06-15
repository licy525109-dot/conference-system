<template>
  <section class="admin-page">
    <AdminPageHeader
      title="订单支付"
      eyebrow="会议业务"
      subtitle="查看会议报名订单、金额、支付流水和异常状态；后台不提供手动改支付状态。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="订单号 / 姓名 / 手机 / 商户单号" style="width: 280px" @keyup.enter="load" />
      <el-select v-model="conferenceId" clearable filterable placeholder="会议" style="width: 220px">
        <el-option v-for="item in conferences" :key="item.id" :label="item.title" :value="item.id" />
      </el-select>
      <el-select v-model="status" clearable placeholder="订单状态" style="width: 150px">
        <el-option label="待支付" value="PENDING" />
        <el-option label="已支付" value="PAID" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="已关闭" value="CLOSED" />
      </el-select>
      <el-select v-model="paymentStatus" clearable placeholder="支付状态" style="width: 150px">
        <el-option label="支付成功" value="SUCCESS" />
        <el-option label="待支付" value="PENDING" />
        <el-option label="支付失败" value="FAILED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="displayedItems" row-key="id" :row-class-name="orderRowClassName">
        <el-table-column label="订单信息" min-width="230">
          <template #default="{ row }">
            <strong>{{ row.orderNo }}</strong>
            <div class="muted-text">{{ row.outTradeNo || "未生成商户单号" }}</div>
          </template>
        </el-table-column>
        <el-table-column prop="conferenceTitle" label="会议" min-width="200" show-overflow-tooltip />
        <el-table-column label="参会人" width="150">
          <template #default="{ row }">
            <strong>{{ row.attendeeName || "-" }}</strong>
            <div class="muted-text">{{ row.phone || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="订单状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
        <el-table-column label="支付状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.paymentStatus || row.status" :tone="isOrderAbnormal(row) ? 'danger' : undefined" /></template></el-table-column>
        <el-table-column label="应付" width="110"><template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template></el-table-column>
        <el-table-column label="实付" width="110"><template #default="{ row }">{{ row.paidAmountCent === null ? "-" : `¥${formatCent(row.paidAmountCent)}` }}</template></el-table-column>
        <el-table-column label="优惠" width="100"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
        <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
        <el-table-column label="异常" width="110">
          <template #default="{ row }">
            <AdminStatusBadge v-if="isOrderAbnormal(row)" label="需关注" tone="danger" />
            <span v-else class="muted-text">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openDetail(row.orderNo)">详情</el-button></template></el-table-column>
        <template #empty>
          <AdminEmptyState title="暂无订单" description="调整筛选条件，或从用户端完成报名下单后再查看。" action-text="查看会议" @action="goConferences" />
        </template>
      </el-table>
    </section>

    <el-dialog v-model="detailVisible" title="订单详情" width="860px">
      <div v-if="detail" class="admin-page">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="订单状态"><AdminStatusBadge :status="detail.status" /></el-descriptions-item>
          <el-descriptions-item label="会议">{{ detail.conferenceTitle }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ detail.attendeeName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="原价">¥{{ formatCent(detail.originAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="优惠">¥{{ formatCent(detail.discountAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="应付">¥{{ formatCent(detail.payableAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="实付">{{ detail.paidAmountCent === null ? "-" : `¥${formatCent(detail.paidAmountCent)}` }}</el-descriptions-item>
          <el-descriptions-item label="支付状态"><AdminStatusBadge :status="detail.paymentStatus || detail.status" /></el-descriptions-item>
          <el-descriptions-item label="支付时间">{{ formatDate(detail.paidAt) }}</el-descriptions-item>
          <el-descriptions-item label="商户订单号">{{ detail.outTradeNo || "-" }}</el-descriptions-item>
          <el-descriptions-item label="微信交易号">{{ detail.transactionId || "-" }}</el-descriptions-item>
        </el-descriptions>
        <el-alert class="reserved-alert" title="退款与同步支付状态属于预留能力，本页仅展示现有订单与支付流水。" type="info" :closable="false" />
        <h3>优惠明细</h3>
        <el-table :data="detail.discounts" empty-text="暂无优惠">
          <el-table-column prop="type" label="类型" width="130" />
          <el-table-column prop="title" label="名称" min-width="180" />
          <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        </el-table>
        <h3>支付记录</h3>
        <el-table :data="detail.payments" empty-text="暂无支付">
          <el-table-column prop="provider" label="渠道" width="100" />
          <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" /></template></el-table-column>
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180" />
          <el-table-column label="支付时间" width="180"><template #default="{ row }">{{ formatDate(row.paidAt) }}</template></el-table-column>
        </el-table>
        <h3>提交表单</h3>
        <pre class="json-block">{{ formatJson(detail.submittedFormJson) }}</pre>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo } from "../../router";
import { getOrder, listConferences, listOrders } from "../../services/admin";
import type { AdminOrder, AdminOrderDetail, Conference } from "../../services/types";

const items = ref<AdminOrder[]>([]);
const conferences = ref<Conference[]>([]);
const detail = ref<AdminOrderDetail | null>(null);
const keyword = ref("");
const conferenceId = ref("");
const status = ref("");
const paymentStatus = ref("");
const loading = ref(false);
const detailVisible = ref(false);

const displayedItems = computed(() => {
  return items.value.filter((item) => !paymentStatus.value || item.paymentStatus === paymentStatus.value);
});

onMounted(async () => {
  await Promise.all([loadConferences(), load()]);
});

async function loadConferences() {
  conferences.value = (await listConferences({ page: 1, pageSize: 100 })).items;
}

async function load() {
  loading.value = true;
  try {
    items.value = (await listOrders({ page: 1, pageSize: 100, keyword: keyword.value, conferenceId: conferenceId.value, status: status.value })).items;
  } finally {
    loading.value = false;
  }
}

async function openDetail(orderNo: string) {
  detail.value = await getOrder(orderNo);
  detailVisible.value = true;
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

function isOrderAbnormal(row: AdminOrder) {
  const statusText = String(row.status || "").toUpperCase();
  const paymentText = String(row.paymentStatus || "").toUpperCase();
  return ["FAILED", "CANCELLED", "CANCELED", "CLOSED"].includes(statusText) || ["FAILED", "CANCELLED", "CANCELED"].includes(paymentText);
}

function orderRowClassName({ row }: { row: AdminOrder }) {
  return isOrderAbnormal(row) ? "is-warning-row" : "";
}

function goConferences() {
  navigateTo("/conferences");
}
</script>

<style scoped>
.reserved-alert {
  margin-top: 14px;
}

:deep(.is-warning-row) {
  --el-table-tr-bg-color: #fffafa;
}
</style>
