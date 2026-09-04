<template>
  <view v-if="visible" class="ticket-selector" aria-label="选择报名票种">
    <view class="ticket-selector__mask" @click="$emit('close')" />
    <view class="ticket-selector__panel">
      <view class="ticket-selector__handle" />
      <view class="ticket-selector__header">
        <view>
          <text class="ticket-selector__title">选择票种</text>
          <text class="ticket-selector__subtitle">选择后进入报名表，实际金额以下单时后端计算为准。</text>
        </view>
        <button class="ticket-selector__close" aria-label="关闭票种选择" @click="$emit('close')">
          <wd-icon name="close" size="19px" />
        </button>
      </view>

      <scroll-view class="ticket-selector__body" scroll-y>
        <view
          v-for="sku in skus"
          :key="sku.id"
          :class="['ticket-selector__sku', selectedSkuId === sku.id ? 'is-selected' : '', remainingStock(sku) <= 0 ? 'is-disabled' : '']"
          @click="selectSku(sku)"
        >
          <view class="ticket-selector__sku-main">
            <view class="ticket-selector__sku-heading">
              <text class="ticket-selector__sku-name">{{ sku.name }}</text>
              <text v-if="remainingStock(sku) <= 0" class="ticket-selector__sold-out">已售罄</text>
            </view>
            <text v-if="sku.description" class="ticket-selector__sku-desc">{{ sku.description }}</text>
            <view class="ticket-selector__stock">
              <wd-icon name="info-circle" size="15px" />
              <text>{{ stockLabel(sku) }}</text>
            </view>
          </view>
          <view class="ticket-selector__price-col">
            <text class="ticket-selector__price">¥{{ formatCent(sku.priceCent) }}</text>
            <view class="ticket-selector__check">
              <wd-icon v-if="selectedSkuId === sku.id" name="check" size="18px" />
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="ticket-selector__footer">
        <view class="ticket-selector__selected">
          <text class="ticket-selector__selected-label">已选</text>
          <text class="ticket-selector__selected-value">{{ selectedSku?.name || "请选择票种" }}</text>
        </view>
        <button class="ticket-selector__confirm" :disabled="!selectedSku || selectedDisabled" @click="$emit('confirm')">
          下一步
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { RegistrationSku } from "@/services/conference";
import { formatCent } from "@/utils/money";
import { remainingRegistrationStock } from "@/utils/registration-stock";

const props = defineProps<{
  visible: boolean;
  skus: RegistrationSku[];
  selectedSkuId: string;
}>();

const emit = defineEmits<{
  close: [];
  select: [skuId: string];
  confirm: [];
}>();

const selectedSku = computed(() => props.skus.find((sku) => sku.id === props.selectedSkuId) ?? null);
const selectedDisabled = computed(() => (selectedSku.value ? remainingStock(selectedSku.value) <= 0 : true));

function selectSku(sku: RegistrationSku) {
  if (remainingStock(sku) <= 0) return;
  emit("select", sku.id);
}

function remainingStock(sku: RegistrationSku): number {
  return remainingRegistrationStock(sku);
}

function stockLabel(sku: RegistrationSku): string {
  const remaining = remainingStock(sku);
  if (remaining <= 0) return "名额已售罄";
  if (remaining <= 10) return `仅剩 ${remaining} 席`;
  return `剩余 ${remaining} 席`;
}
</script>

<style scoped>
.ticket-selector {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 60;
}

.ticket-selector__mask {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(13, 22, 35, 0.48);
}

.ticket-selector__panel {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  max-height: 86vh;
  flex-direction: column;
  border-radius: 28rpx 28rpx 0 0;
  background: #fbfcfa;
  box-shadow: 0 -20rpx 54rpx rgba(16, 28, 42, 0.16);
  box-sizing: border-box;
}

.ticket-selector__handle {
  width: 88rpx;
  height: 10rpx;
  margin: 18rpx auto 10rpx;
  border-radius: 999px;
  background: #d6dce2;
}

.ticket-selector__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24rpx;
  align-items: flex-start;
  padding: 20rpx 38rpx 24rpx;
  box-sizing: border-box;
}

