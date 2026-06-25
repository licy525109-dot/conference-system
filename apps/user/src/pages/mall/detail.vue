<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <LoadingState v-if="loading" title="加载商品详情中" description="正在读取商品图片、规格和库存。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回商城" @retry="load" @secondary="goMall" />
    <template v-else-if="product">
      <view v-if="isProductModuleVisible('productInfo')" class="hero-card ui-card">
        <image v-if="heroImage && isProductModuleVisible('cover')" class="hero" :src="heroImage" mode="aspectFill" />
        <view v-else class="hero empty">暂无图片</view>
        <view class="headline">
          <StatusTag :label="productTypeText(product.productType)" tone="info" />
          <text class="title">{{ product.title }}</text>
          <text class="subtitle">{{ product.subtitle || product.category?.name || "会议相关商品" }}</text>
          <text class="price-range">{{ priceRangeText }}</text>
        </view>
      </view>

      <ExtensionStatusNotice
        status="商城闭环"
        title="商城订单独立履约"
        description="商城订单与会议报名订单分开管理，商品金额以后端库存和 SKU 价格计算为准，订单创建后可在我的商城订单中支付。"
        tone="info"
      />

      <view class="content">
        <view v-if="isProductModuleVisible('skuSelector')" class="sku-list">
          <text class="section-title">{{ productModuleTitle('skuSelector', '规格') }}</text>
          <EmptyState v-if="product.skus.length === 0" title="暂无可选规格" description="商品规格完善后可创建待支付订单。" mark="规" />
          <view
            v-for="sku in product.skus"
            :key="sku.id"
            :class="['sku-card', selectedSkuId === sku.id ? 'selected' : '']"
            @click="selectSku(sku.id)"
          >
            <view>
              <text class="sku-name">{{ sku.name }}</text>
              <text class="muted">可售 {{ sku.availableStock }}</text>
              <StatusTag :label="skuAvailable(sku) ? '可下待支付订单' : '库存不足'" :tone="skuAvailable(sku) ? 'info' : 'neutral'" />
            </view>
            <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
          </view>
        </view>
        <view class="quantity-box ui-card">
          <text class="section-title">数量</text>
          <view class="quantity-control">
            <button class="qty-button" :disabled="!canAddProduct" @click="changeQuantity(-1)">-</button>
            <text class="qty-value">{{ quantity }}</text>
            <button class="qty-button" :disabled="!canAddProduct" @click="changeQuantity(1)">+</button>
          </view>
        </view>
        <view class="coupon-box ui-card">
          <view>
            <text class="section-title">商品优惠券</text>
            <text class="muted">{{ couponCode ? `已选择 ${couponCode}` : "可选择已领取的商品券或通用券，订单金额以后端重算为准。" }}</text>
          </view>
          <button class="ui-button-secondary ui-button-compact" @click="selectMallCoupon">{{ couponCode ? "更换" : "选择" }}</button>
        </view>
        <view v-if="isProductModuleVisible('detail')" class="description-card ui-card">
          <text class="section-title">{{ productModuleTitle('detail', '商品说明') }}</text>
          <text class="muted">{{ descriptionText }}</text>
        </view>
        <PageRenderer
          v-if="cmsPage"
          :dsl="cmsPage.version.dsl"
          :theme="theme"
        />
        <view v-if="requiresReceiver" class="receiver-card ui-card">
          <text class="section-title">收货信息</text>
          <input v-model="receiver.name" class="field" placeholder="收货人" />
          <input v-model="receiver.phone" class="field" placeholder="手机号" />
          <input v-model="receiver.address" class="field" placeholder="收货地址" />
        </view>
        <view v-else class="receiver-card ui-card">
          <text class="section-title">履约信息</text>
          <text class="muted">虚拟/服务商品无需填写收货地址，订单创建后请在我的商城订单查看待使用或核销状态。</text>
        </view>
      </view>
    </template>
    <EmptyState v-else title="商品不存在" description="该商品可能已下架或暂未开放展示。" mark="商" action-text="返回商城" @action="goMall" />

    <view v-if="product" class="bottom-actions">
      <view class="bottom-copy">
        <text class="bottom-title">{{ selectedSku ? `¥${formatCent(selectedSku.priceCent * quantity)}` : "请选择规格" }}</text>
        <text class="bottom-note">后端计价，订单页支付</text>
      </view>
      <button class="ui-button-secondary action-button" @click="goCart">购物车</button>
      <button v-if="isProductModuleVisible('addCartButton')" class="ui-button-primary action-button" :disabled="adding || !canAddProduct" @click="addToCart">
        {{ adding ? "加入中..." : productModuleContent('addCartButton', '加入购物车') }}
      </button>
      <button v-if="isProductModuleVisible('buyNowButton')" class="ui-button-primary action-button" :disabled="buying || !canAddProduct" @click="buyNow">
        {{ buying ? "下单中..." : productModuleContent('buyNowButton', '创建订单') }}
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import ExtensionStatusNotice from "@/components/ui/ExtensionStatusNotice.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
import { addProductCartItem } from "@/services/cart";
import { getProductDetail, type Product, type ProductSku } from "@/services/mall";
import { createMallOrder, getMyCoupons, type MyCouponItem } from "@/services/operations";

