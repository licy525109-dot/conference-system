<template>
  <view :class="pageClass" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view class="page-content">
      <LoadingState v-if="loading" title="加载会议详情中" description="正在读取会议、票种和页面内容。" />
      <ErrorState
        v-else-if="error"
        :message="error"
        primary-text="重新加载"
        secondary-text="返回首页"
        @retry="loadDetail"
        @secondary="goHome"
      />

      <view v-else-if="conference" class="content">
        <view v-if="isModuleVisible('conferenceInfo')" class="hero ui-card">
          <StatusTag :label="registrationStatus.label" :tone="registrationStatus.tone" />
          <text class="title">{{ conference.title }}</text>
          <text class="summary">{{ conference.summary || "会议报名已开放，请选择合适的报名规格并填写参会信息。" }}</text>
          <view class="facts">
            <view class="fact">
              <text class="fact-label">会议时间</text>
              <text class="fact-value">{{ formatDateTime(conference.startsAt) }} - {{ formatDateTime(conference.endsAt) }}</text>
            </view>
            <view class="fact">
              <text class="fact-label">会议地点</text>
              <text class="fact-value">{{ conference.location || "待公布" }}</text>
            </view>
            <view class="fact">
              <text class="fact-label">报名截止</text>
              <text class="fact-value">{{ conference.registrationEndsAt ? formatDateTime(conference.registrationEndsAt) : "以主办方通知为准" }}</text>
            </view>
          </view>
        </view>

        <AiAssistantEntry v-if="showAssistant" :conference-id="conference.id" />

        <FormSection v-if="isModuleVisible('skus')" :title="displaySettings.skusTitle" description="报名规格来自后台票种配置。金额以提交订单时系统计算结果为准。">
          <EmptyState v-if="conference.skus.length === 0" title="暂无可报名规格" description="主办方尚未开放报名票种。" mark="票" />
          <view v-else class="sku-list">
            <view v-for="sku in conference.skus" :key="sku.id" class="sku-card">
              <view class="sku-info">
                <text class="sku-name">{{ sku.name }}</text>
                <text class="sku-desc">{{ sku.description || "标准报名规格" }}</text>
                <view v-if="isModuleVisible('inventory') && stockDisplayMode !== 'HIDDEN'" class="stock-row">
                  <StatusTag :label="stockLabel(sku)" :tone="remainingStock(sku) > 0 ? 'success' : 'neutral'" />
                  <text v-if="stockDisplayMode === 'EXACT'" class="stock">库存 {{ Math.max(sku.stock - sku.soldCount, 0) }} / {{ sku.stock }}</text>
                </view>
              </view>
              <view class="sku-side">
                <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
                <button v-if="isModuleVisible('submitOrder')" class="ui-button-primary ui-button-compact sku-button" @click="goRegister(sku.id)">{{ displaySettings.primaryButtonText }}</button>
              </view>
            </view>
          </view>
        </FormSection>

        <FormSection v-if="isModuleVisible('guide')" :title="displaySettings.guideTitle" description="以下内容由主办方维护，报名前请确认参会安排。">
          <PageRenderer
            v-if="cmsPage"
            :components="cmsPage.version.components"
            :theme="theme"
            :conference="conference"
            suppress-registration-cta
            @register="goRegisterFirst"
          />
          <text v-else class="body-text">{{ contentText }}</text>
        </FormSection>
      </view>
      <WechatProfilePrompt />
    </view>
    <CustomTabbar active-page-key="conference-detail" />
    <FixedBottomActionBar
      v-if="conference && isModuleVisible('submitOrder')"
      amount-label="报名费用"
      :amount-value="priceRangeText"
      note="金额以提交订单时系统计算结果为准"
      :primary-text="displaySettings.primaryButtonText"
      :primary-disabled="conference.skus.length === 0"
      tabbar-offset
      @primary="goRegisterFirst"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import AiAssistantEntry from "@/components/AiAssistantEntry.vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import FixedBottomActionBar from "@/components/ui/FixedBottomActionBar.vue";
