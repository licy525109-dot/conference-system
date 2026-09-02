<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <view class="page-heading">
      <view>
        <text class="eyebrow">PERSONAL SCHEDULE</text>
        <text class="page-title">我的会务安排</text>
      </view>
      <button class="refresh-button" aria-label="刷新会务安排" @click="load">刷新</button>
    </view>

    <LoadingState v-if="loading" title="正在同步安排" description="请稍候" />
    <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="load" />
    <EmptyState
      v-else-if="items.length === 0"
      title="暂无已发布安排"
      description="主办方确认并发布后，工作坊、晚宴和分享安排会显示在这里。"
      mark="排"
      action-text="查看我的报名"
      @action="goRegistrations"
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

      <view class="conference-summary">
        <image v-if="selectedConference?.coverImageUrl" class="conference-cover" :src="selectedConference.coverImageUrl" mode="aspectFill" />
        <view class="conference-summary__body">
          <text class="conference-name">{{ selectedConference?.title }}</text>
          <view class="conference-meta">
            <text>{{ formatConferenceDate(selectedConference?.startsAt, selectedConference?.endsAt) }}</text>
            <text>{{ selectedConference?.location || "会议地点待定" }}</text>
          </view>
          <view class="update-meta">
            <text>{{ selectedConferenceItems.length }} 项已发布安排</text>
            <text v-if="latestPublishedAt">更新于 {{ formatShortTime(latestPublishedAt) }}</text>
          </view>
        </view>
      </view>

      <view v-if="subscriptionConfig?.enabled" class="subscribe-strip">
        <view class="subscribe-strip__content">
          <text class="subscribe-title">会务安排更新提醒</text>
          <text class="subscribe-copy">主办方再次发布时，通过微信通知你。</text>
        </view>
        <button class="subscribe-button" :disabled="subscribing" @click="subscribe">
          {{ subscribed ? "已订阅" : subscribing ? "处理中" : "开启提醒" }}
        </button>
      </view>

      <view v-if="attendees.length > 1" class="attendee-switch">
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
              <view class="schedule-details">
                <view class="detail-row">
                  <text class="detail-icon">地</text>
                  <text>{{ item.location || "地点待定" }}</text>
                </view>
                <view v-if="item.type === 'DINNER' && item.tableNo" class="detail-row detail-row--strong">
                  <text class="detail-icon">席</text>
                  <text>{{ item.tableNo }}{{ item.isTableLeader ? " · 本桌桌长" : "" }}</text>
                </view>
                <view v-if="item.shareTopic" class="detail-row">
                  <text class="detail-icon">讲</text>
                  <text>{{ item.shareTopic }}</text>
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
    </template>

    <CustomTabbar active-page-key="my-registrations" />
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
const selectedConferenceItems = computed(() => items.value.filter((item) => item.conference.id === selectedConferenceId.value));
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
const selectedAttendeeItems = computed(() => selectedConferenceItems.value.filter((item) => item.attendee.id === selectedAttendeeId.value));
const days = computed(() => {
  const keys = Array.from(new Set(selectedAttendeeItems.value.map((item) => dayKey(item.startsAt))));
  return keys.sort().map((key) => ({ key, label: dayLabel(key), weekday: weekdayLabel(key) }));
});
const visibleItems = computed(() => selectedAttendeeItems.value.filter((item) => dayKey(item.startsAt) === selectedDay.value));
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
  if (!subscriptionConfig.value || subscribing.value) return;
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

function goRegistrations() {
  uni.redirectTo({ url: "/pages/registrations/my" });
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
  if (!startsAt) return "会议时间待定";
  const start = new Date(startsAt);
  const end = endsAt ? new Date(endsAt) : null;
  const startText = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(start);
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
  padding-bottom: calc(176rpx + env(safe-area-inset-bottom));
  background-color: #f4f6f8;
}

.page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24rpx;
  padding: 30rpx 0 24rpx;
}

.eyebrow {
  display: block;
  color: #5a6b7e;
  font-size: 19rpx;
  font-weight: 800;
}

