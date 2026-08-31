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
        <view :class="['conference-summary', { 'has-cover': conference.coverImageUrl }]">
          <view v-if="conference.coverImageUrl" class="cover-wrap">
            <image class="cover" :src="conference.coverImageUrl" mode="aspectFill" />
            <view class="cover-brand">
              <text>观潮会集</text>
              <text>GUANCHAO CONFERENCE</text>
            </view>
          </view>
          <view v-else class="summary-identity">
            <view class="brand-seal">观</view>
            <view>
              <text class="brand-name">观潮会集</text>
              <text class="brand-tagline">行业会议与创始人社群平台</text>
            </view>
          </view>
          <view class="summary-content">
            <view class="status-row">
              <view class="status-group">
                <text :class="['status', `status--${registrationStatus.tone}`]">{{ registrationStatus.label }}</text>
                <text class="summary-eyebrow">会议报名</text>
              </view>
              <text v-if="conference.location" class="location">{{ conference.location }}</text>
            </view>
            <text class="title">{{ conference.title }}</text>
            <text v-if="conference.summary" class="summary">{{ conference.summary }}</text>
            <view class="facts">
              <view class="fact">
                <text class="fact-icon">日</text>
                <view class="fact-copy">
                  <text class="fact-label">会议时间</text>
                  <text class="fact-value">{{ formatDateTime(conference.startsAt) }} 至 {{ formatDateTime(conference.endsAt) }}</text>
                </view>
              </view>
              <view v-if="conference.location" class="fact">
                <text class="fact-icon">地</text>
                <view class="fact-copy">
                  <text class="fact-label">会议地点</text>
                  <text class="fact-value">{{ conference.location }}</text>
                </view>
              </view>
              <view class="fact">
                <text class="fact-icon">止</text>
                <view class="fact-copy">
                  <text class="fact-label">报名截止</text>
                  <text class="fact-value">{{ registrationDeadline }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <ConferenceDetailContent
          v-if="detailContentBlocks.length"
          :blocks="detailContentBlocks"
          @action="handleDetailAction"
        />
        <ConferenceDetailLongImage
          v-if="detailLongImage"
          :segments="detailLongImage.segments"
        />
      </view>
      <WechatProfilePrompt />
    </view>

    <CustomTabbar active-page-key="conference-detail" />
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
  normalizeConferenceDetailContent,
  type ConferenceDetailContentBlock
} from "@conference/shared";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const conferenceId = ref("");
const couponCode = ref("");
const conference = ref<ConferenceDetail | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const loading = ref(false);
const error = ref("");

const pageStyle = computed(() => createCmsThemeVars(theme.value));
const detailLongImage = computed(() => normalizeConferenceDetailLongImage(conference.value?.contentJson));
const detailContentBlocks = computed(() => normalizeConferenceDetailContent(conference.value?.contentJson).blocks);
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
const registrationStatus = computed(() => {
  if (registrationAvailability.value === "NOT_STARTED") return { label: "即将报名", tone: "warning" };
  if (registrationAvailability.value === "ENDED") return { label: "报名截止", tone: "neutral" };
  return { label: "报名中", tone: "success" };
});
const registrationPrimaryText = computed(() => {
  if (registrationAvailability.value === "NOT_STARTED") return "预约报名";
  if (registrationAvailability.value === "ENDED") return "报名已截止";
  return "立即报名";
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
  const sku = registrationSkus.value.find((item) => remainingStock(item) > 0) ?? registrationSkus.value[0];
  if (!sku) {
    uni.showToast({ title: "暂无可报名规格", icon: "none" });
    return;
  }
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
  return Math.max(sku.stock - sku.soldCount, 0);
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
  padding: 0 0 calc(268rpx + env(safe-area-inset-bottom));
  overflow: visible;
  background: #eef1ef;
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

.conference-summary {
  position: relative;
  background: #fff;
}

.cover-wrap {
  position: relative;
  height: 430rpx;
  overflow: hidden;
  background: #e7e9e6;
}

.cover {
  display: block;
  width: 100%;
  height: 430rpx;
  background: #e7e9e6;
}

.cover-brand {
  position: absolute;
  left: 26rpx;
  bottom: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 2rpx;
  padding: 12rpx 18rpx;
  border-radius: 10rpx;
  background: rgba(15, 31, 51, 0.88);
  color: #ffffff;
}

.cover-brand text:first-child {
  font-size: 24rpx;
  font-weight: 800;
}

.cover-brand text:last-child {
  color: #d7c08c;
  font-size: 14rpx;
  letter-spacing: 0;
}

.summary-identity {
  display: flex;
  min-height: 164rpx;
  align-items: center;
  gap: 22rpx;
  padding: 28rpx 32rpx;
  border-bottom: 1px solid #e8ece9;
  background: #10243e;
  box-sizing: border-box;
}

.brand-seal {
  display: flex;
  width: 82rpx;
  height: 82rpx;
  flex: 0 0 82rpx;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(213, 187, 126, 0.7);
  border-radius: 50%;
  color: #d5bb7e;
  font-family: serif;
  font-size: 38rpx;
  font-weight: 700;
}

.brand-name,
.brand-tagline {
  display: block;
}

.brand-name {
  color: #ffffff;
  font-size: 30rpx;
  font-weight: 800;
}

.brand-tagline {
  margin-top: 8rpx;
  color: #c8d1dc;
  font-size: 21rpx;
}

.summary-content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 36rpx 32rpx 42rpx;
  border-bottom: 1px solid #e2e7e3;
  box-sizing: border-box;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.status-group {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.summary-eyebrow {
  color: #9a752d;
  font-size: 22rpx;
  font-weight: 700;
}

.status {
  display: inline-flex;
  min-height: 46rpx;
  align-items: center;
  padding: 0 18rpx;
  border-radius: 23rpx;
  font-size: 23rpx;
  font-weight: 700;
}

.status--success {
  background: #e7f6ee;
  color: #137a4b;
}

.status--warning {
  background: #fff4dc;
  color: #9a6412;
}

.status--neutral {
  background: #edf0ee;
  color: #667069;
}

.location {
  max-width: 440rpx;
  overflow: hidden;
  color: #68716b;
  font-size: 24rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.title {
  color: #152033;
  font-size: 40rpx;
  font-weight: 800;
  line-height: 1.38;
}

.summary {
  color: #667085;
  font-size: 27rpx;
  line-height: 1.65;
}

.facts {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0;
  margin-top: 8rpx;
  border: 1px solid #e2e7e3;
  border-radius: 14rpx;
  background: #f7f8f6;
  overflow: hidden;
}

.fact {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  padding: 22rpx 24rpx;
  border-bottom: 1px solid #e4e8e5;
}

.fact:last-child {
  border-bottom: 0;
}

.fact-icon {
  display: flex;
  width: 44rpx;
  height: 44rpx;
  flex: 0 0 44rpx;
  align-items: center;
  justify-content: center;
  border-radius: 10rpx;
  background: #10243e;
  color: #d9c18a;
  font-size: 20rpx;
  font-weight: 800;
  line-height: 44rpx;
  text-align: center;
}

.fact-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}

.fact-label {
  color: #8a938d;
  font-size: 21rpx;
  line-height: 1.55;
}

.fact-value {
  color: #293445;
  font-size: 25rpx;
  font-weight: 600;
  line-height: 1.55;
}

@media (min-width: 760px) {
  .content {
    box-shadow: 0 20px 60px rgba(24, 39, 57, 0.1);
  }
}
</style>
