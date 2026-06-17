<template>
  <section class="admin-page">
    <AdminPageHeader
      title="订单支付"
      eyebrow="订单交易"
      subtitle="查看会议报名订单、金额、支付流水和异常状态；后台不提供手动改支付状态。"
    >
      <template #actions>
        <el-button :loading="exporting" @click="exportExcel">导出 Excel</el-button>
        <el-button v-if="hasPermission('order:delete')" :loading="deleting" type="danger" plain @click="deleteFiltered">筛选后一键删除</el-button>
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
      <el-checkbox v-model="onlyExceptions">只看异常</el-checkbox>
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
            <el-tooltip v-if="isOrderAbnormal(row)" placement="top" :content="exceptionText(row)">
              <AdminStatusBadge label="需关注" tone="danger" />
            </el-tooltip>
            <span v-else class="muted-text">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="170">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.orderNo)">详情</el-button>
            <el-button v-if="hasPermission('order:delete')" size="small" type="danger" plain @click="deleteSingle(row)">删除</el-button>
          </template>
        </el-table-column>
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
        <div v-if="detail.registration" class="inline-actions">
          <el-button type="primary" @click="navigateTo('/registrations/detail', { id: detail.registration.id })">查看报名详情</el-button>
        </div>
        <el-alert class="reserved-alert" title="退款与重新处理支付成功属于高风险预留能力，本页仅展示异常、记录人工处理备注，不修改支付状态。" type="info" :closable="false" />
        <section v-if="detail.paymentExceptions.length > 0" class="exception-panel">
          <h3>异常识别</h3>
          <el-alert
            v-for="item in detail.paymentExceptions"
            :key="item.code"
            :title="item.message"
            :type="item.level === 'danger' ? 'error' : 'warning'"
            :closable="false"
            show-icon
          />
          <el-input v-model="reviewNote" type="textarea" :rows="3" maxlength="1000" show-word-limit placeholder="填写人工核对结果，例如：已核对微信商户后台，用户未支付；或已联系开发排查报名缺失。" />
          <div class="inline-actions">
            <el-button type="primary" :disabled="!reviewNote.trim()" :loading="reviewSaving" @click="saveExceptionReview">记录处理备注</el-button>
          </div>
          <el-timeline v-if="detail.exceptionReviewLogs.length > 0">
            <el-timeline-item v-for="log in detail.exceptionReviewLogs" :key="log.id" :timestamp="formatDate(log.createdAt)">
              <strong>{{ log.adminName }}</strong>
              <div class="muted-text">{{ readReviewNote(log.metadataJson) || log.summary || "-" }}</div>
            </el-timeline-item>
          </el-timeline>
        </section>
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
import { ElMessage, ElMessageBox } from "element-plus";
import AdminEmptyState from "../../components/AdminEmptyState.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { navigateTo } from "../../router";
import { deleteOrder, deleteOrdersByFilter, exportOrdersExcel, getOrder, listConferences, listOrders, reviewPaymentException } from "../../services/admin";
import { useAdminSession } from "../../stores/admin-session";
import type { AdminOrder, AdminOrderDetail, Conference } from "../../services/types";

const items = ref<AdminOrder[]>([]);
const { hasPermission } = useAdminSession();
const conferences = ref<Conference[]>([]);
const detail = ref<AdminOrderDetail | null>(null);
const keyword = ref("");
const conferenceId = ref("");
const status = ref("");
const paymentStatus = ref("");
const onlyExceptions = ref(false);
const loading = ref(false);
const exporting = ref(false);
const deleting = ref(false);
const reviewSaving = ref(false);
const detailVisible = ref(false);
const reviewNote = ref("");

const displayedItems = computed(() => {
  return items.value.filter((item) => !onlyExceptions.value || isOrderAbnormal(item));
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
    items.value = (await listOrders({ page: 1, pageSize: 100, keyword: keyword.value, conferenceId: conferenceId.value, status: status.value, paymentStatus: paymentStatus.value })).items;
  } finally {
    loading.value = false;
  }
}

async function openDetail(orderNo: string) {
  detail.value = await getOrder(orderNo);
  reviewNote.value = "";
  detailVisible.value = true;
}

async function exportExcel() {
  exporting.value = true;
  try {
    await exportOrdersExcel({
      keyword: keyword.value,
      conferenceId: conferenceId.value,
      status: status.value,
      paymentStatus: paymentStatus.value,
      onlyExceptions: onlyExceptions.value
    });
    ElMessage.success("订单 Excel 已开始下载");
  } finally {
    exporting.value = false;
  }
}

async function saveExceptionReview() {
  if (!detail.value || !reviewNote.value.trim()) return;
  reviewSaving.value = true;
  try {
    await reviewPaymentException(detail.value.orderNo, reviewNote.value);
    detail.value = await getOrder(detail.value.orderNo);
    reviewNote.value = "";
    ElMessage.success("处理备注已记录");
  } finally {
    reviewSaving.value = false;
  }
}

async function deleteSingle(row: AdminOrder) {
  try {
    await ElMessageBox.confirm("仅未支付、未生成报名且没有成功支付流水的订单可删除。确认删除该订单？", "删除订单", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  deleting.value = true;
  try {
    const result = await deleteOrder(row.orderNo);
    await load();
    ElMessage.success(`已删除 ${result.deleted} 单${result.skipped ? `，跳过 ${result.skipped} 单` : ""}`);
  } finally {
    deleting.value = false;
  }
}

async function deleteFiltered() {
  try {
    await ElMessageBox.confirm("将按当前筛选条件删除可安全删除的订单；已支付、有成功支付流水或已生成报名记录的订单会跳过。确认继续？", "筛选后一键删除", {
      confirmButtonText: "确认删除",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  deleting.value = true;
  try {
    const result = await deleteOrdersByFilter({
      keyword: keyword.value,
      conferenceId: conferenceId.value,
      status: status.value,
      paymentStatus: paymentStatus.value,
      onlyExceptions: onlyExceptions.value
    });
    await load();
    const message = `已匹配 ${result.matched} 单，删除 ${result.deleted} 单，跳过 ${result.skipped} 单`;
    if (result.deleted > 0) {
      ElMessage.success(message);
    } else {
      ElMessage.warning(`${message}；仅未支付、无报名、无成功支付流水的订单可删除`);
    }
  } finally {
    deleting.value = false;
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

function isOrderAbnormal(row: AdminOrder) {
  if (row.paymentExceptions?.length > 0) return true;
  const statusText = String(row.status || "").toUpperCase();
  const paymentText = String(row.paymentStatus || "").toUpperCase();
  return ["FAILED", "CANCELLED", "CANCELED", "CLOSED"].includes(statusText) || ["FAILED", "CANCELLED", "CANCELED"].includes(paymentText);
}

function exceptionText(row: AdminOrder) {
  return row.paymentExceptions?.map((item) => item.message).join("；") || "订单状态需关注";
}

function readReviewNote(value: Record<string, unknown> | null) {
  return typeof value?.note === "string" ? value.note : "";
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

.exception-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:deep(.is-warning-row) {
  --el-table-tr-bg-color: #fffafa;
}
</style>
