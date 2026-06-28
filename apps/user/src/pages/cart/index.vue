<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view v-if="showCartTitle" class="topbar ui-card" :class="[`is-${cartDisplay.title.style}`, `align-${cartDisplay.title.align}`]" :style="cartTitleStyle">
      <view>
        <text class="eyebrow">购物车</text>
        <text class="title">{{ cartDisplay.title.text }}</text>
        <text v-if="cartDisplay.title.description" class="subtitle">{{ cartDisplay.title.description }}</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="loadCart">刷新</button>
    </view>

    <view v-if="cartDisplay.couponNotice.visible" class="coupon-notice ui-card" :class="`is-${cartDisplay.couponNotice.style}`">
      <view>
        <text class="section-title">{{ cartDisplay.couponNotice.title }}</text>
        <text v-if="cartDisplay.couponNotice.description" class="muted">{{ cartDisplay.couponNotice.description }}</text>
      </view>
      <button v-if="cartDisplay.couponNotice.buttonText && cartDisplay.couponNotice.action !== 'none'" class="ui-button-secondary ui-button-compact" @click="handleCouponNoticeAction">
        {{ cartDisplay.couponNotice.buttonText }}
      </button>
    </view>

    <PageRenderer v-if="cmsPage" :dsl="cmsPage.version.dsl" :theme="theme" />

    <LoadingState v-if="loading" title="加载购物车中" description="正在同步会议报名项和商品项。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回首页" @retry="loadCart" @secondary="goHome" />
    <EmptyState
      v-else-if="isEmpty && cartDisplay.emptyState.visible"
      :title="cartDisplay.emptyState.title"
      :description="cartDisplay.emptyState.description"
      mark="车"
      :action-text="cartDisplay.emptyState.buttonText"
      @action="handleEmptyStateAction"
    />

    <template v-else>
      <view v-if="showRegistrationSection" class="section">
        <view class="section-head">
          <view>
            <text class="section-title">{{ cartDisplay.registrationItems.title }}</text>
            <text v-if="cartDisplay.registrationItems.description" class="muted">{{ cartDisplay.registrationItems.description }}</text>
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
              <text v-if="cartDisplay.registrationItems.showSku && cartDisplay.registrationItems.showQuantity" class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
              <text v-else-if="cartDisplay.registrationItems.showSku" class="muted">{{ item.sku.name }}</text>
              <text v-else-if="cartDisplay.registrationItems.showQuantity" class="muted">数量 × {{ item.quantity }}</text>
              <text class="muted" v-if="cartDisplay.registrationItems.showLocation && item.conference.location">{{ item.conference.location }}</text>
            </view>
            <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
          </view>
          <view v-if="cartDisplay.registrationItems.showQuantity" class="quantity-row">
            <text class="muted">数量</text>
            <view v-if="cartDisplay.registrationItems.allowQuantityEdit" class="quantity-stepper">
              <button @click="changeRegistrationQuantity(item, -1)">−</button>
              <text>{{ item.quantity }}</text>
              <button @click="changeRegistrationQuantity(item, 1)">＋</button>
            </view>
            <text v-else class="quantity-static">{{ item.quantity }}</text>
          </view>
          <view v-if="showRegistrationCardActions" class="card-actions">
            <button v-if="cartDisplay.registrationItems.showDeleteButton" class="ui-button-secondary action-button" :disabled="removingId === item.id" @click="removeRegistration(item.id)">删除</button>
            <button v-if="cartDisplay.registrationItems.showSinglePayButton" class="ui-button-primary action-button" :disabled="checkoutId === item.id" @click="payRegistration(item.id)">
              {{ checkoutId === item.id ? "处理中..." : "去付款" }}
            </button>
          </view>
        </view>
      </view>

      <view v-if="showMallSection" class="section">
        <view class="section-head">
          <view>
            <text class="section-title">{{ cartDisplay.mallItems.title }}</text>
            <text v-if="cartDisplay.mallItems.description" class="muted">{{ cartDisplay.mallItems.description }}</text>
          </view>
          <StatusTag label="待支付订单" tone="info" />
        </view>
        <view v-if="showShippingInfoCard && hasPhysicalProduct" class="receiver-card ui-card">
          <text class="section-title">{{ cartDisplay.shippingInfo.title }}</text>
          <input v-if="cartDisplay.shippingInfo.showName" v-model="receiver.name" class="field" placeholder="收货人" />
          <input v-if="cartDisplay.shippingInfo.showPhone" v-model="receiver.phone" class="field" placeholder="手机号" />
          <input v-if="cartDisplay.shippingInfo.showAddress" v-model="receiver.address" class="field" placeholder="收货地址" />
          <view v-if="cartDisplay.shippingInfo.showUseCommon || cartDisplay.shippingInfo.showSaveCommon" class="receiver-actions">
            <button v-if="cartDisplay.shippingInfo.showUseCommon" class="ui-button-secondary ui-button-compact" @click="loadSavedReceiver">使用常用信息</button>
            <button v-if="cartDisplay.shippingInfo.showSaveCommon" class="ui-button-secondary ui-button-compact" @click="saveReceiverProfile()">保存为常用</button>
          </view>
        </view>
        <view v-else-if="showShippingInfoCard" class="receiver-card ui-card">
          <text class="section-title">{{ cartDisplay.shippingInfo.title || "履约信息" }}</text>
          <text class="muted">当前商品均为虚拟/服务商品，无需填写收货地址。</text>
        </view>
        <view v-if="cartDisplay.productCoupons.visible" class="coupon-card ui-card">
          <view>
            <text class="section-title">{{ cartDisplay.productCoupons.title }}</text>
            <text class="muted">{{ productCouponCode ? `已选择 ${productCouponCode}` : cartDisplay.productCoupons.description }}</text>
          </view>
          <button class="ui-button-secondary ui-button-compact" @click="selectProductCoupon">{{ productCouponCode ? "更换" : cartDisplay.productCoupons.buttonText }}</button>
        </view>
        <view v-for="item in productItems" :key="item.id" class="card product-card selectable-card ui-card">
          <view class="select-dot" :class="{ active: selectedProductIds.includes(item.id) }" @click="toggleProduct(item.id)">
            <text>{{ selectedProductIds.includes(item.id) ? "✓" : "" }}</text>
          </view>
          <image v-if="cartDisplay.mallItems.showImage && item.sku.product.coverImageUrl" class="product-cover" :src="item.sku.product.coverImageUrl" mode="aspectFill" @click="goProductDetail(item.sku.product.id)" />
          <view v-else-if="cartDisplay.mallItems.showImage" class="product-cover empty-cover" @click="goProductDetail(item.sku.product.id)">商品</view>
          <view class="product-body">
            <view class="card-head">
              <view class="card-main">
                <text class="card-title">{{ item.sku.product.title }}</text>
                <text v-if="cartDisplay.mallItems.showSku && cartDisplay.mallItems.showQuantity" class="muted">{{ item.sku.name }} × {{ item.quantity }}</text>
                <text v-else-if="cartDisplay.mallItems.showSku" class="muted">{{ item.sku.name }}</text>
                <text v-else-if="cartDisplay.mallItems.showQuantity" class="muted">数量 × {{ item.quantity }}</text>
                <StatusTag v-if="cartDisplay.mallItems.showStock" :label="item.sku.availableStock > 0 ? '可下待支付订单' : '库存不足'" :tone="item.sku.availableStock > 0 ? 'info' : 'neutral'" />
              </view>
              <text class="price">¥{{ formatCent(item.subtotalCent) }}</text>
            </view>
            <view v-if="showMallCardActions" class="card-actions">
              <button v-if="cartDisplay.mallItems.showDeleteButton" class="ui-button-secondary action-button" :disabled="removingId === item.id" @click="removeProduct(item.id)">删除</button>
              <button class="ui-button-ghost action-button reserve-button" :disabled="checkoutId === item.id || item.sku.availableStock <= 0" @click="checkoutProduct(item.id)">
                {{ checkoutId === item.id ? "处理中..." : "创建订单" }}
              </button>
            </view>
            <view v-if="cartDisplay.mallItems.showQuantity" class="quantity-row">
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

    <view v-if="!loading && !error && cartDisplay.recommendations.visible" class="recommendation-card ui-card">
      <view>
        <text class="section-title">{{ cartDisplay.recommendations.title }}</text>
        <text v-if="cartDisplay.recommendations.description" class="muted">{{ cartDisplay.recommendations.description }}</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="goMall">{{ cartDisplay.recommendations.buttonText }}</button>
    </view>

    <view v-if="!loading && !error && cartDisplay.customerService.visible" class="customer-service-card ui-card">
      <view>
        <text class="section-title">{{ cartDisplay.customerService.title }}</text>
        <text v-if="cartDisplay.customerService.description" class="muted">{{ cartDisplay.customerService.description }}</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="contactService">{{ cartDisplay.customerService.buttonText }}</button>
    </view>

    <view v-if="!isEmpty && cartDisplay.checkoutBar.visible" class="settlement-bar" :class="{ 'is-static': !cartDisplay.checkoutBar.sticky, 'avoid-tabbar': cartDisplay.checkoutBar.avoidTabbar }">
      <view v-if="cartDisplay.checkoutBar.showSelectAll" class="settlement-select" @click="toggleAll">
        <view class="select-dot" :class="{ active: allSelected }"><text>{{ allSelected ? "✓" : "" }}</text></view>
        <text>全选</text>
      </view>
      <view class="settlement-total">
        <text>{{ cartDisplay.checkoutBar.totalText }}：¥{{ formatCent(selectedTotalCent) }}</text>
        <text v-if="cartDisplay.checkoutBar.showDiscountDetail" class="muted">已选 {{ selectedCount }} 项</text>
      </view>
      <button class="settlement-button" :class="`is-${cartDisplay.checkoutBar.style}`" :disabled="selectedCount === 0 || Boolean(checkoutId)" @click="checkoutSelected">{{ cartDisplay.checkoutBar.buttonText }}</button>
    </view>

    <CustomTabbar active-page-key="cart" />
    <WechatProfilePrompt />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { onShow } from "@dcloudio/uni-app";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
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

