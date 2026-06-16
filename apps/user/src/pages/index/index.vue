<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted object-fit="cover" :controls="false" />
    <view class="hero" :class="heroClass" :style="heroStyle">
      <video v-if="showHeaderVideo" class="hero-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted object-fit="cover" :controls="false" />
      <view>
        <text class="eyebrow">{{ homeHero.eyebrow }}</text>
        <text class="title">{{ homeHero.title }}</text>
        <text class="subtitle">{{ homeHero.subtitle }}</text>
      </view>
      <button v-if="homeHero.buttonText" class="ui-button-secondary ui-button-compact" @click="goHeroAction">{{ homeHero.buttonText }}</button>
    </view>

    <LoadingState v-if="loading" title="加载会议中" description="正在同步最新可报名会议。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="retryLoadConferences" />
    <EmptyState
      v-else-if="conferences.length === 0"
      title="暂无可报名会议"
      description="会议发布后会显示在这里，请稍后再来查看。"
      mark="会"
      action-text="刷新"
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
        :price-text="homeDetailText(conference.id).priceText"
        :deadline-text="homeDetailText(conference.id).deadlineText"
        :status-label="homeDetailText(conference.id).statusLabel"
        :status-tone="homeDetailText(conference.id).statusTone"
        @open="goDetail(conference.id)"
      />
    </view>
    <WechatProfilePrompt />
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
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferenceDetail, getConferences, type ConferenceDetail, type ConferenceListItem } from "@/services/conference";
import { ApiRequestError } from "@/services/request";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";

const HOME_REFRESH_INTERVAL_MS = 30 * 1000;

const loading = ref(false);
const error = ref("");
const conferences = ref<ConferenceListItem[]>([]);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const homeDetails = ref<Record<string, HomeConferenceDetailText>>({});
let hasLoadedOnce = false;
let lastLoadAt = 0;

const homeHero = computed(() => {
  const raw = cmsPage.value?.version.themeJson?.homeHero;
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    eyebrow: stringValue(source.eyebrow, "会议报名"),
    title: stringValue(source.title, "选择会议，完成报名缴费"),
    subtitle: stringValue(source.subtitle, "所有报名费用以提交订单时系统计算结果为准。"),
    buttonText: stringValue(source.buttonText, "我的报名"),
    buttonTarget: stringValue(source.buttonTarget, "/pages/registrations/my"),
    layout: stringValue(source.layout, "split")
  };
});

const pageStyle = computed(() => ({
  "--ui-color-primary": theme.value.primaryColor,
  "--ui-color-accent": theme.value.secondaryColor,
  "--ui-color-bg": theme.value.backgroundColor,
  "--ui-color-surface": theme.value.cardBackground,
  "--ui-radius": `${theme.value.radius}px`,
  ...themeBackgroundStyle(theme.value, "body")
}));
const heroStyle = computed(() => themeBackgroundStyle(theme.value, "header"));
const pageClass = computed(() => ["page", "ui-page", backgroundClass(theme.value)]);
const heroClass = computed(() => [`is-${homeHero.value.layout}`, backgroundClass(theme.value, "header")]);
const showBodyVideo = computed(() => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo !== "header");
const showHeaderVideo = computed(() => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo === "header");

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
  void loadConferences();
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

function goMyRegistrations() {
  uni.navigateTo({
    url: "/pages/registrations/my"
  });
}

function goHeroAction() {
  const target = homeHero.value.buttonTarget || "/pages/registrations/my";
  uni.navigateTo({ url: target });
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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
  padding-bottom: 164rpx;
  overflow: hidden;
}

.hero {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 26rpx;
  padding: 32rpx 0 10rpx;
  overflow: hidden;
}

.hero.is-centered {
  align-items: center;
  flex-direction: column;
  text-align: center;
}

.page-bg-video {
  position: fixed;
  inset: 0;
  z-index: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: none;
}

.hero-bg-video {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.hero > view,
.hero > button {
  position: relative;
  z-index: 1;
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

.eyebrow {
  display: block;
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-text);
  font-size: 44rpx;
  font-weight: 900;
  line-height: 1.24;
}

.subtitle {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
</style>
