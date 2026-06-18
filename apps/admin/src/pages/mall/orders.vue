<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商城订单"
      eyebrow="商城"
      subtitle="商城订单与会议报名订单隔离。当前商城真实支付暂未开放，用户下单后保持待支付状态，不会伪造支付成功。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="navigateTo('/mall/fulfillment')">发货核销</el-button>
        <el-button @click="navigateTo('/mall/aftersales')">商城售后</el-button>
      </template>
    </AdminPageHeader>

    <AdminFilterBar>
      <el-input v-model="keyword" clearable placeholder="订单号 / 收件人 / 手机" style="width: 260px" @keyup.enter="load" />
      <el-select v-model="status" clearable placeholder="状态" style="width: 170px">
        <el-option label="待支付" value="PENDING_PAYMENT" />
        <el-option label="已支付" value="PAID" />
        <el-option label="已发货" value="SHIPPED" />
        <el-option label="已完成" value="COMPLETED" />
        <el-option label="已关闭" value="CLOSED" />
        <el-option label="售后中" value="REFUNDING" />
        <el-option label="已退款" value="REFUNDED" />
      </el-select>
      <template #actions>
        <el-button :loading="loading" type="primary" @click="load">查询</el-button>
      </template>
    </AdminFilterBar>

    <section class="table-panel">
      <el-table v-loading="loading" :data="orders" empty-text="暂无商城订单">
        <el-table-column prop="orderNo" label="订单号" min-width="180" />
        <el-table-column label="商品" min-width="220">
          <template #default="{ row }">
            <div v-for="item in row.items.slice(0, 2)" :key="item.id">{{ item.productTitle }} / {{ item.skuName }} x{{ item.quantity }}</div>
            <span v-if="row.items.length > 2" class="muted-text">等 {{ row.items.length }} 项</span>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="120"><template #default="{ row }">¥{{ formatCent(row.payableAmountCent) }}</template></el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="orderStatusText(row.status)" /></template></el-table-column>
        <el-table-column prop="receiverName" label="收件人" width="120" />
        <el-table-column prop="receiverPhone" label="手机号" width="140" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button v-if="row.status === 'PENDING_PAYMENT'" size="small" @click="closeOrder(row.id)">关闭</el-button>
            <el-button v-if="row.status === 'PAID'" size="small" type="primary" @click="openShip(row)">发货</el-button>
            <el-button v-if="row.status === 'SHIPPED'" size="small" type="success" @click="verifyOrder(row.id)">完成核销</el-button>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          layout="total, sizes, prev, pager, next"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          @current-change="load"
          @size-change="load"
        />
      </div>
    </section>

    <el-drawer v-model="detailVisible" size="620px" title="商城订单详情">
      <template v-if="detail">
        <el-alert type="info" :closable="false" show-icon :title="detail.paymentNotice || '商城真实支付暂未开放，待支付订单不会伪造支付成功。'" />
        <section class="detail-section">
          <h3>{{ detail.orderNo }}</h3>
          <p><strong>状态：</strong>{{ orderStatusText(detail.status) }}</p>
          <p><strong>金额：</strong>¥{{ formatCent(detail.payableAmountCent) }}</p>
          <p><strong>收件人：</strong>{{ detail.receiverName || "-" }} {{ detail.receiverPhone || "" }}</p>
          <p><strong>地址：</strong>{{ detail.receiverAddress || "-" }}</p>
        </section>
        <section class="detail-section">
          <h3>商品明细</h3>
          <el-table :data="detail.items" size="small">
            <el-table-column prop="productTitle" label="商品" min-width="160" />
            <el-table-column prop="skuName" label="SKU" min-width="120" />
            <el-table-column label="单价" width="100"><template #default="{ row }">¥{{ formatCent(row.unitPriceCent) }}</template></el-table-column>
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column label="小计" width="100"><template #default="{ row }">¥{{ formatCent(row.totalAmountCent) }}</template></el-table-column>
          </el-table>
        </section>
        <section class="detail-section">
          <h3>发货记录</h3>
          <el-table :data="detail.shipments" size="small" empty-text="暂无发货">
            <el-table-column prop="status" label="状态" width="110"><template #default="{ row }">{{ shipmentStatusText(row.status) }}</template></el-table-column>
            <el-table-column prop="company" label="物流" width="120" />
            <el-table-column prop="trackingNo" label="单号" min-width="150" />
            <el-table-column prop="pickupCode" label="核销码" width="120" />
          </el-table>
        </section>
        <section class="detail-section">
          <h3>售后记录</h3>
          <el-table :data="detail.afterSales" size="small" empty-text="暂无售后">
            <el-table-column prop="type" label="类型" width="120"><template #default="{ row }">{{ afterSaleTypeText(row.type) }}</template></el-table-column>
            <el-table-column prop="status" label="状态" width="120"><template #default="{ row }">{{ afterSaleStatusText(row.status) }}</template></el-table-column>
            <el-table-column prop="reason" label="原因" min-width="180" show-overflow-tooltip />
          </el-table>
        </section>
      </template>
    </el-drawer>

    <el-dialog v-model="shipVisible" title="商城发货" width="560px">
      <el-alert type="info" :closable="false" show-icon title="仅已支付商城订单可发货；待支付订单需先完成真实支付接入后才能进入履约。" />
      <el-form :model="shipForm" label-width="110px" class="dialog-form">
        <el-form-item label="物流公司"><el-input v-model="shipForm.company" placeholder="到店核销可为空" /></el-form-item>
        <el-form-item label="物流单号"><el-input v-model="shipForm.trackingNo" /></el-form-item>
        <el-form-item label="核销码"><el-input v-model="shipForm.pickupCode" placeholder="到店核销时填写" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="shipForm.remark" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="shipVisible = false">取消</el-button>
        <el-button type="primary" @click="submitShip">发货</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { closeMallOrder, getMallOrder, listMallOrders, shipMallOrder, verifyMallOrder } from "../../services/admin";
