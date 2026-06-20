<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <LoadingState v-if="loading" title="加载报名信息中" description="正在读取票种、价格和报名字段。" />
    <ErrorState
      v-else-if="error"
      :message="error"
      primary-text="重新加载"
      secondary-text="返回首页"
      @retry="loadPage"
      @secondary="goHome"
    />

    <view v-else-if="conference && form" class="content">
      <view class="headline ui-card">
        <StatusTag label="报名信息" tone="info" />
        <text class="title">{{ conference.title }}</text>
        <text class="summary">{{ form.title || "填写报名信息" }}</text>
        <text class="safety-note">金额以提交订单时系统计算结果为准，前端 quote 仅用于展示。</text>
      </view>

      <PageRenderer
        v-if="cmsPage"
        :components="cmsPage.version.components"
        :theme="theme"
        :conference="conference"
        suppress-registration-cta
        @register="scrollToForm"
      />

      <FormSection title="选择报名规格" description="可选择多个票种，系统会为每张票生成一份参会人信息。" step="1">
        <view class="sku-list">
          <view
            v-for="sku in conference.skus"
            :key="sku.id"
            :class="['sku-card', skuQuantity(sku.id) > 0 ? 'selected' : '']"
          >
            <view class="sku-main">
              <text class="sku-name">{{ sku.name }}</text>
              <text class="sku-desc">{{ sku.description || "标准报名规格" }}</text>
              <text v-if="stockDisplayMode !== 'HIDDEN'" class="sku-stock">{{ stockLabel(sku) }}</text>
            </view>
            <view class="sku-side">
              <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
              <view class="quantity-control">
                <button class="qty-button" @click.stop="changeSkuQuantity(sku.id, -1)">-</button>
                <text class="qty-value">{{ skuQuantity(sku.id) }}</text>
                <button class="qty-button" @click.stop="changeSkuQuantity(sku.id, 1)">+</button>
              </view>
            </view>
          </view>
        </view>
      </FormSection>

      <FormSection title="优惠与费用" description="可输入优惠码试算，最终应付金额以下单时后端重新计算为准。" step="2">
        <view class="coupon-row">
          <input class="coupon-input" placeholder="输入优惠码" :value="couponCode" @input="setCouponCode" />
          <button class="ui-button-secondary ui-button-compact coupon-button" :disabled="quoteLoading" @click="loadQuote">使用</button>
        </view>
        <PriceSummary
          :origin-amount-cent="quote?.originAmountCent ?? selectedAmountCent"
          :discount-amount-cent="quote?.discountAmountCent ?? 0"
          :payable-amount-cent="payableAmountCent"
          :discounts="quote?.discounts ?? []"
          :messages="quote?.messages ?? []"
          :loading="quoteLoading"
          :error="quoteError"
          note="提交订单后后端会重新读取票种、库存、优惠规则并计算最终金额。"
        />
      </FormSection>

      <FormSection title="参会人信息" :description="attendeeSectionDescription" step="3">
        <EmptyState v-if="attendeeForms.length === 0" title="请先选择报名票数" description="选择票数后，这里会自动生成参会人表单。" mark="人" />
        <view v-for="attendee in attendeeForms" :key="attendee.key" class="attendee-card">
          <text class="attendee-title">{{ attendee.skuName }} 第 {{ attendee.index + 1 }} 位参会人</text>
          <view v-for="field in form.fields" :key="`${attendee.key}-${field.id}`" class="field">
            <text class="label">{{ field.label }}<text v-if="field.required" class="required">*</text></text>

            <input
              v-if="isTextInput(field.type)"
              class="input"
              :type="inputType(field.type)"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :value="textValue(attendee.formData, field.key)"
              @input="setEventTextValue(attendee.key, field.key, $event)"
            />

            <textarea
              v-else-if="normalizeFieldType(field.type) === 'textarea'"
              class="textarea"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :value="textValue(attendee.formData, field.key)"
              @input="setEventTextValue(attendee.key, field.key, $event)"
            />

            <picker
              v-else-if="normalizeFieldType(field.type) === 'select'"
              mode="selector"
              range-key="label"
              :range="fieldOptions(field)"
              @change="setPickerEventValue(attendee.key, field.key, fieldOptions(field), $event)"
            >
              <view class="picker-value">{{ textValue(attendee.formData, field.key) || field.placeholder || `请选择${field.label}` }}</view>
            </picker>

            <radio-group
              v-else-if="normalizeFieldType(field.type) === 'radio'"
              class="choice-group"
              @change="setEventTextValue(attendee.key, field.key, $event)"
            >
              <label v-for="option in fieldOptions(field)" :key="option.value" class="choice">
                <radio :value="option.value" :checked="textValue(attendee.formData, field.key) === option.value" />
                <text>{{ option.label }}</text>
              </label>
            </radio-group>

            <checkbox-group
              v-else-if="normalizeFieldType(field.type) === 'checkbox'"
              class="choice-group"
              @change="setEventArrayValue(attendee.key, field.key, $event)"
            >
              <label v-for="option in fieldOptions(field)" :key="option.value" class="choice">
                <checkbox :value="option.value" :checked="arrayValue(attendee.formData, field.key).includes(option.value)" />
                <text>{{ option.label }}</text>
              </label>
            </checkbox-group>

            <picker
              v-else-if="normalizeFieldType(field.type) === 'date'"
              mode="date"
              @change="setEventTextValue(attendee.key, field.key, $event)"
            >
              <view class="picker-value">{{ textValue(attendee.formData, field.key) || field.placeholder || `请选择${field.label}` }}</view>
            </picker>

            <input
              v-else
              class="input"
              :placeholder="field.placeholder || `请输入${field.label}`"
              :value="textValue(attendee.formData, field.key)"
              @input="setEventTextValue(attendee.key, field.key, $event)"
            />
          </view>
        </view>
      </FormSection>
    </view>
    <WechatProfilePrompt />
    <FixedBottomActionBar
      v-if="conference && form"
      amount-label="合计"
      :amount-value="`¥${formatCent(payableAmountCent)}`"
      note="金额以提交订单时系统计算结果为准"
      primary-text="提交订单"
      :secondary-text="addingToCart ? '加入中...' : '加入购物车'"
      :loading="submitting"
      loading-text="提交中..."
      :primary-disabled="submitting || totalTickets === 0"
      :secondary-disabled="submitting || addingToCart || totalTickets === 0"
      @primary="submitOrder"
      @secondary="addSelectedToCart"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import FixedBottomActionBar from "@/components/ui/FixedBottomActionBar.vue";
