<template>
  <view class="claim-page">
    <text class="heading">领取参会资格</text>
    <text>使用本人已验证手机号，领取会务组发给你的参会资格。</text>
    <input v-model="token" maxlength="100" placeholder="粘贴领取口令" />
    <text v-if="error" class="error">{{ error }}</text>
    <button :disabled="saving || !token.trim()" @click="claim">{{ saving ? '核对中…' : '确认本人领取' }}</button>
    <button class="ui-button-secondary" @click="viewAttendance">查看我的参会资格</button>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { ensureRegistrationProfile } from "@/services/registration-profile";
import { claimGuestIdentity } from "@/services/guest-profiles";
import { ApiRequestError } from "@/services/request";
const token = ref(""); const error = ref(""); const saving = ref(false);
onLoad(query => { token.value = typeof query?.token === "string" ? query.token.slice(0, 100) : ""; });
function viewAttendance() { uni.redirectTo({ url: "/pages/account/attendance" }); }
async function claim() {
  if (saving.value || !token.value.trim()) return;
  saving.value = true; error.value = "";
  try {
    if (!(await ensureRegistrationProfile())) return;
    await claimGuestIdentity(token.value.trim());
    token.value = "";
    uni.showModal({ title: "领取成功", content: "已关联本人参会资格，可查看本人签到码和会务安排。", showCancel: false, success: viewAttendance });
  } catch(e) { error.value = e instanceof ApiRequestError && e.responseMessage ? e.responseMessage : "领取失败，请联系会务核对"; } finally { saving.value = false; }
}
</script>
<style scoped>
.claim-page { padding: 40rpx; display: flex; flex-direction: column; gap: 32rpx; font-size: 34rpx; line-height: 1.7; }
.heading { font-size: 44rpx; font-weight: 700; } input { padding: 24rpx; border: 1px solid #cbd5dc; border-radius: 8rpx; }.error { color: #ad2626; }
</style>
