<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <view class="page-content">
      <ErrorState v-if="offline && !contentReady" v-bind="networkFeedback" @retry="retryLoadConferences" />
      <HomeSkeleton v-else-if="loading && !contentReady" />
      <ErrorState v-else-if="error && !contentReady" v-bind="networkFeedback" @retry="retryLoadConferences" />
      <NetworkNotice v-if="offline && contentReady" />
      <HomeMessageNotice ref="homeMessages" />
      <PageRenderer
        v-if="contentReady"
        :dsl="effectiveHomeDsl"
        :theme="theme"
        :conferences="conferences"
        :conference-loading="conferenceLoading"
        @open-conference="goDetail"
      />
      <view v-if="!offline && (error || configurationError) && contentReady" class="refresh-notice"><text>{{ error ? networkFeedback.message : configurationError }}</text><button :disabled="loading" @click="retryLoadConferences">重试</button></view>
      <WechatProfilePrompt />
    </view>
    <CustomTabbar active-page-key="home" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import HomeSkeleton from "@/components/ui/HomeSkeleton.vue";
import NetworkNotice from "@/components/ui/NetworkNotice.vue";
import { usePageNetwork } from "@/composables/usePageNetwork";
import HomeMessageNotice from "@/components/ui/HomeMessageNotice.vue";
import { readFreshPublicCache } from "@/utils/public-home-cache";
import { API_BASE_URL } from "@/config/app";
import PageRenderer from "@/components/PageRenderer.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, createDefaultPageDsl, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferences, type ConferenceListItem } from "@/services/conference";
import { ApiRequestError } from "@/services/request";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";

const HOME_REFRESH_INTERVAL_MS = 30 * 1000;

const loading = ref(true);
const { offline, feedback: networkFeedback, reportFailure, clearFailure, refreshNetwork } = usePageNetwork(loadConferences, loading);
const homeMessages = ref<InstanceType<typeof HomeMessageNotice> | null>(null);
const conferenceLoading = ref(true);
const configurationError = ref("");
const contentReady = ref(false);
let inFlight = false;
const error = ref("");
const conferences = ref<ConferenceListItem[]>([]);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const conferenceFilter = ref<{ keyword?: string; tag?: string; location?: string; category?: string }>({});
let hasLoadedOnce = false;
let lastLoadAt = 0;

const pageStyle = computed(() => ({
  ...createCmsThemeVars(theme.value),
  ...createCmsBackgroundStyle(theme.value, "body")
}));
const pageClass = computed(() => ["page", "ui-page"]);
const showBodyVideo = computed(() => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo !== "header");
const showBodyDynamicBackground = computed(() => theme.value.backgroundMode === "dynamic-gradient" && theme.value.backgroundApplyTo !== "header");
const effectiveHomeDsl = computed(() => cmsPage.value?.version.dsl ?? createDefaultPageDsl("home"));

onLoad((query) => {
  conferenceFilter.value = {
    keyword: readQueryText(query?.keyword),
    tag: readQueryText(query?.tag),
    location: readQueryText(query?.location),
    category: readQueryText(query?.category)
  };
  restorePublicCache();
  void loadConferences();
});

onShow(() => {
  void homeMessages.value?.refresh();
  if (loading.value) {
    return;
  }

  const shouldLoad = !hasLoadedOnce || Boolean(error.value) || Date.now() - lastLoadAt > HOME_REFRESH_INTERVAL_MS;
  if (shouldLoad) {
    void loadConferences();
  }
});

onShareAppMessage(() => buildPageShare(cmsPage.value, "/pages/index/index", "观潮会集"));

async function loadConferences() {
  if (inFlight) return;
  inFlight = true;
  loading.value = true;
  clearFailure();
  error.value = "";
  configurationError.value = "";
  conferenceLoading.value = true;

  try {
    await Promise.allSettled([
      getConferences(conferenceFilter.value).then(items => {
        conferences.value = items; contentReady.value = true;
        savePublicCache("conferences", items);
      }).catch(err => {
        logConferenceLoadError(err);
        error.value = "最新会议暂时无法读取，请重试";
        reportFailure(err, error.value);
      }).finally(() => { conferenceLoading.value = false; }),
      getPublishedPage("home", {}, { networkOnly: true }).then(page => {
        cmsPage.value = page; if (page) contentReady.value = true;
        applyPageTitle(page, "观潮会集"); savePublicCache("page", page);
      }).catch(err => {
        configurationError.value = "首页内容暂未更新，正在显示已有内容";
        if (!error.value) reportFailure(err, "首页内容暂时无法读取，请重试");
      }),
      getAppTheme("home", { networkOnly: true }).then(config => { theme.value = config; savePublicCache("theme", config); }).catch(() => { /* The default theme remains usable. */ })
    ]);
  } catch (err) {
    logConferenceLoadError(err);
    error.value = "会议加载失败，请稍后重试";
    reportFailure(err, error.value);
  } finally {
    hasLoadedOnce = true;
    lastLoadAt = Date.now();
    loading.value = false;
    inFlight = false;
    if (!contentReady.value && !error.value) error.value = "首页暂时无法读取，请重试";
    void homeMessages.value?.refresh();
  }
}

function cacheKey(part: string) { return `public-home-v1:${API_BASE_URL}:${part}:${part === "conferences" ? JSON.stringify(conferenceFilter.value) : "home"}`; }
function savePublicCache(part: string, value: unknown) {
  try { uni.setStorageSync(cacheKey(part), { version: 1, savedAt: Date.now(), value }); } catch { /* Storage pressure must not prevent rendering. */ }
}
function restorePublicCache() {
  try {
    const items = readFreshPublicCache<ConferenceListItem[]>(uni.getStorageSync(cacheKey("conferences")));
    const page = readFreshPublicCache<PublishedPage>(uni.getStorageSync(cacheKey("page")));
    const config = readFreshPublicCache<ThemeConfig>(uni.getStorageSync(cacheKey("theme")));
    if (Array.isArray(items)) { conferences.value = items; contentReady.value = true; }
    if (page?.version?.dsl) { cmsPage.value = page; contentReady.value = true; applyPageTitle(page, "观潮会集"); }
    if (config && typeof config === "object" && !Array.isArray(config)) theme.value = { ...DEFAULT_THEME, ...config };
  } catch { /* Ignore invalid caches and continue with the network. */ }
}

function logConferenceLoadError(err: unknown): void {
  if (err instanceof ApiRequestError) {
    console.error("[CONFERENCE_LOAD_ERROR]", {
      method: err.method,
      url: err.url,
      statusCode: err.statusCode,
      API_BASE_URL: err.apiBaseUrl,
      message: err.responseMessage || err.message,
      errMsg: err.errMsg,
      responseData: err.responseData,
      error: err
    });
    return;
  }

  console.error("[CONFERENCE_LOAD_ERROR]", {
    message: err instanceof Error ? err.message : String(err),
    error: err
  });
}

function retryLoadConferences() {
  refreshNetwork();
  void loadConferences();
}

function readQueryText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function goDetail(id: string) {
  uni.navigateTo({
    url: `/pages/conference/detail?id=${encodeURIComponent(id)}`
  });
}
</script>

<style scoped>
.page {
  position: relative;
  padding-top: 0;
  padding-bottom: calc(160rpx + env(safe-area-inset-bottom));
  overflow: visible;
}

.page-bg-video {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

.page-content {
  position: relative;
  z-index: 1;
}
.refresh-notice { display: flex; gap: 20rpx; align-items: center; padding: 24rpx; font-size: 30rpx; }

</style>
