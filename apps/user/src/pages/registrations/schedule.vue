<template>
  <view class="page ui-page">
    <view class="page-content">
      <view class="page-heading">
        <view class="page-heading__copy">
          <text class="page-title">我的会务安排</text>
        </view>
        <button class="refresh-button" :disabled="loading" :aria-label="loading ? '同步中' : '刷新安排'" title="刷新安排" @click="load"><wd-icon name="refresh" size="22px" /></button>
      </view>

      <LoadingState v-if="loading && items.length === 0" title="正在同步安排" />
      <ErrorState v-else-if="error && items.length === 0" :message="error" primary-text="重新加载" @retry="load" />
      <EmptyState
        v-else-if="items.length === 0"
        title="暂无已发布安排"
        mark="排"
      />

      <template v-else>
      <scroll-view v-if="conferences.length > 1" class="conference-switch" scroll-x :show-scrollbar="false">
        <view class="conference-switch__inner">
          <button
            v-for="conference in conferences"
            :key="conference.id"
            class="conference-option"
            :class="{ active: conference.id === selectedConference?.id }"
            @click="selectedConferenceId = conference.id"
          >
            {{ conference.title }}
          </button>
        </view>
      </scroll-view>

      <view class="conference-overview">
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
              :class="{ active: attendee.id === currentAttendee?.id }"
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
            :class="{ active: day.key === activeDay }"
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

        <view v-if="visibleItems.length" class="schedule-list">
          <GuestSchedulePresentation v-for="item in visibleItems" :key="item.id" class="schedule-item" :schedule="item" />
        </view>
        <view v-else class="day-empty">
          <text>当天暂无安排</text>
        </view>
      </view>

      <view v-if="subscriptionConfig?.enabled" class="subscribe-strip">
        <view class="subscribe-strip__content">
          <text class="subscribe-title">微信更新提醒</text>
        </view>
        <button class="subscribe-button" :disabled="subscribing || subscribed" @click="subscribe">
          {{ subscribed ? "已开启" : subscribing ? "处理中" : "开启" }}
        </button>
      </view>
      </template>
    </view>

    <WechatProfilePrompt />
    <CustomTabbar active-page-key="notifications" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import GuestSchedulePresentation from "@/components/GuestSchedulePresentation.vue";
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
const { refreshTheme } = useCmsPageTheme("my-registrations");

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
      registrationNo: item.attendee.registration?.registrationNo || ""
    });
  }
  return Array.from(seen.values());
});
const currentAttendee = computed(() => attendees.value.find((item) => item.id === selectedAttendeeId.value) ?? attendees.value[0]);
const selectedAttendeeItems = computed(() => {
  const attendeeId = currentAttendee.value?.id;
  if (!attendeeId) return selectedConferenceItems.value;
  const matching = selectedConferenceItems.value.filter((item) => item.attendee.id === attendeeId);
  return matching.length > 0 ? matching : selectedConferenceItems.value;
});
const days = computed(() => {
  const keys = Array.from(new Set(selectedAttendeeItems.value.map((item) => dayKey(item.startsAt))));
  return keys.sort().map((key) => ({ key, label: dayLabel(key), weekday: weekdayLabel(key) }));
});
const activeDay = computed(() => days.value.some((day) => day.key === selectedDay.value) ? selectedDay.value : days.value[0]?.key || "");
const visibleItems = computed(() => selectedAttendeeItems.value
  .filter((item) => dayKey(item.startsAt) === activeDay.value)
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt)));
const selectedDayLabel = computed(() => days.value.find((item) => item.key === activeDay.value)?.label || "");
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
    initializeSelection(scheduleItems, requested);
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

