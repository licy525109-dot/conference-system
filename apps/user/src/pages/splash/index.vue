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
      <view />
      <button v-if="allowSkip" class="splash-skip" @click="finish">{{ skipText }} {{ countdown }}s</button>
      <text v-else class="splash-countdown">{{ countdown }}s</text>
    </view>
    <view v-if="showBottomText" class="splash-bottom" :class="`is-${bottomTextStyle}`">
      <text>{{ bottomText }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref } from "vue";
import { onLoad, onReady } from "@dcloudio/uni-app";
import { DEFAULT_THEME, getAppTheme, type ThemeConfig } from "@/services/cms";
import { resolveSplashRedirect } from "@/utils/launch";
import { goHome } from "@/utils/navigation";

const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const redirectUrl = ref("/pages/index/index");
const countdown = ref(5);
const videoFailed = ref(false);
let timer: ReturnType<typeof setInterval> | undefined;
let pendingRedirectTimer: ReturnType<typeof setTimeout> | undefined;
let finished = false;
let pageReady = false;

const videoUrl = computed(() => String(theme.value.splashVideoUrl || ""));
const posterUrl = computed(() => String(theme.value.splashPosterUrl || ""));
const allowSkip = computed(() => theme.value.splashAllowSkip !== false);
const skipText = computed(() => String(theme.value.splashSkipText || "跳过"));
const showBottomText = computed(() => theme.value.splashShowBottomText !== false && Boolean(bottomText.value));
const bottomText = computed(() => String(theme.value.splashBottomText || "欢迎进入会务小程序"));
const bottomTextStyle = computed(() => {
  const value = String(theme.value.splashBottomTextStyle || "light");
  return value === "dark" || value === "pill" ? value : "light";
});

onLoad((query) => {
  redirectUrl.value = resolveSplashRedirect(query?.redirect);
  void loadSplash();
});

onReady(() => {
  pageReady = true;
});

onUnmounted(() => {
  clearTimer();
  clearPendingRedirect();
});

async function loadSplash(): Promise<void> {
  try {
    theme.value = await getAppTheme("home");
  } catch {
    theme.value = { ...DEFAULT_THEME };
  }
  if (!shouldShowSplash(theme.value)) {
    finish();
    return;
  }
  markSplashShown(theme.value);
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
  void scheduleRedirect();
}

async function scheduleRedirect(): Promise<void> {
  await nextTick();
  if (!pageReady) {
    pendingRedirectTimer = setTimeout(() => {
      pendingRedirectTimer = undefined;
      void scheduleRedirect();
    }, 0);
    return;
  }

  pendingRedirectTimer = setTimeout(() => {
    pendingRedirectTimer = undefined;
    redirectToTarget();
  }, 0);
}

function redirectToTarget(): void {
  const pages = getCurrentPages();
  const current = pages[pages.length - 1] as unknown as { route?: string } | undefined;
  if (current?.route && current.route !== "pages/splash/index") {
    return;
  }

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

function shouldShowSplash(value: ThemeConfig): boolean {
  if (!value.splashEnabled) return false;
  if (!String(value.splashVideoUrl || "") && !String(value.splashPosterUrl || "")) return false;
  const frequency = String(value.splashFrequency || "daily");
  if (frequency === "every_time") return true;
  return uni.getStorageSync(splashStorageKey(value, frequency)) !== splashStorageValue(frequency);
}

function markSplashShown(value: ThemeConfig): void {
  const frequency = String(value.splashFrequency || "daily");
  if (frequency === "every_time") return;
  uni.setStorageSync(splashStorageKey(value, frequency), splashStorageValue(frequency));
}

function splashStorageKey(value: ThemeConfig, frequency: string): string {
  if (frequency === "version") {
    return `conference:splash:version:${hashStorageSeed([value.splashVideoUrl, value.splashPosterUrl, value.splashCountdownSeconds, value.splashSkipText, value.splashBottomText].map((item) => String(item || "")).join("|"))}`;
  }
  return "conference:splash:daily";
}

function splashStorageValue(frequency: string): string {
  if (frequency === "version") return "shown";
  const now = new Date();
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

function hashStorageSeed(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return String(hash);
}

function clearPendingRedirect(): void {
  if (pendingRedirectTimer) {
    clearTimeout(pendingRedirectTimer);
    pendingRedirectTimer = undefined;
  }
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

.splash-bottom.is-dark {
  color: #111827;
  text-shadow: 0 4rpx 18rpx rgba(255, 255, 255, 0.36);
}

.splash-bottom.is-pill text {
  display: inline-flex;
  padding: 16rpx 26rpx;
  border-radius: 999rpx;
  background: rgba(15, 23, 42, 0.42);
}
</style>