import FormSection from "@/components/ui/FormSection.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import PageRenderer from "@/components/PageRenderer.vue";
import PriceSummary from "@/components/ui/PriceSummary.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { getPublishedPage, type PublishedPage } from "@/services/cms";
import {
  getConferenceDetail,
  getConferenceForm,
  normalizeOptions,
  type ConferenceDetail,
  type ConferenceForm,
  type FormField,
  type FormOption,
  type RegistrationSku
} from "@/services/conference";
import { clearExpiredAuthSession, ensureLogin, EXPIRED_LOGIN_REENTRY_MESSAGE, isAuthSessionExpiredError } from "@/services/auth";
import { addRegistrationCartItem } from "@/services/cart";
import { createRegistrationOrder, quoteRegistration, type QuoteResponse, type RegistrationOrderItem } from "@/services/registration";
import { ApiRequestError } from "@/services/request";
import { formatCent } from "@/utils/money";
import { goHome } from "@/utils/navigation";

const conferenceId = ref("");
const selectedSkuId = ref("");
const conference = ref<ConferenceDetail | null>(null);
const form = ref<ConferenceForm | null>(null);
const cmsPage = ref<PublishedPage | null>(null);
const quantities = ref<Record<string, number>>({});
const attendeeForms = ref<AttendeeFormState[]>([]);
const quote = ref<QuoteResponse | null>(null);
const loading = ref(false);
const quoteLoading = ref(false);
const submitting = ref(false);
const addingToCart = ref(false);
const error = ref("");
const quoteError = ref("");
const couponCode = ref("");
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("registration-form");

