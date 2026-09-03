<template>
  <view class="page ui-page" :style="pageStyle">
    <video
      v-if="showBodyVideo"
      class="page-bg-video"
      :src="String(theme.backgroundVideoUrl)"
      :poster="String(theme.backgroundVideoPosterUrl || '')"
      autoplay
      loop
      muted
      playsinline
      webkit-playsinline
      object-fit="cover"
      :controls="false"
    />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <LoadingState v-if="loading" title="加载报名凭证中" description="正在同步报名信息" />
    <ErrorState
      v-else-if="error"
      title="凭证加载失败"
      :message="error"
      primary-text="重新加载"
      secondary-text="我的报名"
      @retry="loadCredential"
      @secondary="goMyRegistrations"
    />

    <view v-else-if="credential" class="credential">
      <view class="success-head">
        <view class="success-mark">✓</view>
        <view class="success-head__copy">
          <text class="success-kicker">{{ credential.complimentary ? "主办方邀请" : "报名已确认" }}</text>
          <text class="success-title">{{ credential.conference.name }}</text>
          <view class="status-row">
            <text>{{ credential.ticket.name }}</text>
            <text>{{ registrationStatusText(credential.status) }}</text>
          </view>
        </view>
      </view>

      <view class="credential-card">
        <view class="qr-wrap">
          <QrCodeMatrix :value="credential.qrPayload" label="电子报名凭证二维码" />
        </view>
        <view class="qr-copy">
          <text class="qr-title">电子报名凭证</text>
          <text class="qr-description">{{ qrDescription }}</text>
          <text class="registration-no">报名号 {{ credential.registrationNo }}</text>
        </view>
      </view>

      <view v-if="conferenceRows.length" class="section-card">
        <view class="section-head">
          <text class="section-title">会议信息</text>
        </view>
        <view class="info-list">
          <view v-for="item in conferenceRows" :key="item.label" class="info-row">
            <text class="info-label">{{ item.label }}</text>
            <text class="info-value" :class="{ 'info-value--strong': item.strong }">{{ item.value }}</text>
          </view>
        </view>
      </view>

      <view v-if="attendeeRows.length" class="section-card">
        <view class="section-head">
          <text class="section-title">参会人</text>
        </view>
        <view class="info-list">
          <view v-for="item in attendeeRows" :key="item.label" class="info-row">
            <text class="info-label">{{ item.label }}</text>
            <text class="info-value">{{ item.value }}</text>
          </view>
        </view>
      </view>

      <view v-if="paymentRows.length" class="section-card">
        <view class="section-head">
          <text class="section-title">支付信息</text>
          <text class="section-state">{{ paymentStatusText(credential.payment.status) }}</text>
        </view>
        <view class="info-list">
          <view v-for="item in paymentRows" :key="item.label" class="info-row">
            <text class="info-label">{{ item.label }}</text>
            <text class="info-value" :class="{ 'info-value--strong': item.strong }">{{ item.value }}</text>
          </view>
        </view>
      </view>

      <view v-if="formRows.length" class="section-card">
        <view class="section-head">
          <text class="section-title">报名信息</text>
        </view>
        <view class="info-list">
          <view v-for="item in formRows" :key="item.label" class="info-row">
            <text class="info-label">{{ item.label }}</text>
            <text class="info-value">{{ item.value }}</text>
          </view>
        </view>
      </view>

      <view v-if="showCheckinSection" class="section-card checkin-card">
        <view class="checkin-copy">
          <text class="section-title">签到状态</text>
          <text class="checkin-status">{{ checkinStatusText(credential.checkIn.status) }}</text>
          <text v-if="credential.checkIn.checkedInAt" class="checkin-time">{{ formatDateTime(credential.checkIn.checkedInAt) }}</text>
        </view>
        <button v-if="canCheckin" class="checkin-button" @click="goCheckin">去签到</button>
      </view>

      <view v-if="actionLinks.length" class="actions-section">
        <text class="actions-title">参会服务</text>
        <view class="actions-grid">
          <button v-for="action in actionLinks" :key="action.key" class="action-button" @click="openLink(action.url)">
            <text>{{ action.title }}</text>
            <text class="action-arrow">›</text>
          </button>
        </view>
      </view>

      <button class="my-registrations-button" @click="goMyRegistrations">返回我的报名</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import QrCodeMatrix from "@/components/QrCodeMatrix.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { applyPageTitle, getPublishedPage } from "@/services/cms";
import { getOrderRegistrationCredential, getRegistrationCredential } from "@/services/registration";
import type { RegistrationCredential } from "@/services/registration-types";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";

interface InfoRow {
  label: string;
  value: string;
  strong?: boolean;
}

const registrationId = ref("");
const orderNo = ref("");
const credential = ref<RegistrationCredential | null>(null);
const loading = ref(false);
const error = ref("");
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("registration-success");

