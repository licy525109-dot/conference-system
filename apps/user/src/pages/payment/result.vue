<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <LoadingState v-if="loading" title="查询支付状态中" description="正在确认订单与报名记录。" />
    <ErrorState
      v-else-if="error"
      :title="errorTitle"
      :message="error"
      primary-text="刷新状态"
      secondary-text="返回首页"
      @retry="loadStatus"
      @secondary="goHome"
    />

    <ResultState
      v-else
      :tone="resultTone"
      :title="resultTitle"
      :description="resultDescription"
      :order-no="orderNo || '-'"
      :time-text="paymentStatus?.paidAt ? formatDateTime(paymentStatus.paidAt) : ''"
    >
      <view class="actions">
        <button
          v-if="orderNo && paymentStatus?.status !== 'PAID'"
          class="ui-button-primary action"
          :disabled="confirming"
          @click="confirmPay"
        >
          {{ confirming ? "确认中..." : paymentActionLabel }}
        </button>
        <button v-if="orderNo" class="ui-button-secondary action" @click="loadStatus">刷新状态</button>
        <button v-if="paymentStatus?.status === 'PAID'" class="ui-button-primary action" @click="goMyRegistrations">查看我的报名</button>
        <button v-else class="ui-button-secondary action" @click="goMyRegistrations">我的报名</button>
        <button class="ui-button-secondary action" @click="goHome">返回首页</button>
      </view>
    </ResultState>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import ResultState from "@/components/ui/ResultState.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { getPaymentActionLabel, getPaymentStatus, startOrderPayment, type PaymentStatusResponse } from "@/services/payment";
import { buildPaymentErrorMessage } from "@/services/paymentError";
import { formatDateTime } from "@/utils/date";
import { goHome } from "@/utils/navigation";

const orderNo = ref("");
const paymentStatus = ref<PaymentStatusResponse | null>(null);
const loading = ref(false);
const confirming = ref(false);
const error = ref("");
const errorContext = ref<"status" | "payment">("status");
const paymentActionLabel = getPaymentActionLabel();
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("payment-result");

const resultTitle = computed(() => {
  if (paymentStatus.value?.status === "PAID") {
    return "支付成功";
  }
  if (paymentStatus.value?.status === "PENDING") {
    return "等待支付";
  }
  if (paymentStatus.value?.status === "CANCELLED" || paymentStatus.value?.status === "CLOSED") {
    return "订单已关闭";
  }
  if (paymentStatus.value?.paymentStatus === "FAILED") {
    return "支付未完成";
  }
  return "待确认";
});
const resultDescription = computed(() => {
  if (paymentStatus.value?.status === "PAID") {
    return "报名记录已生成，请在我的报名中查看参会信息。";
  }
  if (paymentStatus.value?.status === "PENDING") {
    return "订单仍在待支付状态，可继续发起支付或刷新状态。";
  }
  if (paymentStatus.value?.status === "CANCELLED" || paymentStatus.value?.status === "CLOSED") {
    return "当前订单不可继续支付，请返回会议详情重新报名。";
  }
  return "支付结果可能仍在同步，请刷新状态确认。";
});
const resultTone = computed<"success" | "warning" | "danger" | "info">(() => {
  if (paymentStatus.value?.status === "PAID") return "success";
  if (paymentStatus.value?.status === "CANCELLED" || paymentStatus.value?.status === "CLOSED") return "danger";
  if (paymentStatus.value?.paymentStatus === "FAILED") return "danger";
  if (paymentStatus.value?.status === "PENDING") return "warning";
  return "info";
});
const errorTitle = computed(() => errorContext.value === "payment" ? "支付未完成" : "支付状态查询异常");

onLoad((query) => {
  orderNo.value = String(query?.orderNo || "");
  void refreshTheme();
  void loadStatus();
});

async function loadStatus() {
  errorContext.value = "status";
  if (!orderNo.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await ensureLogin();
    paymentStatus.value = await getPaymentStatus(orderNo.value);
    redirectToCredentialIfPaid();
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
  errorContext.value = "payment";
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

    error.value = buildPaymentErrorMessage(err, EXPIRED_LOGIN_REENTRY_MESSAGE);

    uni.showToast({
      title: error.value,
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

function redirectToCredentialIfPaid() {
  if (paymentStatus.value?.status !== "PAID" || !paymentStatus.value.registrationId) {
    return;
  }
  uni.redirectTo({
    url: `/pages/registration-success/index?registrationId=${encodeURIComponent(paymentStatus.value.registrationId)}&orderNo=${encodeURIComponent(orderNo.value)}`
  });
}
</script>

<style scoped>
.page {
  padding-bottom: 64rpx;
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.action {
  width: 100%;
}
</style>
