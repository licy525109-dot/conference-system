<template>
  <view class="splash-page">
    <image v-if="posterUrl" class="splash-media" :src="posterUrl" mode="aspectFill" />
    <video
      v-if="videoUrl && !videoFailed"
      class="splash-media"
      :src="videoUrl"
      :poster="posterUrl"
      autoplay
      muted
      playsinline
      webkit-playsinline
      object-fit="cover"
      :controls="false"
      @ended="finish"
      @error="handleVideoError"
    />
    <view class="splash-shade" />
    <view class="splash-top">
      <text class="splash-title">会议报名</text>
      <button v-if="allowSkip" class="splash-skip" @click="finish">{{ skipText }} {{ countdown }}s</button>
      <text v-else class="splash-countdown">{{ countdown }}s</text>
    </view>
    <view class="splash-bottom">
      <text>欢迎进入会务小程序</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { DEFAULT_THEME, getAppTheme, type ThemeConfig } from "@/services/cms";
import { goHome } from "@/utils/navigation";

const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const redirectUrl = ref("/pages/index/index");
const countdown = ref(5);
const videoFailed = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let finished = false;

const videoUrl = computed(() => String(theme.value.splashVideoUrl || ""));
const posterUrl = computed(() => String(theme.value.splashPosterUrl || ""));
const allowSkip = computed(() => theme.value.splashAllowSkip !== false);
const skipText = computed(() => String(theme.value.splashSkipText || "跳过"));

onLoad((query) => {
  redirectUrl.value = normalizeRedirect(query?.redirect);
  void loadSplash();
});

onUnmounted(() => {
  clearTimer();
});

async function loadSplash(): Promise<void> {
  try {
    theme.value = await getAppTheme("home");
  } catch {
    theme.value = { ...DEFAULT_THEME };
  }
  if (!theme.value.splashEnabled || (!videoUrl.value && !posterUrl.value)) {
    finish();
    return;
  }
  countdown.value = clampSeconds(theme.value.splashCountdownSeconds);
  startCountdown();
}

function startCountdown(): void {
  clearTimer();
  timer = setInterval(() => {
    countdown.value -= 1;
    if (countdown.value <= 0) {
      finish();
    }
  }, 1000);
}

function handleVideoError(): void {
  videoFailed.value = true;
  if (!posterUrl.value) {
    uni.showToast({ title: "启动视频无法播放，已跳过", icon: "none" });
    finish();
  }
}

function finish(): void {
  if (finished) return;
  finished = true;
  clearTimer();
  if (getCurrentPages().length > 1) {
    uni.navigateBack({
      delta: 1,
      fail: () => redirectHome()
    });
    return;
  }
  redirectHome();
}

function redirectHome(): void {
  uni.redirectTo({
    url: redirectUrl.value,
    fail: () => goHome()
  });
}

function clearTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}

function clampSeconds(value: unknown): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 5;
  return Math.max(1, Math.min(15, Math.round(numeric)));
}

function normalizeRedirect(value: unknown): string {
  const raw = typeof value === "string" ? decodeURIComponent(value) : "/pages/index/index";
  return raw.startsWith("/pages/") ? raw : "/pages/index/index";
}
</script>

<style scoped>
.splash-page {
  position: fixed;
  inset: 0;
  min-height: 100vh;
  overflow: hidden;
  background: #0f172a;
  color: #ffffff;
}

.splash-media,
.splash-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.splash-media {
  object-fit: cover;
}

.splash-shade {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.16), rgba(15, 23, 42, 0.44));
}

.splash-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: calc(52rpx + env(safe-area-inset-top)) 32rpx 0;
}

.splash-title {
  font-size: 34rpx;
  font-weight: 800;
  letter-spacing: 0;
}

.splash-skip {
  min-width: 132rpx;
  min-height: 56rpx;
  padding: 0 22rpx;
  border: 1rpx solid rgba(255, 255, 255, 0.36);
  border-radius: 999rpx;
  background: rgba(15, 23, 42, 0.28);
  color: #ffffff;
  font-size: 24rpx;
  line-height: 56rpx;
}

.splash-countdown {
  min-width: 64rpx;
  text-align: right;
  font-size: 26rpx;
  font-weight: 700;
}

.splash-bottom {
  position: absolute;
  right: 32rpx;
  bottom: calc(64rpx + env(safe-area-inset-bottom));
  left: 32rpx;
  z-index: 1;
  text-align: center;
  font-size: 28rpx;
  font-weight: 700;
  text-shadow: 0 4rpx 18rpx rgba(0, 0, 0, 0.22);
}
</style>
