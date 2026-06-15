<template>
  <view class="page">
    <view v-if="loading" class="state">加载页面中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadPage">重试</button>
      <button class="ghost-button compact" @click="goHome">返回首页</button>
    </view>
    <PageRenderer v-else-if="cmsPage" :components="cmsPage.version.components" :theme="theme" @open-conference="goDetail" />
    <view v-else class="state">页面尚未发布</view>
    <CustomTabbar :active-page-key="pageKey" />
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { goHome } from "@/utils/navigation";

const pageKey = ref("custom:");
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");

onLoad((query) => {
  pageKey.value = String(query?.pageKey || "custom:");
  void loadPage();
});

onShareAppMessage(() =>
  buildPageShare(cmsPage.value, `/pages/custom/index?pageKey=${encodeURIComponent(pageKey.value)}`, cmsPage.value?.title || "会议报名")
);

async function loadPage() {
  loading.value = true;
  error.value = "";
  try {
    const [page, themeConfig] = await Promise.all([getPublishedPage(pageKey.value), getAppTheme()]);
    cmsPage.value = page;
    theme.value = themeConfig;
    applyPageTitle(page, page?.title || "会议报名");
  } catch (err) {
    console.error("[CUSTOM_PAGE_LOAD_ERROR]", err);
    error.value = "页面加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function goDetail(id: string) {
  uni.navigateTo({
    url: `/pages/conference/detail?id=${encodeURIComponent(id)}`
  });
}
</script>

<style scoped>
.page {
  min-height: 100vh;
}

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
}

.primary-button {
  background: #2452a8;
  color: #ffffff;
}

.ghost-button {
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
