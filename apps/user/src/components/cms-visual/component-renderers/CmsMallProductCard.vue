<template>
  <view :class="['cms-mall-product-card', `is-${cardStyle}`]" @click="emit('open')">
    <image
      v-if="showImage && product.coverImageUrl"
      :class="['cms-mall-product-card__image', `is-${imageRatio.replace(':', '-')}`]"
      :src="product.coverImageUrl"
      mode="aspectFill"
    />
    <view v-else-if="showImage" class="cms-mall-product-card__image is-empty">
      <text>{{ product.title.slice(0, 1) }}</text>
    </view>
    <view class="cms-mall-product-card__body">
      <text class="cms-mall-product-card__title">{{ product.title }}</text>
      <text v-if="product.subtitle && showSubtitle" class="cms-mall-product-card__subtitle">{{ product.subtitle }}</text>
      <view class="cms-mall-product-card__footer">
        <text v-if="showPrice" class="cms-mall-product-card__price">{{ product.availableStock > 0 ? priceText : "售罄" }}</text>
        <button v-if="showCartButton" class="cms-mall-product-card__add" @click.stop="emit('add')">+</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import type { Product } from "@/services/mall";
import { formatCent } from "@/utils/money";
import { booleanConfig, stringConfig } from "./config";

const props = defineProps<{ component: CmsComponent; product: Product }>();
const emit = defineEmits<{ open: []; add: [] }>();

const cardStyle = computed(() => stringConfig(props.component, "cardStyle", "elevated"));
const imageRatio = computed(() => stringConfig(props.component, "imageRatio", "1:1"));
const showImage = computed(() => booleanConfig(props.component, "showImage", true));
const showSubtitle = computed(() => booleanConfig(props.component, "showSubtitle", false));
const showPrice = computed(() => booleanConfig(props.component, "showPrice", true));
const showCartButton = computed(() => booleanConfig(props.component, "showCartButton", true));
const priceText = computed(() => {
  const prices = props.product.skus.map((item) => item.priceCent);
  return prices.length > 0 ? `¥${formatCent(Math.min(...prices))}` : "暂无价格";
});
</script>

<style scoped>
.cms-mall-product-card {
  min-width: 0;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 14rpx;
  background: var(--cms-surface-elevated);
}

.cms-mall-product-card.is-elevated {
  box-shadow: 0 10rpx 24rpx rgba(20, 31, 45, 0.08);
}

.cms-mall-product-card__image {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  background: var(--cms-surface-muted);
  object-fit: cover;
}

.cms-mall-product-card__image.is-4-3 {
  aspect-ratio: 4 / 3;
}

.cms-mall-product-card__image.is-3-4 {
  aspect-ratio: 3 / 4;
}

.cms-mall-product-card__image.is-empty {
  display: grid;
  place-items: center;
  color: var(--cms-text-secondary);
  font-size: 42rpx;
}

.cms-mall-product-card__body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 12rpx;
  padding: 18rpx 16rpx 16rpx;
}

.cms-mall-product-card__title {
  display: -webkit-box;
  min-height: 64rpx;
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.34;
  word-break: break-word;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.cms-mall-product-card__subtitle {
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: 20rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-mall-product-card__footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8rpx;
}

.cms-mall-product-card__price {
  min-width: 0;
  overflow: hidden;
  color: var(--cms-accent);
  font-size: 25rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-mall-product-card__add {
  width: 48rpx;
  height: 48rpx;
  min-height: 48rpx;
  flex: none;
  margin: 0;
  padding: 0;
  border-radius: 10rpx;
  background: var(--cms-primary);
  color: #f8faf8;
  font-size: 28rpx;
  line-height: 46rpx;
}

.cms-mall-product-card__add::after {
  border: 0;
}
</style>
