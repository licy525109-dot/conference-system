<template>
  <view class="page ui-page">
    <view class="page-head">
      <view>
        <text class="page-title">消息通知</text>
        <text class="page-subtitle">会议安排和重要提醒会保留在这里</text>
      </view>
      <button v-if="unreadCount > 0" class="text-button" @click="readAll">全部已读</button>
    </view>

    <view v-if="subscriptionConfig?.enabled" class="reminder-bar">
      <view class="reminder-copy">
        <text class="reminder-title">微信会务提醒</text>
        <text>安排再次发布时，允许微信服务通知提醒你</text>
      </view>
      <button class="reminder-button" :disabled="subscribing" @click="subscribe">
        {{ subscribed ? "已开启" : subscribing ? "处理中" : "开启" }}
      </button>
    </view>

    <view class="filter-bar">
      <button :class="{ active: filter === 'all' }" @click="setFilter('all')">全部</button>
      <button :class="{ active: filter === 'unread' }" @click="setFilter('unread')">未读 {{ unreadCount || '' }}</button>
    </view>

    <LoadingState v-if="loading" title="正在加载消息" description="请稍候" />
    <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="load" />
    <EmptyState
      v-else-if="items.length === 0"
      :title="filter === 'unread' ? '没有未读消息' : '暂无消息'"
      :description="filter === 'unread' ? '新发布的会务安排会显示在这里。' : '主办方发布安排后，你会在这里直接看到详情。'"
      mark="讯"
    />
    <view v-else class="message-list">
      <view v-for="item in items" :key="item.id" class="message-item" :class="{ unread: !item.readAt }" @click="openNotification(item)">
        <view class="message-marker"><view class="message-dot" /></view>
        <view class="message-body">
          <view class="message-meta">
            <text>{{ typeText(item.type) }}</text>
            <text>{{ formatMessageTime(item.createdAt) }}</text>
          </view>
          <text class="message-title">{{ item.title }}</text>
          <text v-if="item.summary" class="message-summary">本次更新：{{ item.summary }}</text>
          <view v-if="schedulePreview(item).length" class="schedule-preview">
            <view v-for="schedule in schedulePreview(item)" :key="schedule.id" class="preview-row">
              <view class="preview-time">
                <text>{{ dayOnly(schedule.startsAt) }}</text>
                <text>{{ timeOnly(schedule.startsAt) }}</text>
              </view>
              <view class="preview-copy">
                <text class="preview-name">{{ schedule.name }}</text>
                <view
                  v-for="field in scheduleFields(schedule)"
                  :key="field.key"
                  class="preview-field"
                  :class="{ 'preview-field--strong': field.emphasis }"
                >
                  <text class="preview-field__label">{{ field.label }}：</text>
                  <text class="preview-field__value">{{ field.value }}</text>
                </view>
              </view>
            </view>
          </view>
          <view class="message-footer">
            <text>{{ item.readAt ? "已读" : "新消息" }}</text>
            <text>查看完整安排 ›</text>
          </view>
        </view>
      </view>
    </view>

    <view v-if="selectedNotification" class="detail-mask" @click="closeDetail">
      <view class="detail-sheet" @click.stop>
        <view class="detail-head">
          <view class="detail-head__copy">
            <text class="detail-kicker">会务安排</text>
            <text class="detail-title">{{ selectedNotification.title }}</text>
          </view>
          <button class="detail-close" aria-label="关闭" @click="closeDetail">×</button>
        </view>

        <scroll-view class="detail-scroll" scroll-y>
          <text v-if="selectedNotification.summary" class="detail-summary">本次更新：{{ selectedNotification.summary }}</text>
          <view v-if="detailLoading" class="detail-loading">正在同步完整安排...</view>
          <view v-if="detailSchedules.length" class="detail-schedules">
            <view v-for="schedule in detailSchedules" :key="schedule.id" class="detail-schedule">
              <view class="detail-schedule__time">
                <text>{{ fullDay(schedule.startsAt) }}</text>
                <text>{{ timeRange(schedule.startsAt, schedule.endsAt) }}</text>
              </view>
              <text class="detail-schedule__type">{{ schedule.typeLabel || typeLabel(schedule.type) }}</text>
              <text class="detail-schedule__name">{{ schedule.name }}</text>
              <view v-if="scheduleFields(schedule).length" class="detail-fields">
                <view
                  v-for="field in scheduleFields(schedule)"
                  :key="field.key"
                  class="detail-field"
                  :class="{ 'detail-field--strong': field.emphasis, 'detail-field--note': field.key === 'notes' }"
                >
                  <text class="detail-field__label">{{ field.label }}：</text>
                  <text class="detail-field__value">{{ field.value }}</text>
                </view>
              </view>
            </view>
          </view>
          <view v-else-if="!detailLoading" class="detail-empty">这条通知没有可展示的事项，请联系会务组核对发布内容。</view>
        </scroll-view>

        <button v-if="selectedConferenceId" class="detail-action" @click="openFullSchedule">打开完整日程</button>
      </view>
    </view>

    <WechatProfilePrompt />
    <CustomTabbar active-page-key="notifications" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { clearExpiredAuthSession, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { getGuestScheduleSubscriptionConfig, subscribeGuestScheduleUpdates, type GuestScheduleSubscriptionConfig } from "@/services/guest-schedule";
import { getMyGuestSchedules, type MyGuestScheduleItem } from "@/services/guest-schedule";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification, type UserNotificationScheduleItem } from "@/services/user-notifications";
import { buildGuestScheduleFields } from "@/utils/guestSchedulePresentation";