type CartCouponNoticeAction = "selectCoupon" | "couponPage" | "none";
type CartDisplayAlign = "left" | "center" | "right";
type CartModuleStyle = "capsule" | "title" | "hidden" | "bar" | "card" | "text" | "compact" | "sticky" | "accent";

interface CartDisplayModule {
  visible: boolean;
  title: string;
  description: string;
  style: CartModuleStyle;
}

interface CartDisplay {
  title: CartDisplayModule & {
    text: string;
    align: CartDisplayAlign;
    backgroundColor: string;
    textColor: string;
  };
  couponNotice: CartDisplayModule & {
    buttonText: string;
    action: CartCouponNoticeAction;
  };
  cartItems: CartDisplayModule;
  registrationItems: CartDisplayModule & {
    showSku: boolean;
    showLocation: boolean;
    showQuantity: boolean;
    showSinglePayButton: boolean;
    showDeleteButton: boolean;
    allowQuantityEdit: boolean;
  };
  mallItems: CartDisplayModule & {
    showImage: boolean;
    showSku: boolean;
    showQuantity: boolean;
    showDeleteButton: boolean;
    showStock: boolean;
  };
  shippingInfo: CartDisplayModule & {
    showName: boolean;
    showPhone: boolean;
    showAddress: boolean;
    showUseCommon: boolean;
    showSaveCommon: boolean;
    required: boolean;
    hideForVirtualService: boolean;
  };
  productCoupons: CartDisplayModule & {
    buttonText: string;
  };
  checkoutBar: CartDisplayModule & {
    showSelectAll: boolean;
    totalText: string;
    showDiscountDetail: boolean;
    buttonText: string;
    avoidTabbar: boolean;
    sticky: boolean;
  };
  emptyState: CartDisplayModule & {
    buttonText: string;
    target: string;
  };
  recommendations: CartDisplayModule & {
    buttonText: string;
    source: string;
  };
  customerService: CartDisplayModule & {
    buttonText: string;
  };
}

