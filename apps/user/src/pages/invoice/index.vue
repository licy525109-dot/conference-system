<template>
  <view class="page ui-page">
    <view class="form ui-card">
      <text class="title">发票申请</text>
      <text class="hint">当前为人工开票流程，金额由后端按已支付订单计算。</text>
      <picker :range="sourceOptions" range-key="label" :value="sourceIndex" @change="onSourceChange">
        <view class="field picker">{{ sourceOptions[sourceIndex].label }}</view>
      </picker>
      <input v-model="form.orderNo" class="field" :placeholder="sourceOptions[sourceIndex].placeholder" />
      <input v-model="form.title" class="field" placeholder="发票抬头" />
      <input v-model="form.taxNo" class="field" placeholder="税号（选填）" />
      <input v-model="form.email" class="field" placeholder="接收邮箱（选填）" />
      <input v-model="form.phone" class="field" placeholder="接收手机号（选填）" />
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
      <text v-if="invoice.rejectReason" class="warning">驳回原因：{{ invoice.rejectReason }}</text>
      <text v-if="invoice.issuedInvoiceNo" class="muted">开票号：{{ invoice.issuedInvoiceNo }}</text>
      <text v-if="invoice.invoiceLink" class="link" @click="copyLink(String(invoice.invoiceLink))">复制发票链接</text>
    </view>
    <view v-if="!loading && invoices.length === 0" class="ui-card empty">暂无发票申请</view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { createInvoiceApplication, getMyInvoices } from "@/services/operations";

const loading = ref(false);
const invoices = ref<Array<Record<string, unknown>>>([]);
const sourceOptions = [
  { label: "报名订单", value: "REGISTRATION", placeholder: "报名订单号" },
  { label: "商城订单", value: "MALL", placeholder: "商城订单号" }
];
const sourceIndex = ref(0);
const form = reactive({ orderNo: "", title: "", taxNo: "", email: "", phone: "" });

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    invoices.value = (await getMyInvoices()).items;
  } finally {
    loading.value = false;
  }
}

function onSourceChange(event: { detail: { value: number } }) {
  sourceIndex.value = Number(event.detail.value || 0);
}

async function submit() {
  if (!form.orderNo.trim() || !form.title.trim()) {
    uni.showToast({ title: "请填写订单号和抬头", icon: "none" });
    return;
  }
  loading.value = true;
  try {
    await createInvoiceApplication({ ...form, sourceType: sourceOptions[sourceIndex.value].value as "REGISTRATION" | "MALL" });
    form.orderNo = "";
    form.title = "";
    form.taxNo = "";
    form.email = "";
    form.phone = "";
    await load();
    uni.showToast({ title: "已提交", icon: "success" });
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : "提交失败", icon: "none" });
  } finally {
    loading.value = false;
  }
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
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.form,
.item {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 28rpx;
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

.picker {
  display: flex;
  align-items: center;
}

.list-head,
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
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