import type { MallOrder } from "../../services/types";
import { navigateTo } from "../../router";

const orders = ref<MallOrder[]>([]);
const detail = ref<MallOrder | null>(null);
const keyword = ref("");
const status = ref("");
const loading = ref(false);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const detailVisible = ref(false);
const shipVisible = ref(false);
const shipOrderId = ref("");
const shipForm = reactive({ company: "", trackingNo: "", pickupCode: "", remark: "" });

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    const result = await listMallOrders({ page: page.value, pageSize: pageSize.value, keyword: keyword.value, status: status.value });
    orders.value = result.items;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

async function openDetail(id: string) {
  detail.value = await getMallOrder(id);
  detailVisible.value = true;
}

async function closeOrder(id: string) {
  await ElMessageBox.confirm("关闭待支付商城订单会释放已锁定库存，确认继续？", "关闭商城订单", { type: "warning" });
  await closeMallOrder(id);
  await load();
  ElMessage.success("订单已关闭，锁定库存已释放");
}

function openShip(row: MallOrder) {
  shipOrderId.value = row.id;
  Object.assign(shipForm, { company: "", trackingNo: "", pickupCode: "", remark: "" });
  shipVisible.value = true;
}

async function submitShip() {
  await shipMallOrder(shipOrderId.value, {
    company: shipForm.company || null,
    trackingNo: shipForm.trackingNo || null,
    pickupCode: shipForm.pickupCode || null,
    remark: shipForm.remark || null
  });
  shipVisible.value = false;
  await load();
  ElMessage.success("发货记录已创建");
}

async function verifyOrder(id: string) {
  await verifyMallOrder(id);
  await load();
  ElMessage.success("商城订单已完成核销");
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function orderStatusText(value: string) {
  return { PENDING_PAYMENT: "待支付", PAID: "已支付", SHIPPED: "已发货", COMPLETED: "已完成", CLOSED: "已关闭", REFUNDING: "售后中", REFUNDED: "已退款" }[value] ?? value;
}

function shipmentStatusText(value: string) {
  return { PENDING: "待处理", SHIPPED: "已发货", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}

function afterSaleTypeText(value: string) {
  return { REFUND: "退款", RETURN_REFUND: "退货退款", EXCHANGE: "换货" }[value] ?? value;
}

function afterSaleStatusText(value: string) {
  return { REQUESTED: "已申请", APPROVED: "已同意", REJECTED: "已拒绝", PROCESSING: "处理中", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}
</script>

<style scoped>
.pagination-row {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
}

.detail-section {
  margin-top: 20px;
}

.detail-section h3 {
  margin: 0 0 10px;
  font-size: 15px;
}

.dialog-form {
  margin-top: 16px;
}
</style>
