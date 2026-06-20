<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <view class="page-content">
      <LoadingState v-if="loading" title="加载会议中" description="正在同步最新可报名会议。" />
      <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="retryLoadConferences" />
      <EmptyState
        v-else-if="conferences.length === 0"
        :title="hasConferenceFilter ? '没有匹配会议' : '暂无可报名会议'"
        :description="hasConferenceFilter ? '请调整搜索关键词或筛选标签后再试。' : '会议发布后会显示在这里，请稍后再来查看。'"
        mark="会"
        :action-text="hasConferenceFilter ? '清除筛选' : '刷新'"
        @action="retryLoadConferences"
      />

      <PageRenderer
        v-else-if="cmsPage"
        :components="cmsPage.version.components"
        :theme="theme"
        :conferences="conferences"
        @open-conference="goDetail"
      />

      <view v-else class="list">
        <ConferenceCard
          v-for="conference in conferences"
          :key="conference.id"
          :title="conference.title"
          :summary="conference.summary"
          :starts-at="conference.startsAt"
          :ends-at="conference.endsAt"
          :location="conference.location"
          :registration-count="conference.registrationCount"
          :cover-image-url="conference.coverImageUrl"
          :price-text="homeDetailText(conference.id).priceText"
          :deadline-text="homeDetailText(conference.id).deadlineText"
          :status-label="homeDetailText(conference.id).statusLabel"
          :status-tone="homeDetailText(conference.id).statusTone"
          @open="goDetail(conference.id)"
        />
      </view>
      <WechatProfilePrompt />
    </view>
    <CustomTabbar active-page-key="home" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage, onShow } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import ConferenceCard from "@/components/ui/ConferenceCard.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferenceDetail, getConferences, type ConferenceDetail, type ConferenceListItem } from "@/services/conference";
import { ApiRequestError } from "@/services/request";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";

const HOME_REFRESH_INTERVAL_MS = 30 * 1000;

const loading = ref(false);
const error = ref("");
const conferences = ref<ConferenceListItem[]>([]);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const homeDetails = ref<Record<string, HomeConferenceDetailText>>({});
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

onShareAppMessage(() => buildPageShare(cmsPage.value, "/pages/index/index", "会议报名"));

async function loadConferences() {
  loading.value = true;
  error.value = "";

  try {
    const [items, page, themeConfig] = await Promise.all([getConferences(conferenceFilter.value), getPublishedPage("home"), getAppTheme("home")]);
    conferences.value = items;
    cmsPage.value = page;
    theme.value = themeConfig;
    homeDetails.value = await loadHomeDetails(items);
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
  if (hasConferenceFilter.value && conferences.value.length === 0) {
    conferenceFilter.value = {};
  }
  void loadConferences();
}

function readQueryText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function loadHomeDetails(items: ConferenceListItem[]): Promise<Record<string, HomeConferenceDetailText>> {
  const entries = await Promise.allSettled(
    items.map(async (item) => {
      const detail = await getConferenceDetail(item.id);
      return [item.id, buildHomeDetailText(detail)] as const;
    })
  );

  const next: Record<string, HomeConferenceDetailText> = {};
  entries.forEach((entry, index) => {
    const fallback = buildHomeDetailText(items[index]);
    if (entry.status === "fulfilled") {
      next[entry.value[0]] = entry.value[1];
    } else {
      next[items[index]?.id ?? `fallback-${index}`] = fallback;
    }
  });
  return next;
}

function homeDetailText(id: string): HomeConferenceDetailText {
  return homeDetails.value[id] ?? {
    priceText: "查看票种",
    deadlineText: "以详情页为准",
    statusLabel: "报名中",
    statusTone: "success"
  };
}

function buildHomeDetailText(item: ConferenceListItem | ConferenceDetail): HomeConferenceDetailText {
  const detail = item as Partial<ConferenceDetail>;
  return {
    priceText: priceRangeText(detail.skus ?? []),
    deadlineText: detail.registrationEndsAt ? formatDateTime(detail.registrationEndsAt) : "以详情页为准",
    ...statusFor(detail.registrationStartsAt, detail.registrationEndsAt, item.startsAt, item.endsAt)
  };
}

function priceRangeText(skus: ConferenceDetail["skus"]): string {
  if (!Array.isArray(skus) || skus.length === 0) {
    return "查看票种";
  }
  const prices = skus.map((sku) => sku.priceCent).filter((value) => Number.isFinite(value));
  if (prices.length === 0) {
    return "查看票种";
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${formatCent(min)}` : `¥${formatCent(min)} 起`;
}

function statusFor(
  registrationStartsAt: string | null | undefined,
  registrationEndsAt: string | null | undefined,
  startsAt: string,
  endsAt: string
): Pick<HomeConferenceDetailText, "statusLabel" | "statusTone"> {
  const now = Date.now();
  const regStart = registrationStartsAt ? new Date(registrationStartsAt).getTime() : 0;
  const regEnd = registrationEndsAt ? new Date(registrationEndsAt).getTime() : 0;
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();

  if (regStart && now < regStart) return { statusLabel: "即将报名", statusTone: "warning" };
  if (regEnd && now > regEnd) return { statusLabel: "报名截止", statusTone: "neutral" };
  if (Number.isFinite(end) && now > end) return { statusLabel: "已结束", statusTone: "neutral" };
  if (Number.isFinite(start) && now > start) return { statusLabel: "进行中", statusTone: "info" };
  return { statusLabel: "报名中", statusTone: "success" };
}

function goDetail(id: string) {
  uni.navigateTo({
    url: `/pages/conference/detail?id=${encodeURIComponent(id)}`
  });
}

interface HomeConferenceDetailText {
  priceText: string;
  deadlineText: string;
  statusLabel: string;
  statusTone: "info" | "success" | "warning" | "danger" | "neutral";
}
</script>

<style scoped>
.page {
  position: relative;
  padding-bottom: calc(228rpx + env(safe-area-inset-bottom));
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

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
</style>
