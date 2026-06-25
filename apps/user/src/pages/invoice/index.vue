<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <PageRenderer v-if="cmsPage" :dsl="cmsPage.version.dsl" :theme="theme" />

    <view class="form ui-card">
      <text class="title">发票申请</text>
      <text class="hint">当前为人工开票流程，金额由后端按已支付订单计算。</text>
      <picker :range="invoiceableOrders" range-key="label" :value="orderIndex" @change="onOrderChange">
        <view class="field picker">{{ selectedOrder ? selectedOrder.label : "请选择可开票订单" }}</view>
      </picker>
      <view v-if="selectedOrder" class="order-card">
        <text class="muted">{{ selectedOrder.sourceText }} · {{ selectedOrder.orderNo }}</text>
        <text class="muted">{{ selectedOrder.title }}</text>
        <text class="muted">支付金额 ¥{{ formatCent(selectedOrder.paidAmountCent) }} · 可开票 ¥{{ formatCent(selectedOrder.availableAmountCent) }}</text>
        <text class="muted">支付时间 {{ selectedOrder.paidAt || "-" }}</text>
      </view>
      <text v-else class="hint">只展示你本人已支付且仍有可开票额度的报名订单和商城订单。</text>
      <input v-model="form.title" class="field" placeholder="发票抬头" />
      <input v-model="form.taxNo" class="field" placeholder="税号（选填）" />
      <picker :range="invoiceTypeOptions" range-key="label" :value="invoiceTypeIndex" @change="onInvoiceTypeChange">
        <view class="field picker">发票类型：{{ invoiceTypeOptions[invoiceTypeIndex]?.label || "普通发票" }}</view>
      </picker>
      <input v-model="form.email" class="field" placeholder="接收邮箱（选填）" />
      <input v-model="form.phone" class="field" placeholder="接收手机号（选填）" />
      <input v-model="form.address" class="field" placeholder="注册地址（选填）" />
      <input v-model="form.bankName" class="field" placeholder="开户银行（选填）" />
      <input v-model="form.bankAccount" class="field" placeholder="银行账号（选填）" />
      <view class="save-row">
        <text>保存为常用发票信息</text>
        <switch :checked="saveAsDefault" @change="onSaveDefaultChange" />
      </view>
      <button class="ui-button-secondary" :loading="savingProfile" @click="saveProfile">仅保存常用信息</button>
      <button class="ui-button-primary" :loading="loading" @click="submit">提交申请</button>
    </view>

    <view class="list-head">
      <text class="title">我的发票</text>
      <button class="ui-button-secondary ui-button-compact" @click="load">刷新</button>
    </view>
    <view v-for="invoice in invoices" :key="String(invoice.id)" class="item ui-card">
      <view class="row">
        <text class="name">{{ invoice.invoiceNo }}</text>
        <text class="status">{{ statusText(String(invoice.status || "")) }}</text>
      </view>
      <text class="muted">{{ sourceText(String(invoice.sourceType || "REGISTRATION")) }} · {{ invoice.orderNo }}</text>
      <text class="muted">{{ invoice.title }} · ¥{{ formatCent(Number(invoice.amountCent || 0)) }}</text>
      <text v-if="invoice.email || invoice.phone" class="muted">接收：{{ invoice.email || "-" }} {{ invoice.phone || "" }}</text>
      <text v-if="invoice.rejectReason" class="warning">驳回原因：{{ invoice.rejectReason }}</text>
      <text v-if="invoice.issuedInvoiceNo" class="muted">开票号：{{ invoice.issuedInvoiceNo }}</text>
      <text v-if="invoice.invoiceLink" class="link" @click="copyLink(String(invoice.invoiceLink))">复制发票链接</text>
    </view>
    <view v-if="!loading && invoices.length === 0" class="ui-card empty">暂无发票申请</view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import PageRenderer from "@/components/PageRenderer.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
import { createInvoiceApplication, getMyInvoiceableOrders, getMyInvoiceProfile, getMyInvoices, saveMyInvoiceProfile, type InvoiceableOrder } from "@/services/operations";

const loading = ref(false);
const invoices = ref<Array<Record<string, unknown>>>([]);
const invoiceableOrders = ref<Array<InvoiceableOrder & { label: string }>>([]);
const orderIndex = ref(0);
const savingProfile = ref(false);
const saveAsDefault = ref(true);
const cmsPage = ref<PublishedPage | null>(null);
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("invoice");
const invoiceTypeOptions = [
  { label: "普通发票", value: "GENERAL" },
  { label: "专用发票", value: "SPECIAL" }
];
const invoiceTypeIndex = ref(0);
const form = reactive({ title: "", taxNo: "", invoiceType: "GENERAL", email: "", phone: "", address: "", bankName: "", bankAccount: "" });
const selectedOrder = computed(() => invoiceableOrders.value[orderIndex.value] ?? null);

