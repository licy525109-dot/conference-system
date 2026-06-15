<template>
  <view class="page">
    <view v-if="loading" class="state">加载商品详情中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="load">重试</button>
    </view>
    <template v-else-if="product">
      <image v-if="heroImage" class="hero" :src="heroImage" mode="aspectFill" />
      <view v-else class="hero empty">暂无图片</view>
      <view class="content">
        <text class="title">{{ product.title }}</text>
        <text class="subtitle">{{ product.subtitle || product.category?.name || "会议相关商品" }}</text>
        <view class="sku-list">
          <text class="section-title">规格</text>
          <view
            v-for="sku in product.skus"
            :key="sku.id"
            :class="['sku-card', selectedSkuId === sku.id ? 'selected' : '']"
            @click="selectSku(sku.id)"
          >
            <view>
              <text class="sku-name">{{ sku.name }}</text>
              <text class="muted">库存 {{ sku.stock - sku.soldCount }}</text>
            </view>
            <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
          </view>
        </view>
        <view class="quantity-box">
          <text class="section-title">数量</text>
          <view class="quantity-control">
            <button class="qty-button" @click="changeQuantity(-1)">-</button>
            <text class="qty-value">{{ quantity }}</text>
            <button class="qty-button" @click="changeQuantity(1)">+</button>
          </view>
        </view>
        <view class="notice">商品可先加入购物车统一管理；商品支付链路后续开放，不会影响会议报名支付。</view>
      </view>
    </template>

    <view class="bottom-actions">
      <button class="ghost-button" @click="goCart">购物车</button>
      <button class="primary-button" :disabled="adding || !selectedSkuId" @click="addToCart">
        {{ adding ? "加入中..." : "加入购物车" }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { addProductCartItem } from "@/services/cart";
import { getProductDetail, type Product } from "@/services/mall";

const productId = ref("");
const product = ref<Product | null>(null);
const loading = ref(false);
const error = ref("");
const selectedSkuId = ref("");
const quantity = ref(1);
const adding = ref(false);
const heroImage = computed(() => product.value?.coverImageUrl || product.value?.images[0]?.url || "");

onLoad((query) => {
  productId.value = typeof query?.id === "string" ? query.id : "";
  void load();
});

async function load() {
  if (!productId.value) {
    error.value = "缺少商品 ID";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    product.value = await getProductDetail(productId.value);
    selectedSkuId.value = product.value.skus[0]?.id ?? "";
  } catch (err) {
    console.error("[MALL_DETAIL_LOAD_ERROR]", err);
    error.value = "商品详情加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

function selectSku(id: string) {
  selectedSkuId.value = id;
  quantity.value = Math.min(quantity.value, maxQuantity());
}

function changeQuantity(delta: number) {
  quantity.value = Math.min(maxQuantity(), Math.max(1, quantity.value + delta));
}

async function addToCart() {
  if (!selectedSkuId.value) {
    uni.showToast({ title: "请选择商品规格", icon: "none" });
    return;
  }
  adding.value = true;
  try {
    await addProductCartItem(selectedSkuId.value, quantity.value);
    uni.showToast({ title: "已加入购物车", icon: "success" });
  } catch (err) {
    console.error("[MALL_ADD_CART_ERROR]", err);
    uni.showToast({ title: "加入购物车失败，请重试", icon: "none" });
  } finally {
    adding.value = false;
  }
}

function maxQuantity() {
  const sku = product.value?.skus.find((item) => item.id === selectedSkuId.value);
  return Math.max(1, (sku?.stock ?? 1) - (sku?.soldCount ?? 0));
}

function goCart() {
  uni.navigateTo({ url: "/pages/cart/index" });
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding-bottom: 140rpx;
  box-sizing: border-box;
}

.hero {
  width: 100%;
  height: 520rpx;
  background: #e8eef8;
}

.hero.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #627087;
  font-size: 28rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  padding: 28rpx;
}

.title,
.section-title,
.sku-name {
  display: block;
  color: #172033;
  font-weight: 800;
}

.title {
  font-size: 42rpx;
  line-height: 1.35;
}

.subtitle,
.muted {
  display: block;
  color: #627087;
  font-size: 25rpx;
  line-height: 1.45;
}

.sku-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.sku-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.sku-card.selected {
  border-color: #2452a8;
  background: #eef4ff;
}

.price {
  color: #2452a8;
  font-size: 31rpx;
  font-weight: 800;
}

.notice {
  padding: 22rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #f8fafc;
  color: #41516a;
  font-size: 25rpx;
  line-height: 1.5;
}

.quantity-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 14rpx;
}

.qty-button {
  width: 58rpx;
  height: 58rpx;
  padding: 0;
  border-radius: 8px;
  background: #2452a8;
  color: #ffffff;
  font-size: 30rpx;
  line-height: 58rpx;
}

.qty-value {
  min-width: 44rpx;
  color: #172033;
  font-size: 29rpx;
  font-weight: 800;
  text-align: center;
}

.bottom-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-columns: 1fr 1.5fr;
  gap: 16rpx;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 1px solid #dce3ef;
  background: #ffffff;
}

.primary-button,
.ghost-button {
  min-height: 80rpx;
  border-radius: 8px;
  font-size: 28rpx;
  line-height: 80rpx;
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
  width: 176rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 160rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
