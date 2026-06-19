<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <text class="title">我的商城订单</text>
      <text class="subtitle">商城订单与会议报名订单分开管理。待支付订单完成支付后才会进入发货和售后流程。</text>
    </view>
    <LoadingState v-if="loading" title="加载商城订单" description="正在读取订单、履约和售后状态。" />
    <EmptyState v-else-if="orders.length === 0" title="暂无商城订单" description="购买商品后会显示在这里。" mark="商" />
    <view v-for="order in orders" v-else :key="order.id" class="order ui-card">
      <view class="order-head">
        <view>
          <text class="name">{{ order.orderNo }}</text>
          <text class="muted">{{ order.createdAt }}</text>
        </view>
        <StatusTag :label="orderStatusText(order)" :tone="order.status === 'PENDING_PAYMENT' ? 'warning' : 'info'" />
      </view>
      <view class="items">
        <text v-for="item in order.items" :key="item.id" class="muted">{{ item.productTitle }} / {{ item.skuName }} × {{ item.quantity }}</text>
      </view>
      <text class="price">¥{{ formatCent(order.payableAmountCent) }}</text>
      <text class="muted" v-if="order.paymentNotice">{{ order.paymentNotice }}</text>
      <view class="meta-row" v-if="latestPayment(order)">
        <text class="muted">支付：{{ paymentStatusText(latestPayment(order)?.status) }} / {{ providerText(latestPayment(order)?.provider) }}</text>
        <text class="muted" v-if="latestPayment(order)?.paidAt">支付时间：{{ latestPayment(order)?.paidAt }}</text>
      </view>
      <view class="meta-row" v-if="order.shipments.length">
        <text class="muted">履约：{{ order.shipments.map((item) => shipmentStatusText(item.status)).join(" / ") }}</text>
      </view>
      <view class="meta-row" v-if="order.afterSales.length">
        <text class="muted">售后：{{ order.afterSales.map((item) => afterSaleStatusText(item.status)).join(" / ") }}</text>
      </view>
      <view class="meta-row" v-if="latestRefund(order)">
        <text class="muted">退款：{{ refundStatusText(latestRefund(order)?.status) }}{{ latestRefund(order)?.failedReason ? `（${latestRefund(order)?.failedReason}）` : "" }}</text>
      </view>
      <view class="actions" v-if="order.status === 'PENDING_PAYMENT' || canRequestAfterSale(order)">
        <button v-if="order.status === 'PENDING_PAYMENT'" class="ui-button-primary ui-button-compact" :disabled="payingId === order.id || order.paymentEnabled === false" @click="payOrder(order)">
          {{ payingId === order.id ? "确认中..." : order.paymentEnabled === false ? "支付暂未开放" : payButtonText }}
        </button>
        <button v-if="canRequestAfterSale(order)" class="ui-button-secondary ui-button-compact" :disabled="submittingId === order.id" @click="requestAfterSale(order)">
          {{ submittingId === order.id ? "提交中..." : "申请售后" }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import { PAYMENT_MODE } from "@/config/app";
import { createMallAfterSale, getMyMallOrders, startMallOrderPayment, type MallOrder } from "@/services/operations";
import { formatCent } from "@/utils/money";

const loading = ref(false);
const submittingId = ref("");
const payingId = ref("");
const orders = ref<MallOrder[]>([]);
const payButtonText = PAYMENT_MODE === "mock" ? "测试支付" : "去支付";

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    orders.value = (await getMyMallOrders()).items;
  } finally {
    loading.value = false;
  }
}

function canRequestAfterSale(order: MallOrder) {
  return ["PAID", "SHIPPED", "COMPLETED"].includes(order.status) && !order.afterSales.some((item) => !["REJECTED", "CANCELLED", "COMPLETED"].includes(item.status));
}

async function payOrder(order: MallOrder) {
  if (order.paymentEnabled === false) {
    uni.showModal({
      title: "商城支付暂未开放",
      content: order.paymentNotice || "当前商城支付暂未开放；订单已创建，状态为待支付；请联系会务组或等待商城支付开放",
      showCancel: false
    });
    return;
  }
  payingId.value = order.id;
  try {
    await startMallOrderPayment(order.id);
    uni.showToast({ title: "支付成功", icon: "success" });
    await load();
  } catch (err) {
    console.error("[MALL_PAYMENT_ERROR]", err);
    uni.showToast({ title: "支付未完成，请稍后重试", icon: "none" });
    await load();
  } finally {
    payingId.value = "";
  }
}

async function requestAfterSale(order: MallOrder) {
  submittingId.value = order.id;
  try {
    await createMallAfterSale({ orderId: order.id, type: "REFUND", reason: "用户在小程序端申请售后" });
    uni.showToast({ title: "售后已提交", icon: "success" });
    await load();
  } catch (err) {
    console.error("[MALL_AFTERSALE_CREATE_ERROR]", err);
    uni.showToast({ title: "提交失败，请稍后重试", icon: "none" });
  } finally {
    submittingId.value = "";
  }
}

function orderStatusText(order: MallOrder) {
  if (order.fulfillmentType === "VIRTUAL") {
    return { PENDING_PAYMENT: "待支付", PAID: "待使用/待核销", SHIPPED: "待使用/待核销", COMPLETED: "已完成", CLOSED: "已关闭", REFUNDING: "售后中", REFUNDED: "已退款" }[order.status] ?? order.status;
  }
  return { PENDING_PAYMENT: "待支付", PAID: "已支付", SHIPPED: "已发货", COMPLETED: "已完成", CLOSED: "已关闭", REFUNDING: "售后中", REFUNDED: "已退款" }[order.status] ?? order.status;
}

function shipmentStatusText(value: string) {
  return { PENDING: "待处理", SHIPPED: "已发货", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}

function afterSaleStatusText(value: string) {
  return { REQUESTED: "已申请", APPROVED: "已同意", REJECTED: "已拒绝", PROCESSING: "处理中", COMPLETED: "已完成", CANCELLED: "已取消" }[value] ?? value;
}

function latestPayment(order: MallOrder) {
  return order.latestPayment || order.payments?.[0] || null;
}

function latestRefund(order: MallOrder) {
  return order.latestRefund || order.refunds?.[0] || null;
}

function paymentStatusText(value?: string | null) {
  return value ? ({ PENDING: "待支付", SUCCESS: "已支付", FAILED: "失败", CLOSED: "已关闭" }[value] ?? value) : "未创建";
}

function refundStatusText(value?: string | null) {
  return value ? ({ REQUESTED: "已申请", APPROVED: "已同意", PROCESSING: "处理中", SUCCESS: "已退款", FAILED: "失败", REJECTED: "已拒绝" }[value] ?? value) : "无退款";
}

function providerText(value?: string | null) {
  return value ? ({ MOCK: "Mock 测试", WECHAT: "微信支付" }[value] ?? value) : "-";
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.topbar,
.order {
  padding: 28rpx;
}

.order {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}

.order-head,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.title,
.name,
.price {
  display: block;
  color: var(--ui-color-text);
  font-weight: 900;
}

.title {
  font-size: 40rpx;
}

.name {
  font-size: 30rpx;
}

.price {
  color: var(--ui-color-primary);
  font-size: 32rpx;
}

.subtitle,
.muted {
  display: block;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.45;
}

.subtitle {
  margin-top: 8rpx;
}

.items,
.meta-row {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
</style>
