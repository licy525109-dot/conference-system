<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <LoadingState v-if="loading" title="加载报名凭证中" description="正在同步报名、订单和支付信息。" />
    <ErrorState v-else-if="error" title="凭证加载失败" :message="error" primary-text="重新加载" secondary-text="我的报名" @retry="loadCredential" @secondary="goMyRegistrations" />
    <view v-else-if="credential" class="credential">
      <view
        v-for="component in credentialComponents"
        :key="component.id"
        :class="credentialBlockClass(component)"
      >
        <template v-if="component.type === 'credential-header'">
        <text class="success-kicker">报名成功</text>
        <text class="success-title">{{ displayText(credential.conference.name) }}</text>
        <text class="success-no">报名号：{{ credential.registrationNo }}</text>
        <view class="credential-status-row">
          <text>支付状态：{{ paymentStatusText(credential.payment.status) }}</text>
          <text>报名状态：{{ registrationStatusText(credential.status) }}</text>
          <text>签到状态：{{ checkinStatusText(credential.checkIn.status) }}</text>
        </view>
        </template>

        <template v-else-if="component.type === 'credential-qr'">
        <QrCodeMatrix :value="credential.qrPayload" label="电子报名凭证二维码" />
        <view class="qr-copy">
          <text class="qr-title">{{ componentTitle(component, "电子报名凭证") }}</text>
          <text class="qr-desc">{{ stringConfig(component, "description") || "请妥善保存报名凭证，工作人员可扫码完成签到核销。二维码不包含手机号、姓名等个人信息。" }}</text>
          <text class="qr-code">报名号：{{ credential.credentialCode }}</text>
        </view>
        </template>

        <AiAssistantEntry v-else-if="component.type === 'credential-ai-entry'" :conference-id="credential.conference.id" />

        <template v-else-if="component.type === 'credential-conference-info'">
        <text class="section-title">{{ componentTitle(component, "会议信息") }}</text>
        <InfoLine label="时间" :value="`${formatDateTime(credential.conference.startTime)} - ${formatDateTime(credential.conference.endTime)}`" />
        <InfoLine label="地点" :value="displayText(credential.conference.venue)" />
        <InfoLine label="地址" :value="displayText(credential.conference.address)" />
        <InfoLine label="票种" :value="displayText(credential.ticket.name)" />
        </template>

        <template v-else-if="component.type === 'credential-attendee-info'">
        <text class="section-title">{{ componentTitle(component, "参会人信息") }}</text>
        <InfoLine label="姓名" :value="displayText(credential.attendee.name)" />
        <InfoLine label="手机号" :value="displayText(credential.attendee.mobileMasked)" />
        <InfoLine label="公司" :value="displayText(credential.attendee.company)" />
        <InfoLine label="职位" :value="displayText(credential.attendee.title)" />
          <view v-if="booleanConfig(component, 'showWechatUser', true)" class="wechat-user">
            <image v-if="credential.user.avatarUrl" class="wechat-avatar" :src="credential.user.avatarUrl" mode="aspectFill" />
            <view v-else class="wechat-avatar wechat-avatar--empty">{{ displayText(credential.user.nickname).slice(0, 1) }}</view>
            <view class="wechat-user__copy">
              <text>{{ displayText(credential.user.nickname) }}</text>
              <text>{{ displayText(credential.user.phoneMasked) }}</text>
            </view>
          </view>
        </template>

        <template v-else-if="component.type === 'credential-payment-info'">
        <text class="section-title">{{ componentTitle(component, "支付信息") }}</text>
        <InfoLine label="支付金额" :value="`¥${formatCent(credential.payment.paidAmountCent)}`" highlight />
        <InfoLine label="支付状态" :value="paymentStatusText(credential.payment.status)" />
        <InfoLine label="支付渠道" :value="providerText(credential.payment.provider)" />
        <InfoLine label="报名状态" :value="registrationStatusText(credential.status)" />
        <InfoLine label="订单号" :value="credential.order.orderNo" />
        <InfoLine label="支付时间" :value="formatDateTime(credential.payment.paidAt) || '-'" />
        </template>

        <template v-else-if="component.type === 'credential-form-summary'">
        <text class="section-title">{{ componentTitle(component, "报名表单摘要") }}</text>
        <InfoLine v-for="item in credential.formSummary" :key="item.label" :label="item.label" :value="item.value" />
          <text v-if="credential.formSummary.length === 0" class="empty-copy">{{ stringConfig(component, "emptyText") || "暂无补充报名字段" }}</text>
        </template>

        <template v-else-if="component.type === 'credential-checkin-info'">
        <text class="section-title">{{ componentTitle(component, "签到信息") }}</text>
        <InfoLine label="签到状态" :value="checkinStatusText(credential.checkIn.status)" highlight />
        <InfoLine label="签到时间" :value="credential.checkIn.checkedInAt ? formatDateTime(credential.checkIn.checkedInAt) : '暂无'" />
        </template>

        <template v-else-if="component.type === 'credential-actions'">
        <button class="ui-button-primary action" @click="goCheckin">{{ stringConfig(component, "checkinText") || "去签到" }}</button>
        <button v-if="credential.links.groupJoinUrl" class="ui-button-secondary action" @click="openLink(credential.links.groupJoinUrl, '会议客户群暂未配置')">{{ stringConfig(component, "groupText") || "加入会议客户群" }}</button>
        <button class="ui-button-secondary action" @click="openLink(credential.links.agendaUrl, '会议议程暂未配置')">{{ stringConfig(component, "agendaText") || "查看议程" }}</button>
        <button class="ui-button-secondary action" @click="openLink(credential.links.guideUrl, '参会指南暂未配置')">{{ stringConfig(component, "guideText") || "参会指南" }}</button>
        <button class="ui-button-secondary action" @click="openLink(credential.links.contactUrl, '客服入口暂未配置')">{{ stringConfig(component, "contactText") || "联系客服" }}</button>
        <button class="ui-button-secondary action" @click="calendarTodo">{{ stringConfig(component, "calendarText") || "添加到日历" }}</button>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import AiAssistantEntry from "@/components/AiAssistantEntry.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import QrCodeMatrix from "@/components/QrCodeMatrix.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { applyPageTitle, getPublishedPage, type CmsComponent, type PublishedPage } from "@/services/cms";
