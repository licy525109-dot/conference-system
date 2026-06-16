<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted object-fit="cover" :controls="false" />
    <LoadingState v-if="loading" title="加载页面中" description="正在读取主办方发布内容。" />
    <ErrorState
      v-else-if="error"
      :message="error"
      primary-text="重新加载"
      secondary-text="返回首页"
      @retry="loadPage"
      @secondary="goHome"
    />
    <template v-else-if="cmsPage">
      <ExtensionStatusNotice
        v-if="extensionNotice"
        :status="extensionNotice.status"
        :title="extensionNotice.title"
        :description="extensionNotice.description"
        :tone="extensionNotice.tone"
      />
      <PageRenderer :components="cmsPage.version.components" :theme="theme" @open-conference="goDetail" />
    </template>
    <EmptyState v-else title="页面尚未发布" description="该页面内容暂未开放，请返回首页查看会议。" mark="页" action-text="返回首页" @action="goHome" />
    <CustomTabbar :active-page-key="pageKey" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import ExtensionStatusNotice from "@/components/ui/ExtensionStatusNotice.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { goHome } from "@/utils/navigation";

const pageKey = ref("custom:");
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");
const pageStyle = computed(() => ({
  "--ui-color-primary": theme.value.primaryColor,
  "--ui-color-accent": theme.value.secondaryColor,
  "--ui-color-bg": theme.value.backgroundColor,
  "--ui-color-surface": theme.value.cardBackground,
  "--ui-radius": `${theme.value.radius}px`,
  ...themeBackgroundStyle(theme.value, "body")
}));
const pageClass = computed(() => ["page", "ui-page", backgroundClass(theme.value)]);
const showBodyVideo = computed(() => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo !== "header");
const extensionNotice = computed(() => extensionNoticeFor(pageKey.value));

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
    const [page, themeConfig] = await Promise.all([getPublishedPage(pageKey.value), getAppTheme(pageKey.value)]);
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

function themeBackgroundStyle(config: ThemeConfig, target: "body" | "header"): Record<string, string> {
  if (target === "body" && config.backgroundApplyTo === "header") return {};
  if (target === "header" && config.backgroundApplyTo !== "header") return {};
  if (config.backgroundMode === "video") {
    return { background: "transparent" };
  }
  if (config.backgroundMode === "image" && config.backgroundImageUrl) {
    return {
      backgroundImage: `${config.backgroundBottomFilter === false ? "" : "linear-gradient(180deg, rgba(245,247,251,0.20), rgba(245,247,251,0.92)), "}url("${config.backgroundImageUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center top",
      backgroundRepeat: "no-repeat"
    };
  }
  if (config.backgroundMode === "dynamic-gradient") {
    return {
      backgroundImage: dynamicGradient(config),
      backgroundSize: `${dynamicSize(config)}% ${dynamicSize(config)}%`,
      animationDuration: `${dynamicSpeed(config)}s`
    };
  }
  if (config.backgroundMode === "gradient") {
    return {
      backgroundImage: `linear-gradient(180deg, ${config.backgroundGradientFrom || config.backgroundColor}, ${config.backgroundGradientTo || config.secondaryColor})`
    };
  }
  return { background: config.backgroundColor };
}

function backgroundClass(config: ThemeConfig, target: "body" | "header" = "body"): string {
  const applies = target === "body" ? config.backgroundApplyTo !== "header" : config.backgroundApplyTo === "header";
  return applies && config.backgroundMode === "dynamic-gradient" ? "is-dynamic-bg" : "";
}

function dynamicGradient(config: ThemeConfig): string {
  const from = config.backgroundGradientFrom || config.backgroundColor;
  const to = config.backgroundGradientTo || config.secondaryColor;
  const density = Math.max(10, Math.min(100, Number(config.backgroundDynamicDensity) || 40));
  const dotOpacity = Math.min(0.22, 0.06 + density / 700);
  const filterLayer = config.backgroundBottomFilter === false ? "" : "linear-gradient(180deg, rgba(255,255,255,0.10), rgba(245,247,251,0.84)), ";
  return `${filterLayer}radial-gradient(circle at 18% 24%, rgba(255,255,255,${dotOpacity}) 0, transparent ${Math.max(12, density / 3)}%), radial-gradient(circle at 82% 18%, rgba(20,184,166,${dotOpacity}) 0, transparent ${Math.max(14, density / 2.8)}%), linear-gradient(135deg, ${from}, ${to})`;
}

function dynamicSize(config: ThemeConfig): number {
  const density = Math.max(10, Math.min(100, Number(config.backgroundDynamicDensity) || 40));
  return Math.max(160, 520 - density * 3);
}

function dynamicSpeed(config: ThemeConfig): number {
  return Math.max(6, Math.min(40, Number(config.backgroundDynamicSpeed) || 18));
}

function extensionNoticeFor(key: string):
  | { status: string; title: string; description: string; tone: "info" | "warning" | "neutral" }
  | null {
  const normalized = key.replace(/^custom:/, "");
  const map: Record<string, { status: string; title: string; description: string; tone: "info" | "warning" | "neutral" }> = {
    "member-center": {
      status: "扩展能力",
      title: "会员权益展示中",
      description: "会员权益暂不参与会议报名定价，报名金额仍以提交订单时系统计算结果为准。",
      tone: "warning"
    },
    cart: {
      status: "主线提醒",
      title: "会议报名结算优先",
      description: "购物车商品支付后续开放，请优先完成会议报名缴费主流程。",
      tone: "info"
    },
    mall: {
      status: "商城试运行",
      title: "商品支付后续开放",
      description: "商城内容可展示和加入购物车，暂不提供完整商品支付和履约。",
      tone: "warning"
    }
  };
  return map[normalized] ?? null;
}
</script>

<style scoped>
.page {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding-bottom: 164rpx;
  overflow: hidden;
}

.page-bg-video {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

.is-dynamic-bg {
  animation-name: dynamicBackgroundMove;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
  animation-direction: alternate;
}

@keyframes dynamicBackgroundMove {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 100% 70%;
  }
}
</style>
