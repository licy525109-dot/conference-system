<template>
  <view class="cms-conference-schedule">
    <view class="cms-conference-schedule__months">
      <scroll-view scroll-x class="cms-conference-schedule__month-scroll">
        <view class="cms-conference-schedule__month-track">
          <view
            v-for="month in months"
            :key="month.key"
            :class="['cms-conference-schedule__month', activeMonth === month.key ? 'is-active' : '']"
            @click="activeMonth = month.key"
          >
            <text class="cms-conference-schedule__year">{{ month.year }}</text>
            <text class="cms-conference-schedule__month-label">{{ month.label }}</text>
          </view>
        </view>
      </scroll-view>
      <view v-if="showCalendarButton" class="cms-conference-schedule__calendar" @click="emitFirstCalendar">
        <text class="cms-conference-schedule__calendar-icon">▦</text>
        <text>{{ calendarText }}</text>
      </view>
    </view>

    <scroll-view scroll-x class="cms-conference-schedule__category-scroll">
      <view class="cms-conference-schedule__category-track">
        <text
          v-for="category in categories"
          :key="category"
          :class="['cms-conference-schedule__category', activeCategory === category ? 'is-active' : '']"
          @click="activeCategory = category"
        >{{ category }}</text>
      </view>
    </scroll-view>

    <view v-if="visibleConferences.length === 0" class="cms-conference-schedule__empty">
      <text>暂无该月份会议</text>
    </view>

    <view v-for="item in visibleConferences" :key="item.id" class="cms-conference-schedule__card">
      <view class="cms-conference-schedule__date">
        <text class="cms-conference-schedule__day">{{ scheduleDay(item.startsAt) }}</text>
        <text class="cms-conference-schedule__weekday">{{ scheduleWeekday(item.startsAt) }}</text>
        <text class="cms-conference-schedule__time">{{ showEndTime ? scheduleTimeRange(item.startsAt, item.endsAt) : scheduleTime(item.startsAt) }}</text>
        <text class="cms-conference-schedule__location">{{ item.location || "地点待定" }}</text>
      </view>

      <view class="cms-conference-schedule__content">
        <view class="cms-conference-schedule__main">
          <image
            v-if="showCover(item)"
            class="cms-conference-schedule__cover"
            :src="item.coverImageUrl"
            mode="aspectFill"
            @error="markCoverFailed(item.id)"
          />
          <view v-else-if="showCoverEnabled" class="cms-conference-schedule__cover cms-conference-schedule__cover--empty">
            <text>{{ item.title.slice(0, 1) || "会" }}</text>
          </view>
          <view class="cms-conference-schedule__copy">
            <text class="cms-conference-schedule__tag">{{ scheduleCardTag(item) }}</text>
            <text class="cms-conference-schedule__title">{{ item.title }}</text>
            <text v-if="item.summary" class="cms-conference-schedule__summary">{{ item.summary }}</text>
            <view class="cms-conference-schedule__meta">
              <text>已报名 {{ item.registrationCount || 0 }} 人</text>
              <text>{{ conferenceStatusText(item) }}</text>
            </view>
          </view>
        </view>

        <view class="cms-conference-schedule__actions">
          <button class="cms-conference-schedule__action" @click.stop="emit('action', item)">
            {{ conferenceActionText(item) }}
          </button>
          <button v-if="showItemCalendarButton" class="cms-conference-schedule__calendar-action" @click.stop="emit('calendar', item)">
            日历
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { CmsComponent } from "@/services/cms";
import type { ConferenceListItem } from "@/services/conference";
import { booleanConfig, numberConfig, stringConfig, stringListConfig } from "./config";

const props = defineProps<{
  component: CmsComponent;
  conferences: ConferenceListItem[];
  nowTimestamp: number;
}>();

const emit = defineEmits<{
  action: [conference: ConferenceListItem];
  calendar: [conference: ConferenceListItem];
}>();

const activeMonth = ref("");
const activeCategory = ref("全部");
const failedCoverIds = ref<Set<string>>(new Set());

const months = computed(() => {
  const rows = new Map<string, { key: string; year: string; label: string; timestamp: number }>();
  props.conferences.forEach((item) => {
    const date = parseDate(item.startsAt);
    if (!date) return;
    const key = monthKey(date);
    if (!rows.has(key)) {
      rows.set(key, {
        key,
        year: String(date.getFullYear()),
        label: `${date.getMonth() + 1} 月`,
        timestamp: date.getTime()
      });
    }
  });
  const configured = Array.from(rows.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (configured.length > 0) return configured;
  const today = new Date();
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth() + index, 1);
    return {
      key: monthKey(date),
      year: String(date.getFullYear()),
      label: `${date.getMonth() + 1} 月`,
      timestamp: date.getTime()
    };
  });
});