.ticket-selector__title,
.ticket-selector__subtitle,
.ticket-selector__sku-name,
.ticket-selector__sku-desc,
.ticket-selector__price,
.ticket-selector__selected-label,
.ticket-selector__selected-value {
  display: block;
}

.ticket-selector__title {
  color: #121d2f;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.25;
}

.ticket-selector__subtitle {
  margin-top: 10rpx;
  color: #697586;
  font-size: 24rpx;
  line-height: 1.5;
}

.ticket-selector__close {
  display: flex;
  width: 64rpx;
  height: 64rpx;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid #dfe5ea;
  border-radius: 50%;
  background: #f6f8f9;
  color: #1f2937;
  line-height: 1;
}

.ticket-selector__close::after,
.ticket-selector__confirm::after {
  border: 0;
}

.ticket-selector__body {
  min-height: 280rpx;
  max-height: 760rpx;
  padding: 0 38rpx;
  box-sizing: border-box;
}

.ticket-selector__sku {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 20rpx;
  margin-bottom: 22rpx;
  padding: 28rpx 26rpx;
  border: 2rpx solid #edf1f3;
  border-radius: 20rpx;
  background: #f7f8f7;
  box-sizing: border-box;
  transition: border-color 160ms ease, background-color 160ms ease, transform 160ms ease;
}

.ticket-selector__sku.is-selected {
  border-color: #1d6fe8;
  background: #eef6ff;
}

.ticket-selector__sku.is-disabled {
  opacity: 0.58;
}

.ticket-selector__sku-heading,
.ticket-selector__stock {
  display: flex;
  align-items: center;
}

.ticket-selector__sku-heading {
  flex-wrap: wrap;
  gap: 12rpx;
}

.ticket-selector__sku-name {
  color: #202a3a;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 1.35;
}

.ticket-selector__sold-out {
  padding: 5rpx 12rpx;
  border-radius: 999px;
  background: #e7ebee;
  color: #717b86;
  font-size: 21rpx;
  font-weight: 800;
}

.ticket-selector__sku-desc {
  margin-top: 12rpx;
  color: #687386;
  font-size: 25rpx;
  line-height: 1.52;
}

.ticket-selector__stock {
  gap: 8rpx;
  margin-top: 18rpx;
  color: #8892a0;
  font-size: 23rpx;
}

.ticket-selector__price-col {
  display: flex;
  min-width: 150rpx;
  flex-direction: column;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24rpx;
}

.ticket-selector__price {
  color: #ff4d52;
  font-size: 38rpx;
  font-weight: 900;
  line-height: 1.2;
}

.ticket-selector__check {
  display: flex;
  width: 48rpx;
  height: 48rpx;
  align-items: center;
  justify-content: center;
  border: 2rpx solid #d9e0e7;
  border-radius: 50%;
  color: #ffffff;
  box-sizing: border-box;
}

.ticket-selector__sku.is-selected .ticket-selector__check {
  border-color: #1d6fe8;
  background: #1d6fe8;
}

.ticket-selector__footer {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  padding: 24rpx 38rpx calc(26rpx + env(safe-area-inset-bottom));
  border-top: 1px solid #e6ebef;
  background: rgba(251, 252, 250, 0.96);
  box-shadow: 0 -10rpx 28rpx rgba(18, 29, 47, 0.05);
  box-sizing: border-box;
}

.ticket-selector__selected {
  min-width: 0;
}

.ticket-selector__selected-label {
  color: #8b93a1;
  font-size: 22rpx;
  line-height: 1.35;
}

.ticket-selector__selected-value {
  overflow: hidden;
  color: #202a3a;
  font-size: 27rpx;
  font-weight: 800;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-selector__confirm {
  width: 100%;
  min-width: 0;
  height: 86rpx;
  padding: 0;
  border-radius: 999px;
  background: #1d6fe8;
  color: #fbfcfa;
  font-size: 31rpx;
  font-weight: 900;
  line-height: 86rpx;
  box-shadow: 0 16rpx 28rpx rgba(29, 111, 232, 0.24);
}

.ticket-selector__confirm[disabled] {
  background: #d6dce2;
  color: #8390a0;
  box-shadow: none;
}
</style>