const productId = ref("");
const product = ref<Product | null>(null);
const cmsPage = ref<PublishedPage | null>(null);
const loading = ref(false);
const error = ref("");
const selectedSkuId = ref("");
const quantity = ref(1);
const adding = ref(false);
const buying = ref(false);
const receiver = ref({ name: "", phone: "", address: "" });
const couponCode = ref("");
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("mall-detail");
const heroImage = computed(() => product.value?.coverImageUrl || product.value?.images[0]?.url || "");
const selectedSku = computed(() => product.value?.skus.find((item) => item.id === selectedSkuId.value) ?? null);
const canAddProduct = computed(() => Boolean(selectedSku.value && skuAvailable(selectedSku.value)));
const requiresReceiver = computed(() => product.value?.productType !== "VIRTUAL" && product.value?.productType !== "SERVICE");
const productDisplayModules = computed(() => normalizeProductModules(readCmsBusinessDisplay(cmsPage.value)));
const priceRangeText = computed(() => {
  const prices = product.value?.skus.map((sku) => sku.priceCent) ?? [];
  if (prices.length === 0) return "暂无价格";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  return min === max ? `¥${formatCent(min)}` : `¥${formatCent(min)} 起`;
});
const descriptionText = computed(() => toDescriptionText(product.value?.descriptionJson) || "商品详情仍在完善中，可先加入购物车或创建待支付订单。");

onLoad((query) => {
  productId.value = typeof query?.id === "string" ? query.id : "";
  couponCode.value = readInitialCouponCode(query, "MALL");
  void refreshTheme();
  void load();
});

function readInitialCouponCode(query: Record<string, unknown> | undefined, scope: "CONFERENCE" | "MALL"): string {
  const direct = typeof query?.couponCode === "string" ? query.couponCode.trim() : "";
  if (direct) return direct;
  const pending = readPendingCoupon(scope);
  return pending?.code ?? "";
}

function readPendingCoupon(scope: "CONFERENCE" | "MALL"): { code: string } | null {
  const value = uni.getStorageSync("pendingCouponForUse");
  if (!value || typeof value !== "object") return null;
  const record = value as { code?: unknown; scope?: unknown; savedAt?: unknown };
  const code = typeof record.code === "string" ? record.code.trim() : "";
  const couponScope = typeof record.scope === "string" ? record.scope : "";
  const savedAt = typeof record.savedAt === "number" ? record.savedAt : 0;
  const fresh = Date.now() - savedAt < 30 * 60 * 1000;
  if (!code || !fresh || (couponScope !== scope && couponScope !== "BOTH")) return null;
  return { code };
}

