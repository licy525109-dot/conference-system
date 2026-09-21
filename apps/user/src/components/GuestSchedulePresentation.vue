<template>
  <view class="schedule-presentation">
    <view v-if="showHeading" class="schedule-heading">
      <text v-if="schedule.typeLabel" class="schedule-type">{{ schedule.typeLabel }}</text>
      <text class="schedule-name">{{ schedule.name }}</text>
    </view>

    <view class="schedule-time">
      <text class="field-label">{{ timeLabel }}</text>
      <view v-if="scheduleTime.time" class="time-value">
        <view class="date-value">
          <text class="date-main">{{ scheduleTime.date }}</text>
          <text class="date-weekday">{{ scheduleTime.weekday }}</text>
        </view>
        <text class="time-main">{{ scheduleTime.time }}</text>
      </view>
      <text v-if="scheduleTime.end" class="time-end">至 {{ scheduleTime.end }}</text>
    </view>

    <view v-if="primaryFields.length" class="primary-fields" :class="{ 'primary-fields--paired': primaryFields.length > 1 }">
      <view
        v-for="field in primaryFields"
        :key="field.key"
        class="primary-field"
        :class="{ 'primary-field--table': field.key === 'tableNo' }"
      >
        <text class="field-label">{{ field.label }}</text>
        <text class="field-value">{{ field.value }}</text>
      </view>
    </view>

    <view v-if="otherFields.length" class="other-fields">
      <view v-for="field in otherFields" :key="field.key" class="other-field" :class="{ 'other-field--strong': field.emphasis }">
        <text class="field-label">{{ field.label }}</text>
        <text class="other-value">{{ field.value }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { UserNotificationScheduleItem } from "@/services/user-notifications";
import { buildGuestScheduleFields, formatGuestScheduleTime } from "@/utils/guestSchedulePresentation";

const props = withDefaults(defineProps<{
  schedule: UserNotificationScheduleItem;
  showHeading?: boolean;
}>(), { showHeading: true });

const timeLabel = computed(() => ({
  DINNER: "晚宴时间", WORKSHOP: "工作坊时间", SPEECH: "分享时间",
  REHEARSAL: "彩排时间", RECEPTION: "接待时间", OTHER: "事项时间"
} as Record<string, string>)[props.schedule.type] || "事项时间");
const fields = computed(() => buildGuestScheduleFields(props.schedule));
const primaryFields = computed(() => fields.value.filter((field) => field.key === "location" || field.key === "tableNo"));
const otherFields = computed(() => fields.value.filter((field) => field.key !== "location" && field.key !== "tableNo"));
const scheduleTime = computed(() => formatGuestScheduleTime(props.schedule.startsAt, props.schedule.endsAt));
</script>

<style scoped>
.schedule-presentation { min-width: 0; color: var(--ui-color-text, #18202d); font-size: 18px; line-height: 1.5; letter-spacing: 0; overflow-wrap: anywhere; }
.schedule-heading { padding-bottom: 18px; }
.schedule-type { display: block; margin-bottom: 6px; color: var(--ui-color-muted, #667080); font-size: 14px; }
.schedule-name { display: block; font-size: 26px; font-weight: 700; line-height: 1.4; }
.schedule-time { padding: 18px 0; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.field-label { display: block; color: var(--ui-color-muted, #667080); font-size: 18px; font-weight: 400; line-height: 1.5; }
.time-value { display: grid; grid-template-columns: minmax(0, 1fr) max-content; align-items: baseline; gap: 12px; margin-top: 8px; }
.date-value { display: flex; min-width: 0; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
.date-main { min-width: 0; max-width: 100%; font-size: 24px; font-weight: 700; }
.date-weekday { font-size: 18px; }
.time-main { color: var(--ui-color-primary, #99732c); font-size: 42px; font-weight: 700; line-height: 1.15; font-variant-numeric: tabular-nums; white-space: nowrap; }
.time-end { display: block; margin-top: 8px; color: var(--ui-color-muted, #667080); font-size: 18px; font-variant-numeric: tabular-nums; }
.primary-fields { display: grid; grid-template-columns: minmax(0, 1fr); border-top: 1px solid var(--ui-color-border, #e2e5e9); border-bottom: 1px solid var(--ui-color-border, #e2e5e9); }
.primary-fields--paired { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.primary-field { min-width: 0; padding: 18px 12px 18px 0; box-sizing: border-box; }
.primary-field + .primary-field { padding-left: 18px; border-left: 1px solid var(--ui-color-border, #e2e5e9); }
.field-value { display: block; margin-top: 8px; font-size: 24px; font-weight: 700; line-height: 1.4; white-space: pre-wrap; }
.primary-field--table .field-value { color: var(--ui-color-primary, #99732c); font-size: 36px; line-height: 1.2; }
.other-fields { padding-top: 18px; }
.other-field { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: baseline; gap: 12px; }
.other-field + .other-field { margin-top: 12px; }
.other-value { display: block; min-width: 0; font-size: 18px; white-space: pre-wrap; }
.other-field--strong .other-value { color: var(--ui-color-primary, #99732c); font-weight: 700; }
</style>