type CartDisplayKey = keyof CartDisplay;

const DEFAULT_CART_DISPLAY: CartDisplay = {
  title: {
    visible: true,
    title: "页面标题",
    text: "购物车",
    description: "会议报名项可继续支付；商城商品可创建订单后前往订单页支付。",
    style: "capsule",
    align: "left",
    backgroundColor: "",
    textColor: ""
  },
  couponNotice: {
    visible: true,
    title: "优惠券提示",
    description: "选择已领取的商品券或通用券。",
    buttonText: "选择优惠券",
    action: "selectCoupon",
    style: "bar"
  },
  cartItems: {
    visible: true,
    title: "商品与报名项",
    description: "",
    style: "card"
  },
  registrationItems: {
    visible: true,
    title: "会议报名",
    description: "报名支付沿用现有安全订单链路",
    style: "card",
    showSku: true,
    showLocation: true,
    showQuantity: true,
    showSinglePayButton: true,
    showDeleteButton: true,
    allowQuantityEdit: true
  },
  mallItems: {
    visible: true,
    title: "商品",
    description: "商品可创建待支付订单，订单页完成支付",
    style: "card",
    showImage: true,
    showSku: true,
    showQuantity: true,
    showDeleteButton: true,
    showStock: true
  },
  shippingInfo: {
    visible: true,
    title: "收货信息",
    description: "用于实物商品配送",
    style: "card",
    showName: true,
    showPhone: true,
    showAddress: true,
    showUseCommon: true,
    showSaveCommon: true,
    required: true,
    hideForVirtualService: false
  },
  productCoupons: {
    visible: true,
    title: "商品优惠券",
    description: "选择已领取的商品券或通用券，结算时由后端重新计算抵扣。",
    buttonText: "选择",
    style: "card"
  },
  checkoutBar: {
    visible: true,
    title: "底部结算条",
    description: "",
    style: "sticky",
    showSelectAll: true,
    totalText: "合计",
    showDiscountDetail: true,
    buttonText: "去结算",
    avoidTabbar: true,
    sticky: true
  },
  emptyState: {
    visible: true,
    title: "购物车还没有内容",
    description: "可以先从会议列表选择报名规格，完成报名缴费主流程。",
    buttonText: "查看会议",
    target: "home",
    style: "card"
  },
  recommendations: {
    visible: true,
    title: "推荐商品",
    description: "也可以先去商城看看更多周边商品。",
    buttonText: "去商城逛逛",
    source: "auto",
    style: "card"
  },
  customerService: {
    visible: false,
    title: "客服入口",
    description: "如需协助，可联系会务客服。",
    buttonText: "联系客服",
    style: "compact"
  }
};

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
const cartDisplay = computed(() => resolveCartDisplay(cmsPage.value));
const cartTitleStyle = computed(() => ({
  background: cartDisplay.value.title.backgroundColor || undefined,
  color: cartDisplay.value.title.textColor || undefined,
  "--cart-title-color": cartDisplay.value.title.textColor || undefined
}));
const showCartTitle = computed(() => cartDisplay.value.title.visible && cartDisplay.value.title.style !== "hidden");
const showRegistrationSection = computed(() => cartDisplay.value.cartItems.visible && cartDisplay.value.registrationItems.visible && registrationItems.value.length > 0);
const showMallSection = computed(() => cartDisplay.value.cartItems.visible && cartDisplay.value.mallItems.visible && productItems.value.length > 0);
const showShippingInfoCard = computed(() => cartDisplay.value.shippingInfo.visible && showMallSection.value && (hasPhysicalProduct.value || !cartDisplay.value.shippingInfo.hideForVirtualService));
const showRegistrationCardActions = computed(() => cartDisplay.value.registrationItems.showDeleteButton || cartDisplay.value.registrationItems.showSinglePayButton);
const showMallCardActions = computed(() => showMallSection.value);
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
const COMMON_PROFILE_STORAGE_KEY = "conference_user_common_profile";

