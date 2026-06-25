<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <PageRenderer v-if="cmsPage" :dsl="cmsPage.version.dsl" :theme="theme" />

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
        <button v-if="canRequestAfterSale(order)" class="ui-button-secondary ui-button-compact" :disabled="submittingId === order.id" @click="openAfterSale(order)">
          申请售后
        </button>
      </view>
    </view>

    <view v-if="afterSaleVisible" class="sheet-mask" @click="closeAfterSale">
      <view class="sheet ui-card" @click.stop>
        <view class="sheet-head">
          <view>
            <text class="title">申请售后</text>
            <text class="muted">{{ afterSaleOrder?.orderNo }}</text>
          </view>
          <button class="ui-button-secondary ui-button-compact" @click="closeAfterSale">关闭</button>
        </view>
        <picker :range="afterSaleTypeOptions" range-key="label" :value="afterSaleTypeIndex" @change="onAfterSaleTypeChange">
          <view class="field picker">售后类型：{{ afterSaleTypeOptions[afterSaleTypeIndex]?.label }}</view>
        </picker>
        <textarea v-model="afterSaleForm.reason" class="field textarea" maxlength="200" placeholder="请填写售后原因（必填）" />
        <textarea v-model="afterSaleForm.note" class="field textarea small" maxlength="200" placeholder="补充说明（选填）" />
        <view class="upload-head">
          <text class="muted">凭证图片（最多 6 张，JPG/PNG/WebP，单张不超过 2MB）</text>
          <button class="ui-button-secondary ui-button-compact" :disabled="uploading || afterSaleForm.attachments.length >= 6" @click="chooseAfterSaleImages">
            {{ uploading ? "上传中..." : "添加图片" }}
          </button>
        </view>
        <view v-if="afterSaleForm.attachments.length" class="image-list">
          <view v-for="(url, index) in afterSaleForm.attachments" :key="url" class="image-item">
            <image :src="url" mode="aspectFill" />
            <text @click="removeAfterSaleImage(index)">移除</text>
          </view>
        </view>
        <button class="ui-button-primary" :loading="!!submittingId" @click="submitAfterSale">
          {{ submittingId ? "提交中..." : "提交售后申请" }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
import { createMallAfterSale, getMyMallOrders, startMallOrderPayment, uploadMallAfterSaleAttachment, type MallOrder } from "@/services/operations";
import { formatCent } from "@/utils/money";

const loading = ref(false);
const submittingId = ref("");
const payingId = ref("");
const orders = ref<MallOrder[]>([]);
const payButtonText = "去支付";
const cmsPage = ref<PublishedPage | null>(null);
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("mall-orders");
const uploading = ref(false);
const afterSaleVisible = ref(false);
const afterSaleOrder = ref<MallOrder | null>(null);
const afterSaleTypeOptions = [
  { label: "仅退款", value: "REFUND" },
  { label: "退货退款", value: "RETURN_REFUND" },
  { label: "换货", value: "EXCHANGE" }
];
const afterSaleTypeIndex = ref(0);
const afterSaleForm = ref({ type: "REFUND", reason: "", note: "", attachments: [] as string[] });

onMounted(() => {
  void refreshTheme();
  void load();
});

async function load() {
  loading.value = true;
  try {
    const [orderData, page] = await Promise.all([getMyMallOrders(), getPublishedPage("mall-orders")]);
    orders.value = orderData.items;
    cmsPage.value = page;
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

function openAfterSale(order: MallOrder) {
  afterSaleOrder.value = order;
  afterSaleForm.value = { type: "REFUND", reason: "", note: "", attachments: [] };
  afterSaleTypeIndex.value = 0;
  afterSaleVisible.value = true;
}

function closeAfterSale() {
  if (submittingId.value || uploading.value) return;
  afterSaleVisible.value = false;
  afterSaleOrder.value = null;
}

function onAfterSaleTypeChange(event: { detail: { value: number } }) {
  afterSaleTypeIndex.value = Number(event.detail.value || 0);
  afterSaleForm.value.type = afterSaleTypeOptions[afterSaleTypeIndex.value]?.value || "REFUND";
}

function chooseAfterSaleImages() {
  const remaining = 6 - afterSaleForm.value.attachments.length;
  if (remaining <= 0) return;
  uni.chooseImage({
    count: remaining,
    sizeType: ["compressed"],
    success: (res) => void uploadAfterSaleImages(Array.isArray(res.tempFilePaths) ? res.tempFilePaths : [res.tempFilePaths].filter(Boolean) as string[])
  });
}

async function uploadAfterSaleImages(paths: string[]) {
  uploading.value = true;
  try {
    for (const path of paths.slice(0, 6 - afterSaleForm.value.attachments.length)) {
      const url = await uploadMallAfterSaleAttachment(path);
      afterSaleForm.value.attachments.push(url);
    }
  } catch (err) {
    console.error("[MALL_AFTERSALE_UPLOAD_ERROR]", err);
    uni.showToast({ title: err instanceof Error ? err.message : "凭证上传失败", icon: "none" });
  } finally {
    uploading.value = false;
  }
}

function removeAfterSaleImage(index: number) {
  afterSaleForm.value.attachments.splice(index, 1);
}

async function submitAfterSale() {
  const order = afterSaleOrder.value;
  if (!order) return;
  if (!afterSaleForm.value.reason.trim()) {
    uni.showToast({ title: "请填写售后原因", icon: "none" });
    return;
  }
  submittingId.value = order.id;
  try {
    await createMallAfterSale({
      orderId: order.id,
      type: afterSaleForm.value.type,
      reason: afterSaleForm.value.reason.trim(),
      note: afterSaleForm.value.note.trim(),
      attachments: afterSaleForm.value.attachments
    });
    afterSaleVisible.value = false;
    afterSaleOrder.value = null;
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
  return value ? ({ MOCK: "历史测试记录", WECHAT: "微信支付" }[value] ?? value) : "-";
}
</script>

<style scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.topbar,
.order {
  position: relative;
  z-index: 1;
  padding: 28rpx;
}

.page :deep(.cms-page) {
  position: relative;
  z-index: 1;
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

.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-end;
  background: rgb(15 23 42 / 45%);
}

.sheet {
  width: 100%;
  max-height: 84vh;
  overflow-y: auto;
  padding: 28rpx;
  border-radius: 28rpx 28rpx 0 0;
}

.sheet-head,
.upload-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 16rpx;
}

.field {
  width: 100%;
  min-height: 82rpx;
  box-sizing: border-box;
  margin-bottom: 16rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  color: var(--ui-color-text);
  font-size: 26rpx;
}

.textarea {
  min-height: 150rpx;
}

.textarea.small {
  min-height: 110rpx;
}

.image-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;
  margin-bottom: 20rpx;
}

.image-item {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: var(--ui-radius-md);
  background: #f1f5f9;
}

.image-item image {
  width: 100%;
  height: 100%;
}

.image-item text {
  position: absolute;
  right: 8rpx;
  bottom: 8rpx;
  padding: 4rpx 10rpx;
  border-radius: 999rpx;
  background: rgb(15 23 42 / 72%);
  color: #fff;
  font-size: 22rpx;
}
</style>
