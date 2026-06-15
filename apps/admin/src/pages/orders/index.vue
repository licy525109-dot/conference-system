<template>
  <section class="admin-page">
    <div class="page-header">
      <div>
        <h1 class="page-title">订单列表</h1>
        <p class="page-subtitle">查看订单和支付信息；后台不提供手动改支付状态。</p>
      </div>
    </div>
    <div class="toolbar">
      <el-input v-model="keyword" placeholder="订单号/姓名/手机" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="status" clearable placeholder="状态" style="width: 160px">
        <el-option label="待支付" value="PENDING" />
        <el-option label="已支付" value="PAID" />
        <el-option label="已取消" value="CANCELLED" />
        <el-option label="已关闭" value="CLOSED" />
      </el-select>
      <el-button :loading="loading" @click="load">查询</el-button>
    </div>
    <section class="table-panel">
      <el-table :data="items" empty-text="暂无订单">
        <el-table-column prop="orderNo" label="订单号" min-width="180" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="180" />
        <el-table-column prop="attendeeName" label="姓名" width="120" />
        <el-table-column label="原价" width="100"><template #default="{ row }">¥{{ formatCent(row.originAmountCent) }}</template></el-table-column>
        <el-table-column label="优惠" width="100"><template #default="{ row }">¥{{ formatCent(row.discountAmountCent) }}</template></el-table-column>
        <el-table-column label="应付" width="100"><template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template></el-table-column>
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="transactionId" label="微信交易号" min-width="180"><template #default="{ row }">{{ row.transactionId || "-" }}</template></el-table-column>
        <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openDetail(row.orderNo)">详情</el-button></template></el-table-column>
      </el-table>
    </section>
    <el-dialog v-model="detailVisible" title="订单详情" width="860px">
      <div v-if="detail" class="admin-page">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="订单号">{{ detail.orderNo }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ detail.status }}</el-descriptions-item>
          <el-descriptions-item label="会议">{{ detail.conferenceTitle }}</el-descriptions-item>
          <el-descriptions-item label="姓名">{{ detail.attendeeName || "-" }}</el-descriptions-item>
          <el-descriptions-item label="原价">¥{{ formatCent(detail.originAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="优惠">¥{{ formatCent(detail.discountAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="应付">¥{{ formatCent(detail.payableAmountCent) }}</el-descriptions-item>
          <el-descriptions-item label="实付">{{ detail.paidAmountCent === null ? "-" : `¥${formatCent(detail.paidAmountCent)}` }}</el-descriptions-item>
        </el-descriptions>
        <h3>优惠明细</h3>
        <el-table :data="detail.discounts" empty-text="暂无优惠">
          <el-table-column prop="type" label="类型" width="130" />
          <el-table-column prop="title" label="名称" min-width="180" />
          <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
        </el-table>
        <h3>支付记录</h3>
        <el-table :data="detail.payments" empty-text="暂无支付">
          <el-table-column prop="provider" label="渠道" width="100" />
          <el-table-column prop="status" label="状态" width="110" />
          <el-table-column prop="outTradeNo" label="商户单号" min-width="180" />
          <el-table-column prop="transactionId" label="微信交易号" min-width="180" />
        </el-table>
        <h3>提交表单</h3>
        <pre class="json-block">{{ formatJson(detail.submittedFormJson) }}</pre>
      </div>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getOrder, listOrders } from "../../services/admin";
import type { AdminOrder, AdminOrderDetail } from "../../services/types";

const items = ref<AdminOrder[]>([]);
const detail = ref<AdminOrderDetail | null>(null);
const keyword = ref("");
const status = ref("");
const loading = ref(false);
const detailVisible = ref(false);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    items.value = (await listOrders({ page: 1, pageSize: 100, keyword: keyword.value, status: status.value })).items;
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

function formatJson(value: unknown) {
  return JSON.stringify(value ?? {}, null, 2);
}
</script>
