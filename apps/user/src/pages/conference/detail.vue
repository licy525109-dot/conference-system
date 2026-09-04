<template>
  <view class="page ui-page" :style="pageStyle">
    <view class="page-content">
      <LoadingState v-if="loading" title="加载会议详情中" description="正在读取会议和报名信息。" />
      <ErrorState
        v-else-if="error"
        :message="error"
        primary-text="重新加载"
        secondary-text="返回首页"
        @retry="loadDetail"
        @secondary="goHome"
      />

      <view v-else-if="conference" class="content">
        <ConferenceDetailOverview
          :conference="conference"
          :status-label="registrationStatus.label"
          :status-tone="registrationStatus.tone"
          :registration-deadline="registrationDeadline"
          :price-range-text="priceRangeText"
          :skus="registrationSkus"
          @open-tickets="openTicketSelector"
        />

        <view v-if="detailSections.length" class="detail-section" aria-label="会议详情栏目">
          <scroll-view v-if="detailSections.length > 1" class="detail-section-nav" scroll-x :show-scrollbar="false">
            <view class="detail-section-nav__inner">
              <button
                v-for="section in detailSections"
                :key="section.id"
                :class="['detail-section-nav__item', { 'is-active': section.id === activeDetailSectionId }]"
                @click="activeDetailSectionId = section.id"
              >
                {{ section.title }}
              </button>
            </view>
          </scroll-view>
          <view v-if="detailSections.length === 1" class="detail-section__header">
            <view>
              <text class="detail-section__title">{{ activeDetailSection?.title }}</text>
              <text class="detail-section__subtitle">主办方发布的图文内容</text>
            </view>
          </view>
          <ConferenceDetailRichText v-if="activeDetailSectionRenderable" :content="activeDetailSectionContent" />
          <ConferenceDetailLongImage v-if="showLongImageInActiveSection" :segments="detailLongImageSegments" />
          <view v-if="!activeDetailSectionRenderable && !showLongImageInActiveSection" class="detail-section__empty">
            <wd-icon name="info-circle" size="24px" />
            <text>本栏目暂未发布内容</text>
          </view>
        </view>

        <view v-else class="detail-section" aria-label="活动详情">
          <view class="detail-section__header">
            <view>
              <text class="detail-section__title">活动详情</text>
              <text class="detail-section__subtitle">主办方发布的图文内容</text>
            </view>
          </view>
          <ConferenceDetailRichText v-if="detailRichTextRenderable" :content="detailRichText" />
          <ConferenceDetailContent
            v-else-if="!hasDetailRichText && detailContentBlocks.length"
            :blocks="detailContentBlocks"
            @action="handleDetailAction"
          />
          <ConferenceDetailLongImage v-if="detailLongImage" :segments="detailLongImage.segments" />
          <view v-if="!detailHasContent" class="detail-section__empty">
            <wd-icon name="info-circle" size="24px" />
            <text>主办方暂未上传活动详情</text>
          </view>
        </view>
      </view>
      <WechatProfilePrompt />
    </view>

    <CustomTabbar active-page-key="conference-detail" />
    <ConferenceTicketSelector
      :visible="ticketSheetVisible"
      :skus="registrationSkus"
      :selected-sku-id="selectedSkuId"
      @close="ticketSheetVisible = false"
      @select="selectSku"
      @confirm="confirmTicketSelection"
    />
    <FixedBottomActionBar
      v-if="conference"
      amount-label="报名费用"
      :amount-value="priceRangeText"
      :primary-text="registrationPrimaryText"
      :primary-disabled="registrationSkus.length === 0 || registrationAvailability === 'ENDED'"
      tabbar-offset
      @primary="goRegisterFirst"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShareAppMessage } from "@dcloudio/uni-app";