const selectedItems = computed<RegistrationOrderItem[]>(() =>
  Object.entries(quantities.value)
    .filter(([, quantity]) => quantity > 0)
    .map(([skuId, quantity]) => ({ skuId, quantity }))
);
const selectedAmountCent = computed(() =>
  selectedItems.value.reduce((sum, item) => {
    const sku = conference.value?.skus.find((entry) => entry.id === item.skuId);
    return sum + (sku?.priceCent ?? 0) * item.quantity;
  }, 0)
);
const totalTickets = computed(() => selectedItems.value.reduce((sum, item) => sum + item.quantity, 0));
const payableAmountCent = computed(() => quote.value?.payableAmountCent ?? selectedAmountCent.value);
const displaySettings = computed(() => normalizeDetailDisplay(conference.value?.contentJson, readCmsBusinessDisplay(cmsPage.value)));
const stockDisplayMode = computed(() => displaySettings.value.inventoryDisplayMode);
const attendeeSectionDescription = computed(() =>
  totalTickets.value > 0 ? `共 ${totalTickets.value} 位参会人，请填写真实有效信息。` : "选择报名票数后自动生成表单。"
);

onLoad((query) => {
  conferenceId.value = String(query?.conferenceId || "");
  selectedSkuId.value = String(query?.skuId || "");
  void refreshTheme();
  void loadPage();
});

