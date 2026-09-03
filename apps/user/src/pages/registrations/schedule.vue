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

    <view class="page-heading">
      <view class="page-heading__copy">
        <text class="page-title">我的会务安排</text>
        <text class="page-subtitle">主办方发布的工作坊、晚宴及分享安排</text>
      </view>
      <button class="refresh-button" :disabled="loading" @click="load">{{ loading ? "同步中" : "刷新" }}</button>
    </view>

    <LoadingState v-if="loading && items.length === 0" title="正在同步安排" description="请稍候" />
    <ErrorState v-else-if="error && items.length === 0" :message="error" primary-text="重新加载" @retry="load" />
    <EmptyState
      v-else-if="items.length === 0"
      title="暂无已发布安排"
      description="主办方确认并发布后，你会在消息列表和这里看到具体事项。"
      mark="排"
    />

    <template v-else>
      <scroll-view v-if="conferences.length > 1" class="conference-switch" scroll-x :show-scrollbar="false">
        <view class="conference-switch__inner">
          <button
            v-for="conference in conferences"
            :key="conference.id"
            class="conference-option"
            :class="{ active: conference.id === selectedConferenceId }"
            @click="selectedConferenceId = conference.id"
          >
            {{ conference.title }}
          </button>
        </view>
      </scroll-view>

      <view class="conference-overview">
        <view class="conference-overview__accent" />
        <view class="conference-overview__body">
          <text class="conference-name">{{ selectedConference?.title }}</text>
          <view class="conference-facts">
            <view class="fact">
              <text class="fact-label">日期</text>
              <text>{{ formatConferenceDate(selectedConference?.startsAt, selectedConference?.endsAt) }}</text>
            </view>
            <view v-if="selectedConference?.location" class="fact">
              <text class="fact-label">地点</text>
              <text>{{ selectedConference.location }}</text>
            </view>
          </view>
          <view class="publish-meta">
            <text>{{ selectedConferenceItems.length }} 项已发布</text>
            <text v-if="latestPublishedAt">更新于 {{ formatShortTime(latestPublishedAt) }}</text>
          </view>
        </view>
      </view>

      <view v-if="attendees.length > 1" class="attendee-block">
        <text class="switch-label">查看参会人</text>
        <scroll-view class="attendee-switch" scroll-x :show-scrollbar="false">
          <view class="attendee-switch__inner">
            <button
              v-for="attendee in attendees"
              :key="attendee.id"
              class="attendee-option"
              :class="{ active: attendee.id === selectedAttendeeId }"
              @click="selectedAttendeeId = attendee.id"
            >
              <text>{{ attendee.name }}</text>
              <text>{{ attendee.registrationNo }}</text>
            </button>
          </view>
        </scroll-view>
      </view>

      <scroll-view v-if="days.length > 1" class="day-switch" scroll-x :show-scrollbar="false">
        <view class="day-switch__inner">
          <button
            v-for="day in days"
            :key="day.key"
            class="day-option"
            :class="{ active: day.key === selectedDay }"
            @click="selectedDay = day.key"
          >
            <text>{{ day.weekday }}</text>
            <text>{{ day.label }}</text>
          </button>
        </view>
      </scroll-view>

      <view class="schedule-section">
        <view class="section-heading">
          <view>
            <text class="section-title">{{ currentAttendee?.name }}的安排</text>
            <text class="section-subtitle">{{ selectedDayLabel }}</text>
          </view>
          <text class="section-count">{{ visibleItems.length }} 项</text>
        </view>

        <view v-if="visibleItems.length" class="timeline">
          <view v-for="item in visibleItems" :key="item.id" class="timeline-item">
            <view class="time-column">
              <text class="time-main">{{ timeOnly(item.startsAt) }}</text>
              <text v-if="item.endsAt" class="time-end">{{ timeOnly(item.endsAt) }}</text>
            </view>
            <view class="timeline-rail">
              <view class="timeline-dot" :data-type="item.type" />
              <view class="timeline-line" />
            </view>
            <view class="schedule-card">
              <view class="schedule-card__head">
                <text class="type-label" :data-type="item.type">{{ item.typeLabel }}</text>
                <text v-if="item.role" class="role-label">{{ item.role }}</text>
              </view>
              <text class="schedule-name">{{ item.name }}</text>
              <view v-if="hasItemDetails(item)" class="schedule-details">
                <view v-if="item.location" class="detail-row">
                  <text class="detail-label">地点</text>
                  <text class="detail-value">{{ item.location }}</text>
                </view>
                <view v-if="item.tableNo" class="detail-row detail-row--highlight">
                  <text class="detail-label">席位</text>
                  <text class="detail-value">{{ item.tableNo }}{{ item.isTableLeader ? " · 本桌桌长" : "" }}</text>
                </view>
                <view v-if="item.shareTopic" class="detail-row">
                  <text class="detail-label">内容</text>
                  <text class="detail-value">{{ item.shareTopic }}</text>
                </view>
                <view v-if="item.notes" class="schedule-note">
                  <text>{{ item.notes }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>
        <view v-else class="day-empty">
          <text>当天暂无安排</text>
        </view>
      </view>

      <view v-if="subscriptionConfig?.enabled" class="subscribe-strip">
        <view class="subscribe-strip__content">
          <text class="subscribe-title">微信更新提醒</text>
          <text>主办方再次发布安排时，通过微信服务通知提醒你。</text>
        </view>
        <button class="subscribe-button" :disabled="subscribing || subscribed" @click="subscribe">
          {{ subscribed ? "已开启" : subscribing ? "处理中" : "开启" }}
        </button>
      </view>
    </template>

    <CustomTabbar active-page-key="notifications" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { clearExpiredAuthSession, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import {
  getGuestScheduleSubscriptionConfig,
  getMyGuestSchedules,
  subscribeGuestScheduleUpdates,
  type GuestScheduleSubscriptionConfig,
  type MyGuestScheduleItem
} from "@/services/guest-schedule";

const items = ref<MyGuestScheduleItem[]>([]);
const loading = ref(false);
const error = ref("");
const initialConferenceId = ref("");
const selectedConferenceId = ref("");
const selectedAttendeeId = ref("");
const selectedDay = ref("");
const subscriptionConfig = ref<GuestScheduleSubscriptionConfig | null>(null);
const subscribing = ref(false);
const subscribed = ref(false);
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("my-registrations");

const conferences = computed(() => {
  const seen = new Map<string, MyGuestScheduleItem["conference"]>();
  for (const item of items.value) seen.set(item.conference.id, item.conference);
  return Array.from(seen.values());
});
const selectedConference = computed(() => conferences.value.find((item) => item.id === selectedConferenceId.value) ?? conferences.value[0]);
const selectedConferenceItems = computed(() => items.value.filter((item) => item.conference.id === selectedConference.value?.id));
const attendees = computed(() => {
  const seen = new Map<string, { id: string; name: string; registrationNo: string }>();
  for (const item of selectedConferenceItems.value) {
    seen.set(item.attendee.id, {
      id: item.attendee.id,
      name: item.attendee.name,
      registrationNo: item.attendee.registration.registrationNo
    });
  }
  return Array.from(seen.values());
});
const currentAttendee = computed(() => attendees.value.find((item) => item.id === selectedAttendeeId.value) ?? attendees.value[0]);
const selectedAttendeeItems = computed(() => selectedConferenceItems.value.filter((item) => item.attendee.id === currentAttendee.value?.id));
const days = computed(() => {
  const keys = Array.from(new Set(selectedAttendeeItems.value.map((item) => dayKey(item.startsAt))));
  return keys.sort().map((key) => ({ key, label: dayLabel(key), weekday: weekdayLabel(key) }));
});
const visibleItems = computed(() => selectedAttendeeItems.value
  .filter((item) => dayKey(item.startsAt) === selectedDay.value)
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
const selectedDayLabel = computed(() => days.value.find((item) => item.key === selectedDay.value)?.label || "");
const latestPublishedAt = computed(() => selectedConferenceItems.value
  .map((item) => item.publishedAt)
  .filter((value): value is string => Boolean(value))
  .sort()
  .at(-1) || "");

watch(selectedConferenceId, () => {
  selectedAttendeeId.value = attendees.value[0]?.id || "";
});
watch([selectedConferenceId, selectedAttendeeId], () => {
  selectedDay.value = days.value[0]?.key || "";
});

onLoad((query) => {
  initialConferenceId.value = String(query?.conferenceId || "");
  void refreshTheme();
  void load();
});

async function load() {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const [scheduleItems, config] = await Promise.all([
      getMyGuestSchedules(),
      getGuestScheduleSubscriptionConfig().catch(() => null)
    ]);
    items.value = scheduleItems;
    subscriptionConfig.value = config;
    const requested = initialConferenceId.value;
    selectedConferenceId.value = conferences.value.some((item) => item.id === requested)
      ? requested
      : conferences.value[0]?.id || "";
    selectedAttendeeId.value = attendees.value[0]?.id || "";
    selectedDay.value = days.value[0]?.key || "";
  } catch (err) {
    console.error("[GUEST_SCHEDULE_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "会务安排加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

async function subscribe() {
  if (!subscriptionConfig.value || subscribing.value || subscribed.value) return;
  subscribing.value = true;
  try {
    const result = await subscribeGuestScheduleUpdates(subscriptionConfig.value);
    subscribed.value = result.accepted;
    uni.showToast({ title: result.message, icon: result.accepted ? "success" : "none", duration: 2500 });
  } catch (err) {
    console.error("[GUEST_SCHEDULE_SUBSCRIBE_ERROR]", err);
    uni.showToast({ title: "订阅未完成，请稍后重试", icon: "none" });
  } finally {
    subscribing.value = false;
  }
}

function hasItemDetails(item: MyGuestScheduleItem) {
  return Boolean(item.location || item.tableNo || item.shareTopic || item.notes);
}

function dayKey(value: string) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dayLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric" }).format(date);
}

function weekdayLabel(key: string) {
  const date = new Date(`${key}T00:00:00`);
  return new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(date);
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}

function formatConferenceDate(startsAt?: string, endsAt?: string) {
  if (!startsAt) return "";
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const startText = new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(start);
  if (!end || start.toDateString() === end.toDateString()) return startText;
  return `${startText} - ${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(end)}`;
}

function formatShortTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 30rpx 28rpx calc(170rpx + env(safe-area-inset-bottom));
  background-color: #f3f6f5;
}

.page-heading,
.section-heading,
.schedule-card__head,
.subscribe-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.page-heading {
  padding-bottom: 24rpx;
}

.page-heading__copy {
  min-width: 0;
}

.page-title {
  display: block;
  color: #17202f;
  font-size: 40rpx;
  font-weight: 900;
  line-height: 1.25;
}

.page-subtitle {
  display: block;
  margin-top: 7rpx;
  color: #758190;
  font-size: 21rpx;
  line-height: 1.45;
}

.refresh-button {
  flex: 0 0 auto;
  min-width: 100rpx;
  height: 62rpx;
  margin: 0;
  padding: 0 18rpx;
  border: 1px solid #d9e2e6;
  border-radius: 8rpx;
  background: #ffffff;
  color: #315d7d;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 60rpx;
}

.refresh-button::after,
.conference-option::after,
.attendee-option::after,
.day-option::after,
.subscribe-button::after {
  border: 0;
}

.conference-switch,
.attendee-switch,
.day-switch {
  width: calc(100% + 56rpx);
  margin-right: -28rpx;
  margin-left: -28rpx;
  white-space: nowrap;
}

.conference-switch {
  margin-bottom: 18rpx;
}

.conference-switch__inner,
.attendee-switch__inner,
.day-switch__inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 0 28rpx;
}

.conference-option {
  max-width: 480rpx;
  height: 62rpx;
  margin: 0;
  padding: 0 22rpx;
  overflow: hidden;
  border: 1px solid #d9e2e6;
  border-radius: 7rpx;
  background: rgba(255, 255, 255, 0.92);
  color: #596878;
  font-size: 22rpx;
  font-weight: 700;
  line-height: 60rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conference-option.active {
  border-color: #315d7d;
  background: #315d7d;
  color: #ffffff;
}

.conference-overview {
  position: relative;
  display: flex;
  overflow: hidden;
  border: 1px solid #dce5e8;
  border-radius: 8rpx;
  background: #ffffff;
  box-shadow: 0 8rpx 24rpx rgba(23, 32, 47, 0.05);
}

.conference-overview__accent {
  width: 8rpx;
  background: #315d7d;
}

.conference-overview__body {
  min-width: 0;
  flex: 1;
  padding: 25rpx 26rpx 23rpx;
}

.conference-name {
  display: block;
  color: #17202f;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.4;
}

.conference-facts {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 19rpx;
}

.fact {
  display: grid;
  grid-template-columns: 58rpx minmax(0, 1fr);
  gap: 12rpx;
  color: #4f5e6d;
  font-size: 22rpx;
  line-height: 1.48;
}

.fact-label {
  color: #8b96a1;
}

.publish-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 22rpx;
  margin-top: 17rpx;
  padding-top: 16rpx;
  border-top: 1px solid #edf0f2;
  color: #86919d;
  font-size: 20rpx;
}

.attendee-block {
  margin-top: 24rpx;
}

.switch-label {
  display: block;
  margin-bottom: 12rpx;
  color: #6d7986;
  font-size: 21rpx;
  font-weight: 700;
}

.attendee-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4rpx;
  min-width: 210rpx;
  min-height: 78rpx;
  margin: 0;
  padding: 13rpx 18rpx;
  border: 1px solid #dbe3e7;
  border-radius: 7rpx;
  background: #ffffff;
  color: #253346;
  line-height: 1.3;
  text-align: left;
}

.attendee-option text:first-child {
  font-size: 23rpx;
  font-weight: 900;
}

.attendee-option text:last-child {
  color: #87929e;
  font-size: 18rpx;
}

.attendee-option.active {
  border-color: #315d7d;
  box-shadow: inset 5rpx 0 #315d7d;
}

.day-switch {
  margin-top: 24rpx;
}

.day-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rpx;
  width: 146rpx;
  height: 82rpx;
  margin: 0;
  padding: 0;
  border: 1px solid #dce4e7;
  border-radius: 7rpx;
  background: #ffffff;
  color: #687684;
  line-height: 1.25;
}

