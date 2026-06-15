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
      <button v-if="orderNo" class="primary-button compact" @click="loadStatus">重试</button>
      <button class="ghost-button compact" @click="goHome">返回首页</button>
    </view>

    <view v-if="orderNo" class="actions">
      <button v-if="orderNo && paymentStatus?.status !== 'PAID'" class="primary-button" :disabled="confirming" @click="confirmPay">
        {{ confirming ? "确认中..." : paymentActionLabel }}
      </button>
      <button class="ghost-button" @click="goHome">返回首页</button>
      <button v-if="orderNo" class="ghost-button" @click="loadStatus">刷新状态</button>
      <button class="ghost-button" @click="goMyRegistrations">我的报名</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { getPaymentActionLabel, getPaymentStatus, startOrderPayment, type PaymentStatusResponse } from "@/services/payment";
import { ApiRequestError } from "@/services/request";
import { formatDateTime } from "@/utils/date";
import { goHome } from "@/utils/navigation";

const orderNo = ref("");
const paymentStatus = ref<PaymentStatusResponse | null>(null);
const loading = ref(false);
const confirming = ref(false);
const error = ref("");
const paymentActionLabel = getPaymentActionLabel();

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
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await ensureLogin();
    paymentStatus.value = await getPaymentStatus(orderNo.value);
  } catch (err) {
    console.error("[PAYMENT_STATUS_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "支付状态查询失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

async function confirmPay() {
  confirming.value = true;
  error.value = "";

  try {
    await ensureLogin();
    paymentStatus.value = await startOrderPayment(orderNo.value);
    await loadStatus();
    uni.showToast({ title: "支付已确认", icon: "success" });
  } catch (err) {
    console.error("[PAYMENT_CONFIRM_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
      uni.showToast({
        title: error.value,
        icon: "none"
      });
      return;
    }

    error.value = buildPaymentErrorMessage(err);

    uni.showToast({
      title: error.value,
      icon: "none"
    });
  } finally {
    confirming.value = false;
  }
}

function buildPaymentErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (isInvalidWechatIdentityMessage(err.responseMessage)) {
      return "当前订单未绑定有效微信身份，请返回重新下单支付。";
    }
    if (err.statusCode === 401 || err.statusCode === 403) {
      return EXPIRED_LOGIN_REENTRY_MESSAGE;
    }
    if (err.statusCode === 404) {
      return "未找到订单，请返回后重新进入支付页";
    }
    if (err.statusCode === 409) {
      return "订单当前状态不支持支付，请刷新状态后重试";
    }
    if (typeof err.statusCode === "number" && err.statusCode >= 500) {
      return "支付服务暂时不可用，请稍后重试";
    }
    return err.errMsg ? "网络异常，请检查网络后重试" : "支付发起失败，请稍后重试";
  }

  if (err instanceof Error && err.message.includes("cancel")) {
    return "你已取消支付，订单仍为待支付，可稍后继续支付。";
  }
  return "支付未完成，请稍后重试";
}

function isInvalidWechatIdentityMessage(message: string | undefined): boolean {
  return Boolean(
    message?.includes("当前订单未绑定有效微信身份") || message?.includes("A real WeChat openid is required for WeChat Pay")
  );
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
