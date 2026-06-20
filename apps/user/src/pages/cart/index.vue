<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">会议报名优先</text>
        <text class="title">购物车</text>
        <text class="subtitle">会议报名项可继续支付；商城商品可创建订单后前往订单页支付。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="loadCart">刷新</button>
    </view>

    <ExtensionStatusNotice
      status="主线提醒"
      title="第一版优先完成会议报名缴费"
      description="购物车中的商品可创建商城待支付订单，金额由后端按 SKU 当前价格重算，支付以订单页后端状态为准。"
      tone="info"
    />

    <PageRenderer v-if="cmsPage" :components="cmsPage.version.components" :theme="theme" />

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
            <text class="muted">商品可创建待支付订单，订单页完成支付</text>
          </view>
          <StatusTag label="待支付订单" tone="info" />
        </view>
        <ExtensionStatusNotice
          status="商城订单"
          title="商品项可创建待支付订单"
          description="后端会重新计算金额并锁定库存。订单创建后前往我的商城订单完成支付。"
          tone="info"
        />
        <view v-if="hasPhysicalProduct" class="receiver-card ui-card">
          <text class="section-title">收货信息</text>
          <input v-model="receiver.name" class="field" placeholder="收货人" />
          <input v-model="receiver.phone" class="field" placeholder="手机号" />
          <input v-model="receiver.address" class="field" placeholder="收货地址" />
        </view>
        <view v-else class="receiver-card ui-card">
          <text class="section-title">履约信息</text>
          <text class="muted">当前商品均为虚拟/服务商品，无需填写收货地址。</text>
        </view>
        <view v-for="item in productItems" :key="item.id" class="card product-card ui-card">
          <image v-if="item.sku.product.coverImageUrl" class="product-cover" :src="item.sku.product.coverImageUrl" mode="aspectFill" />
          <view v-else class="product-cover empty-cover">商品</view>
          <view class="product-body">
            <view class="card-head">
              <view class="card-main">
                <text class="card-title">{{ item.sku.product.title }}</text>
                <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
                <StatusTag :label="item.sku.availableStock > 0 ? '可下待支付订单' : '库存不足'" :tone="item.sku.availableStock > 0 ? 'info' : 'neutral'" />
              </view>
              <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
            </view>
            <view class="card-actions">
              <button class="ui-button-secondary action-button" :disabled="removingId === item.id" @click="removeProduct(item.id)">删除</button>
              <button class="ui-button-ghost action-button reserve-button" :disabled="checkoutId === item.id || item.sku.availableStock <= 0" @click="checkoutProduct(item.id)">
                {{ checkoutId === item.id ? "处理中..." : "创建订单" }}
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
import PageRenderer from "@/components/PageRenderer.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
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
const receiver = ref({ name: "", phone: "", address: "" });
const cmsPage = ref<PublishedPage | null>(null);
const isEmpty = computed(() => registrationItems.value.length === 0 && productItems.value.length === 0);
const hasPhysicalProduct = computed(() => productItems.value.some((item) => !["VIRTUAL", "SERVICE"].includes(String(item.sku.product.productType || "PHYSICAL"))));
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("cart");

onShow(() => {
  void refreshTheme();
  void loadCart();
});

async function loadCart() {
  loading.value = true;
  error.value = "";
  try {
    await ensureLogin();
    const [data, page] = await Promise.all([getCart(), getPublishedPage("cart")]);
    registrationItems.value = data.registrationItems;
    productItems.value = data.productItems;
    cmsPage.value = page;
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
  const item = productItems.value.find((entry) => entry.id === id);
  const requiresReceiver = !["VIRTUAL", "SERVICE"].includes(String(item?.sku.product.productType || "PHYSICAL"));
  if (requiresReceiver && (!receiver.value.name || !receiver.value.phone || !receiver.value.address)) {
    uni.showToast({ title: "请先填写收货信息", icon: "none" });
    return;
  }
  checkoutId.value = id;
  try {
    const order = await checkoutProductCart({
      itemIds: [id],
      receiverName: requiresReceiver ? receiver.value.name : undefined,
      receiverPhone: requiresReceiver ? receiver.value.phone : undefined,
      receiverAddress: requiresReceiver ? receiver.value.address : undefined
    });
    productItems.value = productItems.value.filter((item) => item.id !== id);
    uni.showModal({
      title: "商城订单已创建",
      content: `订单号：${order.orderNo}\n${order.paymentNotice || "请前往我的商城订单完成支付。"}`,
      showCancel: false,
      success: () => uni.navigateTo({ url: "/pages/mall/orders" })
    });
  } catch (err) {
    console.error("[CART_CHECKOUT_PRODUCT_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "商城订单创建失败，请重试"), icon: "none" });
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

.receiver-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 24rpx;
}

.field {
  min-height: 78rpx;
  padding: 0 20rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  font-size: 26rpx;
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