async function load() {
  if (!productId.value) {
    error.value = "缺少商品 ID";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    const [detail, page] = await Promise.all([
      getProductDetail(productId.value),
      getPublishedPage("mall-detail", { productId: productId.value })
    ]);
    product.value = detail;
    cmsPage.value = page;
    selectedSkuId.value = product.value.skus[0]?.id ?? "";
  } catch (err) {
    console.error("[MALL_DETAIL_LOAD_ERROR]", err);
    error.value = "商品详情加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

async function buyNow() {
  if (!canAddProduct.value || !selectedSkuId.value) {
    uni.showToast({ title: "请选择可购买规格", icon: "none" });
    return;
  }
  if (requiresReceiver.value && (!receiver.value.name || !receiver.value.phone || !receiver.value.address)) {
    uni.showToast({ title: "请填写收货信息", icon: "none" });
    return;
  }
  buying.value = true;
  try {
    const order = await createMallOrder({
      items: [{ skuId: selectedSkuId.value, quantity: quantity.value }],
      couponCode: normalizedCouponCode(),
      receiverName: requiresReceiver.value ? receiver.value.name : undefined,
      receiverPhone: requiresReceiver.value ? receiver.value.phone : undefined,
      receiverAddress: requiresReceiver.value ? receiver.value.address : undefined
    });
    uni.showModal({
      title: "商城订单已创建",
      content: `订单号：${order.orderNo}\n${order.paymentNotice || "请前往我的商城订单完成支付。"}`,
      showCancel: false,
      success: () => uni.navigateTo({ url: "/pages/mall/orders" })
    });
  } catch (err) {
    console.error("[MALL_CREATE_ORDER_ERROR]", err);
    uni.showToast({ title: "下单失败，请检查库存和收货信息", icon: "none" });
  } finally {
    buying.value = false;
  }
}

async function selectMallCoupon() {
  try {
    const response = await getMyCoupons({ scope: "MALL" });
    const usable = response.items.filter((item) => item.usable && couponFitsSelectedSku(item)).slice(0, 5);
    if (usable.length === 0) {
      uni.showToast({ title: "暂无可用于该商品的优惠券", icon: "none" });
      return;
    }
    uni.showActionSheet({
      itemList: ["不使用优惠券", ...usable.map(formatCouponOption)],
      success: ({ tapIndex }) => {
        couponCode.value = tapIndex === 0 ? "" : usable[tapIndex - 1]?.coupon.code ?? "";
      }
    });
  } catch (err) {
    console.error("[MALL_DETAIL_COUPON_ERROR]", err);
    uni.showToast({ title: "优惠券加载失败", icon: "none" });
  }
}

function couponFitsSelectedSku(item: MyCouponItem) {
  const allowed = item.coupon.allowedSkuIds ?? [];
  return allowed.length === 0 || (selectedSkuId.value ? allowed.includes(selectedSkuId.value) : false);
}

function formatCouponOption(item: MyCouponItem) {
  const discount =
    item.coupon.type === "AMOUNT"
      ? `减 ¥${formatCent(item.coupon.discountAmountCent ?? 0)}`
      : `${((item.coupon.discountPercent ?? 0) / 100).toFixed(2)} 折`;
  const threshold = item.coupon.minAmountCent ? `，满 ¥${formatCent(item.coupon.minAmountCent)} 可用` : "";
  return `${item.coupon.name}（${discount}${threshold}）`;
}

function normalizedCouponCode(): string | undefined {
  const code = couponCode.value.trim();
  return code ? code : undefined;
}

function selectSku(id: string) {
  selectedSkuId.value = id;
  quantity.value = Math.min(quantity.value, maxQuantity());
}

function changeQuantity(delta: number) {
  quantity.value = Math.min(maxQuantity(), Math.max(1, quantity.value + delta));
}

async function addToCart() {
  if (!canAddProduct.value || !selectedSkuId.value) {
    uni.showToast({ title: selectedSkuId.value ? "当前规格库存不足" : "请选择商品规格", icon: "none" });
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
  return Math.max(0, sku?.availableStock ?? 0);
}

function skuAvailable(sku: ProductSku) {
  return sku.availableStock > 0;
}

function productTypeText(value: string | undefined) {
  return { PHYSICAL: "实体商品", VIRTUAL: "虚拟商品", SERVICE: "服务商品" }[value || "PHYSICAL"] || "实体商品";
}

function goCart() {
  uni.navigateTo({ url: "/pages/cart/index" });
}

function goMall() {
  uni.navigateTo({ url: "/pages/mall/index" });
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function toDescriptionText(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toDescriptionText).filter(Boolean).join("\n");
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record.title, record.text, record.content, record.description, record.blocks].map(toDescriptionText).filter(Boolean).join("\n");
  }
  return "";
}

function readCmsBusinessDisplay(page: PublishedPage | null): Record<string, unknown> {
  const themeJson = readRecord(page?.version.themeJson);
  const businessDisplay = readRecord(themeJson.businessDisplay);
  return readRecord(businessDisplay.productDetail);
}

function normalizeProductModules(source: Record<string, unknown>) {
  const defaults = [
    { key: "productInfo", title: "商品信息", content: "", visible: true, sort: 10 },
    { key: "cover", title: "商品封面", content: "", visible: true, sort: 20 },
    { key: "skuSelector", title: "规格", content: "", visible: true, sort: 40 },
    { key: "detail", title: "商品说明", content: "", visible: true, sort: 60 },
    { key: "addCartButton", title: "加入购物车", content: "加入购物车", visible: true, sort: 70 },
    { key: "buyNowButton", title: "创建订单", content: "创建订单", visible: true, sort: 80 }
  ];
  const rawModules = Array.isArray(source.modules) ? source.modules : [];
  return defaults.map((item) => {
    const record = readRecord(rawModules.find((raw) => readRecord(raw).key === item.key));
    return {
      ...item,
      visible: typeof record.visible === "boolean" ? record.visible : item.visible,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : item.title,
      content: typeof record.content === "string" && record.content.trim() ? record.content.trim() : item.content
    };
  });
}

function productModule(key: string) {
  return productDisplayModules.value.find((item) => item.key === key);
}

function isProductModuleVisible(key: string): boolean {
  return productModule(key)?.visible !== false;
}

function productModuleTitle(key: string, fallback: string): string {
  return productModule(key)?.title || fallback;
}

function productModuleContent(key: string, fallback: string): string {
  return productModule(key)?.content || fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
  padding-bottom: 214rpx;
  overflow: visible;
}

.hero-card {
  overflow: hidden;
}

.hero {
  width: 100%;
  height: 420rpx;
  background: var(--ui-color-primary-soft);
}

.hero.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-muted);
  font-size: 28rpx;
}

