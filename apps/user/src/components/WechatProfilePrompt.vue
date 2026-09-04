<template>
  <view v-if="visible && miniProgramEnabled" class="profile-mask">
    <view class="profile-dialog">
      <text class="dialog-title">{{ dialogTitle }}</text>
      <text class="dialog-summary">{{ dialogSummary }}</text>

      <view class="phone-panel" :class="{ 'phone-panel--bound': phone }">
        <view class="phone-copy">
          <text class="phone-title">{{ phone ? "手机号已绑定" : "微信手机号" }}</text>
          <text class="phone-description">{{ phone ? maskPhone(phone) : "用于匹配报名、凭证和会务安排" }}</text>
        </view>
        <button
          v-if="!phone"
          class="phone-button"
          open-type="getPhoneNumber"
          :disabled="bindingPhone"
          @getphonenumber="onGetPhoneNumber"
        >
          {{ bindingPhone ? "绑定中" : "一键绑定" }}
        </button>
        <text v-else class="bound-mark">已完成</text>
      </view>

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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { ensureLogin, isAuthSessionExpiredError, refreshLogin } from "@/services/auth";
import { bindWechatPhone, getWechatProfile, updateWechatProfile, uploadWechatAvatar } from "@/services/profile";
import { ApiRequestError } from "@/services/request";

const miniProgramEnabled = ref(false);
const visible = ref(false);
const saving = ref(false);
const bindingPhone = ref(false);
const error = ref("");
const phone = ref("");
const wechatNickname = ref("");
const wechatAvatarUrl = ref("");
const pendingAvatarPath = ref("");
const avatarLoadFailed = ref(false);

const displayAvatarUrl = computed(() => (avatarLoadFailed.value ? "" : pendingAvatarPath.value || wechatAvatarUrl.value));
const previewName = computed(() => wechatNickname.value.trim() || "请选择头像并填写昵称");
const dialogTitle = computed(() => phone.value ? "完善微信资料" : "绑定微信手机号");
const dialogSummary = computed(() => phone.value ? "头像和昵称用于报名凭证展示" : "授权后自动读取微信绑定手机号，无需手动输入");

onMounted(() => {
  uni.$on("wechat-profile:open", openProfilePrompt);
  // #ifdef MP-WEIXIN
  miniProgramEnabled.value = true;
  void checkProfile();
  // #endif
});

onUnmounted(() => {
  uni.$off("wechat-profile:open", openProfilePrompt);
});

async function openProfilePrompt() {
  // #ifdef MP-WEIXIN
  miniProgramEnabled.value = true;
  await checkProfile({ forceOpen: true });
  // #endif
  // #ifndef MP-WEIXIN
  uni.showToast({ title: "请在微信小程序内完善头像昵称", icon: "none" });
  // #endif
}

async function checkProfile(options?: { forceOpen?: boolean }) {
  try {
    await ensureLogin();
    const profile = await getWechatProfile();
    phone.value = profile.phone || "";
    wechatNickname.value = profile.wechatNickname || "";
    wechatAvatarUrl.value = profile.wechatAvatarUrl || "";
    visible.value = options?.forceOpen ? true : !phone.value || !wechatNickname.value || !wechatAvatarUrl.value;
  } catch (err) {
    console.error("[WECHAT_PROFILE_PROMPT_LOAD_ERROR]", err);
  }
}

async function onGetPhoneNumber(event: unknown) {
  const detail = readEventDetail(event);
  const code = typeof detail.code === "string" ? detail.code.trim() : "";
  const errMsg = typeof detail.errMsg === "string" ? detail.errMsg : "";
  if (Number(detail.errno) === 1400001) {
    error.value = "手机号验证额度不足，请联系管理员在微信公众平台“付费管理”补充额度";
    return;
  }
  if (!code || !errMsg.includes(":ok")) {
    error.value = "需要你点击允许后才能自动绑定微信手机号";
    return;
  }

  bindingPhone.value = true;
  error.value = "";
  try {
    const result = await bindPhoneWithFreshSession(code);
    phone.value = result.user.phone || "";
    uni.$emit("auth:changed", result.user);
    uni.$emit("wechat-phone:updated", result.user);
    const linked = result.linkedRegistrations;
    uni.showToast({
      title: linked > 0 ? `已绑定，并找回 ${linked} 条报名` : "手机号已绑定",
      icon: "success",
      duration: 2400
    });
  } catch (err) {
    console.error("[WECHAT_PHONE_BIND_ERROR]", err);
    error.value = phoneBindingErrorMessage(err);
  } finally {
    bindingPhone.value = false;
  }
}

