<template>
  <view class="cms-membership-benefits" :style="rootStyle">
    <view class="cms-membership-benefits__shade" />
    <view class="cms-membership-benefits__head">
      <view class="cms-membership-benefits__copy">
        <text class="cms-membership-benefits__title">{{ title }}</text>
        <text v-if="subtitle" class="cms-membership-benefits__subtitle">{{ subtitle }}</text>
      </view>
      <wd-button custom-class="cms-membership-benefits__button" size="small" type="warning" :round="false" :custom-style="benefitButtonStyle" @click.stop="emit('activate')">{{ buttonText }}</wd-button>
    </view>
    <view class="cms-membership-benefits__items">
      <view v-for="(item, index) in items" :key="`${index}-${item}`" class="cms-membership-benefits__item">
        <text class="cms-membership-benefits__index">{{ index + 1 }}</text>
        <text>{{ item }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { stringConfig, stringListConfig } from "./config";

const props = defineProps<{ component: CmsComponent }>();
const emit = defineEmits<{ activate: [] }>();

const title = computed(() => stringConfig(props.component, "title", "会员权益"));
const subtitle = computed(() => stringConfig(props.component, "subtitle"));
const buttonText = computed(() => stringConfig(props.component, "buttonText", "查看权益"));
const items = computed(() => stringListConfig(props.component, "items").length > 0
  ? stringListConfig(props.component, "items")
  : ["优先获取会议排期", "会员专享报名通道", "尊享活动与服务特权"]);
const rootStyle = computed(() => stringConfig(props.component, "imageUrl")
  ? { backgroundImage: `url(${stringConfig(props.component, "imageUrl")})` }
  : {});
const benefitButtonStyle = "min-height:62rpx;padding:0 24rpx;border-radius:12rpx;background:#e7d1aa;color:#15304d;border:0;";
</script>

<style scoped>
.cms-membership-benefits {
  position: relative;
  padding: 32rpx;
  overflow: hidden;
  border-radius: 16rpx;
  color: #f7f8f6;
  background-color: var(--cms-primary);
  background-position: center;
  background-size: cover;
  box-shadow: var(--cms-shadow-md);
}

.cms-membership-benefits__shade {
  position: absolute;
  inset: 0;
  background: rgba(10, 29, 51, 0.9);
}

.cms-membership-benefits__head,
.cms-membership-benefits__items {
  position: relative;
  z-index: 1;
}

.cms-membership-benefits__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  margin-bottom: 26rpx;
}

.cms-membership-benefits__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6rpx;
}

.cms-membership-benefits__title {
  color: #f7f8f6;
  font-size: 32rpx;
  font-weight: 700;
}

.cms-membership-benefits__subtitle {
  color: rgba(247, 248, 246, 0.72);
  font-size: 21rpx;
}

.cms-membership-benefits__button {
  min-height: 62rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 12rpx;
  color: #15304d;
  font-size: 22rpx;
  line-height: 62rpx;
  background: #e7d1aa;
}

.cms-membership-benefits__button::after {
  border: 0;
}

.cms-membership-benefits__items {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  border: 1rpx solid rgba(247, 248, 246, 0.14);
  border-radius: 12rpx;
  background: rgba(247, 248, 246, 0.06);
}

.cms-membership-benefits__item {
  display: flex;
  min-width: 0;
  min-height: 118rpx;
  flex-direction: column;
  justify-content: center;
  gap: 10rpx;
  padding: 18rpx;
  color: #f7f8f6;
  font-size: 21rpx;
  line-height: 1.4;
}

.cms-membership-benefits__item + .cms-membership-benefits__item {
  border-left: 1rpx solid rgba(247, 248, 246, 0.14);
}

.cms-membership-benefits__index {
  color: #e7d1aa;
  font-size: 25rpx;
  font-weight: 700;
}

@media (max-width: 430px) {
  .cms-membership-benefits__head {
    align-items: center;
  }

  .cms-membership-benefits__items {
    grid-template-columns: 1fr;
  }

  .cms-membership-benefits__item {
    min-height: 86rpx;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
  }

  .cms-membership-benefits__item + .cms-membership-benefits__item {
    border-top: 1rpx solid rgba(247, 248, 246, 0.14);
    border-left: 0;
  }
}
</style>