import FormSection from "@/components/ui/FormSection.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { applyPageTitle, buildPageShare, DEFAULT_THEME, getAppTheme, getPublishedPage, type PublishedPage, type ThemeConfig } from "@/services/cms";
import { getConferenceDetail, type ConferenceDetail, type RegistrationSku } from "@/services/conference";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const conferenceId = ref("");
const conference = ref<ConferenceDetail | null>(null);
const cmsPage = ref<PublishedPage | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");
const pageStyle = computed(() => ({
  ...createCmsThemeVars(theme.value),
  ...createCmsBackgroundStyle(theme.value, "body")
}));
const pageClass = computed(() => ["page", "ui-page"]);
const showBodyVideo = computed(() => theme.value.backgroundMode === "video" && Boolean(theme.value.backgroundVideoUrl) && theme.value.backgroundApplyTo !== "header");
const showBodyDynamicBackground = computed(() => theme.value.backgroundMode === "dynamic-gradient" && theme.value.backgroundApplyTo !== "header");

const displaySettings = computed(() => normalizeDetailDisplay(conference.value?.contentJson));
const stockDisplayMode = computed(() => displaySettings.value.inventoryDisplayMode);
const showAssistant = computed(() => isModuleVisible("assistant") && displaySettings.value.assistantMode === "ai");
const contentText = computed(() => toContentText(conference.value?.contentJson) || "会议议程、嘉宾和报名说明请以主办方发布内容为准。");
const priceRangeText = computed(() => {
  const prices = conference.value?.skus.map((sku) => sku.priceCent).filter(Number.isFinite) ?? [];
  if (prices.length === 0) {
    return "暂无票种";
  }
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${formatCent(min)}` : `¥${formatCent(min)} 起`;
});
const registrationStatus = computed(() => {
  const detail = conference.value;
  if (!detail) {
    return { label: "报名中", tone: "success" as const };
  }
  const now = Date.now();
  const regStart = detail.registrationStartsAt ? new Date(detail.registrationStartsAt).getTime() : 0;
  const regEnd = detail.registrationEndsAt ? new Date(detail.registrationEndsAt).getTime() : 0;
  if (regStart && now < regStart) return { label: "即将报名", tone: "warning" as const };
  if (regEnd && now > regEnd) return { label: "报名截止", tone: "neutral" as const };
  return { label: "报名中", tone: "success" as const };
});

onLoad((query) => {
  conferenceId.value = String(query?.id || query?.conferenceId || "");
  void loadDetail();
});

onShareAppMessage(() =>
  buildPageShare(
    cmsPage.value,
    `/pages/conference/detail?id=${encodeURIComponent(conferenceId.value)}`,
    conference.value?.title || "会议详情"
  )
);

async function loadDetail() {
  if (!conferenceId.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    const [detail, page, themeConfig] = await Promise.all([
      getConferenceDetail(conferenceId.value),
      getPublishedPage("conference-detail", { conferenceId: conferenceId.value }),
      getAppTheme("conference-detail")
    ]);
    conference.value = detail;
    cmsPage.value = page;
    theme.value = themeConfig;
    applyPageTitle(page, detail.title);
  } catch (err) {
    console.error("[CONFERENCE_DETAIL_LOAD_ERROR]", err);
    error.value = "会议详情加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function goRegister(skuId: string) {
  uni.navigateTo({
    url: `/pages/registration/form?conferenceId=${encodeURIComponent(conferenceId.value)}&skuId=${encodeURIComponent(skuId)}`
  });
}

function goRegisterFirst() {
  const sku = conference.value?.skus.find((item) => remainingStock(item) > 0) ?? conference.value?.skus[0];
  if (!sku) {
    uni.showToast({ title: "暂无可报名规格", icon: "none" });
    return;
  }
  goRegister(sku.id);
}

function remainingStock(sku: RegistrationSku): number {
  return Math.max(sku.stock - sku.soldCount, 0);
}

function stockLabel(sku: RegistrationSku): string {
  const remaining = remainingStock(sku);
  if (remaining <= 0) return "已售罄";
  if (stockDisplayMode.value === "EXACT") return "可报名";
  return remaining <= displaySettings.value.lowStockThreshold ? "库存紧张" : "名额充足";
}

function isModuleVisible(moduleKey: string): boolean {
  return displaySettings.value.visibleModules.includes(moduleKey);
}

function toContentText(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toContentText).filter(Boolean).join("\n");
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const candidates = [record.title, record.text, record.content, record.description, record.blocks, record.sections];
    return candidates.map(toContentText).filter(Boolean).join("\n");
  }

  return "";
}

function normalizeDetailDisplay(value: unknown) {
  const defaults = {
    visibleModules: ["conferenceInfo", "assistant", "skus", "inventory", "submitOrder", "guide"],
    assistantMode: "ai",
    skusTitle: "报名规格",
    guideTitle: "会议详情",
    primaryButtonText: "立即报名",
    inventoryDisplayMode: "STATUS" as "EXACT" | "STATUS" | "HIDDEN",
    lowStockThreshold: 10
  };
  const content = readRecord(value);
  const source = readRecord(content.detailDisplay);
  const visibleModules = Array.isArray(source.visibleModules) ? source.visibleModules.filter((item): item is string => typeof item === "string") : defaults.visibleModules;
  const mode = String(source.inventoryDisplayMode || defaults.inventoryDisplayMode).toUpperCase();
  return {
    ...defaults,
    visibleModules: visibleModules.length ? visibleModules : defaults.visibleModules,
    assistantMode: typeof source.assistantMode === "string" ? source.assistantMode : defaults.assistantMode,
    skusTitle: typeof source.skusTitle === "string" && source.skusTitle.trim() ? source.skusTitle.trim() : defaults.skusTitle,
    guideTitle: typeof source.guideTitle === "string" && source.guideTitle.trim() ? source.guideTitle.trim() : defaults.guideTitle,
    primaryButtonText: typeof source.primaryButtonText === "string" && source.primaryButtonText.trim() ? source.primaryButtonText.trim() : defaults.primaryButtonText,
    inventoryDisplayMode: mode === "EXACT" || mode === "HIDDEN" ? mode : "STATUS",
    lowStockThreshold: Number.isFinite(Number(source.lowStockThreshold)) ? Math.max(1, Number(source.lowStockThreshold)) : defaults.lowStockThreshold
  };
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
</script>

<style scoped>
.page {
  position: relative;
  padding-bottom: calc(260rpx + env(safe-area-inset-bottom));
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

.page-content {
  position: relative;
  z-index: 1;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 32rpx;
  background: var(--cms-gradient-card);
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 44rpx;
  font-weight: 900;
  line-height: 1.35;
}

.summary {
  color: var(--ui-color-muted);
  font-size: 27rpx;
  line-height: 1.55;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 22rpx;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.fact {
  display: flex;
  justify-content: space-between;
  gap: 22rpx;
}

.fact-label {
  color: var(--ui-color-subtle);
  font-size: 24rpx;
}

.fact-value {
  flex: 1;
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 800;
  line-height: 1.4;
  text-align: right;
}

.sku-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.sku-card {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
  border: 1px solid var(--cms-border);
  border-radius: var(--cms-radius-md);
  background: var(--cms-surface-soft);
}

.sku-info {
  flex: 1;
  min-width: 0;
}

.sku-side {
  width: 190rpx;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 16rpx;
}

.sku-name {
  display: block;
  color: var(--ui-color-text);
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.35;
}

.sku-desc,
.stock,
.body-text {
  display: block;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.stock-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 16rpx;
}

.price {
  display: block;
  color: var(--cms-primary-strong);
  font-size: 32rpx;
  font-weight: 900;
  text-align: right;
}

.sku-button {
  min-width: 154rpx;
}
</style>