.page-title {
  display: block;
  margin-top: 6rpx;
  color: #122238;
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.25;
}

.refresh-button {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 104rpx;
  min-height: 66rpx;
  margin: 0;
  padding: 0 20rpx;
  border: 1px solid #d7e0e8;
  border-radius: 8rpx;
  background: #ffffff;
  color: #32475c;
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1;
}

.refresh-button::after,
.conference-option::after,
.attendee-option::after,
.day-option::after,
.subscribe-button::after {
  border: 0;
}

.conference-switch,
.day-switch {
  width: calc(100% + 32rpx);
  margin: 0 -16rpx 20rpx;
  white-space: nowrap;
}

.conference-switch__inner,
.day-switch__inner {
  display: inline-flex;
  gap: 12rpx;
  padding: 0 16rpx;
}

.conference-option {
  max-width: 430rpx;
  min-height: 62rpx;
  margin: 0;
  padding: 0 22rpx;
  overflow: hidden;
  border: 1px solid #d8e1e9;
  border-radius: 7rpx;
  background: rgba(255, 255, 255, 0.88);
  color: #536579;
  font-size: 23rpx;
  font-weight: 700;
  line-height: 62rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conference-option.active {
  border-color: #173c5c;
  background: #173c5c;
  color: #ffffff;
}

.conference-summary {
  position: relative;
  display: flex;
  min-height: 228rpx;
  overflow: hidden;
  border: 1px solid #dfe5eb;
  border-radius: 12rpx;
  background: #ffffff;
}

.conference-cover {
  width: 210rpx;
  min-height: 228rpx;
  background: #dfe8ef;
}

.conference-summary__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
  padding: 28rpx;
}

.conference-name {
  display: -webkit-box;
  overflow: hidden;
  color: #122238;
  font-size: 30rpx;
  font-weight: 900;
  line-height: 1.42;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.conference-meta,
.update-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 20rpx;
  margin-top: 18rpx;
  color: #5e6e7f;
  font-size: 22rpx;
  line-height: 1.4;
}

.update-meta {
  margin-top: 14rpx;
  color: #8793a0;
  font-size: 20rpx;
}

.subscribe-strip {
  display: flex;
  align-items: center;
  gap: 18rpx;
  margin-top: 18rpx;
  padding: 22rpx 24rpx;
  border-left: 6rpx solid #18856a;
  background: #edf8f4;
}

.subscribe-strip__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  min-width: 0;
}

