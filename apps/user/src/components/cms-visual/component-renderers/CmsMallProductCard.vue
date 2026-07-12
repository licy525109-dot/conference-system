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
      <view class="cms-mall-product-card__meta">
        <wd-tag v-if="product.availableStock > 0" plain type="warning" size="small">精选</wd-tag>
        <wd-tag v-else plain type="error" size="small">售罄</wd-tag>
      </view>
      <text class="cms-mall-product-card__title">{{ product.title }}</text>
      <text v-if="product.subtitle && showSubtitle" class="cms-mall-product-card__subtitle">{{ product.subtitle }}</text>
      <view class="cms-mall-product-card__footer">
        <text v-if="showPrice" class="cms-mall-product-card__price">{{ product.availableStock > 0 ? priceText : "售罄" }}</text>
        <wd-button v-if="showCartButton" custom-class="cms-mall-product-card__add" type="icon" icon="cart" size="small" :round="false" :custom-style="cartButtonStyle" @click.stop="emit('add')" />
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
const cartButtonStyle = "width:52rpx;height:52rpx;min-width:52rpx;min-height:52rpx;padding:0;border-radius:10rpx;background:var(--cms-primary);color:#f8faf8;border:0;";
</script>

<style scoped>
.cms-mall-product-card {
  min-width: 0;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 16rpx;
  background: var(--cms-surface-elevated);
  transition: transform 160ms ease-out, box-shadow 160ms ease-out;
}

.cms-mall-product-card:active {
  transform: scale(0.985);
}

.cms-mall-product-card.is-elevated {
  box-shadow: 0 12rpx 30rpx rgba(20, 31, 45, 0.09);
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
  gap: 10rpx;
  padding: 18rpx 18rpx 17rpx;
}

.cms-mall-product-card__meta {
  display: flex;
  min-height: 31rpx;
  align-items: center;
}

.cms-mall-product-card__title {
  display: -webkit-box;
  min-height: 64rpx;
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 25rpx;
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
  font-size: 28rpx;
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
