<template>
  <view class="page">
    <view v-if="loading" class="state">加载报名信息中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="loadPage">重试</button>
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
            :class="['sku-card', selectedSkuId === sku.id ? 'selected' : '']"
            @click="selectSku(sku.id)"
          >
            <view class="sku-main">
              <text class="sku-name">{{ sku.name }}</text>
              <text class="sku-desc">{{ sku.description || "标准报名规格" }}</text>
            </view>
            <text class="price">¥{{ formatCent(sku.priceCent) }}</text>
          </view>
        </view>
        <view v-if="quoteLoading" class="hint">正在计算价格...</view>
        <view v-else-if="quoteError" class="hint error-text">{{ quoteError }}</view>
        <view v-else-if="quote" class="quote">
          <text>应付金额</text>
          <text class="quote-price">¥{{ formatCent(quote.payableAmountCent) }}</text>
        </view>
      </view>

      <view class="section">
        <text class="section-title">报名表单</text>
        <view v-for="field in form.fields" :key="field.id" class="field">
          <text class="label">{{ field.label }}<text v-if="field.required" class="required">*</text></text>

          <input
            v-if="isTextInput(field.type)"
            class="input"
            :type="inputType(field.type)"
            :placeholder="field.placeholder || `请输入${field.label}`"
            :value="textValue(field.key)"
            @input="setEventTextValue(field.key, $event)"
          />

          <textarea
            v-else-if="normalizeFieldType(field.type) === 'textarea'"
            class="textarea"
            :placeholder="field.placeholder || `请输入${field.label}`"
            :value="textValue(field.key)"
            @input="setEventTextValue(field.key, $event)"
          />

          <picker
            v-else-if="normalizeFieldType(field.type) === 'select'"
            mode="selector"
            range-key="label"
            :range="fieldOptions(field)"
            @change="setPickerEventValue(field.key, fieldOptions(field), $event)"
          >
            <view class="picker-value">{{ textValue(field.key) || field.placeholder || `请选择${field.label}` }}</view>
          </picker>

          <radio-group
            v-else-if="normalizeFieldType(field.type) === 'radio'"
            class="choice-group"
            @change="setEventTextValue(field.key, $event)"
          >
            <label v-for="option in fieldOptions(field)" :key="option.value" class="choice">
              <radio :value="option.value" :checked="textValue(field.key) === option.value" />
              <text>{{ option.label }}</text>
            </label>
          </radio-group>

          <checkbox-group
            v-else-if="normalizeFieldType(field.type) === 'checkbox'"
            class="choice-group"
            @change="setEventArrayValue(field.key, $event)"
          >
            <label v-for="option in fieldOptions(field)" :key="option.value" class="choice">
              <checkbox :value="option.value" :checked="arrayValue(field.key).includes(option.value)" />
              <text>{{ option.label }}</text>
            </label>
          </checkbox-group>

          <picker
            v-else-if="normalizeFieldType(field.type) === 'date'"
            mode="date"
            @change="setEventTextValue(field.key, $event)"
          >
            <view class="picker-value">{{ textValue(field.key) || field.placeholder || `请选择${field.label}` }}</view>
          </picker>

          <input
            v-else
            class="input"
            :placeholder="field.placeholder || `请输入${field.label}`"
            :value="textValue(field.key)"
            @input="setEventTextValue(field.key, $event)"
          />
        </view>
      </view>

      <view class="footer">
        <view class="footer-price">
          <text>合计</text>
          <text class="quote-price">¥{{ formatCent(quote?.payableAmountCent ?? selectedSku?.priceCent ?? 0) }}</text>
        </view>
        <button class="primary-button submit" :disabled="submitting" @click="submitOrder">
          {{ submitting ? "提交中..." : "提交订单" }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import {
  getConferenceDetail,
  getConferenceForm,
  normalizeOptions,
  type ConferenceDetail,
  type ConferenceForm,
  type FormField,
  type FormOption
} from "@/services/conference";
import { ensureLogin } from "@/services/auth";
import { createRegistrationOrder, quoteRegistration, type QuoteResponse } from "@/services/registration";
import { formatCent } from "@/utils/money";

const conferenceId = ref("");
const selectedSkuId = ref("");
const conference = ref<ConferenceDetail | null>(null);
const form = ref<ConferenceForm | null>(null);
const formData = ref<Record<string, string | string[]>>({});
const quote = ref<QuoteResponse | null>(null);
const loading = ref(false);
const quoteLoading = ref(false);
const submitting = ref(false);
const error = ref("");
const quoteError = ref("");

const selectedSku = computed(() => conference.value?.skus.find((sku) => sku.id === selectedSkuId.value) ?? null);

onLoad((query) => {
  conferenceId.value = String(query?.conferenceId || "");
  selectedSkuId.value = String(query?.skuId || "");
  void loadPage();
});

async function loadPage() {
  if (!conferenceId.value) {
    error.value = "缺少会议 ID";
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

    initializeForm(formResponse.fields);
    await loadQuote();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "报名信息加载失败";
  } finally {
    loading.value = false;
  }
}

function initializeForm(fields: FormField[]) {
  const nextData: Record<string, string | string[]> = {};
  for (const field of fields) {
    nextData[field.key] = normalizeFieldType(field.type) === "checkbox" ? [] : "";
  }
  formData.value = nextData;
}

async function selectSku(skuId: string) {
  selectedSkuId.value = skuId;
  await loadQuote();
}

async function loadQuote() {
  if (!conferenceId.value || !selectedSkuId.value) {
    return;
  }

  quoteLoading.value = true;
  quoteError.value = "";

  try {
    quote.value = await quoteRegistration({
      conferenceId: conferenceId.value,
      skuId: selectedSkuId.value,
      quantity: 1
    });
  } catch (err) {
    quote.value = null;
    quoteError.value = err instanceof Error ? err.message : "报价失败";
  } finally {
    quoteLoading.value = false;
  }
}

async function submitOrder() {
  if (!selectedSkuId.value) {
    uni.showToast({ title: "请选择报名规格", icon: "none" });
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
      skuId: selectedSkuId.value,
      quantity: 1,
      formData: formData.value
    });

    uni.navigateTo({
      url: `/pages/payment/result?orderNo=${encodeURIComponent(order.orderNo)}`
    });
  } catch (err) {
    uni.showToast({
      title: err instanceof Error ? err.message : "创建订单失败",
      icon: "none"
    });
  } finally {
    submitting.value = false;
  }
}