async function loadPage() {
  if (!conferenceId.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await ensureLogin();
    const [detail, formResponse, page] = await Promise.all([
      getConferenceDetail(conferenceId.value),
      getConferenceForm(conferenceId.value),
      getPublishedPage("registration-form", { conferenceId: conferenceId.value })
    ]);
    conference.value = detail;
    form.value = formResponse;
    cmsPage.value = page;

    if (!selectedSkuId.value && detail.skus[0]) {
      selectedSkuId.value = detail.skus[0].id;
    }

    if (!selectedSkuId.value) {
      error.value = "页面信息不完整，请返回首页重新进入";
      return;
    }

    initializeQuantities(detail);
    syncAttendeeForms(formResponse.fields);
    await loadQuote();
  } catch (err) {
    console.error("[REGISTRATION_FORM_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
    } else {
      error.value = "报名信息加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

function scrollToForm() {
  uni.pageScrollTo({ scrollTop: 420, duration: 200 });
}

function createEmptyFormData(fields: FormField[]) {
  const nextData: Record<string, string | string[]> = {};
  for (const field of fields) {
    nextData[field.key] = normalizeFieldType(field.type) === "checkbox" ? [] : "";
  }
  return nextData;
}

function initializeQuantities(detail: ConferenceDetail) {
  const next: Record<string, number> = {};
  for (const sku of detail.skus) {
    next[sku.id] = sku.id === selectedSkuId.value ? 1 : 0;
  }
  if (!selectedSkuId.value && detail.skus[0]) {
    next[detail.skus[0].id] = 1;
  }
  quantities.value = next;
}

function syncAttendeeForms(fields: FormField[]) {
  const existing = new Map(attendeeForms.value.map((item) => [item.key, item]));
  const next: AttendeeFormState[] = [];
  for (const sku of conference.value?.skus ?? []) {
    const quantity = skuQuantity(sku.id);
    for (let index = 0; index < quantity; index += 1) {
      const key = `${sku.id}-${index}`;
      next.push(existing.get(key) ?? { key, skuId: sku.id, skuName: sku.name, index, formData: createEmptyFormData(fields) });
    }
  }
  attendeeForms.value = next;
}

async function changeSkuQuantity(skuId: string, delta: number) {
  const current = skuQuantity(skuId);
  const sku = conference.value?.skus.find((item) => item.id === skuId);
  const max = Math.max(0, (sku?.stock ?? 0) - (sku?.soldCount ?? 0));
  quantities.value = {
    ...quantities.value,
    [skuId]: Math.min(max, Math.max(0, current + delta))
  };
  syncAttendeeForms(form.value?.fields ?? []);
  await loadQuote();
}

function skuQuantity(skuId: string): number {
  return quantities.value[skuId] ?? 0;
}

function stockLabel(sku: RegistrationSku): string {
  const remaining = Math.max(0, sku.stock - sku.soldCount);
  if (remaining <= 0) return "已售罄";
  if (stockDisplayMode.value === "EXACT") return `剩余 ${remaining} / ${sku.stock}`;
  return remaining <= displaySettings.value.lowStockThreshold ? "库存紧张" : "名额充足";
}

async function loadQuote() {
  if (!conferenceId.value || selectedItems.value.length === 0) {
    quote.value = null;
    return;
  }

  quoteLoading.value = true;
  quoteError.value = "";

  try {
    quote.value = await quoteRegistration({
      conferenceId: conferenceId.value,
      items: selectedItems.value,
      couponCode: normalizedCouponCode()
    });
  } catch (err) {
    console.error("[REGISTRATION_QUOTE_ERROR]", err);
    quote.value = null;
    quoteError.value = buildQuoteErrorMessage(err);
  } finally {
    quoteLoading.value = false;
  }
}

async function submitOrder() {
  if (selectedItems.value.length === 0) {
    uni.showToast({ title: "请选择报名票数", icon: "none" });
    return;
  }

  const validationMessage = validateForm();
  if (validationMessage) {
    uni.showToast({ title: validationMessage, icon: "none" });
    return;
  }

  submitting.value = true;
  try {
    await ensureLogin();
    const order = await createRegistrationOrder({
      conferenceId: conferenceId.value,
      items: selectedItems.value,
      couponCode: normalizedCouponCode(),
      attendees: attendeeForms.value.map((attendee) => ({
        skuId: attendee.skuId,
        formData: attendee.formData
      }))
    });

    uni.navigateTo({
      url: `/pages/payment/result?orderNo=${encodeURIComponent(order.orderNo)}`
    });
  } catch (err) {
    console.error("[REGISTRATION_CREATE_ORDER_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
      uni.showToast({
        title: EXPIRED_LOGIN_REENTRY_MESSAGE,
        icon: "none"
      });
      return;
    }

    uni.showToast({
      title: buildCreateOrderErrorMessage(err),
      icon: "none"
    });
  } finally {
    submitting.value = false;
  }
}

async function addSelectedToCart() {
  if (selectedItems.value.length === 0) {
    uni.showToast({ title: "请选择报名票数", icon: "none" });
    return;
  }

  const validationMessage = validateForm();
  if (validationMessage) {
    uni.showToast({ title: validationMessage, icon: "none" });
    return;
  }

  addingToCart.value = true;
  try {
    await ensureLogin();
    for (const item of selectedItems.value) {
      await addRegistrationCartItem({
        conferenceId: conferenceId.value,
        skuId: item.skuId,
        quantity: item.quantity,
        couponCode: normalizedCouponCode(),
        attendees: attendeeForms.value.filter((attendee) => attendee.skuId === item.skuId).map((attendee) => attendee.formData)
      });
    }
    uni.showToast({ title: "已加入购物车", icon: "success" });
    setTimeout(() => {
      uni.navigateTo({ url: "/pages/cart/index" });
    }, 450);
  } catch (err) {
    console.error("[REGISTRATION_ADD_CART_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      error.value = EXPIRED_LOGIN_REENTRY_MESSAGE;
      uni.showToast({ title: EXPIRED_LOGIN_REENTRY_MESSAGE, icon: "none" });
      return;
    }
    uni.showToast({ title: buildCreateOrderErrorMessage(err), icon: "none" });
  } finally {
    addingToCart.value = false;
  }
}

function setCouponCode(event: unknown) {
  couponCode.value = String(readEventValue(event) ?? "");
}

function normalizedCouponCode(): string | undefined {
  const code = couponCode.value.trim();
  return code.length > 0 ? code : undefined;
}

function buildQuoteErrorMessage(err: unknown): string {
  const couponMessage = readCouponErrorMessage(err);
  if (couponMessage) {
    return couponMessage;
  }

  if (err instanceof ApiRequestError) {
    if (err.errMsg) {
      return "网络异常，请检查网络后重试";
    }
    if (err.statusCode === 409) {
      return "当前报名规格暂不可用，请刷新后重试";
    }
  }

  return "价格加载失败，请刷新后重试";
}

function buildCreateOrderErrorMessage(err: unknown): string {
  const couponMessage = readCouponErrorMessage(err);
  if (couponMessage) {
    return couponMessage;
  }

  if (err instanceof ApiRequestError) {
    if (err.statusCode === 401 || err.statusCode === 403) {
      return "登录状态已过期，请重新进入小程序后下单";
    }
    if (err.statusCode === 409) {
      return "当前报名规格暂不可下单，请刷新后重试";
    }
    if (typeof err.statusCode === "number" && err.statusCode >= 500) {
      return "下单服务暂时不可用，请稍后重试";
    }
    return err.errMsg ? "网络异常，请检查网络后重试" : "创建订单失败，请稍后重试";
  }

  return "创建订单失败，请稍后重试";
}

function readCouponErrorMessage(err: unknown): string {
  if (!(err instanceof ApiRequestError)) {
    return "";
  }

  const message = normalizeApiErrorMessage(err.responseMessage);
  if (!message) {
    return "";
  }

  if (message.includes("优惠券不存在")) {
    return "优惠券输入错误或不存在";
  }

  return message.includes("优惠券") ? message : "";
}

function normalizeApiErrorMessage(message: unknown): string {
  if (typeof message === "string") {
    return message.trim();
  }
  if (Array.isArray(message)) {
    return message.filter((item): item is string => typeof item === "string").join("，").trim();
  }
  return "";
}

function validateForm(): string {
  for (const attendee of attendeeForms.value) {
    for (const field of form.value?.fields ?? []) {
      const value = attendee.formData[field.key];
      if (field.required && isEmpty(value)) {
        return `请填写${attendee.skuName}第${attendee.index + 1}位参会人的${field.label}`;
      }

      if (isEmpty(value)) {
        continue;
      }

      if (normalizeFieldType(field.type) === "phone" && !/^1[3-9]\d{9}$/.test(String(value))) {
        return "手机号格式不正确";
      }

      if (normalizeFieldType(field.type) === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value))) {
        return "邮箱格式不正确";
      }
    }
  }

  return "";
}

function isEmpty(value: string | string[] | undefined): boolean {
  return typeof value === "undefined" || value === "" || (Array.isArray(value) && value.length === 0);
}

function normalizeFieldType(type: string): string {
  return type.toLowerCase();
}

function isTextInput(type: string): boolean {
  return ["text", "phone", "email"].includes(normalizeFieldType(type));
}

function inputType(type: string): "text" | "number" {
  return normalizeFieldType(type) === "phone" ? "number" : "text";
}

function fieldOptions(field: FormField): FormOption[] {
  return normalizeOptions(field.options);
}

function textValue(formData: Record<string, string | string[]>, key: string): string {
  const value = formData[key];
  return typeof value === "string" ? value : "";
}

function arrayValue(formData: Record<string, string | string[]>, key: string): string[] {
  const value = formData[key];
  return Array.isArray(value) ? value : [];
}

function setTextValue(attendeeKey: string, fieldKey: string, value: string) {
  updateAttendeeForm(attendeeKey, fieldKey, value);
}

function setEventTextValue(attendeeKey: string, fieldKey: string, event: unknown) {
  setTextValue(attendeeKey, fieldKey, String(readEventValue(event) ?? ""));
}

function setArrayValue(attendeeKey: string, fieldKey: string, value: string[]) {
  updateAttendeeForm(attendeeKey, fieldKey, value);
}

function setEventArrayValue(attendeeKey: string, fieldKey: string, event: unknown) {
  const value = readEventValue(event);
  setArrayValue(attendeeKey, fieldKey, Array.isArray(value) ? value.map(String) : []);
}

function setPickerEventValue(attendeeKey: string, fieldKey: string, options: FormOption[], event: unknown) {
  const index = Number(readEventValue(event));
  const option = options[index];
  if (option) {
    setTextValue(attendeeKey, fieldKey, option.value);
  }
}

function updateAttendeeForm(attendeeKey: string, fieldKey: string, value: string | string[]) {
  attendeeForms.value = attendeeForms.value.map((attendee) =>
    attendee.key === attendeeKey
      ? {
          ...attendee,
          formData: {
            ...attendee.formData,
            [fieldKey]: value
          }
        }
      : attendee
  );
}

function readEventValue(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "detail" in event) {
    const detail = (event as { detail?: { value?: unknown } }).detail;
    return detail?.value;
  }

  return undefined;
}

