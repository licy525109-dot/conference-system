<template>
  <view class="home-skeleton" aria-label="正在加载首页">
    <view class="banner bone" />
    <view class="lines"><view class="bone title" /><view class="bone line" /></view>
    <view class="tiles"><view v-for="n in 3" :key="n" class="bone tile" /></view>
    <view v-for="n in 2" :key="n" class="meeting"><view class="bone picture" /><view class="lines"><view class="bone title" /><view class="bone line" /></view></view>
  </view>
</template>
<style scoped>
.home-skeleton { padding: 24rpx; display: flex; flex-direction: column; gap: 28rpx; }
.bone { background: #e4e9eb; border-radius: 8rpx; animation: pulse 1.5s ease-in-out infinite; }
.banner { width: 100%; aspect-ratio: 16 / 9; }.title { height: 36rpx; width: 70%; }.line { height: 28rpx; width: 90%; }
.lines { display: flex; flex: 1; flex-direction: column; gap: 20rpx; }.tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16rpx; }.tile { height: 120rpx; }
.meeting { display: flex; gap: 20rpx; min-height: 130rpx; }.picture { width: 180rpx; height: 130rpx; }
@keyframes pulse { 50% { opacity: .45; } } @media (prefers-reduced-motion: reduce) { .bone { animation: none; } }
</style>