function validateForm(): string {
  for (const field of form.value?.fields ?? []) {
    const value = formData.value[field.key];
    if (field.required && isEmpty(value)) {
      return `请填写${field.label}`;
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

function textValue(key: string): string {
  const value = formData.value[key];
  return typeof value === "string" ? value : "";
}

function arrayValue(key: string): string[] {
  const value = formData.value[key];
  return Array.isArray(value) ? value : [];
}

function setTextValue(key: string, value: string) {
  formData.value = {
    ...formData.value,
    [key]: value
  };
}

function setEventTextValue(key: string, event: unknown) {
  setTextValue(key, String(readEventValue(event) ?? ""));
}

function setArrayValue(key: string, value: string[]) {
  formData.value = {
    ...formData.value,
    [key]: value
  };
}

function setEventArrayValue(key: string, event: unknown) {
  const value = readEventValue(event);
  setArrayValue(key, Array.isArray(value) ? value.map(String) : []);
}

function setPickerEventValue(key: string, options: FormOption[], event: unknown) {
  const index = Number(readEventValue(event));
  const option = options[index];
  if (option) {
    setTextValue(key, option.value);
  }
}

function readEventValue(event: unknown): unknown {
  if (typeof event === "object" && event !== null && "detail" in event) {
    const detail = (event as { detail?: { value?: unknown } }).detail;
    return detail?.value;
  }

  return undefined;
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

.sku-name {
  font-size: 29rpx;
}

.price {
  color: #2452a8;
  font-size: 30rpx;
  font-weight: 800;
}

.quote {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1px solid #e4eaf3;
  color: #5c6b82;
  font-size: 27rpx;
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

.primary-button {
  min-height: 78rpx;
  border-radius: 8px;
  background: #2452a8;
  color: #ffffff;
  font-size: 28rpx;
  line-height: 78rpx;
}

.submit {
  width: 280rpx;
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
