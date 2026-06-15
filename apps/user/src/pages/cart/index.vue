<template>
  <view class="page">
    <view class="topbar">
      <view>
        <text class="eyebrow">统一结算</text>
        <text class="title">购物车</text>
      </view>
      <button class="ghost-button compact" @click="loadCart">刷新</button>
    </view>

    <view v-if="loading" class="state">加载购物车中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadCart">重试</button>
    </view>
    <view v-else-if="isEmpty" class="state">
      <text>购物车还没有内容</text>
      <button class="primary-button compact" @click="goHome">去看会议</button>
    </view>

    <template v-else>
      <view v-if="registrationItems.length > 0" class="section">
        <view class="section-head">
          <text class="section-title">会议报名</text>
          <text class="muted">报名支付沿用现有安全订单链路</text>
        </view>
        <view v-for="item in registrationItems" :key="item.id" class="card">
          <view class="card-head">
            <view class="card-main">
              <text class="card-title">{{ item.conference.title }}</text>
              <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
              <text class="muted" v-if="item.conference.location">{{ item.conference.location }}</text>
            </view>
            <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
          </view>
          <view class="card-actions">
            <button class="ghost-button" :disabled="removingId === item.id" @click="removeRegistration(item.id)">删除</button>
            <button class="primary-button" :disabled="checkoutId === item.id" @click="payRegistration(item.id)">
              {{ checkoutId === item.id ? "处理中..." : "去付款" }}
            </button>
          </view>
        </view>
      </view>

      <view v-if="productItems.length > 0" class="section">
        <view class="section-head">
          <text class="section-title">商品</text>
          <text class="muted">第一版仅生成商城订单，支付后续开放</text>
        </view>
        <view v-for="item in productItems" :key="item.id" class="card product-card">
          <image v-if="item.sku.product.coverImageUrl" class="product-cover" :src="item.sku.product.coverImageUrl" mode="aspectFill" />
          <view v-else class="product-cover empty-cover">商品</view>
          <view class="product-body">
            <view class="card-head">
              <view class="card-main">
                <text class="card-title">{{ item.sku.product.title }}</text>
                <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
              </view>
              <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
            </view>
            <view class="card-actions">
              <button class="ghost-button" :disabled="removingId === item.id" @click="removeProduct(item.id)">删除</button>
              <button class="primary-button" :disabled="checkoutId === item.id" @click="checkoutProduct(item.id)">
                {{ checkoutId === item.id ? "处理中..." : "生成订单" }}
              </button>
            </view>
          </view>
        </view>
      </view>
    </template>

    <CustomTabbar active-page-key="cart" />
    <WechatProfilePrompt />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import {
  checkoutProductCart,
  checkoutRegistrationCart,
  getCart,
  removeProductCartItem,
  removeRegistrationCartItem,
  type CartProductItem,
  type CartRegistrationItem
} from "@/services/cart";
import { ApiRequestError } from "@/services/request";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const registrationItems = ref<CartRegistrationItem[]>([]);
const productItems = ref<CartProductItem[]>([]);
const loading = ref(false);
const error = ref("");
const removingId = ref("");
const checkoutId = ref("");
const isEmpty = computed(() => registrationItems.value.length === 0 && productItems.value.length === 0);

onShow(() => {
  void loadCart();
});

async function loadCart() {
  loading.value = true;
  error.value = "";
  try {
    await ensureLogin();
    const data = await getCart();
    registrationItems.value = data.registrationItems;
    productItems.value = data.productItems;
  } catch (err) {
    console.error("[CART_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "购物车加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

async function removeRegistration(id: string) {
  removingId.value = id;
  try {
    await removeRegistrationCartItem(id);
    registrationItems.value = registrationItems.value.filter((item) => item.id !== id);
    uni.showToast({ title: "已删除", icon: "success" });
  } catch (err) {
    console.error("[CART_REMOVE_REGISTRATION_ERROR]", err);
    uni.showToast({ title: "删除失败，请重试", icon: "none" });
  } finally {
    removingId.value = "";
  }
}

async function removeProduct(id: string) {
  removingId.value = id;
  try {
    await removeProductCartItem(id);
    productItems.value = productItems.value.filter((item) => item.id !== id);
    uni.showToast({ title: "已删除", icon: "success" });
  } catch (err) {
    console.error("[CART_REMOVE_PRODUCT_ERROR]", err);
    uni.showToast({ title: "删除失败，请重试", icon: "none" });
  } finally {
    removingId.value = "";
  }
}

async function payRegistration(id: string) {
  checkoutId.value = id;
  try {
    const order = await checkoutRegistrationCart([id]);
    uni.navigateTo({ url: `/pages/payment/result?orderNo=${encodeURIComponent(order.orderNo)}` });
  } catch (err) {
    console.error("[CART_CHECKOUT_REGISTRATION_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "报名结算失败，请重试"), icon: "none" });
  } finally {
    checkoutId.value = "";
  }
}

async function checkoutProduct(id: string) {
  checkoutId.value = id;
  try {
    const order = await checkoutProductCart([id]);
    productItems.value = productItems.value.filter((item) => item.id !== id);
    uni.showModal({
      title: "商品订单已生成",
      content: `订单号：${order.orderNo}\n商品支付后续开放，请在后台商城订单中查看。`,
      showCancel: false
    });
  } catch (err) {
    console.error("[CART_CHECKOUT_PRODUCT_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "商品结算失败，请重试"), icon: "none" });
  } finally {
    checkoutId.value = "";
  }
}

function checkoutMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiRequestError && typeof err.responseMessage === "string" && err.responseMessage.length > 0) {
    return err.responseMessage;
  }
  return fallback;
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 30rpx 28rpx 150rpx;
  box-sizing: border-box;
}

.topbar,
.section-head,
.card-head,
.card-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.topbar {
  margin-bottom: 28rpx;
}

.eyebrow,
.title,
.section-title,
.card-title,
.price {
  display: block;
  font-weight: 800;
}

.eyebrow {
  color: #2452a8;
  font-size: 24rpx;
}

.title {
  color: #172033;
  font-size: 42rpx;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
  margin-bottom: 24rpx;
}

.section-title {
  color: #172033;
  font-size: 32rpx;
}

.muted {
  display: block;
  color: #627087;
  font-size: 25rpx;
  line-height: 1.45;
}

.card {
  padding: 24rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
  box-shadow: 0 8rpx 24rpx rgba(15, 23, 42, 0.04);
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title {
  color: #172033;
  font-size: 30rpx;
  line-height: 1.35;
}

.price {
  color: #c2410c;
  font-size: 32rpx;
}

.card-actions {
  margin-top: 22rpx;
  justify-content: flex-end;
}

.product-card {
  display: flex;
  gap: 20rpx;
}

.product-cover {
  width: 144rpx;
  height: 144rpx;
  flex: 0 0 144rpx;
  border-radius: 8px;
  background: #e8eef8;
}

.empty-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #627087;
  font-size: 24rpx;
}

.product-body {
  flex: 1;
  min-width: 0;
}

.primary-button,
.ghost-button {
  min-height: 74rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 74rpx;
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
  width: 180rpx;
}

.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20rpx;
  padding: 150rpx 24rpx;
  color: #627087;
  font-size: 28rpx;
  text-align: center;
}

.error {
  color: #b42318;
}
</style>