import ConferenceDetailContent from "@/components/conference/ConferenceDetailContent.vue";
import ConferenceDetailLongImage from "@/components/conference/ConferenceDetailLongImage.vue";
import ConferenceDetailOverview from "@/components/conference/ConferenceDetailOverview.vue";
import ConferenceDetailRichText from "@/components/conference/ConferenceDetailRichText.vue";
import ConferenceTicketSelector from "@/components/conference/ConferenceTicketSelector.vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import FixedBottomActionBar from "@/components/ui/FixedBottomActionBar.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { DEFAULT_THEME, getAppTheme, type ThemeConfig } from "@/services/cms";
import { getConferenceDetail, reserveConferenceAppointment, type ConferenceDetail, type RegistrationSku } from "@/services/conference";
import { ensureLogin } from "@/services/auth";
import { createCmsThemeVars } from "@/theme/cmsTheme";
import { normalizeConferenceDetailLongImage } from "@/utils/conferenceDetail";
import {
  hasConferenceDetailSectionsContract,
  hasConferenceDetailRichTextContract,
  isConferenceDetailRichTextRenderable,
  normalizeConferenceDetailContent,
  normalizeConferenceDetailRichText,
  normalizeConferenceDetailSections,
  type ConferenceDetailSection,
  type ConferenceDetailContentBlock
} from "@conference/shared";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";
import { remainingRegistrationStock } from "@/utils/registration-stock";

const conferenceId = ref("");
const couponCode = ref("");
const conference = ref<ConferenceDetail | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");
const ticketSheetVisible = ref(false);
const selectedSkuId = ref("");
const activeDetailSectionId = ref("");

