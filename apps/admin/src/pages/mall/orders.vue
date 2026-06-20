<template>
  <section class="admin-page">
    <AdminPageHeader
      title="商城订单"
      eyebrow="商城"
      subtitle="商城订单与会议报名订单隔离。支付记录、退款记录和库存转换独立追踪。"
    >
      <template #actions>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button @click="navigateTo('/mall/payment-config')">支付配置</el-button>
        <el-button @click="navigateTo('/mall/fulfillment')">发货核销</el-button>
        <el-button @click="navigateTo('/mall/aftersales')">商城售后</el-button>
      </template>
    </AdminPageHeader>

    <section class="table-panel payment-config-panel">
      <div class="panel-heading">
        <div>
          <h3>商城支付配置</h3>
          <p>商城支付独立于会议报名支付，生产默认关闭。开启微信支付时必须配置商城专用回调地址。</p>
        </div>
        <el-tag :type="paymentConfig.paymentEnabled ? 'success' : 'warning'">{{ paymentConfig.paymentEnabled ? "可支付" : "未开放" }}</el-tag>
      </div>
      <el-form :model="paymentConfigForm" inline class="payment-config-form">
        <el-form-item label="支付模式">
          <el-radio-group v-model="paymentConfigForm.mode">
            <el-radio-button label="disabled">关闭</el-radio-button>
            <el-radio-button label="wechat">微信支付</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="商城回调地址">
          <div class="notify-field">
            <el-input v-model="paymentConfigForm.notifyUrl" readonly style="width: 420px" />
            <el-button @click="copyNotifyUrl">复制回调地址</el-button>
          </div>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="paymentConfigSaving" @click="savePaymentConfig">保存支付配置</el-button>
        </el-form-item>
      </el-form>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="商城微信支付开启后，系统会在商城 prepay 请求中使用该 notify_url；该回调只处理商城订单，不处理会议报名订单；商城 outTradeNo 使用 MALL_ 前缀。"
      />
      <div class="payment-guide">
        <strong>操作步骤</strong>
        <span>1. 支付模式选择“微信支付”。</span>
        <span>2. 检查并复制商城回调地址。</span>
        <span>3. 保存配置后，用测试商品发起支付。</span>
        <span>4. 支付成功后查看商城订单状态和支付记录。</span>
      </div>
      <div class="readiness-list">
        <span v-for="item in readinessItems" :key="item.key" :class="{ ok: item.ok }">{{ item.ok ? "已配置" : "缺失" }}：{{ item.label }}</span>
      </div>
      <el-alert v-if="paymentConfig.unavailableReason" type="warning" :closable="false" show-icon :title="String(paymentConfig.unavailableReason)" />
    </section>

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
        <el-table-column label="履约" width="130">
          <template #default="{ row }">{{ fulfillmentText(row.fulfillmentType) }}</template>
        </el-table-column>
        <el-table-column label="支付" min-width="220">
          <template #default="{ row }">
            <div>{{ paymentStatusText(latestPayment(row)?.status) }} / {{ providerText(latestPayment(row)?.provider) }}</div>
            <div class="muted-text">{{ paymentModeText(row.paymentMode) }}{{ row.paymentEnabled ? " · 可支付" : " · 未开放" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="退款" min-width="160">
          <template #default="{ row }">
            <div>{{ refundStatusText(latestRefund(row)?.status) }}</div>
            <div class="muted-text">{{ latestRefund(row)?.refundNo || "-" }}</div>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="130"><template #default="{ row }"><AdminStatusBadge :status="row.status" :label="orderStatusText(row)" /></template></el-table-column>
        <el-table-column prop="receiverName" label="收件人" width="120" />
        <el-table-column prop="receiverPhone" label="手机号" width="140" />
        <el-table-column prop="createdAt" label="创建时间" width="180" />
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openDetail(row.id)">详情</el-button>
            <el-button v-if="row.status === 'PENDING_PAYMENT'" size="small" @click="closeOrder(row.id)">关闭</el-button>
            <el-button v-if="row.status === 'PAID' && row.fulfillmentType === 'SHIPMENT'" size="small" type="primary" @click="openShip(row)">发货</el-button>
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
        <el-alert type="info" :closable="false" show-icon :title="detail.paymentNotice || '商城支付、退款和会议报名支付已隔离。'" />
        <section class="detail-section">
          <h3>{{ detail.orderNo }}</h3>
          <p><strong>状态：</strong>{{ orderStatusText(detail) }}</p>
          <p><strong>履约：</strong>{{ fulfillmentText(detail.fulfillmentType) }} / 商品类型：{{ (detail.productTypes || []).map(productTypeText).join("、") || "-" }}</p>
          <p><strong>支付配置：</strong>{{ paymentModeText(detail.paymentMode) }} / {{ detail.paymentEnabled ? "可支付" : "未开放" }}</p>
          <p v-if="detail.paymentUnavailableReason"><strong>未开放原因：</strong>{{ detail.paymentUnavailableReason }}</p>
          <p><strong>金额：</strong>¥{{ formatCent(detail.payableAmountCent) }}</p>
          <p><strong>已付金额：</strong>{{ detail.paidAmountCent === null ? "-" : `¥${formatCent(detail.paidAmountCent)}` }}</p>
          <p><strong>支付时间：</strong>{{ detail.paidAt || "-" }}</p>
          <p><strong>收件人：</strong>{{ detail.receiverName || "-" }} {{ detail.receiverPhone || "" }}</p>
          <p><strong>地址：</strong>{{ detail.receiverAddress || "-" }}</p>
        </section>
        <section class="detail-section">
          <h3>支付记录</h3>
          <el-table :data="detail.payments || []" size="small" empty-text="暂无支付记录">
            <el-table-column prop="status" label="状态" width="100"><template #default="{ row }">{{ paymentStatusText(row.status) }}</template></el-table-column>
            <el-table-column prop="provider" label="渠道" width="100"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
            <el-table-column prop="outTradeNo" label="支付单号" min-width="180" show-overflow-tooltip />
            <el-table-column prop="transactionId" label="交易号" min-width="160" show-overflow-tooltip />
            <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
            <el-table-column prop="paidAt" label="支付时间" width="180" />
          </el-table>
        </section>
        <section class="detail-section">
          <h3>商品明细</h3>
          <el-table :data="detail.items" size="small">
            <el-table-column prop="productTitle" label="商品" min-width="160" />
            <el-table-column prop="skuName" label="SKU" min-width="120" />
            <el-table-column prop="productType" label="类型" width="100"><template #default="{ row }">{{ productTypeText(row.productType) }}</template></el-table-column>
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
        <section class="detail-section">
          <h3>退款记录</h3>
          <el-table :data="detail.refunds || []" size="small" empty-text="暂无退款">
            <el-table-column prop="status" label="状态" width="110"><template #default="{ row }">{{ refundStatusText(row.status) }}</template></el-table-column>
            <el-table-column prop="provider" label="渠道" width="100"><template #default="{ row }">{{ providerText(row.provider) }}</template></el-table-column>
            <el-table-column prop="refundNo" label="退款单号" min-width="150" show-overflow-tooltip />
            <el-table-column prop="outRefundNo" label="商户退款单号" min-width="180" show-overflow-tooltip />
            <el-table-column label="金额" width="100"><template #default="{ row }">¥{{ formatCent(row.amountCent) }}</template></el-table-column>
            <el-table-column prop="failedReason" label="说明" min-width="180" show-overflow-tooltip />
          </el-table>
        </section>
      </template>
    </el-drawer>

    <el-dialog v-model="shipVisible" title="商城发货" width="560px">
      <el-alert type="info" :closable="false" show-icon title="仅已支付商城订单可发货；支付成功会将锁定库存转换为已售库存。" />
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
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminFilterBar from "../../components/AdminFilterBar.vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import { closeMallOrder, getMallOrder, getMallPaymentConfig, listMallOrders, shipMallOrder, updateMallPaymentConfig, verifyMallOrder } from "../../services/admin";
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
const paymentConfig = ref<Record<string, unknown>>({});
const paymentConfigSaving = ref(false);
const paymentConfigForm = reactive({ mode: "disabled", notifyUrl: "", remark: "" });
const readinessItems = computed(() => {
  const readiness = paymentConfig.value.readiness as { items?: Array<{ key: string; label: string; ok: boolean }> } | undefined;
  return readiness?.items ?? [];
});

onMounted(() => void Promise.all([loadPaymentConfig(), load()]));

async function loadPaymentConfig() {
  paymentConfig.value = await getMallPaymentConfig();
  Object.assign(paymentConfigForm, {
    mode: String(paymentConfig.value.mode || "disabled") === "wechat" ? "wechat" : "disabled",
    notifyUrl: String(paymentConfig.value.fixedNotifyUrl || paymentConfig.value.notifyUrl || "https://guanchaohuiji.com/api/mall/payments/wechat/notify"),
    remark: String(paymentConfig.value.remark || "")
  });
}

async function savePaymentConfig() {
  paymentConfigSaving.value = true;
  try {
    paymentConfig.value = await updateMallPaymentConfig({ ...paymentConfigForm });
    await load();
    ElMessage.success("商城支付配置已保存");
  } finally {
    paymentConfigSaving.value = false;
  }
}

async function copyNotifyUrl() {
  const text = paymentConfigForm.notifyUrl || "https://guanchaohuiji.com/api/mall/payments/wechat/notify";
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
  } else {
    const input = document.createElement("textarea");
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    document.body.removeChild(input);
  }
  ElMessage.success("商城回调地址已复制");
}

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
  if (row.fulfillmentType !== "SHIPMENT") {
    ElMessage.warning("虚拟/服务商品不进入发货流程");
    return;
  }
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

function latestPayment(row: MallOrder) {
  return row.latestPayment || row.payments?.[0] || null;
}

function latestRefund(row: MallOrder) {
  return row.latestRefund || row.refunds?.[0] || null;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function orderStatusText(row: MallOrder) {
  if (row.fulfillmentType === "VIRTUAL") {
    return { PENDING_PAYMENT: "待支付", PAID: "待使用/待核销", SHIPPED: "待使用/待核销", COMPLETED: "已完成", CLOSED: "已关闭", REFUNDING: "售后中", REFUNDED: "已退款" }[row.status] ?? row.status;
  }
  return { PENDING_PAYMENT: "待支付", PAID: "已支付", SHIPPED: "已发货", COMPLETED: "已完成", CLOSED: "已关闭", REFUNDING: "售后中", REFUNDED: "已退款" }[row.status] ?? row.status;
}

function fulfillmentText(value?: string | null) {
  return { SHIPMENT: "发货履约", VIRTUAL: "虚拟/服务核销", MIXED: "混合履约" }[value || "SHIPMENT"] ?? value ?? "-";
}

function productTypeText(value?: string | null) {
  return { PHYSICAL: "实物商品", VIRTUAL: "虚拟商品", SERVICE: "服务类商品" }[value || "PHYSICAL"] ?? value ?? "-";
}

function paymentModeText(value?: string | null) {
  return { disabled: "支付关闭", mock: "历史测试配置", wechat: "微信支付" }[value || "disabled"] ?? value ?? "-";
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

function paymentStatusText(value?: string | null) {
  return value ? ({ PENDING: "待支付", SUCCESS: "已支付", FAILED: "失败", CLOSED: "已关闭" }[value] ?? value) : "未创建";
}

function refundStatusText(value?: string | null) {
  return value ? ({ REQUESTED: "已申请", APPROVED: "已同意", PROCESSING: "处理中", SUCCESS: "已退款", FAILED: "失败", REJECTED: "已拒绝" }[value] ?? value) : "无退款";
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "历史测试记录", WECHAT: "微信支付" }[value] ?? value) : "-";
}
</script>

<style scoped>
.payment-config-panel {
  margin-bottom: 16px;
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.panel-heading h3 {
  margin: 0 0 6px;
}

.panel-heading p {
  margin: 0;
  color: var(--admin-color-text-muted, #64748b);
  font-size: 13px;
}

.payment-config-form {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.notify-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.payment-guide,
.readiness-list {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.payment-guide {
  align-items: center;
  color: var(--admin-color-text-muted, #64748b);
  font-size: 13px;
}

.payment-guide strong {
  color: var(--admin-color-text, #172033);
}

.readiness-list span {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  background: #fff7ed;
  color: #b45309;
  font-size: 12px;
  font-weight: 700;
}

.readiness-list span.ok {
  background: #ecfdf5;
  color: #047857;
}

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
