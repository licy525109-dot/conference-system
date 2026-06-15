<template>
  <view class="page">
    <view class="topbar">
      <view>
        <text class="eyebrow">会议报名</text>
        <text class="title">可报名会议</text>
      </view>
      <button class="ghost-button" @click="goMyRegistrations">我的报名</button>
    </view>

    <view v-if="loading" class="state">加载会议中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="retryLoadConferences">重试</button>
    </view>
    <view v-else-if="conferences.length === 0" class="state">暂无可报名会议</view>

    <PageRenderer
      v-else-if="cmsPage"
      :components="cmsPage.version.components"
      :theme="theme"
      :conferences="conferences"
      @open-conference="goDetail"
    />

    <view v-else class="list">
      <view v-for="conference in conferences" :key="conference.id" class="conference-card">
        <view class="card-main" @click="goDetail(conference.id)">
          <text class="conference-title">{{ conference.title }}</text>
          <text class="summary">{{ conference.summary || "会议详情已发布，点击查看报名信息。" }}</text>
          <view class="meta-row">
            <text>{{ formatDateTime(conference.startsAt) }}</text>
            <text v-if="conference.location">{{ conference.location }}</text>
          </view>
        </view>
        <button class="primary-button" @click="goDetail(conference.id)">查看详情</button>
      </view>
    </view>
    <WechatProfilePrompt />
    <CustomTabbar active-page-key="home" />
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferences, type ConferenceListItem } from "@/services/conference";
import { ApiRequestError } from "@/services/request";
import { formatDateTime } from "@/utils/date";

const HOME_REFRESH_INTERVAL_MS = 30 * 1000;

const loading = ref(false);
const error = ref("");
const conferences = ref<ConferenceListItem[]>([]);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
let hasLoadedOnce = false;
let lastLoadAt = 0;

onLoad(() => {
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

onShareAppMessage(() => buildPageShare(cmsPage.value, "/pages/index/index", "会议报名"));

async function loadConferences() {
  loading.value = true;
  error.value = "";

  try {
    const [items, page, themeConfig] = await Promise.all([getConferences(), getPublishedPage("home"), getAppTheme()]);
    conferences.value = items;
    cmsPage.value = page;
    theme.value = themeConfig;
    applyPageTitle(page, "会议报名");
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
  void loadConferences();
}

function goDetail(id: string) {
  uni.navigateTo({
    url: `/pages/conference/detail?id=${encodeURIComponent(id)}`
  });
}

function goMyRegistrations() {
  uni.navigateTo({
    url: "/pages/registrations/my"
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 32rpx 28rpx;
  box-sizing: border-box;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 28rpx;
}

.eyebrow {
  display: block;
  color: #2452a8;
  font-size: 24rpx;
  font-weight: 700;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #14213d;
  font-size: 42rpx;
  font-weight: 800;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.conference-card {
  padding: 28rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.card-main {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.conference-title {
  color: #172033;
  font-size: 34rpx;
  font-weight: 800;
  line-height: 1.35;
}

.summary {
  color: #5c6b82;
  font-size: 27rpx;
  line-height: 1.55;
}

.meta-row {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  color: #41516a;
  font-size: 25rpx;
}

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
}

.primary-button {
  margin-top: 24rpx;
  background: #2452a8;
  color: #ffffff;
}

.ghost-button {
  min-width: 172rpx;
  border: 1px solid #ccd7e6;
  background: #ffffff;
  color: #2452a8;
}

.compact {
  width: 200rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 96rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
