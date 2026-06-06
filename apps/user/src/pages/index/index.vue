<template>
  <view class="page">
    <view class="hero">
      <text class="eyebrow">Conference MVP</text>
      <text class="title">会议报名 H5 / 小程序</text>
      <text class="subtitle">Hello from apps/user. 后续这里会接入会议首页和会议详情。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
console.log("User app booted");
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 48rpx 32rpx;
  box-sizing: border-box;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 40rpx 32rpx;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  background: #ffffff;
}

.eyebrow {
  color: #2563eb;
  font-size: 24rpx;
  font-weight: 700;
}

.title {
  color: #172033;
  font-size: 42rpx;
  font-weight: 700;
}

.subtitle {
  color: #5f6f89;
  font-size: 28rpx;
  line-height: 1.6;
}
</style>
