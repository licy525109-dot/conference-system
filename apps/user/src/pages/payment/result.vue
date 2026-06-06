<template>
  <view class="page">
    <view class="section">
      <text class="eyebrow">支付状态</text>
      <text class="title">{{ statusText }}</text>
      <text class="summary">订单号：{{ orderNo || "-" }}</text>
      <text v-if="paymentStatus?.paidAt" class="summary">支付时间：{{ formatDateTime(paymentStatus.paidAt) }}</text>
    </view>

    <view v-if="loading" class="state">查询支付状态中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadStatus">重试</button>
    </view>

    <view class="actions">
      <button v-if="paymentStatus?.status !== 'PAID'" class="primary-button" :disabled="confirming" @click="confirmPay">
        {{ confirming ? "确认中..." : "开发环境 mock 支付成功" }}
      </button>
      <button class="ghost-button" @click="loadStatus">刷新状态</button>
      <button class="ghost-button" @click="goMyRegistrations">我的报名</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { ensureLogin } from "@/services/auth";
import { confirmMockPayment, getPaymentStatus, type PaymentStatusResponse } from "@/services/payment";
import { formatDateTime } from "@/utils/date";

const orderNo = ref("");
const paymentStatus = ref<PaymentStatusResponse | null>(null);
const loading = ref(false);
const confirming = ref(false);
const error = ref("");

const statusText = computed(() => {
  if (paymentStatus.value?.status === "PAID") {
    return "已支付";
  }
  if (paymentStatus.value?.status === "PENDING") {
    return "待支付";
  }
  return paymentStatus.value?.status || "待查询";
});

onLoad((query) => {
  orderNo.value = String(query?.orderNo || "");
  void loadStatus();
});

async function loadStatus() {
  if (!orderNo.value) {
    error.value = "缺少订单号";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await ensureLogin();
    paymentStatus.value = await getPaymentStatus(orderNo.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "支付状态查询失败";
  } finally {
    loading.value = false;
  }
}

async function confirmPay() {
  confirming.value = true;
  error.value = "";

  try {
    await ensureLogin();
    await confirmMockPayment(orderNo.value);
    await loadStatus();
    uni.showToast({ title: "支付成功", icon: "success" });
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : "mock 支付失败",
      icon: "none"
    });
  } finally {
    confirming.value = false;
  }
}

function goMyRegistrations() {
  uni.navigateTo({
    url: "/pages/registrations/my"
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx;
  box-sizing: border-box;
}

.section {
  padding: 32rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.eyebrow,
.summary {
  display: block;
  color: #5c6b82;
  font-size: 26rpx;
  line-height: 1.5;
}

.title {
  display: block;
  margin: 12rpx 0;
  color: #172033;
  font-size: 44rpx;
  font-weight: 800;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-top: 28rpx;
}

.primary-button,
.ghost-button {
  min-height: 78rpx;
  border-radius: 8px;
  font-size: 28rpx;
  line-height: 78rpx;
}

.primary-button {
  background: #2452a8;
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #ccd7e6;
  background: #ffffff;
  color: #2452a8;
}

.compact {
  width: 200rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 56rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
