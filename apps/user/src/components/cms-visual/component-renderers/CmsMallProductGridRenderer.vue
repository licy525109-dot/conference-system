<template>
  <view class="cms-mall-products" :class="[`is-${layoutMode}`, `is-${cardStyle}`]">
    <view v-if="title || showMore" class="cms-mall-products__head">
      <view v-if="title" class="cms-mall-products__heading">
        <text class="cms-mall-products__eyebrow">PRODUCTS</text>
        <text class="cms-mall-products__title">{{ title }}</text>
      </view>
      <text v-if="showMore" class="cms-mall-products__more" @click.stop="emit('more')">{{ moreText }}</text>
    </view>
    <scroll-view v-if="categories.length > 1" scroll-x class="cms-mall-products__categories">
      <view class="cms-mall-products__category-track">
        <text
          v-for="category in categories"
          :key="category"
          :class="['cms-mall-products__category', activeCategory === category ? 'active' : '']"
          @click="activeCategory = category"
        >{{ category }}</text>
      </view>
    </scroll-view>

    <view v-if="loading" class="cms-mall-products__empty">商品加载中</view>
    <view v-else-if="visibleProducts.length === 0" class="cms-mall-products__empty">暂无可展示商品</view>
    <scroll-view v-else-if="layoutMode === 'scroll'" scroll-x class="cms-mall-products__scroll">
      <view class="cms-mall-products__grid is-scroll" :style="gridStyle">
        <CmsMallProductCard v-for="product in visibleProducts" :key="product.id" :product="product" :component="component" @open="emit('open', product)" @add="emit('add', product)" />
      </view>
    </scroll-view>
    <view v-else class="cms-mall-products__grid" :style="gridStyle">
      <CmsMallProductCard v-for="product in visibleProducts" :key="product.id" :product="product" :component="component" @open="emit('open', product)" @add="emit('add', product)" />
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import CmsMallProductCard from "./CmsMallProductCard.vue";
import type { CmsComponent } from "@/services/cms";
import type { Product } from "@/services/mall";
import { booleanConfig, numberConfig, stringConfig, stringListConfig } from "./config";

const props = defineProps<{ component: CmsComponent; products: Product[]; loading?: boolean }>();
const emit = defineEmits<{ open: [product: Product]; add: [product: Product]; more: [] }>();

const title = computed(() => stringConfig(props.component, "title"));
const showMore = computed(() => booleanConfig(props.component, "showMoreButton", false));
const moreText = computed(() => stringConfig(props.component, "moreButtonText", "查看更多"));
const categories = computed(() => {
  const configured = stringListConfig(props.component, "categories").map((item) => item.split(/[｜|]/)[0]?.trim()).filter(Boolean);
  const actual = Array.from(new Set(props.products.map((item) => item.category?.name || "").filter(Boolean)));
  const rows = configured.length > 0 ? configured : actual;
  return rows.length > 0 && rows[0] !== "全部" ? ["全部", ...rows] : rows.length > 0 ? rows : ["全部"];
});
const activeCategory = ref("全部");
watch(categories, (value) => {
  if (!value.includes(activeCategory.value)) activeCategory.value = value[0] || "全部";
}, { immediate: true });
const visibleProducts = computed(() => activeCategory.value === "全部"
  ? props.products
  : props.products.filter((item) => item.category?.name === activeCategory.value));
const columns = computed(() => Math.min(4, Math.max(2, numberConfig(props.component, "columns", 2))));
const layoutMode = computed<"grid" | "scroll">(() => stringConfig(props.component, "layoutMode") === "scroll" ? "scroll" : "grid");
const cardStyle = computed(() => stringConfig(props.component, "cardStyle", "elevated"));
const gridStyle = computed(() => layoutMode.value === "scroll"
  ? { gap: "18rpx" }
  : { gridTemplateColumns: `repeat(${columns.value}, minmax(0, 1fr))` });

</script>

<style scoped>
.cms-mall-products {
  min-width: 0;
  padding: 10rpx 0 4rpx;
}

.cms-mall-products__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  margin-bottom: 22rpx;
  padding: 0 4rpx;
}

.cms-mall-products__heading {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4rpx;
}

.cms-mall-products__eyebrow {
  color: var(--cms-accent);
  font-size: 17rpx;
  font-weight: 700;
  letter-spacing: 0;
}

.cms-mall-products__title {
  color: var(--cms-text-primary);
  font-size: 32rpx;
  font-weight: 700;
}

.cms-mall-products__more {
  color: var(--cms-accent);
  font-size: 22rpx;
}

.cms-mall-products__categories {
  width: 100%;
  margin-bottom: 22rpx;
  white-space: nowrap;
}

.cms-mall-products__category-track {
  display: flex;
  width: max-content;
  gap: 12rpx;
}

.cms-mall-products__category {
  padding: 13rpx 26rpx;
  border: 1rpx solid transparent;
  border-radius: 999rpx;
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  background: var(--cms-surface-muted);
}

.cms-mall-products__category.active {
  color: #f8faf8;
  background: var(--cms-primary);
  box-shadow: 0 8rpx 18rpx rgba(16, 35, 61, 0.14);
}

.cms-mall-products__grid {
  display: grid;
  min-width: 0;
  gap: 20rpx;
}

.cms-mall-products__grid.is-scroll {
  display: flex;
  width: max-content;
  min-width: 100%;
}

.cms-mall-products__scroll {
  width: 100%;
  white-space: nowrap;
}

.cms-mall-products.is-scroll :deep(.cms-mall-product-card) {
  width: 248rpx;
  flex: none;
}

.cms-mall-products__empty {
  padding: 54rpx 20rpx;
  color: var(--cms-text-secondary);
  font-size: 23rpx;
  text-align: center;
}

.cms-mall-products.is-plain .cms-mall-product-card {
  box-shadow: none;
}
</style>
