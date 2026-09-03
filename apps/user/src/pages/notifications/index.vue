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
          <text v-if="item.summary" class="message-summary">{{ item.summary }}</text>
          <view v-if="schedulePreview(item).length" class="schedule-preview">
            <view v-for="schedule in schedulePreview(item)" :key="schedule.id" class="preview-row">
              <text class="preview-time">{{ timeOnly(schedule.startsAt) }}</text>
              <view class="preview-copy">
                <text>{{ schedule.name }}</text>
                <text v-if="schedule.location || schedule.tableNo">{{ [schedule.location, schedule.tableNo].filter(Boolean).join(' · ') }}</text>
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

    <CustomTabbar active-page-key="notifications" />
  </view>
</template>

<script setup lang="ts">
import { onShow } from "@dcloudio/uni-app";
import { ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { clearExpiredAuthSession, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { getGuestScheduleSubscriptionConfig, subscribeGuestScheduleUpdates, type GuestScheduleSubscriptionConfig } from "@/services/guest-schedule";
import { getMyNotifications, markAllNotificationsRead, markNotificationRead, type UserNotification } from "@/services/user-notifications";

const items = ref<UserNotification[]>([]);
const unreadCount = ref(0);
const loading = ref(false);
const error = ref("");
const filter = ref<"all" | "unread">("all");
const subscriptionConfig = ref<GuestScheduleSubscriptionConfig | null>(null);
const subscribing = ref(false);
const subscribed = ref(false);

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
  const route = item.route?.startsWith("/pages/") ? item.route : "/pages/registrations/schedule";
  uni.navigateTo({ url: route });
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
  return type === "GUEST_SCHEDULE_PUBLISHED" ? "会务安排" : "系统通知";
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

.page-title { display: block; color: #142033; font-size: 40rpx; font-weight: 900; line-height: 1.25; }
.page-subtitle { display: block; margin-top: 8rpx; color: #778292; font-size: 22rpx; line-height: 1.45; }
.text-button { margin: 0; padding: 12rpx 0; border: 0; background: transparent; color: #315f7d; font-size: 23rpx; font-weight: 800; line-height: 1; }
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
.reminder-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; color: #5b746d; font-size: 20rpx; line-height: 1.4; }
.reminder-title { color: #173f35; font-size: 25rpx; font-weight: 900; }
.reminder-button { min-width: 116rpx; height: 58rpx; margin: 0; padding: 0 18rpx; border: 0; border-radius: 8rpx; background: #226c58; color: #fff; font-size: 22rpx; font-weight: 800; line-height: 58rpx; }

.filter-bar { display: inline-grid; grid-template-columns: repeat(2, 1fr); gap: 4rpx; margin: 28rpx 0 20rpx; padding: 4rpx; border-radius: 10rpx; background: #e7ebee; }
.filter-bar button { min-width: 138rpx; height: 56rpx; margin: 0; padding: 0 20rpx; border: 0; border-radius: 7rpx; background: transparent; color: #697585; font-size: 22rpx; font-weight: 800; line-height: 56rpx; }
.filter-bar button.active { background: #fff; color: #16283b; box-shadow: 0 2rpx 8rpx rgba(20, 32, 51, 0.08); }

.message-list { display: flex; flex-direction: column; gap: 16rpx; }
.message-item { display: grid; grid-template-columns: 24rpx minmax(0, 1fr); padding: 26rpx 26rpx 24rpx 18rpx; border: 1px solid #e0e5e8; border-radius: 12rpx; background: #fff; }
.message-item.unread { border-color: #c9dce8; box-shadow: inset 5rpx 0 #2e6689; }
.message-marker { display: flex; justify-content: center; padding-top: 7rpx; }
.message-dot { width: 10rpx; height: 10rpx; border-radius: 50%; background: #c5cbd1; }
.unread .message-dot { background: #2e6689; }
.message-body { min-width: 0; }
.message-meta { color: #87919d; font-size: 20rpx; }
.message-title { display: block; margin-top: 13rpx; color: #142033; font-size: 29rpx; font-weight: 900; line-height: 1.42; }
.message-summary { display: block; margin-top: 9rpx; color: #5f6b79; font-size: 22rpx; line-height: 1.55; }
.schedule-preview { display: flex; flex-direction: column; gap: 12rpx; margin-top: 20rpx; padding: 17rpx 18rpx; border-left: 4rpx solid #b7cbd7; background: #f5f7f8; }
.preview-row { display: grid; grid-template-columns: 76rpx minmax(0, 1fr); gap: 14rpx; }
.preview-time { color: #28536d; font-size: 22rpx; font-weight: 900; }
.preview-copy { display: flex; min-width: 0; flex-direction: column; gap: 3rpx; color: #243447; font-size: 22rpx; font-weight: 800; line-height: 1.4; }
.preview-copy text + text { color: #7a8591; font-size: 19rpx; font-weight: 600; }
.message-footer { margin-top: 20rpx; padding-top: 16rpx; border-top: 1px solid #e8ecef; color: #8a949e; font-size: 20rpx; }
.message-footer text:last-child { color: #315f7d; font-weight: 800; }

@media (min-width: 760px) { .page { max-width: 760px; margin: 0 auto; } }
</style>