.day-option text:first-child {
  font-size: 18rpx;
}

.day-option text:last-child {
  font-size: 23rpx;
  font-weight: 900;
}

.day-option.active {
  border-color: #244861;
  background: #244861;
  color: #ffffff;
}

.schedule-section {
  margin-top: 22rpx;
  padding: 27rpx 24rpx 8rpx;
  border: 1px solid #dce5e8;
  border-radius: 8rpx;
  background: #ffffff;
}

.section-heading {
  align-items: flex-start;
  padding-bottom: 23rpx;
  border-bottom: 1px solid #e7ecee;
}

.section-heading > view {
  display: flex;
  flex-direction: column;
  gap: 5rpx;
}

.section-title {
  color: #172235;
  font-size: 29rpx;
  font-weight: 900;
}

.section-subtitle {
  color: #84909d;
  font-size: 20rpx;
}

.section-count {
  padding: 5rpx 12rpx;
  border-radius: 5rpx;
  background: #edf2f4;
  color: #526272;
  font-size: 19rpx;
  font-weight: 800;
}

.timeline {
  padding-top: 25rpx;
}

.timeline-item {
  display: grid;
  grid-template-columns: 82rpx 24rpx minmax(0, 1fr);
  gap: 9rpx;
}

.time-column {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4rpx;
  padding-top: 2rpx;
}