async function bindPhoneWithFreshSession(code: string) {
  try {
    await ensureLogin();
    return await bindWechatPhone(code);
  } catch (err) {
    if (!isAuthSessionExpiredError(err)) throw err;
    await refreshLogin();
    return bindWechatPhone(code);
  }
}

function phoneBindingErrorMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    const message = err.responseMessage?.trim() || "";
    if (message && /微信|手机号|AppID|AppSecret|错误码|授权/.test(message)) return message;
    if (!err.statusCode) return "网络连接失败，请检查网络后重新点击“一键绑定”";
  }
  return "手机号绑定未完成，请重新点击“一键绑定”；仍失败请联系管理员核对小程序能力配置";
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
  if (!phone.value) {
    error.value = "请先点击一键绑定，授权读取微信手机号";
    return;
  }

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
    uni.$emit("wechat-profile:updated", user);
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

function readEventDetail(event: unknown): Record<string, unknown> {
  if (typeof event === "object" && event !== null && "detail" in event) {
    const detail = (event as { detail?: unknown }).detail;
    return typeof detail === "object" && detail !== null ? detail as Record<string, unknown> : {};
  }
  return {};
}

function maskPhone(value: string): string {
  return value.length >= 7 ? `${value.slice(0, 3)} **** ${value.slice(-4)}` : value;
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
  background: rgba(15, 23, 42, 0.48);
  box-sizing: border-box;
}

.profile-dialog {
  width: 100%;
  max-width: 640rpx;
  padding: 38rpx 36rpx 34rpx;
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: 0 24rpx 70rpx rgba(17, 31, 55, 0.18);
  box-sizing: border-box;
}

.dialog-title {
  display: block;
  color: var(--ui-color-text);
  font-size: 36rpx;
  font-weight: 900;
  text-align: center;
}

.dialog-summary {
  display: block;
  margin: 10rpx 0 28rpx;
  color: var(--ui-color-muted);
  font-size: 29rpx;
  line-height: 1.5;
  text-align: center;
}

.phone-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 28rpx;
  padding: 22rpx 24rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: 10rpx;
  background: var(--ui-color-primary-soft);
}

.phone-panel--bound {
  background: #edf7f3;
}

.phone-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
}

.phone-title {
  color: var(--ui-color-text);
  font-size: 28rpx;
  font-weight: 900;
}

.phone-description {
  color: var(--ui-color-muted);
  font-size: 27rpx;
  line-height: 1.45;
}

.phone-button {
  min-width: 154rpx;
  height: 68rpx;
  margin: 0;
  padding: 0 20rpx;
  border-radius: 8rpx;
  background: var(--ui-color-primary);
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 68rpx;
}

.phone-button::after {
  border: 0;
}

.bound-mark {
  flex: 0 0 auto;
  color: #226c58;
  font-size: 24rpx;
  font-weight: 900;
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
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 26rpx;
  line-height: 132rpx;
}

.avatar-button::after {
  border: 0;
}

.avatar-image {
  width: 132rpx;
  height: 132rpx;
  border-radius: var(--ui-radius);
}

.avatar-placeholder {
  display: block;
  text-align: center;
}

.preview-name {
  display: block;
  margin-top: 16rpx;
  color: var(--ui-color-text);
  font-size: 28rpx;
  font-weight: 800;
  text-align: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
}

.label {
  color: var(--ui-color-text);
  font-size: 29rpx;
  font-weight: 800;
}

.nickname-input {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  color: var(--ui-color-text);
  font-size: 31rpx;
  box-sizing: border-box;
}

.error-text {
  margin-top: 18rpx;
  color: var(--ui-color-danger);
  font-size: 29rpx;
  line-height: 1.55;
  text-align: left;
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
  border-radius: var(--ui-radius);
  font-size: 30rpx;
  line-height: 76rpx;
}

.primary-button {
  background: var(--ui-color-primary);
  color: #ffffff;
}

.ghost-button {
  border: 1px solid var(--ui-color-border);
  background: var(--ui-color-surface);
  color: var(--ui-color-primary);
}

.primary-button::after,
.ghost-button::after {
  border: 0;
}
</style>
