<template>
  <view class="page">
    <view class="topbar">
      <view>
        <text class="eyebrow">会议周边</text>
        <text class="title">商城商品</text>
      </view>
      <button class="ghost-button compact" @click="goHome">首页</button>
    </view>

    <view class="toolbar">
      <input v-model="keyword" class="search" placeholder="搜索商品" @confirm="loadProducts" />
      <button class="primary-button compact" @click="loadProducts">查询</button>
    </view>

    <scroll-view scroll-x class="category-scroll">
      <button class="category" :class="{ active: !categoryId }" @click="selectCategory('')">全部</button>
      <button v-for="item in categories" :key="item.id" class="category" :class="{ active: categoryId === item.id }" @click="selectCategory(item.id)">
        {{ item.name }}
      </button>
    </scroll-view>

    <view v-if="loading" class="state">加载商品中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadProducts">重试</button>
    </view>
    <view v-else-if="products.length === 0" class="state">暂无上架商品</view>
    <view v-else class="grid">
      <view v-for="item in products" :key="item.id" class="product-card" @click="goDetail(item.id)">
        <image v-if="item.coverImageUrl" class="cover" :src="item.coverImageUrl" mode="aspectFill" />
        <view v-else class="cover empty">暂无图片</view>
        <view class="product-body">
          <text class="product-title">{{ item.title }}</text>
          <text class="muted">{{ item.subtitle || item.category?.name || "会议相关商品" }}</text>
          <text class="price">{{ priceText(item) }}</text>
        </view>
      </view>
    </view>

    <CustomTabbar active-page-key="mall" />
  </view>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import { getProductCategories, getProducts, type Product, type ProductCategory } from "@/services/mall";
import { goHome } from "@/utils/navigation";

const categories = ref<ProductCategory[]>([]);
const products = ref<Product[]>([]);
const keyword = ref("");
const categoryId = ref("");
const loading = ref(false);
const error = ref("");

onMounted(async () => {
  await Promise.all([loadCategories(), loadProducts()]);
});

async function loadCategories() {
  categories.value = (await getProductCategories()).items;
}

async function loadProducts() {
  loading.value = true;
  error.value = "";
  try {
    products.value = (await getProducts({ page: 1, pageSize: 50, keyword: keyword.value, categoryId: categoryId.value })).items;
  } catch (err) {
    console.error("[MALL_PRODUCTS_LOAD_ERROR]", err);
    error.value = "商品加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function selectCategory(id: string) {
  categoryId.value = id;
  void loadProducts();
}

function goDetail(id: string) {
  uni.navigateTo({ url: `/pages/mall/detail?id=${encodeURIComponent(id)}` });
}

function priceText(item: Product) {
  const prices = item.skus.map((sku) => sku.priceCent);
  if (prices.length === 0) return "暂无价格";
  return `¥${(Math.min(...prices) / 100).toFixed(2)} 起`;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx 28rpx 140rpx;
  box-sizing: border-box;
}

.topbar,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.topbar {
  margin-bottom: 24rpx;
}

.toolbar {
  margin-bottom: 18rpx;
}

.eyebrow,
.muted {
  display: block;
  color: #627087;
  font-size: 24rpx;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #172033;
  font-size: 42rpx;
  font-weight: 800;
}

.search {
  flex: 1;
  height: 72rpx;
  padding: 0 22rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
  font-size: 27rpx;
}

.category-scroll {
  white-space: nowrap;
  margin-bottom: 22rpx;
}

.category {
  display: inline-block;
  width: auto;
  min-width: 132rpx;
  margin-right: 12rpx;
  padding: 0 22rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
  color: #41516a;
  font-size: 25rpx;
  line-height: 64rpx;
}

.category.active {
  border-color: #2452a8;
  color: #2452a8;
  font-weight: 800;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.product-card {
  overflow: hidden;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.cover {
  width: 100%;
  height: 220rpx;
  background: #e8eef8;
}

.cover.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #627087;
  font-size: 25rpx;
}

.product-body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx;
}

.product-title {
  color: #172033;
  font-size: 29rpx;
  font-weight: 800;
  line-height: 1.35;
}

.price {
  color: #2452a8;
  font-size: 29rpx;
  font-weight: 800;
}

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
}

.primary-button {
  background: #2452a8;
  color: #ffffff;
}

.ghost-button {
  border: 1px solid #ccd7e6;
  background: #ffffff;
  color: #2452a8;
}

.compact {
  width: 156rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 96rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
