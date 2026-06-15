<template>
  <view class="page">
    <view class="topbar">
      <text class="title">我的报名</text>
      <view class="topbar-actions">
        <button class="ghost-button compact" @click="goHome">返回首页</button>
        <button class="ghost-button compact" @click="loadRegistrations">刷新</button>
      </view>
    </view>

    <view v-if="loading" class="state">加载报名记录中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadRegistrations">重试</button>
    </view>
    <view v-else-if="items.length === 0" class="state">暂无报名记录</view>

    <view v-else class="list">
      <view v-for="item in items" :key="item.id" class="card">
        <view class="card-head">
          <text class="conference-title">{{ item.conference.title }}</text>
          <text class="status">{{ item.status }}</text>
        </view>
        <view class="info">
          <text>报名规格：{{ item.sku.name }}</text>
          <text>报名人：{{ item.attendeeName }}</text>
          <text>手机号：{{ item.phone }}</text>
          <text>支付金额：¥{{ formatCent(item.paidAmountCent) }}</text>
          <text>订单号：{{ item.order.orderNo }}</text>
          <text>确认时间：{{ formatDateTime(item.confirmedAt) }}</text>
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
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx;
  box-sizing: border-box;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

.topbar-actions {
  display: flex;
  gap: 12rpx;
}

.title {
  color: #172033;
  font-size: 40rpx;
  font-weight: 800;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.card {
  padding: 28rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 18rpx;
}

.conference-title {
  flex: 1;
  color: #172033;
  font-size: 31rpx;
  font-weight: 800;
  line-height: 1.35;
}

.status {
  color: #2452a8;
  font-size: 25rpx;
  font-weight: 800;
}

.info {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  color: #5c6b82;
  font-size: 26rpx;
  line-height: 1.45;
}

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
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
  width: 176rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 96rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
