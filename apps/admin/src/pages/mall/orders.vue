<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商城订单"
      eyebrow="商城"
      badge="灰度中"
      badge-tone="warning"
      subtitle="当前商城为灰度能力，建议正式配置商品、库存和售后流程后再开放给用户。"
    >
      <AdminFeatureBadge label="商城灰度能力" description="商城订单不与会议报名订单混用，售后和履约流程完整后再开放。" tone="warning" />
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="订单号 / 收件人 / 手机" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="status" clearable placeholder="状态" style="width: 160px">
        <el-option label="待支付" value="PENDING_PAYMENT" />
        <el-option label="已支付" value="PAID" />
        <el-option label="已发货" value="SHIPPED" />
        <el-option label="已完成" value="COMPLETED" />
        <el-option label="已关闭" value="CLOSED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="orders" empty-text="暂无商城订单">
        <el-table-column prop="orderNo" label="订单号" min-width="170" />
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template></el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="orderStatusText(row.status)" /></template></el-table-column>
        <el-table-column prop="receiverName" label="收件人" width="120" />
        <el-table-column prop="receiverPhone" label="手机号" width="140" />
        <el-table-column prop="receiverAddress" label="地址" min-width="220" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="190" />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import AdminFeatureBadge from "../../components/AdminFeatureBadge.vue";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { listMallOrders } from "../../services/admin";
import type { MallOrder } from "../../services/types";

const orders = ref<MallOrder[]>([]);
const keyword = ref("");
const status = ref("");
const loading = ref(false);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    orders.value = (await listMallOrders({ page: 1, pageSize: 100, keyword: keyword.value, status: status.value })).items;
  } finally {
    loading.value = false;
  }
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function orderStatusText(value: string) {
  return { PENDING_PAYMENT: "待支付", PAID: "已支付", SHIPPED: "已发货", COMPLETED: "已完成", CLOSED: "已关闭" }[value] ?? value;
}
</script>