function initializeSelection(scheduleItems: MyGuestScheduleItem[], requestedConferenceId: string) {
  const requestedExists = scheduleItems.some((item) => item.conference.id === requestedConferenceId);
  const conferenceId = requestedExists ? requestedConferenceId : scheduleItems[0]?.conference.id || "";
  const conferenceItems = scheduleItems.filter((item) => item.conference.id === conferenceId);
  const attendeeId = conferenceItems[0]?.attendee.id || "";
  const attendeeItems = conferenceItems.filter((item) => item.attendee.id === attendeeId);
  selectedConferenceId.value = conferenceId;
  selectedAttendeeId.value = attendeeId;
  selectedDay.value = attendeeItems[0] ? dayKey(attendeeItems[0].startsAt) : "";
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
.page { min-height: 100vh; padding: 24px 20px calc(100px + env(safe-area-inset-bottom)); background: #fff; color: var(--ui-color-text, #18202d); font-size: 18px; line-height: 1.5; letter-spacing: 0; box-sizing: border-box; }
.page-content { min-width: 0; }
.page-heading, .section-heading, .subscribe-strip { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
.page-heading { padding-bottom: 20px; }
.page-heading__copy { min-width: 0; flex: 1; }
.page-title { display: block; font-size: 24px; font-weight: 700; line-height: 1.4; }
.refresh-button { flex: 0 0 44px; display: flex; width: 44px; height: 44px; align-items: center; justify-content: center; margin: 0; padding: 0; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-primary, #99732c); line-height: 1; }
.page button::after { border: 0; }
.conference-switch, .attendee-switch, .day-switch { width: 100%; white-space: nowrap; }
.conference-switch { margin-bottom: 20px; }
.conference-switch__inner, .attendee-switch__inner, .day-switch__inner { display: inline-flex; gap: 8px; padding-bottom: 4px; vertical-align: top; }
.conference-option { flex: 0 0 auto; width: 240px; min-height: 52px; margin: 0; padding: 10px 14px; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-muted, #667080); font-size: 18px; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; text-align: left; }
.conference-option.active, .attendee-option.active, .day-option.active { border-color: var(--ui-color-primary, #99732c); background: var(--ui-color-primary-soft, #f7f1e5); color: var(--ui-color-primary, #99732c); }
.conference-overview { padding: 20px 0; border-top: 1px solid var(--ui-color-primary, #99732c); border-bottom: 1px solid var(--ui-color-border, #e2e5e9); }
.conference-overview__body { min-width: 0; }
.conference-name { display: block; font-size: 28px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.conference-facts { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; }
.fact { display: grid; grid-template-columns: 42px minmax(0, 1fr); gap: 12px; font-size: 18px; line-height: 1.5; overflow-wrap: anywhere; }
.fact-label { color: var(--ui-color-muted, #667080); }
.publish-meta { display: flex; flex-wrap: wrap; gap: 4px 14px; margin-top: 16px; color: var(--ui-color-muted, #667080); font-size: 14px; }
.attendee-block { margin-top: 24px; }
.switch-label { display: block; margin-bottom: 10px; color: var(--ui-color-muted, #667080); font-size: 18px; }
.attendee-option { flex: 0 0 auto; display: flex; width: 200px; min-height: 76px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px; margin: 0; padding: 10px 14px; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-text, #18202d); line-height: 1.5; text-align: left; white-space: normal; overflow-wrap: anywhere; }
.attendee-option text:first-child { max-width: 100%; font-size: 18px; font-weight: 700; }
.attendee-option text:last-child { max-width: 100%; color: var(--ui-color-muted, #667080); font-size: 14px; }
.day-switch { margin-top: 20px; }
.day-option { flex: 0 0 110px; display: flex; width: 110px; min-height: 76px; margin: 0; padding: 10px 12px; flex-direction: column; align-items: center; justify-content: center; gap: 4px; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-muted, #667080); line-height: 1.5; }
.day-option text:first-child { font-size: 14px; }
.day-option text:last-child { font-size: 18px; font-weight: 700; }
.schedule-section { margin-top: 24px; }
.section-heading { align-items: flex-start; padding-bottom: 20px; }
.section-heading > view { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; }
.section-title { font-size: 20px; font-weight: 700; overflow-wrap: anywhere; }
.section-subtitle, .section-count { color: var(--ui-color-muted, #667080); font-size: 14px; }
.section-count { flex-shrink: 0; padding: 4px 0; }
.schedule-item { display: block; }
.schedule-item + .schedule-item { margin-top: 28px; padding-top: 28px; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.day-empty { padding: 24px 0; color: var(--ui-color-muted, #667080); font-size: 18px; }
.subscribe-strip { margin-top: 28px; padding-top: 20px; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.subscribe-strip__content { min-width: 0; flex: 1; }
.subscribe-title { font-size: 18px; }
.subscribe-button { min-height: 44px; margin: 0; padding: 8px 16px; border: 1px solid var(--ui-color-border, #e2e5e9); border-radius: 4px; background: #fff; color: var(--ui-color-primary, #99732c); font-size: 18px; line-height: 1.5; }
.subscribe-button[disabled] { opacity: 0.65; }
@media (min-width: 760px) { .page { max-width: 680px; margin: 0 auto; } }
</style>
