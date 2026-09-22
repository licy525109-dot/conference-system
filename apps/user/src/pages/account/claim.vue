<template>
  <view class="claim-page">
    <text class="heading">{{ token ? '确认参会邀请' : '邀请链接无效' }}</text>
    <text>{{ token ? '请使用本人已验证手机号确认邀请，确认后即可查看本人会务安排和签到码。' : '请联系会务组获取本人专属邀请链接。' }}</text>
    <text v-if="error" class="error">{{ error }}</text>
    <button v-if="token" class="ui-button-primary" :disabled="saving" @click="claim">{{ saving ? '核对中…' : '确认本人参会' }}</button>
    <button class="ui-button-secondary" @click="goHome">返回首页</button>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { ensureRegistrationProfile } from "@/services/registration-profile";
import { claimGuestIdentity } from "@/services/guest-profiles";
import { ApiRequestError } from "@/services/request";
import { goHome } from "@/utils/navigation";
const token = ref(""); const error = ref(""); const saving = ref(false);
onLoad(query => {
  token.value = typeof query?.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(query.token) ? query.token : "";
  // Invitations are private. Never expose a token through the native share menu.
  // #ifdef MP-WEIXIN
  uni.hideShareMenu({ menus: ['shareAppMessage', 'shareTimeline'], hideShareItems: ['shareAppMessage', 'shareTimeline'] });
  // #endif
});
function viewAttendance() { uni.redirectTo({ url: "/pages/account/attendance" }); }
async function claim() {
  if (saving.value || !token.value.trim()) return;
  saving.value = true; error.value = "";
  try {
    if (!(await ensureRegistrationProfile())) return;
    await claimGuestIdentity(token.value.trim());
    token.value = "";
    uni.showModal({ title: "已确认参会", content: "已关联本人参会信息，可查看本人签到码和会务安排。", showCancel: false, success: viewAttendance });
  } catch(e) { error.value = e instanceof ApiRequestError && e.responseMessage ? e.responseMessage : "领取失败，请联系会务核对"; } finally { saving.value = false; }
}
</script>
<style scoped>
.claim-page { padding: 40rpx; display: flex; flex-direction: column; gap: 32rpx; font-size: 34rpx; line-height: 1.7; }
.heading { font-size: 24px; font-weight: 700; }.error { color: #ad2626; }
.claim-page button { width: 100%; min-height: 48px; padding: 12px 16px; font-size: 18px; line-height: 1.5; border-radius: 6px; }
</style>
