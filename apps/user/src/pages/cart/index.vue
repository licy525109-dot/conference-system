<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view v-if="!hasCmsContent" class="topbar ui-card">
      <view>
        <text class="eyebrow">会议报名优先</text>
        <text class="title">购物车</text>
        <text class="subtitle">会议报名项可继续支付；商城商品可创建订单后前往订单页支付。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="loadCart">刷新</button>
    </view>

    <ExtensionStatusNotice
      v-if="!hasCmsContent"
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
        <view v-for="item in registrationItems" :key="item.id" class="card selectable-card ui-card">
          <view class="select-dot" :class="{ active: selectedRegistrationIds.includes(item.id) }" @click="toggleRegistration(item.id)">
            <text>{{ selectedRegistrationIds.includes(item.id) ? "✓" : "" }}</text>
          </view>
          <view class="card-head">
            <view class="card-main">
              <text class="card-title">{{ item.conference.title }}</text>
              <text class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
              <text class="muted" v-if="item.conference.location">{{ item.conference.location }}</text>
            </view>
            <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
          </view>
          <view class="quantity-row">
            <text class="muted">数量</text>
            <view class="quantity-stepper">
              <button @click="changeRegistrationQuantity(item, -1)">−</button>
              <text>{{ item.quantity }}</text>
              <button @click="changeRegistrationQuantity(item, 1)">＋</button>
            </view>
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
        <view class="coupon-card ui-card">
          <view>
            <text class="section-title">商品优惠券</text>
            <text class="muted">{{ productCouponCode ? `已选择 ${productCouponCode}` : "选择已领取的商品券或通用券，结算时由后端重新计算抵扣。" }}</text>
          </view>
          <button class="ui-button-secondary ui-button-compact" @click="selectProductCoupon">{{ productCouponCode ? "更换" : "选择" }}</button>
        </view>
        <view v-for="item in productItems" :key="item.id" class="card product-card selectable-card ui-card">
          <view class="select-dot" :class="{ active: selectedProductIds.includes(item.id) }" @click="toggleProduct(item.id)">
            <text>{{ selectedProductIds.includes(item.id) ? "✓" : "" }}</text>
          </view>
          <image v-if="item.sku.product.coverImageUrl" class="product-cover" :src="item.sku.product.coverImageUrl" mode="aspectFill" @click="goProductDetail(item.sku.product.id)" />
          <view v-else class="product-cover empty-cover" @click="goProductDetail(item.sku.product.id)">商品</view>
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
            <view class="quantity-row">
              <text class="muted">数量</text>
              <view class="quantity-stepper">
                <button @click="changeProductQuantity(item, -1)">−</button>
                <text>{{ item.quantity }}</text>
                <button @click="changeProductQuantity(item, 1)">＋</button>
              </view>
            </view>
          </view>
        </view>
      </view>
    </template>

    <view v-if="!isEmpty" class="settlement-bar">
      <view class="settlement-select" @click="toggleAll">
        <view class="select-dot" :class="{ active: allSelected }"><text>{{ allSelected ? "✓" : "" }}</text></view>
        <text>全选</text>
      </view>
      <view class="settlement-total">
        <text>合计：¥{{ formatCent(selectedTotalCent) }}</text>
        <text class="muted">已选 {{ selectedCount }} 项</text>
      </view>
      <button class="settlement-button" :disabled="selectedCount === 0 || Boolean(checkoutId)" @click="checkoutSelected">去结算</button>
    </view>

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
  updateProductCartItem,
  updateRegistrationCartItem,
  type CartProductItem,
  type CartRegistrationItem
} from "@/services/cart";
import { ApiRequestError } from "@/services/request";
import { getMyCoupons, type MyCouponItem } from "@/services/operations";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const registrationItems = ref<CartRegistrationItem[]>([]);
const productItems = ref<CartProductItem[]>([]);
const loading = ref(false);
const error = ref("");
const removingId = ref("");
const checkoutId = ref("");
const receiver = ref({ name: "", phone: "", address: "" });
const productCouponCode = ref("");
const cmsPage = ref<PublishedPage | null>(null);
const selectedRegistrationIds = ref<string[]>([]);
const selectedProductIds = ref<string[]>([]);
const isEmpty = computed(() => registrationItems.value.length === 0 && productItems.value.length === 0);
const hasPhysicalProduct = computed(() => productItems.value.some((item) => !["VIRTUAL", "SERVICE"].includes(String(item.sku.product.productType || "PHYSICAL"))));
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("cart");
const hasCmsContent = computed(() => Boolean(cmsPage.value?.version.components?.length));
const selectedCount = computed(() => selectedRegistrationIds.value.length + selectedProductIds.value.length);
const selectedTotalCent = computed(() => {
  const registrations = registrationItems.value.filter((item) => selectedRegistrationIds.value.includes(item.id)).reduce((sum, item) => sum + item.subtotalCent, 0);
  const products = productItems.value.filter((item) => selectedProductIds.value.includes(item.id)).reduce((sum, item) => sum + item.subtotalCent, 0);
  return registrations + products;
});
const allSelected = computed(() => {
  const total = registrationItems.value.length + productItems.value.length;
  return total > 0 && selectedCount.value === total;
});