const conferenceRows = computed<InfoRow[]>(() => {
  if (!credential.value) return [];
  const data = credential.value;
  return compactRows([
    { label: "时间", value: formatDateRange(data.conference.startTime, data.conference.endTime) },
    { label: "地点", value: data.conference.venue },
    { label: "地址", value: data.conference.address },
    { label: "票种", value: data.ticket.name, strong: true }
  ]);
});

const attendeeRows = computed<InfoRow[]>(() => {
  if (!credential.value) return [];
  const data = credential.value.attendee;
  return compactRows([
    { label: "姓名", value: data.name },
    { label: "手机号", value: data.mobileMasked },
    { label: "公司", value: data.company },
    { label: "职位", value: data.title }
  ]);
});

const paymentRows = computed<InfoRow[]>(() => {
  if (!credential.value || credential.value.complimentary) return [];
  const data = credential.value;
  return compactRows([
    { label: "实付金额", value: `¥${formatCent(data.payment.paidAmountCent)}`, strong: true },
    { label: "支付渠道", value: providerText(data.payment.provider) },
    { label: "支付时间", value: data.payment.paidAt ? formatDateTime(data.payment.paidAt) : null },
    { label: "订单号", value: data.order.orderNo }
  ]);
});

const formRows = computed<InfoRow[]>(() => compactRows((credential.value?.formSummary ?? []).map((item) => ({
  label: item.label,
  value: item.value
}))));

const showCheckinSection = computed(() => Boolean(credential.value && credential.value.checkIn.status !== "NOT_REQUIRED"));
const canCheckin = computed(() => credential.value?.checkIn.status === "PENDING");
const qrDescription = computed(() => credential.value?.checkIn.status === "NOT_REQUIRED"
  ? "请妥善保存，现场需要时向工作人员出示。"
  : "到场后向工作人员出示二维码，用于签到核销。");
const actionLinks = computed(() => {
  const links = credential.value?.links;
  if (!links) return [];
  return [
    { key: "agenda", title: "查看议程", url: links.agendaUrl },
    { key: "guide", title: "参会指南", url: links.guideUrl },
    { key: "group", title: "加入会议群", url: links.groupJoinUrl },
    { key: "contact", title: "联系客服", url: links.contactUrl }
  ].filter((item): item is { key: string; title: string; url: string } => Boolean(cleanText(item.url)));
});

onLoad((query) => {
  registrationId.value = String(query?.registrationId || "");
  orderNo.value = String(query?.orderNo || "");
  void refreshTheme();
  void loadCredential();
});

