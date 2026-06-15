<template>
  <view v-if="visible && miniProgramEnabled" class="profile-mask">
    <view class="profile-dialog">
      <text class="dialog-title">完善微信资料</text>
      <text class="dialog-summary">用于报名信息识别</text>

      <view class="profile-preview">
        <button class="avatar-button" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
          <image v-if="displayAvatarUrl" class="avatar-image" :src="displayAvatarUrl" mode="aspectFill" @error="avatarLoadFailed = true" />
          <text v-else class="avatar-placeholder">头像</text>
        </button>
        <text class="preview-name">{{ previewName }}</text>
      </view>

      <view class="field">
        <text class="label">微信昵称</text>
        <input
          class="nickname-input"
          type="nickname"
          placeholder="请输入微信昵称"
          :value="wechatNickname"
          @input="onNicknameInput"
        />
      </view>

      <view v-if="error" class="error-text">{{ error }}</view>

      <view class="actions">
        <button class="ghost-button" @click="dismiss">稍后再说</button>
        <button class="primary-button" :disabled="saving" @click="saveProfile">
          {{ saving ? "保存中..." : "保存资料" }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { ensureLogin } from "@/services/auth";
import { getWechatProfile, updateWechatProfile, uploadWechatAvatar } from "@/services/profile";

const miniProgramEnabled = ref(false);
const visible = ref(false);
const saving = ref(false);
const error = ref("");
const wechatNickname = ref("");
const wechatAvatarUrl = ref("");
const pendingAvatarPath = ref("");
const avatarLoadFailed = ref(false);

const displayAvatarUrl = computed(() => (avatarLoadFailed.value ? "" : pendingAvatarPath.value || wechatAvatarUrl.value));
const previewName = computed(() => wechatNickname.value.trim() || "请选择头像并填写昵称");

onMounted(() => {
  // #ifdef MP-WEIXIN
  miniProgramEnabled.value = true;
  void checkProfile();
  // #endif
});

async function checkProfile() {
  try {
    await ensureLogin();
    const profile = await getWechatProfile();
    wechatNickname.value = profile.wechatNickname || "";
    wechatAvatarUrl.value = profile.wechatAvatarUrl || "";
    visible.value = !wechatNickname.value || !wechatAvatarUrl.value;
  } catch (err) {
    console.error("[WECHAT_PROFILE_PROMPT_LOAD_ERROR]", err);
  }
}

function onChooseAvatar(event: unknown) {
  const avatarUrl = readEventAvatarUrl(event);
  if (!avatarUrl) {
    uni.showToast({ title: "未选择头像", icon: "none" });
    return;
  }

  pendingAvatarPath.value = avatarUrl;
  avatarLoadFailed.value = false;
  error.value = "";
}

function onNicknameInput(event: unknown) {
  wechatNickname.value = String(readEventValue(event) ?? "");
  error.value = "";
}

async function saveProfile() {
  if (!wechatNickname.value.trim()) {
    error.value = "请填写微信昵称";
    return;
  }

  if (!pendingAvatarPath.value && !wechatAvatarUrl.value) {
    error.value = "请选择微信头像";
    return;
  }

  saving.value = true;
  error.value = "";
  try {
    await ensureLogin();
    let avatarUrl = wechatAvatarUrl.value || null;
    if (pendingAvatarPath.value && !isRemoteUrl(pendingAvatarPath.value)) {
      avatarUrl = await uploadWechatAvatar(pendingAvatarPath.value);
    } else if (pendingAvatarPath.value) {
      avatarUrl = pendingAvatarPath.value;
    }

    const user = await updateWechatProfile({
      wechatNickname: wechatNickname.value.trim(),
      wechatAvatarUrl: avatarUrl
    });

    wechatNickname.value = user.wechatNickname || "";
    wechatAvatarUrl.value = user.wechatAvatarUrl || "";
    pendingAvatarPath.value = "";
    visible.value = false;
    uni.showToast({ title: "微信资料已保存", icon: "success" });
  } catch (err) {
    console.error("[WECHAT_PROFILE_PROMPT_SAVE_ERROR]", err);
    error.value = "微信资料保存失败，请稍后重试";
  } finally {
    saving.value = false;
  }
}

function dismiss() {
  visible.value = false;
}

function readEventAvatarUrl(event: unknown): string {
  if (typeof event === "object" && event !== null && "detail" in event) {
    const detail = (event as { detail?: { avatarUrl?: unknown } }).detail;
    return typeof detail?.avatarUrl === "string" ? detail.avatarUrl : "";
  }

  return "";
}

function readEventValue(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "detail" in event) {
    const detail = (event as { detail?: { value?: unknown } }).detail;
    return detail?.value;
  }

  return undefined;
}

function isRemoteUrl(value: string): boolean {
  return value.startsWith("http://") || value.startsWith("https://");
}
</script>

<style scoped>
.profile-mask {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
  background: rgba(15, 23, 42, 0.45);
  box-sizing: border-box;
}

.profile-dialog {
  width: 100%;
  max-width: 640rpx;
  padding: 38rpx 36rpx 34rpx;
  border-radius: 8px;
  background: #ffffff;
  box-sizing: border-box;
}

.dialog-title {
  display: block;
  color: #172033;
  font-size: 36rpx;
  font-weight: 800;
  text-align: center;
}

.dialog-summary {
  display: block;
  margin: 10rpx 0 28rpx;
  color: #627087;
  font-size: 26rpx;
  line-height: 1.5;
  text-align: center;
}

.profile-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 28rpx;
}

.avatar-button {
  width: 132rpx;
  height: 132rpx;
  margin: 0;
  padding: 0;
  border-radius: 8px;
  background: #eef4ff;
  color: #2452a8;
  font-size: 26rpx;
  line-height: 132rpx;
}

.avatar-button::after {
  border: 0;
}

.avatar-image {
  width: 132rpx;
  height: 132rpx;
  border-radius: 8px;
}

.avatar-placeholder {
  display: block;
  text-align: center;
}

.preview-name {
  display: block;
  margin-top: 16rpx;
  color: #172033;
  font-size: 28rpx;
  font-weight: 700;
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.label {
  color: #24324a;
  font-size: 26rpx;
  font-weight: 700;
}

.nickname-input {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  color: #172033;
  font-size: 28rpx;
  box-sizing: border-box;
}

.error-text {
  margin-top: 18rpx;
  color: #b42318;
  font-size: 25rpx;
  text-align: center;
}

.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}

.primary-button,
.ghost-button {
  flex: 1;
  min-height: 76rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 76rpx;
}

.primary-button {
  background: #1aad19;
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #ccd7e6;
  background: #ffffff;
  color: #2452a8;
}

.primary-button::after,
.ghost-button::after {
  border: 0;
}
</style>