watch(
  cartDisplay,
  (display) => {
    uni.setNavigationBarTitle({ title: display.title.visible && display.title.style !== "hidden" ? display.title.text : "" });
  },
  { immediate: true }
);

function resolveCartDisplay(page: PublishedPage | null): CartDisplay {
  const display = cloneCartDisplay(DEFAULT_CART_DISPLAY);
  const businessDisplay = readRecord(page?.version.themeJson?.businessDisplay);
  const source = readRecord(businessDisplay.cart ?? businessDisplay.cartCheckout ?? businessDisplay.shoppingCart ?? businessDisplay.mallCart);
  applyNestedCartDisplay(display, source);
  applyCartDisplayModules(display, source);
  return display;
}

function cloneCartDisplay(display: CartDisplay): CartDisplay {
  return JSON.parse(JSON.stringify(display)) as CartDisplay;
}

function applyNestedCartDisplay(display: CartDisplay, source: Record<string, unknown>) {
  (Object.keys(display) as CartDisplayKey[]).forEach((key) => {
    const config = readRecord(source[key]);
    if (Object.keys(config).length === 0) return;
    applyCartModuleConfig(display, key, config);
  });
}

function applyCartDisplayModules(display: CartDisplay, source: Record<string, unknown>) {
  const rawModules = Array.isArray(source.modules) ? source.modules : [];
  const oldVisibleModules = Array.isArray(source.visibleModules) ? source.visibleModules.filter((item): item is string => typeof item === "string") : [];
  if (oldVisibleModules.length > 0) {
    const visible = new Set(oldVisibleModules.map(normalizeCartModuleKey));
    (Object.keys(display) as CartDisplayKey[]).forEach((key) => {
      display[key].visible = visible.has(key);
    });
  }
  rawModules.forEach((item) => {
    const module = readRecord(item);
    const rawKey = readString(module.key);
    if (rawKey === "quantity") {
      const visible = readBoolean(module.visible, true);
      display.registrationItems.showQuantity = visible;
      display.registrationItems.allowQuantityEdit = visible;
      display.mallItems.showQuantity = visible;
      return;
    }
    if (rawKey === "feeSummary") {
      display.checkoutBar.showDiscountDetail = readBoolean(module.visible, display.checkoutBar.showDiscountDetail);
      return;
    }
    const key = normalizeCartModuleKey(rawKey);
    if (!key) return;
    applyCartModuleConfig(display, key, module);
  });
}

