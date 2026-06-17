<template>
  <view class="page ui-page">
    <view class="result ui-card">
      <text class="title">{{ title }}</text>
      <text class="subtitle">{{ message }}</text>
      <button class="ui-button-primary" :loading="loading" @click="doClaim">领取优惠券</button>
      <button class="ui-button-secondary" @click="goMyCoupons">我的优惠券</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { claimCoupon } from "@/services/operations";

const claimCode = ref("");
const loading = ref(false);
const title = ref("优惠券领取");
const message = ref("登录后可领取当前活动批次优惠券。");

onLoad((query) => {
  claimCode.value = typeof query?.claimCode === "string" ? query.claimCode : "";
});

async function doClaim() {
  if (!claimCode.value) {
    message.value = "缺少领取码";
    return;
  }
  loading.value = true;
  try {
    const result = await claimCoupon(claimCode.value);
    title.value = "领取成功";
    message.value = `${result.campaign.name} 已加入你的优惠券。`;
  } catch (err) {
    title.value = "领取失败";
    message.value = err instanceof Error ? err.message : "请稍后再试";
  } finally {
    loading.value = false;
  }
}

function goMyCoupons() {
  uni.navigateTo({ url: "/pages/coupon/my" });
}
</script>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 40rpx 28rpx;
}

.title {
  color: var(--ui-color-text);
  font-size: 42rpx;
  font-weight: 900;
}

.subtitle {
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.6;
}
</style>
