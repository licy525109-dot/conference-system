<template>
  <view class="page ui-page">
    <LoadingState v-if="loading" title="加载页面中" description="正在读取主办方发布内容。" />
    <ErrorState
      v-else-if="error"
      :message="error"
      primary-text="重新加载"
      secondary-text="返回首页"
      @retry="loadPage"
      @secondary="goHome"
    />
    <PageRenderer v-else-if="cmsPage" :components="cmsPage.version.components" :theme="theme" @open-conference="goDetail" />
    <EmptyState v-else title="页面尚未发布" description="该页面内容暂未开放，请返回首页查看会议。" mark="页" action-text="返回首页" @action="goHome" />
    <CustomTabbar :active-page-key="pageKey" />
  </view>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
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
  padding-bottom: 164rpx;
}
</style>