.subscribe-title { color: #173e34; font-size: 24rpx; font-weight: 900; }
.subscribe-copy { color: #5a746d; font-size: 20rpx; line-height: 1.4; }
.subscribe-button {
  min-width: 150rpx;
  min-height: 62rpx;
  margin: 0;
  padding: 0 20rpx;
  border: 0;
  border-radius: 7rpx;
  background: #18765f;
  color: #ffffff;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 62rpx;
}
.subscribe-button[disabled] { opacity: 0.62; }

.attendee-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12rpx;
  margin-top: 20rpx;
}

.attendee-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4rpx;
  min-height: 82rpx;
  margin: 0;
  padding: 14rpx 18rpx;
  border: 1px solid #dbe3ea;
  border-radius: 8rpx;
  background: #ffffff;
  color: #23364a;
  line-height: 1.3;
  text-align: left;
}
.attendee-option text:first-child { font-size: 24rpx; font-weight: 900; }
.attendee-option text:last-child { color: #8090a0; font-size: 19rpx; }
.attendee-option.active { border-color: #1b587f; box-shadow: inset 5rpx 0 #1b587f; }

.day-switch { margin-top: 24rpx; }
.day-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3rpx;
  width: 150rpx;
  height: 88rpx;
  margin: 0;
  padding: 0;
  border: 1px solid #dce4eb;
  border-radius: 8rpx;
  background: #ffffff;
  color: #657587;
  line-height: 1.2;
}
.day-option text:first-child { font-size: 19rpx; }
.day-option text:last-child { font-size: 24rpx; font-weight: 900; }
.day-option.active { border-color: #173c5c; background: #173c5c; color: #ffffff; }

.schedule-section {
  margin-top: 24rpx;
  padding: 28rpx 26rpx 10rpx;
  border: 1px solid #dfe5eb;
  border-radius: 12rpx;
  background: #ffffff;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  padding-bottom: 26rpx;
  border-bottom: 1px solid #e4e9ee;
}
.section-heading > view { display: flex; flex-direction: column; gap: 5rpx; }
.section-title { color: #13243a; font-size: 30rpx; font-weight: 900; }
.section-subtitle { color: #788697; font-size: 21rpx; }
.section-count { padding: 5rpx 12rpx; border-radius: 5rpx; background: #edf2f6; color: #52667a; font-size: 20rpx; font-weight: 800; }

.timeline { padding-top: 26rpx; }
.timeline-item { display: grid; grid-template-columns: 90rpx 26rpx minmax(0, 1fr); gap: 10rpx; min-height: 190rpx; }
.time-column { display: flex; flex-direction: column; align-items: flex-end; gap: 5rpx; padding-top: 1rpx; }
.time-main { color: #16283d; font-size: 25rpx; font-weight: 900; }
.time-end { color: #8793a0; font-size: 19rpx; }
.timeline-rail { position: relative; display: flex; justify-content: center; }
.timeline-dot { position: relative; z-index: 1; width: 18rpx; height: 18rpx; margin-top: 7rpx; border: 5rpx solid #e5eef5; border-radius: 50%; background: #28658d; box-sizing: border-box; }
.timeline-dot[data-type="DINNER"] { border-color: #f4e6c7; background: #a27822; }
.timeline-dot[data-type="SPEECH"] { border-color: #d8efe7; background: #178064; }
.timeline-dot[data-type="REHEARSAL"] { border-color: #ece3f3; background: #765287; }
.timeline-line { position: absolute; top: 25rpx; bottom: 0; width: 2rpx; background: #dce5ec; }
.timeline-item:last-child .timeline-line { display: none; }

.schedule-card {
  align-self: start;
  margin-bottom: 24rpx;
  padding: 23rpx 24rpx;
  border: 1px solid #dfe6ec;
  border-radius: 9rpx;
  background: #fbfcfd;
}
.schedule-card__head { display: flex; align-items: center; justify-content: space-between; gap: 14rpx; }
.type-label,
.role-label { padding: 4rpx 10rpx; border-radius: 4rpx; background: #e6f0f7; color: #285d7f; font-size: 19rpx; font-weight: 800; }
.type-label[data-type="DINNER"] { background: #f5ead3; color: #805f20; }
.type-label[data-type="SPEECH"] { background: #e0f2eb; color: #176b55; }
.role-label { overflow: hidden; background: #eff2f5; color: #5d6c7b; text-overflow: ellipsis; white-space: nowrap; }
.schedule-name { display: block; margin-top: 14rpx; color: #122238; font-size: 29rpx; font-weight: 900; line-height: 1.38; }
.schedule-details { display: flex; flex-direction: column; gap: 12rpx; margin-top: 17rpx; }
.detail-row { display: grid; grid-template-columns: 32rpx minmax(0, 1fr); gap: 9rpx; align-items: start; color: #526274; font-size: 22rpx; line-height: 1.5; }
.detail-row--strong { color: #765619; font-weight: 800; }
.detail-icon { display: grid; place-items: center; width: 30rpx; height: 30rpx; border-radius: 5rpx; background: #eaf0f5; color: #4c6378; font-size: 17rpx; font-weight: 900; line-height: 1; }
.schedule-note { margin-top: 3rpx; padding: 14rpx 16rpx; border-left: 4rpx solid #c8d5df; background: #f1f4f6; color: #59697a; font-size: 21rpx; line-height: 1.55; }
.day-empty { display: grid; place-items: center; min-height: 220rpx; color: #8a96a2; font-size: 23rpx; }

@media (min-width: 760px) {
  .page { max-width: 760px; margin: 0 auto; }
}
</style>