function normalizeDetailDisplay(value: unknown, cmsDisplay: Record<string, unknown> = {}) {
  const content = readRecord(value);
  const source = {
    ...readRecord(content.detailDisplay),
    ...cmsDisplay
  };
  const mode = String(source.inventoryDisplayMode || "STATUS").toUpperCase();
  return {
    inventoryDisplayMode: mode === "EXACT" || mode === "HIDDEN" ? mode : "STATUS",
    lowStockThreshold: Number.isFinite(Number(source.lowStockThreshold)) ? Math.max(1, Number(source.lowStockThreshold)) : 10
  };
}

function readCmsBusinessDisplay(page: PublishedPage | null): Record<string, unknown> {
  const themeJson = readRecord(page?.version.themeJson);
  const businessDisplay = readRecord(themeJson.businessDisplay);
  return readRecord(businessDisplay.conferenceDetail ?? themeJson.detailDisplay);
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

interface AttendeeFormState {
  key: string;
  skuId: string;
  skuName: string;
  index: number;
  formData: Record<string, string | string[]>;
}
</script>

<style scoped>
.page {
  padding-bottom: 224rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.headline {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  padding: 30rpx;
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 40rpx;
  font-weight: 900;
  line-height: 1.35;
}

.summary,
.sku-desc,
.sku-stock,
.hint {
  display: block;
  color: var(--ui-color-muted);
  font-size: 26rpx;
  line-height: 1.5;
}

.safety-note {
  display: block;
  padding: 16rpx 18rpx;
  border-radius: var(--ui-radius);
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.45;
}

.sku-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.sku-card {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-muted);
}

.selected {
  border-color: var(--ui-color-primary);
  background: var(--ui-color-primary-soft);
}

.sku-main {
  flex: 1;
  min-width: 0;
}

.sku-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 14rpx;
}