const items = ref<UserNotification[]>([]);
const unreadCount = ref(0);
const loading = ref(false);
const error = ref("");
const filter = ref<"all" | "unread">("all");
const subscriptionConfig = ref<GuestScheduleSubscriptionConfig | null>(null);
const subscribing = ref(false);
const subscribed = ref(false);
const selectedNotification = ref<UserNotification | null>(null);
const detailSchedules = ref<Array<UserNotificationScheduleItem | MyGuestScheduleItem>>([]);
const detailLoading = ref(false);
const selectedConferenceId = ref("");

onShow(() => {
  void load();
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [result, config] = await Promise.all([
      getMyNotifications(filter.value === "unread"),
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
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "消息加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

function setFilter(value: "all" | "unread") {
  filter.value = value;
  void load();
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
  if (!selectedConferenceId.value) return;

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

function openFullSchedule() {
  const conferenceId = selectedConferenceId.value;
  closeDetail();
  uni.navigateTo({ url: `/pages/registrations/schedule?conferenceId=${encodeURIComponent(conferenceId)}` });
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

function scheduleFields(item: UserNotificationScheduleItem | MyGuestScheduleItem) {
  return buildGuestScheduleFields(item);
}

function typeText(type: string) {
  return type === "GUEST_SCHEDULE_PUBLISHED" ? "会务安排" : "系统通知";
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function dayOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(value));
}

function fullDay(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short" }).format(new Date(value));
}

function timeRange(startsAt: string, endsAt: string | null) {
  return endsAt ? `${timeOnly(startsAt)} - ${timeOnly(endsAt)}` : timeOnly(startsAt);
}

function typeLabel(type: string) {
  return ({ WORKSHOP: "工作坊", DINNER: "晚宴", SPEECH: "分享", REHEARSAL: "彩排", RECEPTION: "接待", OTHER: "其他" } as Record<string, string>)[type] || "会务安排";
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return timeOnly(value);
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 30rpx 28rpx calc(164rpx + env(safe-area-inset-bottom));
  background: #f4f6f7;
  box-sizing: border-box;
}

.page-head,
.message-meta,
.message-footer,
.reminder-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.page-title { display: block; color: #142033; font-size: 44rpx; font-weight: 900; line-height: 1.25; }
.page-subtitle { display: block; margin-top: 10rpx; color: #687585; font-size: 28rpx; line-height: 1.5; }
.text-button { margin: 0; padding: 12rpx 0; border: 0; background: transparent; color: #315f7d; font-size: 28rpx; font-weight: 800; line-height: 1; }
.text-button::after,
.filter-bar button::after,
.reminder-button::after { border: 0; }

.reminder-bar {
  margin-top: 28rpx;
  padding: 22rpx 24rpx;
  border: 1px solid #cfe2dc;
  border-radius: 12rpx;
  background: #edf7f3;
}
.reminder-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; color: #4f6861; font-size: 27rpx; line-height: 1.5; }
.reminder-title { color: #173f35; font-size: 31rpx; font-weight: 900; }
.reminder-button { min-width: 126rpx; height: 66rpx; margin: 0; padding: 0 20rpx; border: 0; border-radius: 8rpx; background: #226c58; color: #fff; font-size: 27rpx; font-weight: 800; line-height: 66rpx; }

.filter-bar { display: inline-grid; grid-template-columns: repeat(2, 1fr); gap: 4rpx; margin: 28rpx 0 20rpx; padding: 4rpx; border-radius: 10rpx; background: #e7ebee; }
.filter-bar button { min-width: 150rpx; height: 64rpx; margin: 0; padding: 0 22rpx; border: 0; border-radius: 7rpx; background: transparent; color: #697585; font-size: 28rpx; font-weight: 800; line-height: 64rpx; }
.filter-bar button.active { background: #fff; color: #16283b; box-shadow: 0 2rpx 8rpx rgba(20, 32, 51, 0.08); }

.message-list { display: flex; flex-direction: column; gap: 16rpx; }
.message-item { display: grid; grid-template-columns: 24rpx minmax(0, 1fr); padding: 26rpx 26rpx 24rpx 18rpx; border: 1px solid #e0e5e8; border-radius: 12rpx; background: #fff; }
.message-item.unread { border-color: #c9dce8; box-shadow: inset 5rpx 0 #2e6689; }
.message-marker { display: flex; justify-content: center; padding-top: 7rpx; }
.message-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: #c5cbd1; }
.unread .message-dot { background: #2e6689; }
.message-body { min-width: 0; }
.message-meta { color: #657381; font-size: 29rpx; line-height: 1.45; }
.message-title { display: block; margin-top: 16rpx; color: #142033; font-size: 40rpx; font-weight: 900; line-height: 1.42; overflow-wrap: anywhere; }
.message-summary { display: block; margin-top: 12rpx; color: #435263; font-size: 32rpx; line-height: 1.6; }
.schedule-preview { display: flex; flex-direction: column; gap: 20rpx; margin-top: 22rpx; padding: 22rpx; border: 1px solid #cfdae0; border-radius: 8rpx; background: #f5f8f8; }
.preview-row { display: grid; grid-template-columns: 112rpx minmax(0, 1fr); gap: 20rpx; }
.preview-row + .preview-row { padding-top: 20rpx; border-top: 1px solid #dce4e7; }
.preview-time { display: flex; flex-direction: column; gap: 4rpx; color: #214d69; font-size: 30rpx; font-weight: 900; line-height: 1.35; font-variant-numeric: tabular-nums; }
.preview-copy { display: flex; min-width: 0; flex-direction: column; gap: 10rpx; color: #243447; line-height: 1.5; }
.preview-name { color: #17263a; font-size: 35rpx; font-weight: 900; overflow-wrap: anywhere; }
.preview-field { display: grid; grid-template-columns: 178rpx minmax(0, 1fr); gap: 8rpx; font-size: 34rpx; }
.preview-field__label { color: #657381; font-weight: 700; white-space: nowrap; }
/* #ifdef H5 */
.preview-field__label :deep(span) { letter-spacing: 0; white-space: nowrap; }
/* #endif */
.preview-field__value { min-width: 0; color: #26384b; font-weight: 800; overflow-wrap: anywhere; }
.preview-field--strong .preview-field__value { color: #8a651f; font-weight: 900; }
.message-footer { margin-top: 24rpx; padding-top: 20rpx; border-top: 1px solid #e1e7e9; color: #657381; font-size: 30rpx; line-height: 1.4; }
.message-footer text:last-child { color: #315f7d; font-weight: 800; }

.detail-mask { position: fixed; inset: 0; z-index: 80; display: flex; align-items: flex-end; background: rgba(13, 23, 35, 0.5); }
.detail-sheet { display: flex; width: 100%; max-height: 88vh; flex-direction: column; padding: 30rpx 30rpx calc(30rpx + env(safe-area-inset-bottom)); border-radius: 20rpx 20rpx 0 0; background: #f7f9f9; box-sizing: border-box; }
.detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 22rpx; padding-bottom: 24rpx; border-bottom: 1px solid #dce3e6; }
.detail-head__copy { min-width: 0; flex: 1; }
.detail-kicker { display: block; color: #2e6689; font-size: 27rpx; font-weight: 900; }
.detail-title { display: block; margin-top: 8rpx; color: #142033; font-size: 38rpx; font-weight: 900; line-height: 1.42; }
.detail-close { width: 68rpx; height: 68rpx; margin: 0; padding: 0; border: 0; border-radius: 50%; background: #e7ecee; color: #213247; font-size: 44rpx; line-height: 64rpx; }
.detail-close::after,
.detail-action::after { border: 0; }
.detail-scroll { min-height: 240rpx; flex: 1; overflow-x: hidden; overflow-y: auto; padding: 24rpx 0; box-sizing: border-box; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; }
.detail-scroll :deep(.uni-scroll-view) { height: 100%; min-height: 0; }
.detail-scroll :deep(.uni-scroll-view-content) { padding-bottom: 10rpx; box-sizing: border-box; }
.detail-summary { display: block; margin-bottom: 22rpx; color: #435263; font-size: 32rpx; line-height: 1.6; }
.detail-loading,
.detail-empty { padding: 42rpx 20rpx; color: #6c7885; font-size: 30rpx; line-height: 1.55; text-align: center; }
.detail-schedules { display: flex; flex-direction: column; gap: 20rpx; }
.detail-schedule { padding: 26rpx; border: 1px solid #dce4e7; border-radius: 10rpx; background: #ffffff; }
.detail-schedule__time { display: flex; align-items: baseline; justify-content: space-between; gap: 16rpx; color: #214d69; font-size: 32rpx; font-weight: 900; font-variant-numeric: tabular-nums; }
.detail-schedule__type { display: inline-block; margin-top: 20rpx; padding: 7rpx 13rpx; border-radius: 6rpx; background: #e8f1f5; color: #28536d; font-size: 28rpx; font-weight: 900; }
.detail-schedule__name { display: block; margin-top: 14rpx; color: #152237; font-size: 39rpx; font-weight: 900; line-height: 1.45; overflow-wrap: anywhere; }
.detail-fields { display: flex; flex-direction: column; gap: 14rpx; margin-top: 22rpx; }
.detail-field { display: grid; grid-template-columns: 178rpx minmax(0, 1fr); gap: 10rpx; color: #273649; font-size: 34rpx; line-height: 1.55; }
.detail-field__label { color: #657381; font-weight: 700; white-space: nowrap; }
/* #ifdef H5 */
.detail-field__label :deep(span) { letter-spacing: 0; white-space: nowrap; }
/* #endif */
.detail-field__value { min-width: 0; font-weight: 800; overflow-wrap: anywhere; }
.detail-field--strong .detail-field__value { color: #8a651f; font-weight: 900; }
.detail-field--note { margin-top: 4rpx; padding: 18rpx 20rpx; border-radius: 8rpx; background: #edf2f4; }
.detail-action { min-height: 90rpx; margin: 10rpx 0 0; border: 0; border-radius: 10rpx; background: #285d7e; color: #ffffff; font-size: 33rpx; font-weight: 900; line-height: 90rpx; }

@media (min-width: 760px) { .page { max-width: 760px; margin: 0 auto; } }
</style>
