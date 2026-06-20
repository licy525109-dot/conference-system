<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">商城</text>
        <text class="title">商城商品</text>
        <text class="subtitle">可创建商城待支付订单，并在我的商城订单中完成支付。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="goHome">首页</button>
    </view>

    <ExtensionStatusNotice
      status="商城基础闭环"
      title="商品可下待支付订单"
      description="商品金额由后端按 SKU 当前价格重算并锁定库存，订单创建后以前往订单页查询和支付为准。"
      tone="info"
    />

    <PageRenderer v-if="cmsPage" :components="cmsPage.version.components" :theme="theme" />

    <view class="toolbar ui-card">
      <input v-model="keyword" class="search" placeholder="搜索商品" @confirm="loadProducts" />
      <button class="ui-button-primary ui-button-compact" @click="loadProducts">查询</button>
    </view>

    <scroll-view scroll-x class="category-scroll">
      <button class="category" :class="{ active: !categoryId }" @click="selectCategory('')">全部</button>
      <button v-for="item in categories" :key="item.id" class="category" :class="{ active: categoryId === item.id }" @click="selectCategory(item.id)">
        {{ item.name }}
      </button>
    </scroll-view>

    <LoadingState v-if="loading" title="加载商品中" description="正在读取商品、分类和可售库存。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回首页" @retry="loadProducts" @secondary="goHome" />
    <EmptyState
      v-else-if="products.length === 0"
      title="暂无展示商品"
      description="当前没有可售商品，可以先返回首页查看会议报名。"
      mark="商"
      action-text="查看会议"
      @action="goHome"
    />
    <view v-else class="grid">
      <view v-for="item in products" :key="item.id" class="product-card" @click="goDetail(item.id)">
        <image v-if="item.coverImageUrl" class="cover" :src="item.coverImageUrl" mode="aspectFill" />
        <view v-else class="cover empty">暂无图片</view>
        <view class="product-body">
          <StatusTag label="可下单" tone="info" />
          <text class="product-title">{{ item.title }}</text>
          <text class="muted">{{ item.subtitle || item.category?.name || "会议相关商品" }}</text>
          <text class="price">{{ priceText(item) }}</text>
          <text class="detail-link">查看详情</text>
        </view>
      </view>
    </view>

    <CustomTabbar active-page-key="mall" />
  </view>
</template>

<script setup lang="ts">
import { onLoad } from "@dcloudio/uni-app";
import { onMounted, ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import ExtensionStatusNotice from "@/components/ui/ExtensionStatusNotice.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
import { getProductCategories, getProducts, type Product, type ProductCategory } from "@/services/mall";
import { goHome } from "@/utils/navigation";

const categories = ref<ProductCategory[]>([]);
const products = ref<Product[]>([]);
const keyword = ref("");
const categoryId = ref("");
const loading = ref(false);
const error = ref("");
const cmsPage = ref<PublishedPage | null>(null);
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("mall");

onMounted(async () => {
  await Promise.all([refreshTheme(), loadCmsPage(), loadCategories(), loadProducts()]);
});

onLoad((query) => {
  keyword.value = readQueryText(query?.keyword);
  categoryId.value = readQueryText(query?.categoryId) || readQueryText(query?.productCategoryId);
});

async function loadCategories() {
  categories.value = (await getProductCategories()).items;
}

async function loadCmsPage() {
  cmsPage.value = await getPublishedPage("mall");
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

function readQueryText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.topbar,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.topbar {
  padding: 28rpx;
}

.toolbar {
  padding: 16rpx;
}

.eyebrow,
.muted {
  display: block;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.eyebrow {
  color: var(--ui-color-primary);
  font-weight: 800;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-text);
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.search {
  flex: 1;
  height: 72rpx;
  padding: 0 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
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
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: #41516a;
  font-size: 25rpx;
  line-height: 64rpx;
}

.category.active {
  border-color: var(--ui-color-primary);
  color: var(--ui-color-primary);
  font-weight: 800;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}

.product-card {
  overflow: hidden;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.cover {
  width: 100%;
  height: 220rpx;
  background: var(--ui-color-primary-soft);
}

.cover.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-muted);
  font-size: 25rpx;
}

.product-body {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 18rpx;
}

.product-title {
  color: var(--ui-color-text);
  font-size: 29rpx;
  font-weight: 800;
  line-height: 1.35;
}

.price {
  color: var(--ui-color-primary);
  font-size: 29rpx;
  font-weight: 800;
}

.detail-link {
  color: var(--ui-color-primary);
  font-size: 25rpx;
  font-weight: 800;
}
</style>
