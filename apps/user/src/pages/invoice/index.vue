<template>
  <view class="page ui-page">
    <view class="form ui-card">
      <text class="title">发票申请</text>
      <input v-model="form.orderNo" class="field" placeholder="报名订单号" />
      <input v-model="form.title" class="field" placeholder="发票抬头" />
      <input v-model="form.taxNo" class="field" placeholder="税号（选填）" />
      <input v-model="form.email" class="field" placeholder="接收邮箱（选填）" />
      <button class="ui-button-primary" :loading="loading" @click="submit">提交申请</button>
    </view>
    <view v-for="invoice in invoices" :key="String(invoice.id)" class="item ui-card">
      <text class="name">{{ invoice.invoiceNo }}</text>
      <text class="muted">{{ invoice.title }} · {{ invoice.status }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { createInvoiceApplication, getMyInvoices } from "@/services/operations";

const loading = ref(false);
const invoices = ref<Array<Record<string, unknown>>>([]);
const form = reactive({ orderNo: "", title: "", taxNo: "", email: "" });

onMounted(() => void load());

async function load() {
  invoices.value = (await getMyInvoices()).items;
}

async function submit() {
  loading.value = true;
  try {
    await createInvoiceApplication(form);
    await load();
    uni.showToast({ title: "已提交", icon: "success" });
  } catch (err) {
    uni.showToast({ title: err instanceof Error ? err.message : "提交失败", icon: "none" });
  } finally {
    loading.value = false;
  }
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

.field {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  font-size: 26rpx;
}

.muted {
  color: var(--ui-color-muted);
  font-size: 24rpx;
}
</style>