.time-main {
  color: #17263a;
  font-size: 23rpx;
  font-weight: 900;
}

.time-end {
  color: #909aa5;
  font-size: 18rpx;
}

.timeline-rail {
  position: relative;
  display: flex;
  justify-content: center;
}

.timeline-dot {
  position: relative;
  z-index: 1;
  width: 18rpx;
  height: 18rpx;
  margin-top: 7rpx;
  border: 5rpx solid #e3edf2;
  border-radius: 50%;
  background: #315d7d;
  box-sizing: border-box;
}

.timeline-dot[data-type="DINNER"] { border-color: #f3e9d4; background: #a3782c; }
.timeline-dot[data-type="SPEECH"] { border-color: #dcefe9; background: #2f806d; }
.timeline-dot[data-type="REHEARSAL"] { border-color: #e9e4ed; background: #725e7d; }

.timeline-line {
  position: absolute;
  top: 25rpx;
  bottom: 0;
  width: 2rpx;
  background: #dce5e8;
}

.timeline-item:last-child .timeline-line {
  display: none;
}

.schedule-card {
  min-width: 0;
  margin-bottom: 24rpx;
  padding: 21rpx 22rpx;
  border: 1px solid #e0e6e9;
  border-radius: 7rpx;
  background: #fafcfc;
}

.schedule-card__head {
  align-items: flex-start;
}

.type-label,
.role-label {
  padding: 4rpx 10rpx;
  border-radius: 4rpx;
  background: #e7f0f5;
  color: #315d7d;
  font-size: 18rpx;
  font-weight: 800;
  line-height: 1.35;
}

.type-label[data-type="DINNER"] { background: #f7eedc; color: #805e20; }
.type-label[data-type="SPEECH"] { background: #e4f2ee; color: #216d5b; }

.role-label {
  max-width: 180rpx;
  overflow: hidden;
  background: #eef1f3;
  color: #65717e;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.schedule-name {
  display: block;
  margin-top: 13rpx;
  color: #152034;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 1.42;
}

.schedule-details {
  display: flex;
  flex-direction: column;
  gap: 11rpx;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1px solid #e8ecee;
}

.detail-row {
  display: grid;
  grid-template-columns: 56rpx minmax(0, 1fr);
  gap: 10rpx;
  color: #4e5b69;
  font-size: 21rpx;
  line-height: 1.5;
}

.detail-label {
  color: #8a95a0;
}

.detail-row--highlight .detail-value {
  color: #805e20;
  font-weight: 900;
}

.schedule-note {
  padding: 13rpx 15rpx;
  border-left: 4rpx solid #b8ccd6;
  background: #f1f5f6;
  color: #53606d;
  font-size: 20rpx;
  line-height: 1.55;
}

.day-empty {
  padding: 52rpx 0 60rpx;
  color: #8a95a1;
  font-size: 22rpx;
  text-align: center;
}

.subscribe-strip {
  margin-top: 20rpx;
  padding: 21rpx 23rpx;
  border: 1px solid #cee1db;
  border-radius: 8rpx;
  background: #edf6f3;
}

.subscribe-strip__content {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  color: #60776f;
  font-size: 19rpx;
  line-height: 1.45;
}

.subscribe-title {
  color: #214b40;
  font-size: 23rpx;
  font-weight: 900;
}

.subscribe-button {
  min-width: 112rpx;
  height: 58rpx;
  margin: 0;
  padding: 0 17rpx;
  border: 0;
  border-radius: 7rpx;
  background: #2f7865;
  color: #ffffff;
  font-size: 21rpx;
  font-weight: 800;
  line-height: 58rpx;
}

.subscribe-button[disabled] {
  opacity: 0.62;
}

@media (min-width: 760px) {
  .page {
    max-width: 760px;
    margin: 0 auto;
  }
}
</style>
