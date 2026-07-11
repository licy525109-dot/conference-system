<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <view class="page-content">
      <LoadingState v-if="loading" title="加载会议中" description="正在同步最新可报名会议。" />
      <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="retryLoadConferences" />
      <PageRenderer
        v-else
        :dsl="effectiveHomeDsl"
        :theme="theme"
        :conferences="conferences"
        @open-conference="goDetail"
      />
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
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, createDefaultPageDsl, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferences, type ConferenceListItem } from "@/services/conference";
import { ApiRequestError } from "@/services/request";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";

const HOME_REFRESH_INTERVAL_MS = 30 * 1000;

const loading = ref(false);
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
const hasConferenceFilter = computed(() => Object.values(conferenceFilter.value).some(Boolean));
const effectiveHomeDsl = computed(() => cmsPage.value?.version.dsl ?? createDefaultPageDsl("home"));

onLoad((query) => {
  conferenceFilter.value = {
    keyword: readQueryText(query?.keyword),
    tag: readQueryText(query?.tag),
    location: readQueryText(query?.location),
    category: readQueryText(query?.category)
  };
  void loadConferences();
});

onShow(() => {
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
  loading.value = true;
  error.value = "";

  try {
    const [items, page, themeConfig] = await Promise.all([getConferences(conferenceFilter.value), getPublishedPage("home"), getAppTheme("home")]);
    conferences.value = items;
    cmsPage.value = page;
    theme.value = themeConfig;
    applyPageTitle(page, "观潮会集");
  } catch (err) {
    logConferenceLoadError(err);
    error.value = "会议加载失败，请稍后重试";
  } finally {
    hasLoadedOnce = true;
    lastLoadAt = Date.now();
    loading.value = false;
  }
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
  if (hasConferenceFilter.value && conferences.value.length === 0) {
    conferenceFilter.value = {};
  }
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

</style>