onShow(() => {
  if (!productCouponCode.value) productCouponCode.value = readPendingProductCoupon();
  void refreshTheme();
  void loadCart();
});

function readPendingProductCoupon(): string {
  const value = uni.getStorageSync("pendingCouponForUse");
  if (!value || typeof value !== "object") return "";
  const record = value as { code?: unknown; scope?: unknown; savedAt?: unknown };
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const scope = typeof record.scope === "string" ? record.scope : "";
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;
  const fresh = Date.now() - savedAt < 30 * 60 * 1000;
  return code && fresh && (scope === "MALL" || scope === "BOTH") ? code : "";
}

async function loadCart() {
  loading.value = true;
  error.value = "";
  try {
    await ensureLogin();
    const [data, page] = await Promise.all([getCart(), getPublishedPage("cart")]);
    registrationItems.value = data.registrationItems;
    productItems.value = data.productItems;
    cmsPage.value = page;
    syncSelections();
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

function syncSelections() {
  const registrationIds = new Set(registrationItems.value.map((item) => item.id));
  const productIds = new Set(productItems.value.map((item) => item.id));
  selectedRegistrationIds.value = selectedRegistrationIds.value.filter((id) => registrationIds.has(id));
  selectedProductIds.value = selectedProductIds.value.filter((id) => productIds.has(id));
  if (selectedRegistrationIds.value.length === 0 && selectedProductIds.value.length === 0) {
    selectedRegistrationIds.value = registrationItems.value.map((item) => item.id);
    selectedProductIds.value = productItems.value.map((item) => item.id);
  }
}

function toggleRegistration(id: string) {
  selectedRegistrationIds.value = selectedRegistrationIds.value.includes(id) ? selectedRegistrationIds.value.filter((item) => item !== id) : [...selectedRegistrationIds.value, id];
}

function toggleProduct(id: string) {
  selectedProductIds.value = selectedProductIds.value.includes(id) ? selectedProductIds.value.filter((item) => item !== id) : [...selectedProductIds.value, id];
}

function toggleAll() {
  if (allSelected.value) {
    selectedRegistrationIds.value = [];
    selectedProductIds.value = [];
    return;
  }
  selectedRegistrationIds.value = registrationItems.value.map((item) => item.id);
  selectedProductIds.value = productItems.value.map((item) => item.id);
}

async function removeRegistration(id: string) {
  removingId.value = id;
  try {
    await removeRegistrationCartItem(id);
    registrationItems.value = registrationItems.value.filter((item) => item.id !== id);
    selectedRegistrationIds.value = selectedRegistrationIds.value.filter((item) => item !== id);
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
    selectedProductIds.value = selectedProductIds.value.filter((item) => item !== id);
    uni.showToast({ title: "已删除", icon: "success" });
  } catch (err) {
    console.error("[CART_REMOVE_PRODUCT_ERROR]", err);
    uni.showToast({ title: "删除失败，请重试", icon: "none" });
  } finally {
    removingId.value = "";
  }
}

async function changeRegistrationQuantity(item: CartRegistrationItem, delta: number) {
  const next = item.quantity + delta;
  if (next <= 0) {
    await removeRegistration(item.id);
    return;
  }
  try {
    await updateRegistrationCartItem(item.id, next);
    await loadCart();
  } catch (err) {
    console.error("[CART_REGISTRATION_QUANTITY_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "数量更新失败"), icon: "none" });
  }
}

async function changeProductQuantity(item: CartProductItem, delta: number) {
  const next = item.quantity + delta;
  if (next <= 0) {
    await removeProduct(item.id);
    return;
  }
  try {
    await updateProductCartItem(item.id, next);
    await loadCart();
  } catch (err) {
    console.error("[CART_PRODUCT_QUANTITY_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "数量更新失败"), icon: "none" });
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
      couponCode: normalizedProductCouponCode(),
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

async function checkoutSelected() {
  if (selectedRegistrationIds.value.length > 0 && selectedProductIds.value.length > 0) {
    uni.showToast({ title: "请分别结算报名和商品", icon: "none" });
    return;
  }
  if (selectedRegistrationIds.value.length > 0) {
    checkoutId.value = "selected-registration";
    try {
      const order = await checkoutRegistrationCart(selectedRegistrationIds.value);
      uni.navigateTo({ url: `/pages/payment/result?orderNo=${encodeURIComponent(order.orderNo)}` });
    } catch (err) {
      console.error("[CART_CHECKOUT_SELECTED_REGISTRATION_ERROR]", err);
      uni.showToast({ title: checkoutMessage(err, "报名结算失败，请重试"), icon: "none" });
    } finally {
      checkoutId.value = "";
    }
    return;
  }
  if (selectedProductIds.value.length > 0) {
    await checkoutProductGroup(selectedProductIds.value);
  }
}

async function checkoutProductGroup(ids: string[]) {
  const selectedItems = productItems.value.filter((item) => ids.includes(item.id));
  const requiresReceiver = selectedItems.some((item) => !["VIRTUAL", "SERVICE"].includes(String(item.sku.product.productType || "PHYSICAL")));
  if (requiresReceiver && (!receiver.value.name || !receiver.value.phone || !receiver.value.address)) {
    uni.showToast({ title: "请先填写收货信息", icon: "none" });
    return;
  }
  checkoutId.value = "selected-product";
  try {
    const order = await checkoutProductCart({
      itemIds: ids,
      couponCode: normalizedProductCouponCode(),
      receiverName: requiresReceiver ? receiver.value.name : undefined,
      receiverPhone: requiresReceiver ? receiver.value.phone : undefined,
      receiverAddress: requiresReceiver ? receiver.value.address : undefined
    });
    productItems.value = productItems.value.filter((item) => !ids.includes(item.id));
    selectedProductIds.value = selectedProductIds.value.filter((id) => !ids.includes(id));
    uni.showModal({
      title: "商城订单已创建",
      content: `订单号：${order.orderNo}\n${order.paymentNotice || "请前往我的商城订单完成支付。"}`,
      showCancel: false,
      success: () => uni.navigateTo({ url: "/pages/mall/orders" })
    });
  } catch (err) {
    console.error("[CART_CHECKOUT_SELECTED_PRODUCT_ERROR]", err);
    uni.showToast({ title: checkoutMessage(err, "商城订单创建失败，请重试"), icon: "none" });
  } finally {
    checkoutId.value = "";
  }
}

function goProductDetail(id: string) {
  uni.navigateTo({ url: `/pages/mall/detail?id=${encodeURIComponent(id)}` });
}

async function selectProductCoupon() {
  try {
    const response = await getMyCoupons({ scope: "MALL" });
    const usable = response.items.filter((item) => item.usable && couponFitsCart(item)).slice(0, 5);
    if (usable.length === 0) {
      uni.showToast({ title: "暂无可用于商品的优惠券", icon: "none" });
      return;
    }
    uni.showActionSheet({
      itemList: ["不使用优惠券", ...usable.map(formatCouponOption)],
      success: ({ tapIndex }) => {
        productCouponCode.value = tapIndex === 0 ? "" : usable[tapIndex - 1]?.coupon.code ?? "";
      }
    });
  } catch (err) {
    console.error("[CART_PRODUCT_COUPON_ERROR]", err);
    uni.showToast({ title: "优惠券加载失败", icon: "none" });
  }
}

function couponFitsCart(item: MyCouponItem) {
  const allowed = item.coupon.allowedSkuIds ?? [];
  return allowed.length === 0 || productItems.value.some((entry) => allowed.includes(entry.sku.id));
}

function formatCouponOption(item: MyCouponItem) {
  const discount =
    item.coupon.type === "AMOUNT"
      ? `减 ¥${formatCent(item.coupon.discountAmountCent ?? 0)}`
      : `${((item.coupon.discountPercent ?? 0) / 100).toFixed(2)} 折`;
  const threshold = item.coupon.minAmountCent ? `，满 ¥${formatCent(item.coupon.minAmountCent)} 可用` : "";
  return `${item.coupon.name}（${discount}${threshold}）`;
}

function normalizedProductCouponCode(): string | undefined {
  const code = productCouponCode.value.trim();
  return code ? code : undefined;
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
  padding-bottom: 180rpx;
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

.selectable-card {
  position: relative;
  padding-left: 76rpx;
}

.select-dot {
  width: 42rpx;
  height: 42rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid rgba(8, 23, 44, 0.22);
  border-radius: 50%;
  color: #fff;
  font-size: 24rpx;
  font-weight: 900;
}

.selectable-card > .select-dot {
  position: absolute;
  left: 22rpx;
  top: 50%;
  transform: translateY(-50%);
}

.select-dot.active {
  border-color: var(--ui-color-primary);
  background: var(--ui-color-primary);
}

.receiver-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 24rpx;
}

.coupon-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
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

.quantity-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  margin-top: 18rpx;
}

.quantity-stepper {
  display: inline-flex;
  align-items: center;
  overflow: hidden;
  border: 1rpx solid var(--ui-color-border);
  border-radius: 999rpx;
  background: #fff;
}

.quantity-stepper button {
  width: 62rpx;
  height: 56rpx;
  border: 0;
  background: transparent;
  color: var(--ui-color-primary);
  font-size: 30rpx;
  line-height: 56rpx;
}

.quantity-stepper text {
  min-width: 54rpx;
  text-align: center;
  font-size: 26rpx;
  font-weight: 800;
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

.settlement-bar {
  position: fixed;
  right: 24rpx;
  bottom: calc(118rpx + env(safe-area-inset-bottom));
  left: 24rpx;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 18rpx 22rpx;
  border: 1rpx solid rgba(8, 23, 44, 0.08);
  border-radius: 999rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18rpx 50rpx rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(14px);
}

.settlement-select {
  display: flex;
  align-items: center;
  gap: 10rpx;
  color: var(--ui-color-text);
  font-size: 25rpx;
}

.settlement-total {
  flex: 1;
  min-width: 0;
}

.settlement-total > text:first-child {
  display: block;
  color: var(--ui-color-text);
  font-size: 30rpx;
  font-weight: 900;
}

.settlement-button {
  min-width: 180rpx;
  height: 72rpx;
  border: 0;
  border-radius: 999rpx;
  background: var(--ui-color-primary);
  color: #fff;
  font-size: 28rpx;
  font-weight: 900;
  line-height: 72rpx;
}

.settlement-button[disabled] {
  opacity: 0.55;
}
</style>
