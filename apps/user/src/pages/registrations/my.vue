<template>
  <view class="page ui-page">
    <view class="hero">
      <view>
        <text class="eyebrow">报名记录</text>
        <text class="title">我的报名</text>
        <text class="subtitle">查看已确认报名、票种和支付信息。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="loadRegistrations">刷新</button>
    </view>

    <LoadingState v-if="loading" title="加载报名记录中" description="正在同步你的报名凭证。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="loadRegistrations" />
    <EmptyState
      v-else-if="items.length === 0"
      title="暂无报名记录"
      description="完成会议报名并支付成功后，报名凭证会显示在这里。"
      mark="证"
      action-text="去看会议"
      @action="goHome"
    />

    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-head">
          <view class="title-box">
            <text class="conference-title">{{ item.conference.title }}</text>
            <text class="registration-no">报名号：{{ item.registrationNo }}</text>
          </view>
          <StatusTag :label="statusText(item.status)" :tone="statusTone(item.status)" />
        </view>
        <view class="info-grid">
          <view class="info-item">
            <text class="label">票种</text>
            <text class="value">{{ item.sku.name }}</text>
          </view>
          <view class="info-item">
            <text class="label">参会人</text>
            <text class="value">{{ item.attendeeName }}</text>
          </view>
          <view class="info-item">
            <text class="label">手机号</text>
            <text class="value">{{ item.phone || "-" }}</text>
          </view>
          <view class="info-item">
            <text class="label">支付金额</text>
            <text class="price">¥{{ formatCent(item.paidAmountCent) }}</text>
          </view>
        </view>
        <view class="detail-lines">
          <text>订单号：{{ item.order.orderNo }}</text>
          <text>确认时间：{{ formatDateTime(item.confirmedAt) }}</text>
          <text>会议时间：{{ formatDateTime(item.conference.startsAt) }}</text>
        </view>
      </view>
    </view>
    <WechatProfilePrompt />
    <CustomTabbar active-page-key="my-registrations" />
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { getMyRegistrations } from "@/services/registration";
import type { MyRegistrationItem } from "@/services/registration-types";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const items = ref<MyRegistrationItem[]>([]);
const loading = ref(false);
const error = ref("");

onMounted(() => {
  void loadRegistrations();
});

async function loadRegistrations() {
  loading.value = true;
  error.value = "";

  try {
    await ensureLogin();
    items.value = await getMyRegistrations();
  } catch (err) {
    console.error("[MY_REGISTRATIONS_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "报名记录加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

function statusText(status: string): string {
  const map: Record<string, string> = {
    CONFIRMED: "已确认",
    CANCELLED: "已取消",
    REFUNDED: "已退款"
  };
  return map[status] ?? status;
}

function statusTone(status: string): "info" | "success" | "warning" | "danger" | "neutral" {
  if (status === "CONFIRMED") return "success";
  if (status === "CANCELLED") return "neutral";
  if (status === "REFUNDED") return "warning";
  return "info";
}
</script>

<style scoped>
.page {
  padding-bottom: 164rpx;
}

.hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 28rpx;
  padding-top: 32rpx;
}

.eyebrow {
  display: block;
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-text);
  font-size: 44rpx;
  font-weight: 900;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.card {
  padding: 28rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
}

.title-box {
  flex: 1;
  min-width: 0;
}

.conference-title {
  display: block;
  color: var(--ui-color-text);
  font-size: 32rpx;
  font-weight: 900;
  line-height: 1.35;
}

.registration-no {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-subtle);
  font-size: 23rpx;
  line-height: 1.45;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
  margin-top: 24rpx;
  padding: 22rpx;
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-muted);
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
  min-width: 0;
}

.label {
  color: var(--ui-color-subtle);
  font-size: 22rpx;
}

.value,
.price {
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1.4;
}

.price {
  color: var(--ui-color-primary);
  font-size: 28rpx;
  font-weight: 900;
}

.detail-lines {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  margin-top: 20rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.45;
}
</style>