import { getOrderRegistrationCredential, getRegistrationCredential } from "@/services/registration";
import type { RegistrationCredential } from "@/services/registration-types";
import { formatDateTime } from "@/utils/date";
import { formatCent } from "@/utils/money";

const InfoLine = defineComponent({
  props: {
    label: { type: String, required: true },
    value: { type: String, required: true },
    highlight: { type: Boolean, default: false }
  },
  setup(props) {
    return () => h("view", { class: "info-line" }, [
      h("text", { class: "info-label" }, props.label),
      h("text", { class: props.highlight ? "info-value info-value--highlight" : "info-value" }, props.value)
    ]);
  }
});

const registrationId = ref("");
const orderNo = ref("");
const credential = ref<RegistrationCredential | null>(null);
const cmsPage = ref<PublishedPage | null>(null);
const loading = ref(false);
const error = ref("");
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("registration-success");

const FALLBACK_CREDENTIAL_COMPONENTS: CmsComponent[] = [
  { id: "credential-header-default", type: "credential-header", enabled: true, sortOrder: 0, config: { title: "报名成功", statusText: "报名成功" } },
  { id: "credential-qr-default", type: "credential-qr", enabled: true, sortOrder: 10, config: { title: "电子报名凭证", description: "请妥善保存报名凭证，工作人员可扫码完成签到核销。二维码不包含手机号、姓名等个人信息。" } },
  { id: "credential-conference-default", type: "credential-conference-info", enabled: true, sortOrder: 20, config: { title: "会议信息" } },
  { id: "credential-attendee-default", type: "credential-attendee-info", enabled: true, sortOrder: 30, config: { title: "参会人信息", showWechatUser: true } },
  { id: "credential-payment-default", type: "credential-payment-info", enabled: true, sortOrder: 40, config: { title: "支付信息" } },
  { id: "credential-form-default", type: "credential-form-summary", enabled: true, sortOrder: 50, config: { title: "报名表单摘要", emptyText: "暂无补充报名字段" } },
  { id: "credential-checkin-default", type: "credential-checkin-info", enabled: true, sortOrder: 60, config: { title: "签到信息" } },
  { id: "credential-actions-default", type: "credential-actions", enabled: true, sortOrder: 70, config: { checkinText: "去签到", groupText: "加入会议客户群", agendaText: "查看议程", guideText: "参会指南", contactText: "联系客服", calendarText: "添加到日历" } }
];

