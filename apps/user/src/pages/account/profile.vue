<template>
  <view class="profile-page">
    <text class="heading">完善本人资料</text>
    <text>本人姓名和已验证手机号用于订单联系；代报名的参会人可以另行填写。</text>
    <text v-if="loading" role="status">正在核对账号资料…</text>
    <text v-if="error" class="error" role="alert">{{ error }}</text>
    <!-- #ifndef MP-WEIXIN -->
    <label class="field"><text>本人姓名</text><input v-model="realName" maxlength="80" placeholder="请填写真实姓名，方便会务联系" /></label>
    <view class="phone-status"><text>本人手机号</text><text>{{ phoneLabel }}</text></view>
    <text v-if="!user?.phoneVerifiedAt">请在微信小程序中授权验证手机号。网页版不能验证微信手机号。</text>
    <button class="ui-button-primary" :disabled="loading || saving || !realName.trim()" @click="saveName">{{ saving ? '保存中…' : '保存本人姓名' }}</button>
    <button class="ui-button-secondary" :disabled="loading" @click="load">重新核对资料</button>
    <!-- #endif -->
    <!-- #ifdef MP-WEIXIN -->
    <button class="ui-button-primary" :disabled="loading" @click="open">完善本人资料</button>
    <!-- #endif -->
    <button class="ui-button-secondary" :disabled="saving" @click="cancel">暂不完善，返回上一页</button>
    <WechatProfilePrompt />
  </view>
</template>
<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { goHome } from "@/utils/navigation";
import { ensureAuthenticatedUser, type CurrentUser } from "@/services/auth";
import { updateWechatProfile } from "@/services/profile";
import { registrationProfileReady } from "@/utils/registration-identity";
const user = ref<CurrentUser | null>(null);
const realName = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const phoneLabel = computed(() => {
  const phone = user.value?.phone;
  const masked = phone ? `${phone.slice(0, 3)} **** ${phone.slice(-4)}` : '尚未绑定';
  return `${masked}${user.value?.phoneVerifiedAt ? '（已验证）' : '（未验证）'}`;
});
const open = () => uni.$emit("wechat-profile:open", { force: true });
const done = () => uni.navigateBack({ fail: () => goHome() });
const cancel = () => done();
function onUpdated(profile: CurrentUser) {
  if (getCurrentPages().slice(-1)[0]?.route === "pages/account/profile" && registrationProfileReady(profile)) done();
}
async function load() {
  if (loading.value) return;
  loading.value = true; error.value = "";
  try {
    user.value = await ensureAuthenticatedUser({ force: true });
    realName.value = user.value.realName || "";
    if (registrationProfileReady(user.value)) { done(); return; }
    // #ifdef MP-WEIXIN
    open();
    // #endif
  } catch { error.value = "账号资料暂时无法读取，请重新核对或返回稍后再试。"; }
  finally { loading.value = false; }
}
async function saveName() {
  if (saving.value || !user.value) return;
  saving.value = true; error.value = "";
  try {
    user.value = await updateWechatProfile({ realName: realName.value.trim(), wechatNickname: user.value.wechatNickname || null, wechatAvatarUrl: user.value.wechatAvatarUrl || null });
    uni.$emit("wechat-profile:updated", user.value);
    if (!registrationProfileReady(user.value)) error.value = "姓名已保存，仍需在微信小程序验证本人手机号后继续。";
  } catch { error.value = "资料保存失败，请稍后重试。"; }
  finally { saving.value = false; }
}
onMounted(() => { uni.$on("wechat-profile:updated", onUpdated); void load(); });
onUnmounted(() => uni.$off("wechat-profile:updated", onUpdated));
</script>
<style scoped>
.profile-page { padding: 40rpx; display: flex; flex-direction: column; gap: 32rpx; font-size: 34rpx; line-height: 1.7; }
.heading { font-size: 44rpx; font-weight: 700; }
.field { display: flex; flex-direction: column; gap: 16rpx; }
.field input { border: 1px solid #bac9ce; padding: 24rpx; height: 52rpx; border-radius: 8rpx; background: #fff; }
.phone-status { display: flex; flex-direction: column; gap: 8rpx; }
.error { color: #ad2626; }
.profile-page button { width: 100%; white-space: normal; font-size: 32rpx; }
</style>
