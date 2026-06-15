<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">财务与对账</h1>
        <p class="page-subtitle">基于本地订单与支付记录做只读汇总和差异扫描，不调用微信账单下载。</p>
      </div>
      <div class="inline-actions">
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" @click="scan">生成对账批次</el-button>
      </div>
    </div>

    <div v-if="overview" class="grid-cards">
      <div v-for="item in cards" :key="item.label" class="metric-card">
        <div class="metric-label">{{ item.label }}</div>
        <div class="metric-value">{{ item.value }}</div>
      </div>
    </div>

    <el-row v-if="overview" :gutter="16">
      <el-col :span="12">
        <section class="data-panel">
          <h2 class="page-title">会议收入</h2>
          <el-table :data="overview.conferences" empty-text="暂无收入数据">
            <el-table-column prop="title" label="会议" min-width="180" />
            <el-table-column label="收入" width="120"><template #default="{ row }">¥{{ formatCent(row.revenueCent) }}</template></el-table-column>
            <el-table-column label="优惠" width="120"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
            <el-table-column prop="registrationCount" label="报名" width="90" />
          </el-table>
        </section>
      </el-col>
      <el-col :span="12">
        <section class="data-panel">
          <h2 class="page-title">对账批次</h2>
          <el-table :data="batches" empty-text="暂无对账批次">
            <el-table-column prop="batchNo" label="批次号" min-width="180" />
            <el-table-column label="状态" width="100"><template #default="{ row }">{{ financeStatusText(row.status) }}</template></el-table-column>
            <el-table-column prop="differenceCount" label="差异" width="90" />
            <el-table-column prop="createdAt" label="创建时间" width="190" />
          </el-table>
        </section>
      </el-col>
    </el-row>

    <section class="data-panel">
      <div class="toolbar">
        <el-input v-model="paymentKeyword" placeholder="订单号 / 商户单号 / 微信单号" style="width: 280px" @keyup.enter="loadPayments" />
        <el-select v-model="paymentStatus" clearable placeholder="支付状态" style="width: 160px">
          <el-option label="支付成功" value="SUCCESS" />
          <el-option label="待支付" value="PENDING" />
          <el-option label="支付失败" value="FAILED" />
        </el-select>
        <el-button @click="loadPayments">查询支付流水</el-button>
      </div>
      <el-table :data="payments" empty-text="暂无支付流水">
        <el-table-column prop="orderNo" label="订单号" min-width="170" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="170" />
        <el-table-column prop="provider" label="渠道" width="110" />
        <el-table-column label="状态" width="110"><template #default="{ row }">{{ financeStatusText(row.status) }}</template></el-table-column>
        <el-table-column label="金额" width="110"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        <el-table-column prop="transactionId" label="交易号" min-width="190" show-overflow-tooltip />
        <el-table-column prop="paidAt" label="支付时间" width="190" />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ElMessage } from "element-plus";
import { createFinanceBatch, getFinanceOverview, listFinanceBatches, listFinancePayments } from "../../services/admin";
import type { FinanceBatch, FinanceOverview, FinancePayment } from "../../services/types";

const overview = ref<FinanceOverview | null>(null);
const batches = ref<FinanceBatch[]>([]);
const payments = ref<FinancePayment[]>([]);
const paymentKeyword = ref("");
const paymentStatus = ref("");
const loading = ref(false);

const cards = computed(() => {
  const data = overview.value?.cards;
  if (!data) return [];
  return [
    { label: "累计收入", value: `¥${formatCent(data.totalRevenueCent)}` },
    { label: "支付流水", value: `¥${formatCent(data.paidAmountCent)}` },
    { label: "优惠金额", value: `¥${formatCent(data.discountAmountCent)}` },
    { label: "退款金额", value: `¥${formatCent(data.refundAmountCent)}` },
    { label: "净收入", value: `¥${formatCent(data.netRevenueCent)}` },
    { label: "已支付订单", value: data.paidOrders },
    { label: "待支付订单", value: data.pendingOrders },
    { label: "报名数", value: data.registrationCount }
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