function applyCartModuleConfig(display: CartDisplay, key: CartDisplayKey, module: Record<string, unknown>) {
  const target = display[key];
  if (typeof module.visible === "boolean") target.visible = module.visible;
  const title = readString(module.title);
  const content = readString(module.content ?? module.description);
  const style = normalizeCartStyle(readString(module.style));
  if (title) target.title = title;
  if (content) target.description = content;
  if (style) target.style = style;

  if (key === "title") {
    display.title.text = readString(module.text) || content || title || display.title.text;
    display.title.description = readString(module.description) || display.title.description;
    display.title.align = normalizeAlign(readString(module.align)) || display.title.align;
    display.title.backgroundColor = readString(module.backgroundColor) || display.title.backgroundColor;
    display.title.textColor = readString(module.textColor) || display.title.textColor;
  }
  if (key === "couponNotice") {
    display.couponNotice.buttonText = readString(module.buttonText) || display.couponNotice.buttonText;
    display.couponNotice.action = normalizeCouponNoticeAction(readString(module.action)) || display.couponNotice.action;
  }
  if (key === "registrationItems") {
    display.registrationItems.showSku = readBoolean(module.showSku, display.registrationItems.showSku);
    display.registrationItems.showLocation = readBoolean(module.showLocation, display.registrationItems.showLocation);
    display.registrationItems.showQuantity = readBoolean(module.showQuantity, display.registrationItems.showQuantity);
    display.registrationItems.showSinglePayButton = readBoolean(module.showSinglePayButton, display.registrationItems.showSinglePayButton);
    display.registrationItems.showDeleteButton = readBoolean(module.showDeleteButton, display.registrationItems.showDeleteButton);
    display.registrationItems.allowQuantityEdit = readBoolean(module.allowQuantityEdit, display.registrationItems.allowQuantityEdit);
  }
  if (key === "mallItems") {
    display.mallItems.showImage = readBoolean(module.showImage, display.mallItems.showImage);
    display.mallItems.showSku = readBoolean(module.showSku, display.mallItems.showSku);
    display.mallItems.showQuantity = readBoolean(module.showQuantity, display.mallItems.showQuantity);
    display.mallItems.showDeleteButton = readBoolean(module.showDeleteButton, display.mallItems.showDeleteButton);
    display.mallItems.showStock = readBoolean(module.showStock, display.mallItems.showStock);
  }
  if (key === "shippingInfo") {
    display.shippingInfo.showName = readBoolean(module.showName, display.shippingInfo.showName);
    display.shippingInfo.showPhone = readBoolean(module.showPhone, display.shippingInfo.showPhone);
    display.shippingInfo.showAddress = readBoolean(module.showAddress, display.shippingInfo.showAddress);
    display.shippingInfo.showUseCommon = readBoolean(module.showUseCommon, display.shippingInfo.showUseCommon);
    display.shippingInfo.showSaveCommon = readBoolean(module.showSaveCommon, display.shippingInfo.showSaveCommon);
    display.shippingInfo.required = readBoolean(module.required, display.shippingInfo.required);
    display.shippingInfo.hideForVirtualService = readBoolean(module.hideForVirtualService, display.shippingInfo.hideForVirtualService);
  }
  if (key === "productCoupons") {
    display.productCoupons.buttonText = readString(module.buttonText) || display.productCoupons.buttonText;
  }
  if (key === "checkoutBar") {
    display.checkoutBar.showSelectAll = readBoolean(module.showSelectAll, display.checkoutBar.showSelectAll);
    display.checkoutBar.totalText = readString(module.totalText) || display.checkoutBar.totalText;
    display.checkoutBar.showDiscountDetail = readBoolean(module.showDiscountDetail, display.checkoutBar.showDiscountDetail);
    display.checkoutBar.buttonText = content || readString(module.buttonText) || display.checkoutBar.buttonText;
    display.checkoutBar.avoidTabbar = readBoolean(module.avoidTabbar, display.checkoutBar.avoidTabbar);
    display.checkoutBar.sticky = readBoolean(module.sticky, display.checkoutBar.sticky);
  }
  if (key === "emptyState") {
    display.emptyState.buttonText = readString(module.buttonText) || display.emptyState.buttonText;
    display.emptyState.target = readString(module.target) || display.emptyState.target;
  }
  if (key === "recommendations") {
    display.recommendations.buttonText = content || readString(module.buttonText) || display.recommendations.buttonText;
    display.recommendations.source = readString(module.source) || display.recommendations.source;
  }
  if (key === "customerService") {
    display.customerService.buttonText = content || readString(module.buttonText) || display.customerService.buttonText;
  }
}

