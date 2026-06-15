<template>
  <view class="page">
    <view v-if="loading" class="state">加载报名信息中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button v-if="conferenceId" class="primary-button compact" @click="loadPage">重试</button>
      <button class="ghost-button compact" @click="goHome">返回首页</button>
    </view>

    <view v-else-if="conference && form" class="content">
      <view class="section">
        <text class="title">{{ conference.title }}</text>
        <text class="summary">{{ form.title || "填写报名信息" }}</text>
      </view>

      <view class="section">
        <text class="section-title">报名规格</text>
        <view class="sku-list">
          <view
            v-for="sku in conference.skus"
            :key="sku.id"
            :class="['sku-card', skuQuantity(sku.id) > 0 ? 'selected' : '']"
          >
            <view class="sku-main">
              <text class="sku-name">{{ sku.name }}</text>
              <text class="sku-desc">{{ sku.description || "标准报名规格" }}</text>
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
        <view class="coupon-row">
          <input class="coupon-input" placeholder="输入优惠码" :value="couponCode" @input="setCouponCode" />
          <button class="ghost-button compact" :disabled="quoteLoading" @click="loadQuote">使用</button>
        </view>
        <view v-if="quoteLoading" class="hint">正在计算价格...</view>
        <view v-else-if="quoteError" class="hint error-text">{{ quoteError }}</view>
        <view v-else-if="quote" class="quote-stack">
          <view class="quote-line">
            <text>原价金额</text>
            <text>¥{{ formatCent(quote.originAmountCent) }}</text>
          </view>
          <view v-if="quote.discountAmountCent > 0" class="quote-line discount-line">
            <text>优惠金额</text>
            <text>-¥{{ formatCent(quote.discountAmountCent) }}</text>
          </view>
          <view v-for="discount in quote.discounts || []" :key="`${discount.type}-${discount.title}`" class="discount-title">
            {{ discount.title }}
          </view>
          <view v-for="message in quote.messages || []" :key="message" class="discount-title">
            {{ message }}
          </view>
          <view class="quote-line total-line">
            <text>应付金额</text>
            <text class="quote-price">¥{{ formatCent(quote.payableAmountCent) }}</text>
          </view>
        </view>
      </view>

      <view class="section">
        <text class="section-title">参会人表单</text>
        <view v-if="attendeeForms.length === 0" class="hint">请先选择报名票数</view>
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
      </view>

      <view class="footer">
        <view class="footer-price">
          <text>合计</text>
          <text class="quote-price">¥{{ formatCent(quote?.payableAmountCent ?? selectedAmountCent) }}</text>
        </view>
        <button class="ghost-button submit secondary-submit" :disabled="submitting || addingToCart" @click="addSelectedToCart">
          {{ addingToCart ? "加入中..." : "加入购物车" }}
        </button>
        <button class="primary-button submit" :disabled="submitting" @click="submitOrder">
          {{ submitting ? "提交中..." : "提交订单" }}
        </button>
      </view>
    </view>
    <WechatProfilePrompt />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import {
  getConferenceDetail,
  getConferenceForm,
  normalizeOptions,
  type ConferenceDetail,
  type ConferenceForm,
  type FormField,
  type FormOption
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

onLoad((query) => {
  conferenceId.value = String(query?.conferenceId || "");
  selectedSkuId.value = String(query?.skuId || "");
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
    const [detail, formResponse] = await Promise.all([getConferenceDetail(conferenceId.value), getConferenceForm(conferenceId.value)]);
    conference.value = detail;
    form.value = formResponse;

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
  min-height: 100vh;
  padding: 28rpx;
  box-sizing: border-box;
  padding-bottom: 172rpx;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section {
  padding: 28rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.title,
.section-title,
.sku-name,
.quote-price {
  display: block;
  color: #172033;
  font-weight: 800;
}

.title {
  font-size: 38rpx;
  line-height: 1.35;
}

.summary,
.sku-desc,
.hint {
  color: #5c6b82;
  font-size: 26rpx;
  line-height: 1.5;
}

.section-title {
  margin-bottom: 18rpx;
  font-size: 31rpx;
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
  padding: 22rpx;
  border: 1px solid #e1e8f2;
  border-radius: 8px;
  background: #fbfcff;
}

.selected {
  border-color: #2452a8;
  background: #eef4ff;
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
  font-size: 29rpx;
}

.price {
  color: #2452a8;
  font-size: 30rpx;
  font-weight: 800;
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
  border-radius: 8px;
  background: #2452a8;
  color: #ffffff;
  font-size: 28rpx;
  line-height: 54rpx;
}

.qty-value {
  min-width: 36rpx;
  color: #172033;
  text-align: center;
  font-size: 28rpx;
  font-weight: 800;
}

.attendee-card {
  margin-top: 22rpx;
  padding-top: 22rpx;
  border-top: 1px solid #e4eaf3;
}

.attendee-title {
  display: block;
  color: #2452a8;
  font-size: 28rpx;
  font-weight: 800;
}

.coupon-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-top: 20rpx;
}

.coupon-input {
  flex: 1;
  min-height: 78rpx;
  padding: 0 22rpx;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  background: #ffffff;
  color: #172033;
  font-size: 27rpx;
  box-sizing: border-box;
}

.quote-stack {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1px solid #e4eaf3;
  color: #5c6b82;
  font-size: 27rpx;
}

.quote-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.discount-line,
.discount-title {
  color: #b45309;
}

.discount-title {
  font-size: 24rpx;
}

.total-line {
  margin-top: 4rpx;
}

.quote-price {
  color: #c2410c;
  font-size: 34rpx;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  margin-top: 22rpx;
}

.label {
  color: #24324a;
  font-size: 27rpx;
  font-weight: 700;
}

.required,
.error-text {
  color: #b42318;
}

.input,
.textarea,
.picker-value {
  min-height: 82rpx;
  padding: 0 22rpx;
  border: 1px solid #d8e0ee;
  border-radius: 8px;
  background: #ffffff;
  color: #172033;
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
  color: #24324a;
  font-size: 27rpx;
}

.footer {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
  padding: 20rpx 28rpx 34rpx;
  border-top: 1px solid #dce3ef;
  background: #ffffff;
  box-sizing: border-box;
}

.footer-price {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  color: #5c6b82;
  font-size: 24rpx;
}

.primary-button,
.ghost-button {
  min-height: 78rpx;
  border-radius: 8px;
  font-size: 28rpx;
  line-height: 78rpx;
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

.submit {
  width: 230rpx;
}

.secondary-submit {
  color: #2452a8;
}

.compact {
  width: 200rpx;
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
