<template>
  <view class="page ui-page">
    <view class="hero ui-card">
      <text class="eyebrow">工作人员</text>
      <text class="title">扫码签到</text>
      <text class="subtitle">仅限管理员或有核销权限的工作人员使用。请扫描客户报名凭证二维码。</text>
    </view>

    <view class="ui-card action-card">
      <button class="ui-button-primary" :loading="loading" @click="scan">扫码核销</button>
      <button class="ui-button-secondary" @click="openAdminBind">绑定管理员账号</button>
      <text v-if="error" class="error">{{ error }}</text>
    </view>

    <view v-if="result" class="ui-card result-card">
      <text class="result-title">{{ result.message }}</text>
      <text class="result-line">报名号：{{ result.registrationNo }}</text>
      <text class="result-line">参会人：{{ result.attendeeName }}</text>
      <text class="result-line">签到时间：{{ result.checkedInAt ? formatDateTime(result.checkedInAt) : "-" }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { ensureMobileAdminSession, scanCheckinCredential } from "@/services/admin-mobile";
import { formatDateTime } from "@/utils/date";

const loading = ref(false);
const error = ref("");
const result = ref<Awaited<ReturnType<typeof scanCheckinCredential>> | null>(null);

async function scan() {
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    await ensureMobileAdminSession();
    const qrPayload = await scanQrCode();
    result.value = await scanCheckinCredential(qrPayload);
    uni.showToast({ title: result.value.message, icon: "success" });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "扫码核销失败";
  } finally {
    loading.value = false;
  }
}

function scanQrCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.scanCode({
      onlyFromCamera: true,
      scanType: ["qrCode"],
      success: (response) => {
        if (response.result) resolve(response.result);
        else reject(new Error("未识别到二维码内容"));
      },
      fail: (err) => reject(new Error(err.errMsg || "扫码失败"))
    });
  });
}

function openAdminBind() {
  uni.navigateTo({ url: "/pages/admin/notifications/index" });
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.hero,
.action-card,
.result-card {
  padding: 28rpx;
}

.eyebrow {
  display: block;
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.title,
.result-title {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-text);
  font-size: 44rpx;
  font-weight: 900;
}

.subtitle,
.result-line,
.error {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.action-card {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.error {
  color: #dc2626;
}
</style>