function normalizeCartModuleKey(key: string): CartDisplayKey | "" {
  const map: Record<string, CartDisplayKey> = {
    title: "title",
    pageTitle: "title",
    couponNotice: "couponNotice",
    cartItems: "cartItems",
    registrationItems: "registrationItems",
    mallItems: "mallItems",
    productItems: "mallItems",
    shippingInfo: "shippingInfo",
    receiver: "shippingInfo",
    productCoupons: "productCoupons",
    coupon: "productCoupons",
    submitButton: "checkoutBar",
    checkoutBar: "checkoutBar",
    emptyState: "emptyState",
    recommendations: "recommendations",
    recommended: "recommendations",
    customerService: "customerService"
  };
  return map[key] ?? "";
}

function normalizeCartStyle(value: string): CartModuleStyle | "" {
  const allowed = new Set<CartModuleStyle>(["capsule", "title", "hidden", "bar", "card", "text", "compact", "sticky", "accent"]);
  return allowed.has(value as CartModuleStyle) ? (value as CartModuleStyle) : "";
}

function normalizeAlign(value: string): CartDisplayAlign | "" {
  return value === "left" || value === "center" || value === "right" ? value : "";
}

function normalizeCouponNoticeAction(value: string): CartCouponNoticeAction | "" {
  return value === "selectCoupon" || value === "couponPage" || value === "none" ? value : "";
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

onShow(() => {
  if (!productCouponCode.value) productCouponCode.value = readPendingProductCoupon();
  loadSavedReceiver();
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
    if (requiresReceiver) saveReceiverProfile(false);
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
    if (requiresReceiver) saveReceiverProfile(false);
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

function goMall() {
  uni.navigateTo({ url: "/pages/mall/index" });
}

function handleCouponNoticeAction() {
  if (cartDisplay.value.couponNotice.action === "couponPage") {
    uni.navigateTo({ url: "/pages/coupon/my" });
    return;
  }
  if (cartDisplay.value.couponNotice.action === "selectCoupon") {
    void selectProductCoupon();
  }
}

function handleEmptyStateAction() {
  if (cartDisplay.value.emptyState.target === "mall") {
    goMall();
    return;
  }
  goHome();
}

function contactService() {
  uni.showToast({ title: "请联系会务客服", icon: "none" });
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

function loadSavedReceiver() {
  const stored = uni.getStorageSync(COMMON_PROFILE_STORAGE_KEY);
  if (!stored || typeof stored !== "object") return;
  const value = stored as { name?: unknown; phone?: unknown; address?: unknown };
  receiver.value = {
    name: typeof value.name === "string" ? value.name : receiver.value.name,
    phone: typeof value.phone === "string" ? value.phone : receiver.value.phone,
    address: typeof value.address === "string" ? value.address : receiver.value.address
  };
}

function saveReceiverProfile(showToast = true) {
  const current = uni.getStorageSync(COMMON_PROFILE_STORAGE_KEY);
  const base = current && typeof current === "object" ? (current as Record<string, unknown>) : {};
  uni.setStorageSync(COMMON_PROFILE_STORAGE_KEY, {
    ...base,
    name: receiver.value.name,
    phone: receiver.value.phone,
    address: receiver.value.address
  });
  if (showToast) uni.showToast({ title: "已保存常用收货信息", icon: "success" });
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
  padding-bottom: calc(420rpx + env(safe-area-inset-bottom));
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

.topbar.align-center {
  text-align: center;
}

.topbar.align-right {
  text-align: right;
}

.topbar.is-title,
.topbar.is-hidden {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
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
  color: var(--cart-title-color, var(--ui-color-text));
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
  padding: 26rpx;
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

.receiver-actions {
  display: flex;
  justify-content: flex-end;
  gap: 14rpx;
}

.coupon-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
}

.coupon-notice,
.recommendation-card,
.customer-service-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
}

.coupon-notice.is-bar {
  border-color: rgba(181, 139, 71, 0.22);
  background: rgba(255, 250, 238, 0.94);
}

.coupon-notice.is-text {
  border-color: transparent;
  background: transparent;
  box-shadow: none;
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

.quantity-static {
  color: var(--ui-color-text);
  font-size: 28rpx;
  font-weight: 800;
}

.product-card {
  display: flex;
  align-items: flex-start;
  gap: 20rpx;
  border-radius: 26rpx;
  padding-top: 30rpx;
  padding-bottom: 30rpx;
}

.product-cover {
  width: 176rpx;
  height: 176rpx;
  flex: 0 0 176rpx;
  border-radius: 20rpx;
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

.product-body .card-head {
  align-items: flex-start;
}

.product-body .card-actions {
  margin-top: 18rpx;
}

.product-body .quantity-row {
  margin-top: 20rpx;
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
  bottom: calc(220rpx + env(safe-area-inset-bottom));
  left: 24rpx;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 20rpx 24rpx;
  border: 1rpx solid rgba(8, 23, 44, 0.08);
  border-radius: 34rpx;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 18rpx 50rpx rgba(15, 23, 42, 0.14);
  backdrop-filter: blur(14px);
}

.settlement-bar.is-static {
  position: relative;
  right: auto;
  bottom: auto;
  left: auto;
  margin: 4rpx 24rpx 0;
}

.settlement-bar:not(.avoid-tabbar) {
  bottom: calc(40rpx + env(safe-area-inset-bottom));
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
  min-width: 206rpx;
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