onMounted(() => {
  void refreshTheme();
  void load();
});

async function load() {
  loading.value = true;
  try {
    const [invoiceData, orderData, profileData, page] = await Promise.all([getMyInvoices(), getMyInvoiceableOrders(), getMyInvoiceProfile(), getPublishedPage("invoice")]);
    invoices.value = invoiceData.items;
    invoiceableOrders.value = orderData.items.map((item) => ({
      ...item,
      label: `${item.sourceText}｜${item.title}｜可开票 ¥${formatCent(item.availableAmountCent)}`
    }));
    if (orderIndex.value >= invoiceableOrders.value.length) orderIndex.value = 0;
    if (profileData.item && !form.title) fillForm(profileData.item as unknown as Record<string, unknown>);
    cmsPage.value = page;
  } finally {
    loading.value = false;
  }
}

function onOrderChange(event: { detail: { value: number } }) {
  orderIndex.value = Number(event.detail.value || 0);
}

function onInvoiceTypeChange(event: { detail: { value: number } }) {
  invoiceTypeIndex.value = Number(event.detail.value || 0);
  form.invoiceType = invoiceTypeOptions[invoiceTypeIndex.value]?.value || "GENERAL";
}

function onSaveDefaultChange(event: Event) {
  saveAsDefault.value = Boolean((event as unknown as { detail?: { value?: boolean } }).detail?.value);
}

async function submit() {
  if (!selectedOrder.value) {
    uni.showToast({ title: "请选择可开票订单", icon: "none" });
    return;
  }
  if (!form.title.trim()) {
    uni.showToast({ title: "请填写发票抬头", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    await createInvoiceApplication({ ...form, saveAsDefault: saveAsDefault.value, sourceType: selectedOrder.value.sourceType, orderNo: selectedOrder.value.orderNo });
    await load();
    uni.showToast({ title: "已提交", icon: "success" });
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : "提交失败", icon: "none" });
  } finally {
    loading.value = false;
  }
}

async function saveProfile() {
  if (!form.title.trim()) {
    uni.showToast({ title: "请填写发票抬头", icon: "none" });
    return;
  }
  savingProfile.value = true;
  try {
    await saveMyInvoiceProfile({ ...form, title: form.title.trim() });
    uni.showToast({ title: "已保存", icon: "success" });
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : "保存失败", icon: "none" });
  } finally {
    savingProfile.value = false;
  }
}

function fillForm(profile: Record<string, unknown>) {
  form.title = String(profile.title || "");
  form.taxNo = String(profile.taxNo || "");
  form.invoiceType = String(profile.invoiceType || "GENERAL");
  form.email = String(profile.email || "");
  form.phone = String(profile.phone || "");
  form.address = String(profile.address || "");
  form.bankName = String(profile.bankName || "");
  form.bankAccount = String(profile.bankAccount || "");
  invoiceTypeIndex.value = Math.max(0, invoiceTypeOptions.findIndex((item) => item.value === form.invoiceType));
}

function copyLink(value: string) {
  uni.setClipboardData({ data: value });
}

function sourceText(value: string) {
  return value === "MALL" ? "商城" : "报名";
}

function statusText(value: string) {
  return { REQUESTED: "待审核", APPROVED: "已通过", ISSUED: "已开票", REJECTED: "已驳回" }[value] || value;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}
</script>

<style scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.form,
.item {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 28rpx;
}

.list-head,
.empty,
.page :deep(.cms-page) {
  position: relative;
  z-index: 1;
}

.title,
.name {
  color: var(--ui-color-text);
  font-size: 32rpx;
  font-weight: 900;
}

.hint,
.muted {
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.6;
}

.field {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  font-size: 26rpx;
}

.order-card {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: rgb(255 255 255 / 92%);
}

.picker {
  display: flex;
  align-items: center;
}

.list-head,
.row,
.save-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.save-row {
  min-height: 72rpx;
  color: var(--ui-color-text);
  font-size: 26rpx;
}

.status {
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.warning {
  color: #b45309;
  font-size: 24rpx;
}

.link {
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.empty {
  padding: 32rpx;
  color: var(--ui-color-muted);
  text-align: center;
}
</style>