const categories = computed(() => {
  const configured = stringListConfig(props.component, "categories");
  const source = configured.length > 0 ? configured : stringListConfig(props.component, "tabs");
  const values = source.length > 0 ? source : ["全部", "闭门会", "论坛", "沙龙", "参访", "私董会"];
  return values.includes("全部") ? values : ["全部", ...values];
});

watch(months, (value) => {
  if (!value.some((item) => item.key === activeMonth.value)) activeMonth.value = value[0]?.key || "";
}, { immediate: true });

watch(categories, (value) => {
  if (!value.includes(activeCategory.value)) activeCategory.value = value[0] || "全部";
}, { immediate: true });

const visibleConferences = computed(() => {
  const limit = Math.max(1, numberConfig(props.component, "limit", 8));
  return props.conferences
    .filter((item) => {
      const date = parseDate(item.startsAt);
      if (!date) return false;
      const matchesMonth = !activeMonth.value || monthKey(date) === activeMonth.value;
      const matchesCategory = activeCategory.value === "全部"
        || [item.title, item.summary, item.location].some((value) => value?.includes(activeCategory.value));
      return matchesMonth && matchesCategory;
    })
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, limit);
});

const showCoverEnabled = computed(() => booleanConfig(props.component, "showCover", true));
const showCalendarButton = computed(() => booleanConfig(props.component, "showCalendarButton", true));
const showItemCalendarButton = computed(() => booleanConfig(props.component, "showItemCalendarButton", false));
const showEndTime = computed(() => booleanConfig(props.component, "showEndTime", false));
const calendarText = computed(() => stringConfig(props.component, "calendarText", "日历"));

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function scheduleDay(value: string): string {
  const date = parseDate(value);
  return date ? `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}` : "待定";
}

function scheduleWeekday(value: string): string {
  const date = parseDate(value);
  return date ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()] : "";
}

function scheduleTime(value: string | null | undefined): string {
  const date = parseDate(value);
  return date ? `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}` : "";
}

function scheduleTimeRange(startsAt: string, endsAt?: string | null): string {
  const start = scheduleTime(startsAt);
  const end = scheduleTime(endsAt);
  return !end || end === start ? start : `${start}-${end}`;
}

function scheduleCardTag(item: ConferenceListItem): string {
  const values = categories.value.filter((item) => item !== "全部");
  return values.find((category) => [item.title, item.summary, item.location].some((value) => value?.includes(category))) || values[0] || "会议";
}

function isConferenceEnded(item: ConferenceListItem): boolean {
  const endAt = Date.parse(item.registrationEndsAt || item.endsAt || "");
  return Number.isFinite(endAt) && props.nowTimestamp > endAt;
}

function shouldShowAppointmentAction(item: ConferenceListItem): boolean {
  if (!booleanConfig(props.component, "showAppointmentButton", true) || isConferenceEnded(item)) return false;
  const startAt = Date.parse(item.registrationStartsAt || item.startsAt || "");
  return Number.isFinite(startAt) && props.nowTimestamp < startAt;
}

function conferenceActionText(item: ConferenceListItem): string {
  if (isConferenceEnded(item)) return stringConfig(props.component, "endedButtonText", "查看详情");
  if (!shouldShowAppointmentAction(item)) return stringConfig(props.component, "detailButtonText", "查看详情");
  return stringConfig(props.component, "appointmentButtonText", "提前预约");
}

function conferenceStatusText(item: ConferenceListItem): string {
  if (isConferenceEnded(item)) return stringConfig(props.component, "endedStatusText", "已结束");
  return shouldShowAppointmentAction(item) ? "即将开始" : "开放报名";
}

function showCover(item: ConferenceListItem): boolean {
  return Boolean(showCoverEnabled.value && item.coverImageUrl?.trim() && !failedCoverIds.value.has(item.id));
}

function markCoverFailed(id: string): void {
  failedCoverIds.value = new Set([...failedCoverIds.value, id]);
}

function emitFirstCalendar(): void {
  const item = visibleConferences.value[0] || props.conferences[0];
  if (!item) {
    uni.showToast({ title: "暂无可添加的会议", icon: "none" });
    return;
  }
  emit("calendar", item);
}
</script>

<style scoped>
.cms-conference-schedule {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 22rpx;
}

