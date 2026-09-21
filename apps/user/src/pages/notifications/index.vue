<template>
  <view class="page ui-page">
    <view class="page-head">
      <view>
        <text class="page-title">会务消息</text>
      </view>
      <button v-if="unreadCount > 0" class="text-button" @click="readAll">全部已读</button>
    </view>

    <view v-if="subscriptionConfig?.enabled" class="reminder-bar">
      <view class="reminder-copy">
        <text class="reminder-title">微信会务提醒</text>
      </view>
      <button class="reminder-button" :disabled="subscribing" @click="subscribe">
        {{ subscribed ? "已开启" : subscribing ? "处理中" : "开启" }}
      </button>
    </view>

    <view class="filter-bar">
      <button :class="{ active: filter === 'all' }" @click="setFilter('all')">全部</button>
      <button :class="{ active: filter === 'unread' }" @click="setFilter('unread')">未读 {{ unreadCount || '' }}</button>
    </view>

    <ErrorState v-if="offline" v-bind="networkFeedback" @retry="retryLoad" />
    <LoadingState v-else-if="loading" title="正在加载消息" />
    <ErrorState
      v-else-if="error"
      :title="authRequired ? '需要微信登录' : networkFeedback.title"
      :message="authRequired ? error : networkFeedback.message"
      :primary-text="authRequired ? '微信登录' : networkFeedback.primaryText"
      :tone="authRequired ? 'error' : networkFeedback.tone"
      @retry="retryLoad"
    />
    <EmptyState
      v-else-if="items.length === 0"
      :title="filter === 'unread' ? '暂时没有未读通知' : '暂未收到任何通知'"
      mark="讯"
    />
    <view v-else class="message-list">
      <view v-for="item in items" :key="item.id" class="message-swipe">
        <button
          class="message-clear"
          :disabled="dismissingId === item.id"
          @click.stop="confirmDismiss(item)"
        >{{ dismissingId === item.id ? "处理中" : "清除" }}</button>
        <view
          class="message-item"
          :class="{ unread: !item.readAt, 'message-item--revealed': revealedId === item.id }"
          @click="handleNotificationClick(item)"
          @touchstart="onSwipeStart(item.id, $event)"
          @touchend="onSwipeEnd(item.id, $event)"
          @touchcancel="cancelSwipe"
        >
          <view class="message-body">
            <text class="message-context">{{ item.payloadJson?.conferenceTitle || typeText(item.type) }}</text>
            <view class="message-heading">
              <text class="message-title">{{ formatGuestScheduleNotificationTitle(item) }}</text>
              <view v-if="!item.readAt" class="message-dot" aria-label="未读" />
            </view>
            <view class="message-meta">
              <text>{{ formatMessageTime(item.createdAt) }}</text>
              <text class="message-status">{{ item.readAt ? "已读" : "未读" }}</text>
            </view>
            <view v-if="schedulePreview(item).length" class="schedule-preview">
              <GuestSchedulePresentation
                v-for="schedule in schedulePreview(item)"
                :key="schedule.id"
                class="preview-row"
                :schedule="schedule"
                :show-heading="schedule.name.trim() !== formatGuestScheduleNotificationTitle(item)"
              />
            </view>
            <view v-if="notificationFields(item).length" class="detail-business-fields">
              <view v-for="field in notificationFields(item)" :key="field.label" class="detail-business-field">
                <text class="detail-business-field__label">{{ field.label }}</text>
                <text class="detail-business-field__value" :class="{ 'detail-business-field__value--strong': field.strong }">{{ field.value }}</text>
              </view>
            </view>
            <text v-if="item.summary" class="message-summary">{{ item.summary }}</text>
            <button class="message-action" @click.stop="handleNotificationClick(item)">{{ notificationActionText(item) }}</button>
          </view>
        </view>
      </view>
    </view>

    <view v-if="selectedNotification" class="detail-mask" @click="closeDetail">
      <view class="detail-sheet" @click.stop>
        <view class="detail-head">
          <view class="detail-head__copy">
            <text class="detail-kicker">{{ selectedNotification.payloadJson?.conferenceTitle || typeText(selectedNotification.type) }}</text>
            <text class="detail-title">{{ formatGuestScheduleNotificationTitle(selectedNotification) }}</text>
            <text class="detail-timestamp">{{ formatMessageTime(selectedNotification.createdAt) }}</text>
          </view>
          <button class="detail-close" aria-label="关闭" title="关闭" @click="closeDetail"><wd-icon name="close" size="22px" /></button>
        </view>

        <scroll-view class="detail-scroll" scroll-y>
          <view v-if="detailLoading" class="detail-loading">正在同步完整安排...</view>
          <view v-if="detailSchedules.length" class="detail-schedules">
            <GuestSchedulePresentation
              v-for="schedule in detailSchedules"
              :key="schedule.id"
              class="detail-schedule"
              :schedule="schedule"
              :show-heading="schedule.name.trim() !== formatGuestScheduleNotificationTitle(selectedNotification)"
            />
          </view>
          <view v-if="notificationFields(selectedNotification).length" class="detail-business-fields">
            <view v-for="field in notificationFields(selectedNotification)" :key="field.label" class="detail-business-field">
              <text class="detail-business-field__label">{{ field.label }}</text>
              <text class="detail-business-field__value" :class="{ 'detail-business-field__value--strong': field.strong }">{{ field.value }}</text>
            </view>
          </view>
          <view
            v-else-if="!detailLoading && detailSchedules.length === 0"
            class="detail-empty"
          >这条通知暂无更多详情，请联系会务组核对。</view>
          <text v-if="selectedNotification.summary" class="detail-summary">{{ selectedNotification.summary }}</text>
          <text v-if="formatGuestScheduleNotificationTitle(selectedNotification) !== selectedNotification.title" class="detail-original-title">{{ selectedNotification.title }}</text>
        </scroll-view>

        <button v-if="canOpenRelated(selectedNotification)" class="detail-action" @click="openRelated">
          {{ notificationActionText(selectedNotification) }}
        </button>
      </view>
    </view>

    <WechatProfilePrompt />
    <CustomTabbar active-page-key="notifications" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { usePageNetwork } from "@/composables/usePageNetwork";
import { ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import GuestSchedulePresentation from "@/components/GuestSchedulePresentation.vue";
import { formatGuestScheduleNotificationTitle } from "@/utils/guestSchedulePresentation";
import { clearExpiredAuthSession, ensureAuthenticatedUser, isAuthSessionExpiredError } from "@/services/auth";
import { getGuestScheduleSubscriptionConfig, subscribeGuestScheduleUpdates, type GuestScheduleSubscriptionConfig } from "@/services/guest-schedule";
import { getMyGuestSchedules, type MyGuestScheduleItem } from "@/services/guest-schedule";
import { dismissNotification, getMyNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification, type UserNotificationScheduleItem } from "@/services/user-notifications";

const items = ref<UserNotification[]>([]);
const unreadCount = ref(0);
const loading = ref(false);
const { offline, feedback: networkFeedback, reportFailure, clearFailure, refreshNetwork } = usePageNetwork(load, loading);
const error = ref("");
const authRequired = ref(false);
const filter = ref<"all" | "unread">("all");
const subscriptionConfig = ref<GuestScheduleSubscriptionConfig | null>(null);
const subscribing = ref(false);
const subscribed = ref(false);
const selectedNotification = ref<UserNotification | null>(null);
const detailSchedules = ref<Array<UserNotificationScheduleItem | MyGuestScheduleItem>>([]);
const detailLoading = ref(false);
const selectedConferenceId = ref("");
const revealedId = ref("");
const dismissingId = ref("");
const ignoredClickId = ref("");
let swipeStart: { id: string; x: number; y: number } | null = null;
let ignoredClickTimer: ReturnType<typeof setTimeout> | null = null;

onShow(() => {
  void load();
});

async function load() {
  if (loading.value) return;
  const requestedFilter = filter.value;
  loading.value = true;
  clearFailure();
  error.value = "";
  authRequired.value = false;
  try {
    await ensureAuthenticatedUser();
    const [result, config] = await Promise.all([
      getMyNotifications(requestedFilter === "unread"),
      getGuestScheduleSubscriptionConfig().catch(() => null)
    ]);
    items.value = result.items;
    unreadCount.value = result.unreadCount;
    subscriptionConfig.value = config;
    uni.$emit("notifications:changed");
  } catch (err) {
    console.error("[USER_NOTIFICATIONS_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      authRequired.value = true;
      error.value = "登录后即可查看你的报名结果、支付状态和会务安排。";
    } else {
      error.value = "消息加载失败，请稍后重试";
      reportFailure(err, error.value);
    }
  } finally {
    loading.value = false;
    if (requestedFilter !== filter.value) void load();
  }
}

function retryLoad() {
  refreshNetwork();
  void load();
}

function setFilter(value: "all" | "unread") {
  revealedId.value = "";
  filter.value = value;
  void load();
}

function onSwipeStart(id: string, event: TouchEvent) {
  const touch = event.touches[0];
  if (!touch) return;
  if (revealedId.value && revealedId.value !== id) revealedId.value = "";
  swipeStart = { id, x: touch.clientX, y: touch.clientY };
}

function onSwipeEnd(id: string, event: TouchEvent) {
  const touch = event.changedTouches[0];
  const start = swipeStart;
  swipeStart = null;
  if (!touch || !start || start.id !== id) return;
  const deltaX = touch.clientX - start.x;
  const deltaY = touch.clientY - start.y;
  if (Math.abs(deltaX) < 36 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
  revealedId.value = deltaX < 0 ? id : "";
  ignoredClickId.value = id;
  if (ignoredClickTimer) clearTimeout(ignoredClickTimer);
  ignoredClickTimer = setTimeout(() => {
    if (ignoredClickId.value === id) ignoredClickId.value = "";
  }, 350);
}

function cancelSwipe() {
  swipeStart = null;
}

function handleNotificationClick(item: UserNotification) {
  if (ignoredClickId.value === item.id) return;
  if (revealedId.value) {
    revealedId.value = "";
    return;
  }
  void openNotification(item);
}

function confirmDismiss(item: UserNotification) {
  if (dismissingId.value) return;
  uni.showModal({
    title: "清除这条消息？",
    content: "清除后，这条消息将不再出现在你的消息列表中。",
    confirmText: "清除",
    confirmColor: "#b83232",
    success: (result) => {
      if (result.confirm) {
        void performDismiss(item);
      } else {
        revealedId.value = "";
      }
    }
  });
}

async function performDismiss(item: UserNotification) {
  dismissingId.value = item.id;
  try {
    await dismissNotification(item.id);
    items.value = items.value.filter((candidate) => candidate.id !== item.id);
    if (!item.readAt) unreadCount.value = Math.max(0, unreadCount.value - 1);
    revealedId.value = "";
    uni.$emit("notifications:changed");
    uni.showToast({ title: "消息已清除", icon: "none" });
  } catch (err) {
    console.error("[USER_NOTIFICATION_DISMISS_ERROR]", err);
    uni.showToast({ title: "清除失败，请稍后重试", icon: "none" });
  } finally {
    dismissingId.value = "";
  }
}

async function readAll() {
  try {
    await markAllNotificationsRead();
    await load();
    uni.showToast({ title: "已全部标记为已读", icon: "none" });
  } catch (err) {
    console.error("[USER_NOTIFICATIONS_READ_ALL_ERROR]", err);
    uni.showToast({ title: "操作失败，请稍后重试", icon: "none" });
  }
}

async function openNotification(item: UserNotification) {
  if (!item.readAt) {
    try {
      await markNotificationRead(item.id);
      item.readAt = new Date().toISOString();
      unreadCount.value = Math.max(0, unreadCount.value - 1);
      uni.$emit("notifications:changed");
    } catch (err) {
      console.error("[USER_NOTIFICATION_READ_ERROR]", err);
    }
  }
  selectedNotification.value = item;
  selectedConferenceId.value = item.payloadJson?.conferenceId || "";
  detailSchedules.value = item.payloadJson?.items || [];
  if (item.type !== "GUEST_SCHEDULE_PUBLISHED" || !selectedConferenceId.value) return;

  detailLoading.value = true;
  try {
    const currentItems = await getMyGuestSchedules(selectedConferenceId.value);
    const ids = new Set(item.payloadJson?.assignmentIds || []);
    const matching = ids.size > 0 ? currentItems.filter((schedule) => ids.has(schedule.id)) : currentItems;
    if (matching.length > 0) detailSchedules.value = matching;
  } catch (err) {
    console.error("[USER_NOTIFICATION_DETAIL_LOAD_ERROR]", err);
  } finally {
    detailLoading.value = false;
  }
}

function closeDetail() {
  selectedNotification.value = null;
  detailSchedules.value = [];
  selectedConferenceId.value = "";
}

function openRelated() {
  const notification = selectedNotification.value;
  const conferenceId = selectedConferenceId.value;
  const route = notification?.route || "";
  closeDetail();
  if (notification?.type === "GUEST_SCHEDULE_PUBLISHED" && conferenceId) {
    uni.navigateTo({ url: `/pages/registrations/schedule?conferenceId=${encodeURIComponent(conferenceId)}` });
    return;
  }
  if (route) uni.navigateTo({ url: route.startsWith("/") ? route : `/${route}` });
}

async function subscribe() {
  if (!subscriptionConfig.value || subscribing.value) return;
  subscribing.value = true;
  try {
    const result = await subscribeGuestScheduleUpdates(subscriptionConfig.value);
    subscribed.value = result.accepted;
    uni.showToast({ title: result.message, icon: result.accepted ? "success" : "none", duration: 2500 });
  } catch (err) {
    console.error("[USER_NOTIFICATIONS_SUBSCRIBE_ERROR]", err);
    uni.showToast({ title: "订阅未完成，请稍后重试", icon: "none" });
  } finally {
    subscribing.value = false;
  }
}

function schedulePreview(item: UserNotification) {
  return item.payloadJson?.items?.slice(0, 2) ?? [];
}

function typeText(type: string) {
  return ({
    GUEST_SCHEDULE_PUBLISHED: "会务安排",
    REGISTRATION_CONFIRMED: "报名确认",
    PAYMENT_SUCCESS: "支付结果",
    REFUND_STATUS_UPDATED: "退款进度"
  } as Record<string, string>)[type] || "系统通知";
}

function notificationActionText(item: UserNotification) {
  if (item.type === "GUEST_SCHEDULE_PUBLISHED") return "查看完整安排";
  if (item.type === "REFUND_STATUS_UPDATED") return "查看退款记录";
  if (item.type === "PAYMENT_SUCCESS" || item.type === "REGISTRATION_CONFIRMED") return "查看报名凭证";
  return item.route ? "查看详情" : "打开消息";
}

function canOpenRelated(item: UserNotification) {
  return Boolean(item.route || (item.type === "GUEST_SCHEDULE_PUBLISHED" && item.payloadJson?.conferenceId));
}

function notificationFields(item: UserNotification) {
  const payload = item.payloadJson;
  if (!payload || item.type === "GUEST_SCHEDULE_PUBLISHED") return [];
  const fields: Array<{ label: string; value: string; strong?: boolean }> = [];
  const add = (label: string, value: unknown, strong = false) => {
    const text = typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
    if (text) fields.push({ label, value: text, strong });
  };
  add("会议名称", payload.conferenceTitle);
  add("参会人", payload.attendeeName);
  add("订单号", payload.orderNo);
  if (item.type === "PAYMENT_SUCCESS" && typeof payload.paidAmountCent === "number") {
    add("支付金额", `¥${formatCent(payload.paidAmountCent)}`, true);
  }
  add("退款单号", payload.refundNo);
  if (typeof payload.amountCent === "number") add("退款金额", `¥${formatCent(payload.amountCent)}`, true);
  add("退款状态", payload.statusLabel, true);
  add("处理说明", payload.reason);
  return fields;
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeOnly(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
</script>

<style scoped>
.page { min-height: 100vh; padding: 24px 20px calc(100px + env(safe-area-inset-bottom)); background: #fff; color: var(--ui-color-text, #18202d); box-sizing: border-box; font-size: 18px; line-height: 1.5; letter-spacing: 0; }
.page-head, .message-meta, .reminder-bar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.page-title { display: block; font-size: 24px; font-weight: 700; line-height: 1.4; }
.text-button { margin: 0; padding: 8px 0; border: 0; background: transparent; color: var(--ui-color-primary, #99732c); font-size: 16px; line-height: 1.5; }
.page button::after { border: 0; }
.reminder-bar { margin-top: 16px; padding: 12px 0; border-top: 1px solid var(--ui-color-border, #e2e5e9); border-bottom: 1px solid var(--ui-color-border, #e2e5e9); }
.reminder-copy { min-width: 0; flex: 1; }
.reminder-title { color: var(--ui-color-muted, #667080); font-size: 18px; }
.reminder-button { min-height: 44px; margin: 0; padding: 8px 16px; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-primary, #99732c); font-size: 16px; line-height: 1.5; }
.filter-bar { display: inline-grid; grid-template-columns: repeat(2, minmax(0, 1fr)); max-width: 100%; margin: 20px 0 0; padding: 3px; border-radius: 4px; background: #f2f3f5; box-sizing: border-box; }
.filter-bar button { min-width: 100px; min-height: 44px; margin: 0; padding: 9px 16px; border: 0; border-radius: 3px; background: transparent; color: var(--ui-color-muted, #667080); font-size: 16px; line-height: 1.5; }
.filter-bar button.active { background: #fff; color: var(--ui-color-primary, #99732c); font-weight: 700; }
.message-list { margin-top: 20px; }
.message-swipe { position: relative; overflow: hidden; background: #b83232; }
.message-swipe + .message-swipe { border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.message-clear { position: absolute; z-index: 0; top: 0; right: 0; display: flex; width: 80px; height: 100%; margin: 0; padding: 0; align-items: center; justify-content: center; border: 0; border-radius: 0; background: #b83232; color: #fff; font-size: 18px; line-height: 1.5; }
.message-clear[disabled] { background: #965555; color: #fff; }
.message-item { position: relative; z-index: 1; width: 100%; padding: 0 0 28px; background: #fff; box-sizing: border-box; transform: translateX(0); transition: transform 180ms ease; }
.message-swipe + .message-swipe .message-item { padding-top: 24px; }
.message-item--revealed { transform: translateX(-80px); }
.message-body { min-width: 0; }
.message-context { display: block; padding: 10px 12px; background: #f5f6f8; color: var(--ui-color-muted, #667080); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.message-heading { display: flex; align-items: baseline; gap: 10px; margin-top: 18px; }
.message-title { min-width: 0; font-size: 30px; font-weight: 700; line-height: 1.35; overflow-wrap: anywhere; }
.message-dot { flex: 0 0 9px; width: 9px; height: 9px; border-radius: 50%; background: #ce463a; }
.message-meta { margin-top: 8px; color: var(--ui-color-muted, #667080); font-size: 14px; }
.message-status { padding: 2px 10px; border-radius: 4px; background: #f2f3f5; font-size: 14px; }
.unread .message-status { background: var(--ui-color-primary-soft, #f7f1e5); color: var(--ui-color-primary, #99732c); }
.schedule-preview { margin-top: 22px; }
.preview-row { display: block; }
.preview-row + .preview-row { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.message-summary, .detail-summary { display: block; margin-top: 20px; color: var(--ui-color-muted, #667080); font-size: 18px; line-height: 1.6; overflow-wrap: anywhere; white-space: pre-wrap; }
.message-action, .detail-action { display: block; width: 100%; min-height: 48px; margin: 22px 0 0; padding: 12px 16px; border: 0; border-radius: 4px; background: var(--ui-color-primary, #99732c); color: #fff; font-size: 18px; font-weight: 700; line-height: 1.5; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; }
.detail-mask { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-end; justify-content: center; background: rgba(18, 24, 32, 0.48); }
.detail-sheet { display: flex; width: 100%; max-width: 640px; height: 88vh; max-height: 88vh; flex-direction: column; padding: 20px 20px calc(20px + env(safe-area-inset-bottom)); border-radius: 8px 8px 0 0; background: #fff; box-sizing: border-box; overflow: hidden; }
.detail-head { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding-bottom: 18px; }
.detail-head__copy { min-width: 0; flex: 1; }
.detail-kicker, .detail-timestamp { display: block; color: var(--ui-color-muted, #667080); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
.detail-title { display: block; margin: 8px 0; font-size: 28px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.detail-close { flex: 0 0 44px; width: 44px; height: 44px; margin: 0; padding: 0; border: 0; border-radius: 4px; background: #f2f3f5; color: var(--ui-color-text, #18202d); font-size: 28px; line-height: 44px; }
.detail-scroll { height: 0; min-height: 0; flex: 1; overflow-x: hidden; overflow-y: auto; box-sizing: border-box; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.detail-scroll :deep(.uni-scroll-view) { height: 100%; min-height: 0; }
.detail-scroll :deep(.uni-scroll-view-content) { padding-bottom: 12px; box-sizing: border-box; }
.detail-loading, .detail-empty { padding: 24px 0; color: var(--ui-color-muted, #667080); font-size: 18px; line-height: 1.5; }
.detail-schedule { display: block; }
.detail-schedule + .detail-schedule { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.detail-business-fields { margin-top: 20px; }
.detail-business-field { padding: 16px 0; border-top: 1px solid var(--ui-color-border, #e2e5e9); line-height: 1.5; }
.detail-business-field__label { display: block; color: var(--ui-color-muted, #667080); font-size: 18px; }
.detail-business-field__value { display: block; min-width: 0; margin-top: 6px; font-size: 24px; font-weight: 700; overflow-wrap: anywhere; white-space: pre-wrap; }
.detail-business-field__value--strong { color: var(--ui-color-primary, #99732c); }
.detail-action { flex-shrink: 0; margin-top: 16px; }
.detail-original-title { display: block; margin-top: 16px; color: var(--ui-color-muted, #667080); font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
@media (min-width: 760px) { .page { max-width: 680px; margin: 0 auto; } }
</style>