.sku-name {
  display: block;
  color: var(--ui-color-text);
  font-size: 29rpx;
  font-weight: 900;
  line-height: 1.35;
}

.price {
  color: var(--ui-color-primary);
  font-size: 30rpx;
  font-weight: 900;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.qty-button {
  width: 54rpx;
  height: 54rpx;
  padding: 0;
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-primary);
  color: #ffffff;
  font-size: 28rpx;
  line-height: 54rpx;
}

.qty-value {
  min-width: 42rpx;
  color: var(--ui-color-text);
  text-align: center;
  font-size: 28rpx;
  font-weight: 900;
}

.attendee-card {
  margin-top: 22rpx;
  padding: 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-muted);
}

.attendee-title {
  display: block;
  color: var(--ui-color-primary);
  font-size: 28rpx;
  font-weight: 900;
}

.coupon-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.coupon-input {
  flex: 1;
  min-height: 78rpx;
  padding: 0 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: 27rpx;
  box-sizing: border-box;
}

.coupon-button {
  min-width: 150rpx;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 22rpx;
}

.label {
  color: var(--ui-color-text);
  font-size: 27rpx;
  font-weight: 800;
}

.required,
.error-text {
  color: var(--ui-color-danger);
}

.input,
.textarea,
.picker-value {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: 28rpx;
  box-sizing: border-box;
}

.textarea {
  height: 168rpx;
  padding-top: 18rpx;
}

.picker-value {
  line-height: 82rpx;
}

.choice-group {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
}

.choice {
  display: flex;
  align-items: center;
  gap: 12rpx;
  color: var(--ui-color-text);
  font-size: 27rpx;
}
</style>