async function loadCredential() {
  loading.value = true;
  error.value = "";
  try {
    await ensureLogin();
    const credentialData = registrationId.value
      ? await getRegistrationCredential(registrationId.value)
      : await getOrderRegistrationCredential(orderNo.value);
    credential.value = credentialData;
    const page = await getPublishedPage("registration-success", { conferenceId: credentialData.conference.id });
    applyPageTitle(page, "报名凭证");
  } catch (err) {
    console.error("[REGISTRATION_CREDENTIAL_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "报名凭证加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

function compactRows(rows: Array<{ label: string; value: string | null | undefined; strong?: boolean }>): InfoRow[] {
  return rows.flatMap((row) => {
    const value = cleanText(row.value);
    return value ? [{ ...row, value }] : [];
  });
}

function cleanText(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDateRange(startValue: string, endValue: string) {
  const start = cleanText(startValue);
  const end = cleanText(endValue);
  if (!start) return "";
  if (!end) return formatDateTime(start);
  const startDate = new Date(start);
  const endDate = new Date(end);
  const sameDay = startDate.toDateString() === endDate.toDateString();
  if (sameDay) {
    const date = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(startDate);
    return `${date} ${timeOnly(startDate)} - ${timeOnly(endDate)}`;
  }
  return `${formatDateTime(start)} - ${formatDateTime(end)}`;
}

function timeOnly(value: Date) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(value);
}

function openLink(url: string) {
  uni.navigateTo({ url: `/pages/custom/index?url=${encodeURIComponent(url)}` });
}

function goCheckin() {
  if (!credential.value) return;
  uni.navigateTo({
    url: `/pages/checkin/self?conferenceId=${encodeURIComponent(credential.value.conference.id)}&registrationId=${encodeURIComponent(credential.value.registrationId)}`
  });
}

function goMyRegistrations() {
  uni.redirectTo({ url: "/pages/registrations/my" });
}

function paymentStatusText(value: string) {
  return ({ SUCCESS: "支付成功", PAID: "已支付", PENDING: "待支付", FAILED: "支付失败" } as Record<string, string>)[value] ?? value;
}

function registrationStatusText(value: string) {
  return ({ CONFIRMED: "已确认", PENDING: "待确认", CANCELLED: "已取消", REFUNDED: "已退款" } as Record<string, string>)[value] ?? value;
}

function checkinStatusText(value: string) {
  return ({ PENDING: "待签到", CHECKED_IN: "已签到", CANCELLED: "已取消" } as Record<string, string>)[value] ?? value;
}

function providerText(value: string | null | undefined) {
  if (!value) return "";
  return ({ WECHAT: "微信支付", MOCK: "测试支付" } as Record<string, string>)[value] ?? value;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 26rpx 28rpx calc(64rpx + env(safe-area-inset-bottom));
  background-color: #f3f6f5;
}

.credential {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.success-head {
  display: grid;
  grid-template-columns: 72rpx minmax(0, 1fr);
  gap: 20rpx;
  padding: 18rpx 4rpx 16rpx;
}

.success-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #e3f2ec;
  color: #25755e;
  font-size: 38rpx;
  font-weight: 900;
}

.success-head__copy {
  min-width: 0;
}

.success-kicker {
  display: block;
  color: #25755e;
  font-size: 22rpx;
  font-weight: 900;
}

.success-title {
  display: block;
  margin-top: 8rpx;
  color: #17202f;
  font-size: 34rpx;
  font-weight: 900;
  line-height: 1.38;
}

.status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 14rpx;
}

.status-row text {
  padding: 5rpx 11rpx;
  border-radius: 4rpx;
  background: #e9f0f4;
  color: #426078;
  font-size: 19rpx;
  font-weight: 800;
}

.credential-card,
.section-card,
.checkin-card {
  border: 1px solid #dce5e8;
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 24rpx rgba(23, 32, 47, 0.05);
}

.credential-card {
  display: grid;
  grid-template-columns: 220rpx minmax(0, 1fr);
  align-items: center;
  gap: 24rpx;
  padding: 26rpx;
}

.qr-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.credential-card :deep(.qr-shell) {
  width: 210rpx;
  height: 210rpx;
}

.qr-copy {
  min-width: 0;
}

.qr-title,
.section-title,
.actions-title {
  display: block;
  color: #182336;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.35;
}

.qr-description {
  display: block;
  margin-top: 11rpx;
  color: #6b7785;
  font-size: 20rpx;
  line-height: 1.55;
}

.registration-no {
  display: block;
  margin-top: 16rpx;
  color: #315d7d;
  font-size: 19rpx;
  font-weight: 800;
  line-height: 1.45;
  word-break: break-all;
}

.section-card {
  padding: 0 24rpx;
}

.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  min-height: 84rpx;
  border-bottom: 1px solid #edf0f2;
}

.section-state {
  color: #26745d;
  font-size: 20rpx;
  font-weight: 800;
}

.info-list {
  padding: 2rpx 0;
}

.info-row {
  display: grid;
  grid-template-columns: 122rpx minmax(0, 1fr);
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1px solid #f0f2f3;
  font-size: 22rpx;
  line-height: 1.5;
}

.info-row:last-child {
  border-bottom: 0;
}

.info-label {
  color: #8a95a0;
}

.info-value {
  min-width: 0;
  color: #374454;
  text-align: right;
  word-break: break-word;
}

.info-value--strong {
  color: #244861;
  font-weight: 900;
}

.checkin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 22rpx;
  padding: 23rpx 24rpx;
}

.checkin-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 5rpx;
}

.checkin-status {
  color: #536171;
  font-size: 21rpx;
}

.checkin-time {
  color: #8a95a0;
  font-size: 19rpx;
}

.checkin-button {
  min-width: 126rpx;
  height: 62rpx;
  margin: 0;
  padding: 0 20rpx;
  border: 0;
  border-radius: 7rpx;
  background: #315d7d;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 62rpx;
}

.checkin-button::after,
.action-button::after,
.my-registrations-button::after {
  border: 0;
}

.actions-section {
  margin-top: 6rpx;
}

.actions-title {
  margin-bottom: 13rpx;
  padding: 0 4rpx;
  font-size: 25rpx;
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
}

.action-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
  height: 74rpx;
  margin: 0;
  padding: 0 20rpx;
  border: 1px solid #dce5e8;
  border-radius: 7rpx;
  background: #ffffff;
  color: #30465a;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 74rpx;
  text-align: left;
}

.action-arrow {
  color: #99a3ad;
  font-size: 31rpx;
  font-weight: 500;
}

.my-registrations-button {
  height: 72rpx;
  margin: 8rpx 0 0;
  border: 1px solid #d5e0e5;
  border-radius: 7rpx;
  background: rgba(255, 255, 255, 0.9);
  color: #315d7d;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 70rpx;
}

@media (max-width: 370px) {
  .credential-card {
    grid-template-columns: 184rpx minmax(0, 1fr);
    gap: 18rpx;
    padding: 22rpx;
  }

  .credential-card :deep(.qr-shell) {
    width: 176rpx;
    height: 176rpx;
  }
}
</style>