const pageStyle = computed(() => createCmsThemeVars(theme.value));
const detailLongImage = computed(() => normalizeConferenceDetailLongImage(conference.value?.contentJson));
const detailRichText = computed(() => normalizeConferenceDetailRichText(conference.value?.contentJson));
const hasDetailRichText = computed(() => hasConferenceDetailRichTextContract(conference.value?.contentJson));
const detailRichTextRenderable = computed(() => isConferenceDetailRichTextRenderable(detailRichText.value));
const detailSections = computed(() => {
  if (!hasConferenceDetailSectionsContract(conference.value?.contentJson)) return [];
  return normalizeConferenceDetailSections(conference.value?.contentJson).items.filter((section) => section.enabled);
});
const activeDetailSection = computed<ConferenceDetailSection | null>(() =>
  detailSections.value.find((section) => section.id === activeDetailSectionId.value) ?? detailSections.value[0] ?? null
);
const activeDetailSectionContent = computed(() => activeDetailSection.value?.content ?? normalizeConferenceDetailRichText(null));
const activeDetailSectionRenderable = computed(() => activeDetailSection.value
  ? isConferenceDetailRichTextRenderable(activeDetailSection.value.content)
  : false
);
const detailLongImageSegments = computed(() => detailLongImage.value?.segments ?? []);
const showLongImageInActiveSection = computed(() => Boolean(
  detailLongImage.value?.segments.length
  && activeDetailSection.value?.id === detailSections.value[0]?.id
));
const detailContentBlocks = computed(() => normalizeConferenceDetailContent(conference.value?.contentJson).blocks);
const detailHasContent = computed(() => detailRichTextRenderable.value || (!hasDetailRichText.value && detailContentBlocks.value.length > 0) || Boolean(detailLongImage.value?.segments.length));
const registrationSkus = computed(() => {
  const skus = conference.value?.skus;
  return Array.isArray(skus) ? skus : [];
});
const priceRangeText = computed(() => {
  const prices = registrationSkus.value.map((sku) => sku.priceCent).filter(Number.isFinite);
  if (prices.length === 0) return "暂无票种";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${formatCent(min)}` : `¥${formatCent(min)} 起`;
});
const registrationAvailability = computed<"OPEN" | "NOT_STARTED" | "ENDED">(() => getRegistrationAvailability(conference.value));
const registrationStatus = computed<{ label: string; tone: "success" | "warning" | "neutral" }>(() => {
  if (registrationAvailability.value === "NOT_STARTED") return { label: "即将报名", tone: "warning" };
  if (registrationAvailability.value === "ENDED") return { label: "报名截止", tone: "neutral" };
  return { label: "报名中", tone: "success" };
});
const registrationPrimaryText = computed(() => {
  if (registrationAvailability.value === "NOT_STARTED") return "预约报名";
  if (registrationAvailability.value === "ENDED") return "报名已截止";
  return "我要报名";
});
const registrationDeadline = computed(() => {
  return conference.value?.registrationEndsAt ? formatDateTime(conference.value.registrationEndsAt) : "以主办方通知为准";
});

onLoad((query) => {
  conferenceId.value = String(query?.id || query?.conferenceId || "");
  couponCode.value = typeof query?.couponCode === "string" ? query.couponCode : "";
  void loadDetail();
});

onShareAppMessage(() => ({
  title: conference.value?.title || "会议详情",
  path: `/pages/conference/detail?id=${encodeURIComponent(conferenceId.value)}`,
  imageUrl: conference.value?.coverImageUrl || undefined
}));

async function loadDetail() {
  if (!conferenceId.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const [detail, themeConfig] = await Promise.all([
      getConferenceDetail(conferenceId.value),
      getAppTheme("conference-detail").catch(() => ({ ...DEFAULT_THEME }))
    ]);
    conference.value = detail;
    theme.value = themeConfig;
    activeDetailSectionId.value = normalizeConferenceDetailSections(detail.contentJson).items.find((section) => section.enabled)?.id ?? "";
    selectedSkuId.value = firstAvailableSku(detail.skus)?.id ?? detail.skus[0]?.id ?? "";
    uni.setNavigationBarTitle({ title: detail.title || "会议详情" });
  } catch (err) {
    console.error("[CONFERENCE_DETAIL_LOAD_ERROR]", err);
    error.value = "会议详情加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

async function goRegisterFirst() {
  if (registrationAvailability.value === "ENDED") {
    uni.showToast({ title: "报名已截止", icon: "none" });
    return;
  }
  if (registrationAvailability.value === "NOT_STARTED") {
    await reserveAppointment();
    return;
  }
  openTicketSelector();
}

function openTicketSelector() {
  if (registrationAvailability.value === "ENDED") {
    uni.showToast({ title: "报名已截止", icon: "none" });
    return;
  }
  if (registrationAvailability.value === "NOT_STARTED") {
    void reserveAppointment();
    return;
  }
  const skus = registrationSkus.value;
  const selectedSku = skus.find((sku) => sku.id === selectedSkuId.value && remainingStock(sku) > 0);
  if (!selectedSku) selectedSkuId.value = firstAvailableSku(skus)?.id ?? "";
  if (!selectedSkuId.value) {
    uni.showToast({ title: "暂无可报名规格", icon: "none" });
    return;
  }
  ticketSheetVisible.value = true;
}

function selectSku(skuId: string) {
  selectedSkuId.value = skuId;
}

function confirmTicketSelection() {
  const sku = registrationSkus.value.find((item) => item.id === selectedSkuId.value && remainingStock(item) > 0);
  if (!sku) {
    uni.showToast({ title: "暂无可报名规格", icon: "none" });
    return;
  }
  ticketSheetVisible.value = false;
  const couponQuery = couponCode.value ? `&couponCode=${encodeURIComponent(couponCode.value)}` : "";
  uni.navigateTo({
    url: `/pages/registration/form?conferenceId=${encodeURIComponent(conferenceId.value)}&skuId=${encodeURIComponent(sku.id)}${couponQuery}`
  });
}

async function reserveAppointment() {
  if (!conferenceId.value) return;
  try {
    await ensureLogin();
    const result = await reserveConferenceAppointment(conferenceId.value);
    uni.showToast({ title: result.message || "预约成功", icon: "none" });
  } catch (err) {
    console.error("[CONFERENCE_APPOINTMENT_ERROR]", err);
    uni.showToast({ title: "预约失败，请稍后重试", icon: "none" });
  }
}

async function handleDetailAction(block: ConferenceDetailContentBlock) {
  if (block.actionTargetType === "registration") {
    await goRegisterFirst();
    return;
  }
  if (block.actionTargetType === "phone") {
    if (!block.phone) return showMissingAction("联系电话未配置");
    uni.makePhoneCall({ phoneNumber: block.phone, fail: () => undefined });
    return;
  }
  if (block.actionTargetType === "copy") {
    if (!block.copyText) return showMissingAction("复制内容未配置");
    uni.setClipboardData({
      data: block.copyText,
      success: () => uni.showToast({ title: "内容已复制", icon: "none" }),
      fail: () => uni.showToast({ title: "复制失败", icon: "none" })
    });
    return;
  }
  if (block.actionTargetType === "external-h5") {
    if (!block.externalUrl) return showMissingAction("外部链接未配置");
    // #ifdef H5
    window.open(block.externalUrl, "_blank", "noopener,noreferrer");
    // #endif
    // #ifndef H5
    uni.setClipboardData({
      data: block.externalUrl,
      success: () => uni.showToast({ title: "链接已复制", icon: "none" })
    });
    // #endif
  }
}

function showMissingAction(title: string) {
  uni.showToast({ title, icon: "none" });
}

function remainingStock(sku: RegistrationSku): number {
  return remainingRegistrationStock(sku);
}

function firstAvailableSku(skus: RegistrationSku[]): RegistrationSku | null {
  return skus.find((item) => remainingStock(item) > 0) ?? null;
}

function getRegistrationAvailability(detail: ConferenceDetail | null): "OPEN" | "NOT_STARTED" | "ENDED" {
  if (!detail) return "OPEN";
  const now = Date.now();
  const registrationStart = parseDateTime(detail.registrationStartsAt || detail.startsAt);
  const registrationEnd = parseDateTime(detail.registrationEndsAt || detail.endsAt);
  if (Number.isFinite(registrationEnd) && now > registrationEnd) return "ENDED";
  if (Number.isFinite(registrationStart) && now < registrationStart) return "NOT_STARTED";
  return "OPEN";
}

function parseDateTime(value: string | null | undefined): number {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  padding: 0 0 calc(360rpx + env(safe-area-inset-bottom));
  overflow: visible;
  background: #f3f5f3;
  box-sizing: border-box;
}

.page-content {
  position: relative;
  z-index: 1;
}

.content {
  width: 100%;
  max-width: 820px;
  margin: 0 auto;
}

.detail-section {
  margin: 0 30rpx 32rpx;
  overflow: hidden;
  border-radius: 26rpx;
  background: #fbfcfa;
  box-shadow: 0 12rpx 34rpx rgba(24, 39, 57, 0.07);
}

.detail-section-nav {
  width: 100%;
  border-bottom: 1px solid #e3e8e5;
  background: #f5f7f5;
  white-space: nowrap;
}

.detail-section-nav__inner {
  display: inline-flex;
  min-width: 100%;
  align-items: center;
  gap: 12rpx;
  padding: 18rpx 22rpx;
  box-sizing: border-box;
}

.detail-section-nav__item {
  width: auto;
  min-width: 150rpx;
  height: 62rpx;
  margin: 0;
  padding: 0 24rpx;
  border: 1px solid transparent;
  border-radius: 8rpx;
  background: transparent;
  color: #667085;
  font-size: 25rpx;
  font-weight: 800;
  line-height: 60rpx;
  white-space: nowrap;
}

.detail-section-nav__item::after {
  border: 0;
}

.detail-section-nav__item.is-active {
  border-color: #cad6db;
  background: #fbfcfa;
  color: #17324a;
}

.detail-section__header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 34rpx 32rpx 16rpx;
  box-sizing: border-box;
}

.detail-section__title,
.detail-section__subtitle {
  display: block;
}

.detail-section__title {
  color: #121d2f;
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.25;
}

.detail-section__title::after {
  display: block;
  width: 58rpx;
  height: 7rpx;
  margin-top: 14rpx;
  border-radius: 999px;
  background: #1d6fe8;
  content: "";
}

.detail-section__subtitle {
  margin-top: 10rpx;
  color: #8a93a2;
  font-size: 23rpx;
  line-height: 1.4;
}

.detail-section__empty {
  display: flex;
  min-height: 220rpx;
  align-items: center;
  justify-content: center;
  gap: 10rpx;
  color: #6f7a88;
  font-size: 26rpx;
}

@media (min-width: 760px) {
  .content {
    box-shadow: 0 20px 60px rgba(24, 39, 57, 0.1);
  }
}
</style>
