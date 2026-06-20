<template>
  <view class="page ui-page">
    <view class="hero ui-card">
      <text class="eyebrow">工作人员</text>
      <text class="title">扫码签到</text>
      <text class="subtitle">仅限管理员或有核销权限的工作人员使用。请扫描客户报名凭证二维码。</text>
    </view>

    <view class="ui-card action-card">
      <text class="account-line">{{ admin ? `当前账号：${admin.displayName || admin.username}` : "未绑定后台账号" }}</text>
      <text class="permission-line">{{ admin ? (hasCheckinWrite ? "权限状态：可扫码签到" : "权限状态：缺少 checkin:write") : "请先绑定后台账号后使用扫码签到" }}</text>
      <button class="ui-button-primary" :loading="loading" :disabled="!canScan" @click="scan">扫码核销</button>
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
import { computed, onMounted, ref } from "vue";
import { createMobileAdminSession, getStoredMobileAdmin, scanCheckinCredential, type MobileAdminUser } from "@/services/admin-mobile";
import { formatDateTime } from "@/utils/date";

const loading = ref(false);
const error = ref("");
const admin = ref<MobileAdminUser | null>(getStoredMobileAdmin());
const result = ref<Awaited<ReturnType<typeof scanCheckinCredential>> | null>(null);
const hasCheckinWrite = computed(() => Boolean(admin.value?.permissions?.includes("*") || admin.value?.permissions?.includes("checkin:write")));
const canScan = computed(() => Boolean(admin.value && hasCheckinWrite.value));

onMounted(() => void refreshAdminSession());

async function refreshAdminSession() {
  try {
    const session = await createMobileAdminSession();
    admin.value = session.admin;
  } catch {
    admin.value = getStoredMobileAdmin();
  }
}

async function scan() {
  if (!admin.value) {
    error.value = "请先绑定后台账号";
    return;
  }
  if (!hasCheckinWrite.value) {
    error.value = "当前后台账号暂无 checkin:write 权限，请联系管理员授权";
    return;
  }
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
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

.account-line,
.permission-line {
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.error {
  color: #dc2626;
}
</style>
