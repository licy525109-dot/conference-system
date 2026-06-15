<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">会议报名优先</text>
        <text class="title">购物车</text>
        <text class="subtitle">会议报名项可继续支付；商城商品当前仅作收藏和预留单管理。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="loadCart">刷新</button>
    </view>

    <ExtensionStatusNotice
      status="主线提醒"
      title="第一版优先完成会议报名缴费"
      description="购物车中的商品不会进入支付流程，商品支付和履约会在后续版本开放。"
      tone="info"
    />

    <LoadingState v-if="loading" title="加载购物车中" description="正在同步会议报名项和商品项。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回首页" @retry="loadCart" @secondary="goHome" />
    <EmptyState
      v-else-if="isEmpty"
      title="购物车还没有内容"
      description="可以先从会议列表选择报名规格，完成报名缴费主流程。"
      mark="车"
      action-text="查看会议"
      @action="goHome"
    />

    <template v-else>
      <view v-if="registrationItems.length > 0" class="section">
        <view class="section-head">
          <view>
            <text class="section-title">会议报名</text>
            <text class="muted">报名支付沿用现有安全订单链路</text>
          </view>
          <StatusTag label="已可用" tone="success" />
        </view>
        <view v-for="item in registrationItems" :key="item.id" class="card ui-card">
          <view class="card-head">
            <view class="card-main">
              <text class="card-title">{{ item.conference.title }}</text>
              <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
              <text class="muted" v-if="item.conference.location">{{ item.conference.location }}</text>
            </view>
            <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
          </view>
          <view class="card-actions">
            <button class="ui-button-secondary action-button" :disabled="removingId === item.id" @click="removeRegistration(item.id)">删除</button>
            <button class="ui-button-primary action-button" :disabled="checkoutId === item.id" @click="payRegistration(item.id)">
              {{ checkoutId === item.id ? "处理中..." : "去付款" }}
            </button>
          </view>
        </view>
      </view>

      <view v-if="productItems.length > 0" class="section">
        <view class="section-head">
          <view>
            <text class="section-title">商品</text>
            <text class="muted">商品支付后续开放，暂不支持商品结算</text>
          </view>
          <StatusTag label="预留能力" tone="warning" />
        </view>
        <ExtensionStatusNotice
          status="商品支付后续开放"
          title="商品项暂不进入支付"
          description="可以保留商品或生成预留单，正式商品支付、发货和履约将在后续版本完善。"
          tone="warning"
        />
        <view v-for="item in productItems" :key="item.id" class="card product-card ui-card">
          <image v-if="item.sku.product.coverImageUrl" class="product-cover" :src="item.sku.product.coverImageUrl" mode="aspectFill" />
          <view v-else class="product-cover empty-cover">商品</view>
          <view class="product-body">
            <view class="card-head">
              <view class="card-main">
                <text class="card-title">{{ item.sku.product.title }}</text>
                <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
                <StatusTag label="仅展示 / 不可支付" tone="warning" />
              </view>
              <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
            </view>
            <view class="card-actions">
              <button class="ui-button-secondary action-button" :disabled="removingId === item.id" @click="removeProduct(item.id)">删除</button>
              <button class="ui-button-ghost action-button reserve-button" :disabled="checkoutId === item.id" @click="checkoutProduct(item.id)">
                {{ checkoutId === item.id ? "处理中..." : "生成预留单" }}
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
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import ExtensionStatusNotice from "@/components/ui/ExtensionStatusNotice.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
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
      title: "商品预留单已生成",
      content: `预留单号：${order.orderNo}\n商品支付和履约后续开放，当前不会跳转支付。`,
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
  display: flex;
  flex-direction: column;
  gap: 22rpx;
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
  padding: 28rpx;
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
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.title {
  color: var(--ui-color-text);
  font-size: 42rpx;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.section-title {
  color: var(--ui-color-text);
  font-size: 32rpx;
}

.muted {
  display: block;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.45;
}

.card {
  padding: 24rpx;
}

.card-main {
  flex: 1;
  min-width: 0;
}

.card-title {
  color: var(--ui-color-text);
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
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary-soft);
}

.empty-cover {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.product-body {
  flex: 1;
  min-width: 0;
}

.action-button {
  min-width: 164rpx;
}

.reserve-button {
  color: var(--ui-color-warning);
}
</style>