.cms-conference-schedule__months {
  display: flex;
  min-width: 0;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 18rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-conference-schedule__month-scroll {
  min-width: 0;
  flex: 1;
  white-space: nowrap;
}

.cms-conference-schedule__month-track {
  display: flex;
  width: max-content;
  min-width: 100%;
}

.cms-conference-schedule__month {
  position: relative;
  display: flex;
  min-width: 116rpx;
  min-height: 104rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6rpx;
  color: var(--cms-text-secondary);
}

.cms-conference-schedule__month::after {
  position: absolute;
  right: 24rpx;
  bottom: 0;
  left: 24rpx;
  height: 4rpx;
  border-radius: 999rpx;
  background: transparent;
  content: "";
}

.cms-conference-schedule__month.is-active {
  color: var(--cms-primary);
}

.cms-conference-schedule__month.is-active::after {
  background: var(--cms-accent);
}

.cms-conference-schedule__year {
  font-size: 19rpx;
  font-weight: 600;
}

.cms-conference-schedule__month-label {
  font-size: 29rpx;
  font-weight: 750;
}

.cms-conference-schedule__calendar {
  display: flex;
  width: 104rpx;
  flex: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4rpx;
  border-left: 1rpx solid var(--cms-divider);
  color: var(--cms-text-secondary);
  font-size: 20rpx;
}

.cms-conference-schedule__calendar-icon {
  color: var(--cms-primary);
  font-size: 30rpx;
}

.cms-conference-schedule__category-scroll {
  width: 100%;
  white-space: nowrap;
}

.cms-conference-schedule__category-track {
  display: flex;
  width: max-content;
  gap: 12rpx;
}

.cms-conference-schedule__category {
  min-width: 104rpx;
  padding: 13rpx 22rpx;
  border: 1rpx solid var(--cms-border);
  border-radius: 999rpx;
  background: var(--cms-surface-elevated);
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  text-align: center;
}

.cms-conference-schedule__category.is-active {
  border-color: var(--cms-primary);
  background: var(--cms-primary);
  color: var(--cms-text-inverse);
}

.cms-conference-schedule__card {
  display: grid;
  min-width: 0;
  grid-template-columns: 138rpx minmax(0, 1fr);
  gap: 22rpx;
  padding: 24rpx;
  border: 1rpx solid var(--cms-border);
  border-radius: 18rpx;
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-sm);
}

.cms-conference-schedule__date {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7rpx;
  padding-right: 16rpx;
  border-right: 1rpx solid var(--cms-divider);
  color: var(--cms-text-secondary);
  font-size: 19rpx;
  line-height: 1.35;
}

.cms-conference-schedule__day {
  color: var(--cms-accent);
  font-size: 36rpx;
  font-weight: 750;
  line-height: 1.1;
  white-space: nowrap;
}

.cms-conference-schedule__weekday,
.cms-conference-schedule__time,
.cms-conference-schedule__location {
  display: block;
  word-break: break-word;
}

.cms-conference-schedule__location {
  color: var(--cms-text-primary);
  font-weight: 650;
}

.cms-conference-schedule__content,
.cms-conference-schedule__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.cms-conference-schedule__content {
  gap: 18rpx;
}

.cms-conference-schedule__main {
  display: grid;
  min-width: 0;
  grid-template-columns: 132rpx minmax(0, 1fr);
  align-items: start;
  gap: 16rpx;
}

.cms-conference-schedule__cover {
  width: 132rpx;
  height: 132rpx;
  border-radius: 12rpx;
  background: var(--cms-surface-muted);
}

.cms-conference-schedule__cover--empty {
  display: grid;
  place-items: center;
  color: var(--cms-accent);
  font-size: 38rpx;
  font-weight: 750;
}

.cms-conference-schedule__copy {
  gap: 8rpx;
}

.cms-conference-schedule__tag {
  align-self: flex-start;
  padding: 5rpx 12rpx;
  border-radius: 8rpx;
  background: var(--cms-accent-soft);
  color: var(--cms-accent);
  font-size: 19rpx;
  line-height: 1.3;
}

.cms-conference-schedule__title {
  display: -webkit-box;
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 27rpx;
  font-weight: 750;
  line-height: 1.35;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.cms-conference-schedule__summary {
  display: -webkit-box;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: 21rpx;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.cms-conference-schedule__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx 16rpx;
  color: var(--cms-text-tertiary);
  font-size: 19rpx;
}

.cms-conference-schedule__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12rpx;
}

.cms-conference-schedule__action,
.cms-conference-schedule__calendar-action {
  min-width: 126rpx;
  min-height: 56rpx;
  margin: 0;
  padding: 0 22rpx;
  border-radius: 999rpx;
  font-size: 21rpx;
  font-weight: 700;
  line-height: 56rpx;
}

.cms-conference-schedule__action {
  background: var(--cms-primary);
  color: var(--cms-text-inverse);
}

.cms-conference-schedule__calendar-action {
  border: 1rpx solid var(--cms-border);
  background: var(--cms-surface-elevated);
  color: var(--cms-text-primary);
}

.cms-conference-schedule__action::after,
.cms-conference-schedule__calendar-action::after {
  border: 0;
}

.cms-conference-schedule__empty {
  padding: 54rpx 24rpx;
  border-radius: 18rpx;
  background: var(--cms-surface-soft);
  color: var(--cms-text-secondary);
  font-size: 23rpx;
  text-align: center;
}

@media (max-width: 360px) {
  .cms-conference-schedule__main {
    grid-template-columns: 108rpx minmax(0, 1fr);
  }

  .cms-conference-schedule__cover {
    width: 108rpx;
    height: 108rpx;
  }
}
</style>