.headline {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  padding: 28rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.title,
.section-title,
.sku-name {
  display: block;
  color: var(--ui-color-text);
  font-weight: 800;
}

.title {
  font-size: 42rpx;
  line-height: 1.35;
}

.subtitle,
.muted {
  display: block;
  color: var(--ui-color-muted);
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
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.sku-card.selected {
  border-color: var(--ui-color-primary);
  background: var(--ui-color-primary-soft);
}

.price-range,
.price {
  color: var(--ui-color-primary);
  font-size: 31rpx;
  font-weight: 800;
}

.description-card,
.quantity-box,
.coupon-box,
.receiver-card {
  padding: 24rpx;
}

.receiver-card {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.field {
  min-height: 78rpx;
  padding: 0 20rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  font-size: 26rpx;
}

.quantity-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.coupon-box {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
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
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary);
  color: #ffffff;
  font-size: 30rpx;
  line-height: 58rpx;
}

.qty-button[disabled] {
  background: #d8e0eb;
  color: #ffffff;
}

.qty-value {
  min-width: 44rpx;
  color: var(--ui-color-text);
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
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 16rpx;
  align-items: center;
  padding: 18rpx 28rpx calc(18rpx + env(safe-area-inset-bottom));
  border-top: 1px solid var(--ui-color-border);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: var(--ui-shadow-bottom);
  backdrop-filter: blur(16rpx);
}

.bottom-title,
.bottom-note {
  display: block;
}

.bottom-title {
  color: var(--ui-color-text);
  font-size: 24rpx;
  font-weight: 900;
}

.bottom-note {
  margin-top: 4rpx;
  color: var(--ui-color-muted);
  font-size: 21rpx;
}

.action-button {
  min-width: 178rpx;
}
</style>