const credentialComponents = computed(() => {
  const published = cmsPage.value?.version.components.filter((item) => item.type.startsWith("credential-")) ?? [];
  const source = published.length > 0 ? published : FALLBACK_CREDENTIAL_COMPONENTS;
  return source.filter((item) => item.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
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
    const page = await getPublishedPage("registration-success", { conferenceId: credentialData.conference.id });
    credential.value = credentialData;
    cmsPage.value = page;
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

function openLink(url: string | undefined, emptyText: string) {
  if (!url) {
    uni.showToast({ title: emptyText, icon: "none" });
    return;
  }
  uni.navigateTo({ url: `/pages/custom/index?url=${encodeURIComponent(url)}` });
}

function calendarTodo() {
  uni.showToast({ title: "日历提醒能力后续开放", icon: "none" });
}

function goCheckin() {
  if (!credential.value) return;
  uni.navigateTo({ url: `/pages/checkin/self?conferenceId=${encodeURIComponent(credential.value.conference.id)}&registrationId=${encodeURIComponent(credential.value.registrationId)}` });
}

function goMyRegistrations() {
  uni.navigateTo({ url: "/pages/registrations/my" });
}

function paymentStatusText(value: string) {
  return ({ SUCCESS: "支付成功", PAID: "已支付", PENDING: "待支付", FAILED: "支付失败" } as Record<string, string>)[value] ?? value;
}

function registrationStatusText(value: string) {
  return ({ CONFIRMED: "已确认", PENDING: "待确认", CANCELLED: "已取消", REFUNDED: "已退款" } as Record<string, string>)[value] ?? value;
}

function checkinStatusText(value: string) {
  return ({ NOT_REQUIRED: "无需签到核销", PENDING: "待签到", CHECKED_IN: "已签到", CANCELLED: "已取消" } as Record<string, string>)[value] ?? value;
}

function providerText(value: string | null | undefined) {
  if (!value) return "未填写";
  return ({ WECHAT: "微信支付", MOCK: "Mock 测试" } as Record<string, string>)[value] ?? value;
}

function displayText(value: string | null | undefined) {
  return typeof value === "string" && value.trim() ? value.trim() : "未填写";
}

function stringConfig(component: CmsComponent, key: string): string {
  const value = component.config?.[key];
  return typeof value === "string" ? value : "";
}

function booleanConfig(component: CmsComponent, key: string, fallback = false): boolean {
  const value = component.config?.[key];
  return typeof value === "boolean" ? value : fallback;
}

function componentTitle(component: CmsComponent, fallback: string): string {
  return stringConfig(component, "title") || fallback;
}

function credentialBlockClass(component: CmsComponent) {
  const style = stringConfig(component, "cardStyle") || "standard";
  const base = [`is-${style}`];
  if (component.type === "credential-header") return ["success-band", ...base];
  if (component.type === "credential-qr") return ["qr-panel", ...base];
  if (component.type === "credential-actions") return ["actions", ...base];
  return ["section", ...base];
}
</script>

<style scoped>
.page {
  position: relative;
  min-height: 100vh;
  padding-bottom: 72rpx;
}

.credential {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 24rpx;
}

.success-band,
.qr-panel,
.section {
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.success-band.is-highlight,
.qr-panel.is-highlight,
.section.is-highlight {
  border-color: var(--ui-color-primary);
  background: linear-gradient(135deg, var(--ui-color-primary-soft), var(--ui-color-surface));
}

.success-band.is-plain,
.qr-panel.is-plain,
.section.is-plain {
  box-shadow: none;
}

.success-band {
  padding: 34rpx 30rpx;
}

.success-kicker,
.success-no {
  display: block;
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.success-title {
  display: block;
  margin: 12rpx 0;
  color: var(--ui-color-text);
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.25;
}

.credential-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 18rpx;
}

.credential-status-row text {
  padding: 8rpx 14rpx;
  border-radius: 999rpx;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 22rpx;
  font-weight: 800;
}

.qr-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24rpx;
  padding: 28rpx;
}

.qr-panel :deep(.qr-shell) {
  width: 320rpx;
  height: 320rpx;
  border-radius: 18rpx;
}

.qr-code {
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 20rpx;
}

.qr-copy {
  width: 100%;
  min-width: 0;
  text-align: center;
}

.qr-title,
.section-title {
  display: block;
  color: var(--ui-color-text);
  font-size: 30rpx;
  font-weight: 900;
}

.qr-desc {
  display: block;
  margin-top: 12rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.6;
}

.section {
  padding: 28rpx;
}

.section-title {
  margin-bottom: 18rpx;
}

.info-line {
  display: flex;
  justify-content: space-between;
  gap: 24rpx;
  padding: 14rpx 0;
  border-top: 1px solid var(--ui-color-border);
}

.info-label {
  color: var(--ui-color-subtle);
  font-size: 24rpx;
}

.info-value {
  flex: 1;
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 700;
  line-height: 1.45;
  text-align: right;
  word-break: break-word;
}

.info-value--highlight {
  color: var(--ui-color-primary);
  font-size: 28rpx;
  font-weight: 900;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16rpx;
}

.actions.is-highlight {
  padding: 20rpx;
  border: 1px solid var(--ui-color-primary);
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary-soft);
}

.action {
  width: 100%;
}

.empty-copy {
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.6;
}

.wechat-user {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding-top: 14rpx;
  border-top: 1px solid var(--ui-color-border);
}

.wechat-avatar {
  display: grid;
  place-items: center;
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 30rpx;
  font-weight: 900;
}

.wechat-user__copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 6rpx;
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 800;
}

.wechat-user__copy text + text {
  color: var(--ui-color-muted);
  font-size: 23rpx;
  font-weight: 600;
}
</style>
