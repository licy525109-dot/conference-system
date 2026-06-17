<template>
  <section class="admin-page">
    <AdminPageHeader
      :title="pageTitle"
      eyebrow="财务管理"
      badge="灰度辅助"
      badge-tone="warning"
      subtitle="财务管理灰度能力，基于本地订单与支付记录做只读汇总和差异扫描，不调用微信账单下载。"
    >
      <AdminFeatureBadge label="财务辅助能力" description="第一版只服务运营核对，不作为正式财务结算依据。" tone="warning" />
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="scan">生成对账批次</el-button>
      </template>
    </AdminPageHeader>

    <div v-if="overview" class="admin-stat-grid">
      <AdminStatCard v-for="item in cards" :key="item.label" :label="item.label" :value="item.value" :tone="item.tone" />
    </div>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <AdminSectionCard title="会议收入" subtitle="基于已支付会议报名订单汇总。">
          <el-table :data="overview.conferences" empty-text="暂无收入数据">
            <el-table-column prop="title" label="会议" min-width="180" />
            <el-table-column label="收入" width="120"><template #default="{ row }">¥{{ formatCent(row.revenueCent) }}</template></el-table-column>
            <el-table-column label="优惠" width="120"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
            <el-table-column prop="registrationCount" label="报名" width="90" />
          </el-table>
        </AdminSectionCard>
      </el-col>
      <el-col :span="12">
        <AdminSectionCard title="对账批次" subtitle="批次仅用于本地差异扫描。">
          <el-table :data="batches" empty-text="暂无对账批次">
            <el-table-column prop="batchNo" label="批次号" min-width="180" />
            <el-table-column label="状态" width="110"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="financeStatusText(row.status)" /></template></el-table-column>
            <el-table-column prop="differenceCount" label="差异" width="90" />
            <el-table-column prop="createdAt" label="创建时间" width="190" />
          </el-table>
        </AdminSectionCard>
      </el-col>
    </el-row>

    <AdminSectionCard title="支付流水" subtitle="展示已有支付记录，不提供人工改支付状态。">
      <AdminFilterBar>
        <el-input v-model="paymentKeyword" clearable placeholder="订单号 / 商户单号 / 微信单号" style="width: 280px" @keyup.enter="loadPayments" />
        <el-select v-model="paymentStatus" clearable placeholder="支付状态" style="width: 160px">
          <el-option label="支付成功" value="SUCCESS" />
          <el-option label="待支付" value="PENDING" />
          <el-option label="支付失败" value="FAILED" />
        </el-select>
        <template #actions>
          <el-button @click="loadPayments">查询支付流水</el-button>
        </template>
      </AdminFilterBar>
      <el-table :data="payments" empty-text="暂无支付流水">
        <el-table-column prop="orderNo" label="订单号" min-width="170" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="170" />
        <el-table-column prop="provider" label="渠道" width="110" />
        <el-table-column label="状态" width="120"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="financeStatusText(row.status)" /></template></el-table-column>
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        <el-table-column prop="transactionId" label="交易号" min-width="190" show-overflow-tooltip />
        <el-table-column prop="paidAt" label="支付时间" width="190" />
      </el-table>
    </AdminSectionCard>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminSectionCard from "../../components/AdminSectionCard.vue";
import AdminStatCard from "../../components/AdminStatCard.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { currentRoute } from "../../router";
import { createFinanceBatch, getFinanceOverview, listFinanceBatches, listFinancePayments } from "../../services/admin";
import type { FinanceBatch, FinanceOverview, FinancePayment } from "../../services/types";

const overview = ref<FinanceOverview | null>(null);
const batches = ref<FinanceBatch[]>([]);
const payments = ref<FinancePayment[]>([]);
const paymentKeyword = ref("");
const paymentStatus = ref("");
const loading = ref(false);
const pageTitle = computed(() => (currentRoute.value.title === "支付流水" ? "支付流水" : "财务对账"));

const cards = computed(() => {
  const data = overview.value?.cards;
  if (!data) return [];
  return [
    { label: "累计收入", value: `¥${formatCent(data.totalRevenueCent)}`, tone: "primary" as const },
    { label: "支付流水", value: `¥${formatCent(data.paidAmountCent)}`, tone: "success" as const },
    { label: "优惠金额", value: `¥${formatCent(data.discountAmountCent)}`, tone: "default" as const },
    { label: "退款金额", value: `¥${formatCent(data.refundAmountCent)}`, tone: "warning" as const },
    { label: "净收入", value: `¥${formatCent(data.netRevenueCent)}`, tone: "primary" as const },
    { label: "已支付订单", value: data.paidOrders, tone: "success" as const },
    { label: "待支付订单", value: data.pendingOrders, tone: "warning" as const },
    { label: "报名数", value: data.registrationCount, tone: "default" as const }
  ];
});

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    await Promise.all([loadOverview(), loadBatches(), loadPayments()]);
  } finally {
    loading.value = false;
  }
}

async function loadOverview() {
  overview.value = await getFinanceOverview();
}

async function loadBatches() {
  batches.value = (await listFinanceBatches()).items;
}

async function loadPayments() {
  payments.value = (await listFinancePayments({ page: 1, pageSize: 100, keyword: paymentKeyword.value, status: paymentStatus.value })).items;
}

async function scan() {
  try {
    await ElMessageBox.confirm("对账批次仅基于当前系统内订单与支付记录生成，不会调用微信账单下载。", "确认生成对账批次", {
      confirmButtonText: "生成批次",
      cancelButtonText: "取消",
      type: "warning"
    });
  } catch {
    return;
  }
  await createFinanceBatch();
  await loadBatches();
  ElMessage.success("对账批次已生成");
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function financeStatusText(value: string) {
  return { SUCCESS: "支付成功", PENDING: "待支付", FAILED: "支付失败", CREATED: "已创建", DONE: "已完成", WARNING: "有差异" }[value] ?? value;
}
</script>
