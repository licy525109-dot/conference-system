<template>
  <view class="detail-overview">
    <view class="detail-overview__card">
      <view class="detail-overview__topline">
        <text :class="['detail-overview__status', `is-${statusTone}`]">{{ statusLabel }}</text>
        <text v-if="conference.location" class="detail-overview__location">{{ conference.location }}</text>
      </view>
      <text class="detail-overview__title">{{ conference.title }}</text>
      <text v-if="conference.summary" class="detail-overview__summary">{{ conference.summary }}</text>

      <view class="detail-overview__trust-row">
        <view v-if="typeof conference.registrationCount === 'number'" class="detail-overview__trust-item">
          <wd-icon name="user" size="17px" />
          <text>{{ conference.registrationCount }} 人已报名</text>
        </view>
        <view class="detail-overview__trust-item">
          <wd-icon name="wallet" size="17px" />
          <text>{{ priceRangeText }}</text>
        </view>
        <view v-if="conference.showRemainingSeats && remainingSeatText" class="detail-overview__trust-item">
          <wd-icon name="info-circle" size="17px" />
          <text>{{ remainingSeatText }}</text>
        </view>
      </view>
    </view>

    <view class="detail-overview__facts">
      <view class="detail-overview__fact">
        <wd-icon class="detail-overview__fact-icon" name="time" size="22px" />
        <view class="detail-overview__fact-copy">
          <text class="detail-overview__fact-label">会议时间</text>
          <text class="detail-overview__fact-value">{{ formatDateTime(conference.startsAt) }} 至 {{ formatDateTime(conference.endsAt) }}</text>
        </view>
      </view>
      <view v-if="conference.location" class="detail-overview__fact">
        <wd-icon class="detail-overview__fact-icon" name="location" size="22px" />
        <view class="detail-overview__fact-copy">
          <text class="detail-overview__fact-label">会议地点</text>
          <text class="detail-overview__fact-value">{{ conference.location }}</text>
        </view>
      </view>
      <view class="detail-overview__fact">
        <wd-icon class="detail-overview__fact-icon" name="calendar" size="22px" />
        <view class="detail-overview__fact-copy">
          <text class="detail-overview__fact-label">报名截止</text>
          <text class="detail-overview__fact-value">{{ registrationDeadline }}</text>
        </view>
      </view>
      <view class="detail-overview__fact detail-overview__fact--button" @click="$emit('openTickets')">
        <wd-icon class="detail-overview__fact-icon" name="wallet" size="22px" />
        <view class="detail-overview__fact-copy">
          <text class="detail-overview__fact-label">报名票种</text>
          <text class="detail-overview__fact-value detail-overview__fact-value--link">{{ ticketSummary }}</text>
        </view>
        <wd-icon name="chevron-right" size="19px" />
      </view>
    </view>
    <image
      v-if="conference.coverImageUrl && !coverFailed"
      class="detail-overview__cover"
      :src="conference.coverImageUrl"
      mode="widthFix"
      :aria-label="`${conference.title}会议封面`"
      @error="coverFailed = true"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ConferenceDetail, RegistrationSku } from "@/services/conference";
import { formatDateTime } from "@/utils/date";
import { remainingRegistrationStock } from "@/utils/registration-stock";

const props = defineProps<{
  conference: ConferenceDetail;
  statusLabel: string;
  statusTone: "success" | "warning" | "neutral";
  registrationDeadline: string;
  priceRangeText: string;
  skus: RegistrationSku[];
}>();

defineEmits<{
  openTickets: [];
}>();

const availableSkus = computed(() => props.skus.filter((sku) => remainingStock(sku) > 0));
const coverFailed = ref(false);
watch(() => props.conference.coverImageUrl, () => { coverFailed.value = false; });
const remainingSeatText = computed(() => {
  const total = props.skus.reduce((sum, sku) => sum + remainingStock(sku), 0);
  return total > 0 ? `余 ${total} 席` : "";
});
const ticketSummary = computed(() => {
  if (props.skus.length === 0) return "暂无可选票种";
  if (availableSkus.value.length === 0) return "票种已售罄";
  return `${availableSkus.value.length} 个可选票种，点击查看`;
});

function remainingStock(sku: RegistrationSku): number {
  return remainingRegistrationStock(sku);
}
</script>

<style scoped>
.detail-overview {
  position: relative;
  background: #ffffff;
}

.detail-overview__hero {
  position: relative;
  width: 100%;
  height: 420rpx;
  overflow: hidden;
  background: #ebeae5;
}

.detail-overview__cover {
  display: block;
  width: 100%;
  height: auto;
  background: #ffffff;
}

.detail-overview__fallback {
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: flex-end;
  gap: 8rpx;
  padding: 56rpx 44rpx 76rpx;
  background: #152438;
  box-sizing: border-box;
}

.detail-overview__logo {
  width: 94rpx;
  height: 94rpx;
  margin-bottom: 8rpx;
}

.detail-overview__fallback-title {
  color: #f4f0e8;
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.2;
}

.detail-overview__fallback-subtitle {
  color: #d6c08b;
  font-size: 24rpx;
  font-weight: 700;
}

.detail-overview__card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 24px 20px 12px;
  background: #ffffff;
  box-sizing: border-box;
}

.detail-overview__topline,
.detail-overview__trust-row,
.detail-overview__trust-item,
.detail-overview__fact {
  display: flex;
  align-items: center;
}

.detail-overview__topline {
  justify-content: space-between;
  gap: 20rpx;
}

.detail-overview__status {
  display: inline-flex;
  min-height: 48rpx;
  align-items: center;
  padding: 0 18rpx;
  border-radius: 24rpx;
  font-size: 23rpx;
  font-weight: 800;
  line-height: 48rpx;
}

.detail-overview__status.is-success {
  background: #e5f7ed;
  color: #13734a;
}

.detail-overview__status.is-warning {
  background: #fff2d5;
  color: #8a621e;
}

.detail-overview__status.is-neutral {
  background: #eef1ef;
  color: #5e6972;
}

.detail-overview__location {
  max-width: 330rpx;
  overflow: hidden;
  color: #6c737f;
  font-size: 25rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-overview__title {
  color: var(--cms-text-primary);
  font-size: 25px;
  font-weight: 700;
  overflow-wrap: anywhere;
  line-height: 1.42;
}

.detail-overview__summary {
  color: var(--cms-text-secondary);
  font-size: 17px;
  line-height: 1.65;
}

.detail-overview__trust-row {
  flex-wrap: wrap;
  gap: 14rpx 20rpx;
  padding-top: 6rpx;
}

.detail-overview__trust-item {
  gap: 8rpx;
  color: var(--cms-text-secondary);
  font-size: 16px;
  line-height: 1.35;
}

.detail-overview__facts {
  margin: 0 20px 20px;
  padding: 0;
  background: #ffffff;
  box-sizing: border-box;
}

.detail-overview__fact {
  min-height: 104rpx;
  gap: 22rpx;
  padding: 20rpx 0;
  border-bottom: 1px solid #e5e9e6;
  box-sizing: border-box;
}

.detail-overview__fact:last-child {
  border-bottom: 0;
}

.detail-overview__fact--button {
  cursor: pointer;
}

.detail-overview__fact-icon {
  flex: 0 0 auto;
  color: #6c737f;
}

.detail-overview__fact-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 8rpx;
}

.detail-overview__fact-label {
  color: var(--cms-text-secondary);
  font-size: 16px;
  line-height: 1.25;
}

.detail-overview__fact-value {
  color: var(--cms-text-primary);
  font-size: 18px;
  font-weight: 600;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.detail-overview__fact-value--link {
  color: var(--cms-primary-strong);
}
</style>
