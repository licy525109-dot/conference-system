<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" :poster="String(theme.backgroundVideoPosterUrl || '')" autoplay loop muted playsinline webkit-playsinline object-fit="cover" :controls="false" />
    <view v-if="showBodyVideo" class="page-bg-overlay" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <LoadingState v-if="loading" title="加载报名信息中" description="正在读取票种、价格和报名字段。" />
    <ErrorState
      v-else-if="error"
      :title="authRequired ? '需要微信登录' : '报名信息加载失败'"
      :message="error"
      :primary-text="authRequired ? '微信登录' : '重新加载'"
      secondary-text="返回首页"
      @retry="retryLoadPage"
      @secondary="goHome"
    />
    <view v-else-if="profileRequired" class="profile-required">
      <text class="title">请先完善本人资料</text>
      <text>报名账号需要本人姓名和已验证手机号。已填写的信息仍保留在当前页面。</text>
      <button class="ui-button-primary" @click="retryLoadPage">完善资料并继续</button>
      <button class="ui-button-secondary" @click="goHome">返回首页</button>
    </view>

    <view v-else-if="conference && form" class="content">
      <view class="registration-brief">
        <text class="registration-kicker">会议报名</text>
        <text class="title">{{ conference.title }}</text>
        <view class="registration-brief__meta">
          <view class="registration-brief__meta-item">
            <wd-icon name="time" size="17px" />
            <text>{{ formatDateTime(conference.startsAt) }}</text>
          </view>
          <view v-if="conference.location" class="registration-brief__meta-item">
            <wd-icon name="location" size="17px" />
            <text>{{ conference.location }}</text>
          </view>
        </view>
      </view>

      <FormSection v-if="isRegistrationModuleVisible('skuSelector')" :title="registrationModuleTitle('skuSelector', '选择报名规格')" description="可选择多个票种，系统会为每张票生成一份参会人信息。" step="1">
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

      <FormSection v-if="isRegistrationModuleVisible('attendeeForm')" :title="registrationModuleTitle('attendeeForm', '填写参会人信息')" :description="attendeeSectionDescription" step="2">
        <EmptyState v-if="attendeeForms.length === 0" title="请先选择报名票数" description="选择票数后，这里会自动生成参会人表单。" mark="人" />
        <view v-for="attendee in attendeeForms" :key="attendee.key" class="attendee-card">
          <text class="attendee-title">{{ attendee.skuName }} 第 {{ attendee.index + 1 }} 位参会人</text>
          <button class="ui-button-secondary ui-button-compact" @click="fillPreviousGuest(attendee.key)">填写本人 / 使用历史参会人资料</button>
          <checkbox-group v-if="canDeclareSelf" :key="`${attendee.key}-${selfChoiceRevision}`" @change="setSelfAttendee(attendee.key, $event)">
            <label class="self-choice"><checkbox value="self" :checked="attendee.isSelf" /><text>这是我本人参会</text></label>
          </checkbox-group>
          <text class="identity-hint">{{ attendee.isSelf ? '本人参会：资格将关联当前账号' : '代填资料：不会自动绑定为当前账号本人' }}</text>
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

      <FormSection v-if="isRegistrationModuleVisible('couponFee') && (usableCoupons.length > 0 || couponCode)" title="本次优惠" step="3">
        <view class="coupon-row">
          <button v-if="usableCoupons.length" class="ui-button-secondary ui-button-compact coupon-button coupon-button--wide" :disabled="couponSelectorLoading" @click="selectMyCoupon">{{ couponCode ? '更换已领取优惠' : '使用已领取优惠' }}</button>
          <button v-if="couponCode" class="ui-button-secondary ui-button-compact" @click="couponCode = ''; loadQuote()">不使用优惠</button>
        </view>
        <view v-if="quoteError" class="coupon-feedback is-error">
          <wd-icon name="warning" size="16px" />
          <text>{{ quoteError }}</text>
        </view>
        <view v-else-if="couponCode.trim() && (quote?.discountAmountCent ?? 0) > 0" class="coupon-feedback is-success">
          <wd-icon name="check" size="16px" />
          <text>本次已优惠 ¥{{ formatCent(quote?.discountAmountCent ?? 0) }}</text>
        </view>
      </FormSection>
    </view>
    <WechatProfilePrompt />
    <FixedBottomActionBar
      v-if="conference && form && !profileRequired && !error && isRegistrationModuleVisible('submitOrder')"
      amount-label="合计"
      :amount-value="`¥${formatCent(payableAmountCent)}`"
      :primary-text="registrationModuleContent('submitOrder', '提交订单')"
      :secondary-text="isRegistrationModuleVisible('addCartButton') ? (addingToCart ? '加入中...' : registrationModuleContent('addCartButton', '加入购物车')) : ''"
      :loading="submitting"
      loading-text="提交中..."
      :primary-disabled="submitting || addingToCart || quoteLoading || totalTickets === 0"
      :secondary-disabled="submitting || addingToCart || quoteLoading || totalTickets === 0"
      @primary="submitOrder"
      @secondary="addSelectedToCart"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import FixedBottomActionBar from "@/components/ui/FixedBottomActionBar.vue";
import FormSection from "@/components/ui/FormSection.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
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
import { clearExpiredAuthSession, ensureAuthenticatedUser, getStoredUser, isAuthSessionExpiredError } from "@/services/auth";
import { ensureRegistrationProfile } from "@/services/registration-profile";
import { addRegistrationCartItem } from "@/services/cart";
import { createRegistrationOrder, quoteRegistration, type QuoteResponse, type RegistrationOrderItem } from "@/services/registration";
import { getMyCoupons, type MyCouponItem } from "@/services/operations";
import { ApiRequestError } from "@/services/request";
import { formatCent } from "@/utils/money";
import { formatDateTime } from "@/utils/date";
import { goHome } from "@/utils/navigation";
import { remainingRegistrationStock } from "@/utils/registration-stock";
import { getReusableProfiles } from "@/services/guest-profiles";
import { attendeeMatchesSelf, preserveQuantities, registrationProfileReady, reuseAttendeeAnswers } from "@/utils/registration-identity";
import { couponFitsRegistration, readPendingRegistrationCoupon } from "@/utils/registration-coupons";

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
const authRequired = ref(false);
const profileRequired = ref(false);
const selfChoiceRevision = ref(0);
const quoteError = ref("");
const couponCode = ref("");
const couponSelectorLoading = ref(false);
const claimedCoupons = ref<MyCouponItem[]>([]);
const usableCoupons = computed(() => claimedCoupons.value.filter(item => item.usable && couponFitsSelectedSku(item)));
let awaitingProfile = false;
let initialized = false;
let quoteRequest = 0;
const canDeclareSelf = computed(() => form.value?.fields.some(field => field.key === "name") && form.value?.fields.some(field => field.key === "phone"));
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
  couponCode.value = readInitialCouponCode(query, "CONFERENCE");
  void refreshTheme();
  void loadPage();
});
onShow(() => {
  if (awaitingProfile && !loading.value) {
    awaitingProfile = false;
    // Cancelling or navigating back is not permission to reopen the profile prompt.
    if (registrationProfileReady(getStoredUser())) void loadPage();
  } else if (initialized && !loading.value) {
    void refreshCoupons();
  }
});

function readInitialCouponCode(query: Record<string, unknown> | undefined, scope: "CONFERENCE" | "MALL"): string {
  const direct = typeof query?.couponCode === "string" ? query.couponCode.trim() : "";
  if (direct) return direct;
  return takePendingCoupon();
}

function takePendingCoupon(): string {
  const code = readPendingRegistrationCoupon(uni.getStorageSync("pendingCouponForUse"), conferenceId.value, getStoredUser()?.id || "");
  if (code) uni.removeStorageSync("pendingCouponForUse");
  return code;
}

async function loadPage() {
  if (loading.value) return;
  if (!conferenceId.value) {
    error.value = "页面信息不完整，请返回首页重新进入";
    return;
  }

  loading.value = true;
  error.value = "";
  authRequired.value = false;

  try {
    if (!(await requireProfile())) return;
    const [detail, formResponse, page] = await Promise.all([
      getConferenceDetail(conferenceId.value),
      getConferenceForm(conferenceId.value),
      getPublishedPage("registration-form", { conferenceId: conferenceId.value }).catch(() => null)
    ]);
    conference.value = detail;
    form.value = formResponse;
    cmsPage.value = page;

    const availability = getRegistrationAvailability(detail);
    if (availability !== "OPEN") {
      error.value = availability === "NOT_STARTED" ? "报名尚未开始，请先在会议详情或排期页预约报名。" : "报名已截止，不能继续提交报名。";
      return;
    }

    if (!selectedSkuId.value && detail.skus[0]) {
      selectedSkuId.value = detail.skus[0].id;
    }

    if (!selectedSkuId.value) {
      error.value = "页面信息不完整，请返回首页重新进入";
      return;
    }

    initializeQuantities(detail);
    initialized = true;
    syncAttendeeForms(formResponse.fields);
    await loadQuote();
    void refreshCoupons();
  } catch (err) {
    console.error("[REGISTRATION_FORM_LOAD_ERROR]", err);
    if (isAuthSessionExpiredError(err)) {
      clearExpiredAuthSession();
      authRequired.value = true;
      error.value = "登录后才能填写和提交报名信息。";
    } else {
      error.value = "报名信息加载失败，请稍后重试";
    }
  } finally {
    loading.value = false;
  }
}

async function refreshCoupons() {
  try {
    claimedCoupons.value = (await getMyCoupons({ scope: "CONFERENCE" })).items;
    const pending = takePendingCoupon();
    if (pending && !couponCode.value) { couponCode.value = pending; await loadQuote(); }
  } catch { claimedCoupons.value = []; }
}

async function requireProfile() {
  const ready = await ensureRegistrationProfile();
  profileRequired.value = !ready;
  awaitingProfile = !ready;
  return ready;
}

function retryLoadPage() {
  void loadPage();
}

function createEmptyFormData(fields: FormField[]) {
  const nextData: Record<string, string | string[]> = {};
  for (const field of fields) {
    nextData[field.key] = normalizeFieldType(field.type) === "checkbox" ? [] : "";
  }
  return nextData;
}

async function fillPreviousGuest(key: string) {
  try {
    const result = await getReusableProfiles();
    const options = [{ label: `本人：${result.user.realName || '当前账号'}`, isSelf: true, name: result.user.realName || '', phone: result.user.phone || '', company: null, title: null, formDataJson: null, registration: null },
      ...result.attendees.slice(0, 5).map(item => ({ ...item, isSelf: false, label: `历史代填：${item.name} · ${item.registration.conference.title}` }))];
    uni.showActionSheet({ itemList: options.map(o => o.label), success: ({ tapIndex }) => {
      const chosen = options[tapIndex]; const attendee = attendeeForms.value.find(a => a.key === key);
      if (!chosen || !attendee || !form.value) return;
      attendee.formData = reuseAttendeeAnswers(form.value.fields, conferenceId.value, chosen);
      const self = chosen.isSelf && Boolean(canDeclareSelf.value) && attendeeMatchesSelf(attendee.formData, getStoredUser());
      if (self) attendeeForms.value.forEach(other => { other.isSelf = false; });
      attendee.isSelf = self;
      uni.showToast({ title: '已填入，请核对后提交', icon: 'none' });
    } });
  } catch { uni.showToast({ title: '历史资料加载失败，可直接填写', icon: 'none' }); }
}

function initializeQuantities(detail: ConferenceDetail) {
  quantities.value = preserveQuantities(detail.skus, selectedSkuId.value, quantities.value, initialized);
}

function syncAttendeeForms(fields: FormField[]) {
  const existing = new Map(attendeeForms.value.map((item) => [item.key, item]));
  const next: AttendeeFormState[] = [];
  for (const sku of conference.value?.skus ?? []) {
    const quantity = skuQuantity(sku.id);
    for (let index = 0; index < quantity; index += 1) {
      const key = `${sku.id}-${index}`;
      next.push(existing.get(key) ?? { key, skuId: sku.id, skuName: sku.name, index, isSelf: false, formData: createEmptyFormData(fields) });
    }
  }
  attendeeForms.value = next;
}

async function changeSkuQuantity(skuId: string, delta: number) {
  const current = skuQuantity(skuId);
  const sku = conference.value?.skus.find((item) => item.id === skuId);
  const max = remainingRegistrationStock(sku ?? {});
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
  const remaining = remainingRegistrationStock(sku);
  if (remaining <= 0) return "已售罄";
  if (stockDisplayMode.value === "EXACT") return `剩余 ${remaining} / ${sku.stock}`;
  return remaining <= displaySettings.value.lowStockThreshold ? "库存紧张" : "名额充足";
}

async function loadQuote() {
  const requestId = ++quoteRequest;
  if (!conferenceId.value || selectedItems.value.length === 0) {
    quote.value = null;
    quoteLoading.value = false;
    return;
  }

  quoteLoading.value = true;
  quoteError.value = "";

  try {
    const result = await quoteRegistration({
      conferenceId: conferenceId.value,
      items: selectedItems.value,
      couponCode: normalizedCouponCode()
    });
    if (requestId === quoteRequest) quote.value = result;
  } catch (err) {
    if (requestId !== quoteRequest) return;
    console.error("[REGISTRATION_QUOTE_ERROR]", err);
    quote.value = null;
    quoteError.value = buildQuoteErrorMessage(err);
  } finally {
    if (requestId === quoteRequest) quoteLoading.value = false;
  }
}

async function submitOrder() {
  if (submitting.value || addingToCart.value) return;
  const availability = getRegistrationAvailability(conference.value);
  if (availability !== "OPEN") {
    uni.showToast({ title: availability === "NOT_STARTED" ? "报名尚未开始" : "报名已截止", icon: "none" });
    return;
  }

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
    if (!(await requireProfile())) return;
    const identityError = validateSelfDeclarations();
    if (identityError) { uni.showToast({ title: identityError, icon: "none" }); return; }
    const order = await createRegistrationOrder({
      conferenceId: conferenceId.value,
      items: selectedItems.value,
      couponCode: normalizedCouponCode(),
      attendees: attendeeForms.value.map((attendee) => ({
        skuId: attendee.skuId,
        isSelf: attendee.isSelf,
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
      promptLoginRetry("重新登录后可继续提交，已填写的内容会保留。", () => void submitOrder());
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
  if (submitting.value || addingToCart.value) return;
  const availability = getRegistrationAvailability(conference.value);
  if (availability !== "OPEN") {
    uni.showToast({ title: availability === "NOT_STARTED" ? "报名尚未开始" : "报名已截止", icon: "none" });
    return;
  }

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
    if (!(await requireProfile())) return;
    for (const item of selectedItems.value) {
      await addRegistrationCartItem({
        conferenceId: conferenceId.value,
        skuId: item.skuId,
        quantity: item.quantity,
        couponCode: normalizedCouponCode(),
        attendees: attendeeForms.value.filter((attendee) => attendee.skuId === item.skuId).map((attendee) => ({ formData: attendee.formData, isSelf: attendee.isSelf }))
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
      promptLoginRetry("重新登录后可继续加入购物车，已填写的内容会保留。", () => void addSelectedToCart());
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

async function selectMyCoupon() {
  couponSelectorLoading.value = true;
  try {
    await ensureAuthenticatedUser();
    const response = await getMyCoupons({ scope: "CONFERENCE" });
    const usable = response.items.filter((item) => item.usable && couponFitsSelectedSku(item)).slice(0, 6);
    if (usable.length === 0) {
      uni.showToast({ title: "暂无可用于本次报名的优惠券", icon: "none" });
      return;
    }
    uni.showActionSheet({
      itemList: usable.map(formatCouponOption),
      success: async ({ tapIndex }) => {
        const selected = usable[tapIndex];
        if (!selected) return;
        couponCode.value = selected.coupon.code;
        await loadQuote();
      }
    });
  } catch (err) {
    console.error("[REGISTRATION_COUPON_SELECT_ERROR]", err);
    uni.showToast({ title: "优惠券加载失败", icon: "none" });
  } finally {
    couponSelectorLoading.value = false;
  }
}

function promptLoginRetry(content: string, retry: () => void) {
  uni.showModal({
    title: "需要微信登录",
    content,
    confirmText: "重新登录",
    cancelText: "稍后再试",
    success: (result) => {
      if (result.confirm) retry();
    }
  });
}

function couponFitsSelectedSku(item: MyCouponItem) {
  return couponFitsRegistration(item, conferenceId.value, selectedItems.value.map(entry => ({ ...entry, priceCent: conference.value?.skus.find(sku => sku.id === entry.skuId)?.priceCent ?? 0 })));
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
  const identityError = validateSelfDeclarations();
  if (identityError) return identityError;
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

function validateSelfDeclarations(): string {
  if (attendeeForms.value.some(attendee => attendee.isSelf && !attendeeMatchesSelf(attendee.formData, getStoredUser()))) {
    return "本人参会的姓名和手机号需与已验证账号一致，请核对或取消本人参会";
  }
  return "";
}

function setSelfAttendee(key: string, event: unknown) {
  selfChoiceRevision.value += 1;
  const checked = readEventValue(event);
  const attendee = attendeeForms.value.find(item => item.key === key);
  if (!attendee) return;
  const isSelf = Array.isArray(checked) && checked.includes("self");
  if (isSelf && !attendeeMatchesSelf(attendee.formData, getStoredUser())) {
    uni.showToast({ title: "请先填入本人姓名和已验证手机号", icon: "none" });
    attendee.isSelf = false;
    return;
  }
  attendeeForms.value = attendeeForms.value.map(item => ({ ...item, isSelf: item.key === key ? isSelf : isSelf ? false : item.isSelf }));
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
  const current = attendeeForms.value.find(attendee => attendee.key === attendeeKey);
  const invalidatesSelf = current?.isSelf && !attendeeMatchesSelf({ ...current.formData, [fieldKey]: value }, getStoredUser());
  attendeeForms.value = attendeeForms.value.map((attendee) =>
    attendee.key === attendeeKey
      ? {
          ...attendee,
          isSelf: invalidatesSelf ? false : attendee.isSelf,
          formData: {
            ...attendee.formData,
            [fieldKey]: value
          }
        }
      : attendee
  );
  if (invalidatesSelf) uni.showToast({ title: "参会人信息已变化，已取消本人参会", icon: "none" });
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
    lowStockThreshold: Number.isFinite(Number(source.lowStockThreshold)) ? Math.max(1, Number(source.lowStockThreshold)) : 10,
    modules: normalizeRegistrationModules(source)
  };
}

function readCmsBusinessDisplay(page: PublishedPage | null): Record<string, unknown> {
  const themeJson = readRecord(page?.version.themeJson);
  const businessDisplay = readRecord(themeJson.businessDisplay);
  return readRecord(businessDisplay.registrationForm ?? businessDisplay.conferenceDetail ?? themeJson.detailDisplay);
}

function normalizeRegistrationModules(source: Record<string, unknown>) {
  const defaults = [
    { key: "skuSelector", title: "选择报名规格", content: "", visible: true, sort: 20 },
    { key: "attendeeForm", title: "填写参会人信息", content: "", visible: true, sort: 30 },
    { key: "couponFee", title: "优惠码", content: "", visible: true, sort: 40 },
    { key: "inventory", title: "库存展示", content: "", visible: true, sort: 50 },
    { key: "addCartButton", title: "加入购物车", content: "加入购物车", visible: true, sort: 60 },
    { key: "submitOrder", title: "提交订单", content: "提交订单", visible: true, sort: 70 }
  ];
  const rawModules = Array.isArray(source.modules) ? source.modules : [];
  return defaults.map((item) => {
    const record = readRecord(rawModules.find((raw) => readRecord(raw).key === item.key));
    return {
      ...item,
      visible: typeof record.visible === "boolean" ? record.visible : item.visible,
      title: typeof record.title === "string" && record.title.trim() ? record.title.trim() : item.title,
      content: typeof record.content === "string" && record.content.trim() ? record.content.trim() : item.content,
      sort: Number.isFinite(Number(record.sort)) ? Number(record.sort) : item.sort
    };
  });
}

function registrationModule(key: string) {
  return displaySettings.value.modules.find((item) => item.key === key);
}

function isRegistrationModuleVisible(key: string): boolean {
  return registrationModule(key)?.visible !== false;
}

function registrationModuleTitle(key: string, fallback: string): string {
  const title = registrationModule(key)?.title || fallback;
  if (key === "couponFee" && title === "优惠与费用") return "优惠码";
  if (key === "attendeeForm" && title === "参会人信息") return "填写参会人信息";
  return title;
}

function registrationModuleContent(key: string, fallback: string): string {
  return registrationModule(key)?.content || fallback;
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function getRegistrationAvailability(detail: ConferenceDetail | null): "OPEN" | "NOT_STARTED" | "ENDED" {
  if (!detail) return "OPEN";
  const now = Date.now();
  const regStart = parseDateTime(detail.registrationStartsAt || detail.startsAt);
  const regEnd = parseDateTime(detail.registrationEndsAt || detail.endsAt);
  if (Number.isFinite(regEnd) && now > regEnd) return "ENDED";
  if (Number.isFinite(regStart) && now < regStart) return "NOT_STARTED";
  return "OPEN";
}

function parseDateTime(value: string | null | undefined): number {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

interface AttendeeFormState {
  key: string;
  skuId: string;
  skuName: string;
  index: number;
  isSelf: boolean;
  formData: Record<string, string | string[]>;
}
</script>

<style scoped>
.profile-required { padding: 32rpx; display: flex; flex-direction: column; gap: 24rpx; font-size: 32rpx; line-height: 1.7; }
.self-choice { display: flex; align-items: center; gap: 12rpx; margin-top: 24rpx; font-size: 32rpx; }
.identity-hint { display: block; margin-top: 12rpx; font-size: 28rpx; color: var(--ui-color-muted); line-height: 1.6; }
.page {
  padding-bottom: 224rpx;
}

.content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.registration-brief {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  padding: 34rpx 30rpx 30rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.registration-kicker {
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
  line-height: 1.2;
}

.registration-brief__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx 24rpx;
  margin-top: 2rpx;
}

.registration-brief__meta-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8rpx;
  color: var(--ui-color-muted);
  font-size: 24rpx;
  line-height: 1.4;
}

.title {
  display: block;
  color: var(--ui-color-text);
  font-size: 36rpx;
  font-weight: 900;
  line-height: 1.4;
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

.sku-list {
  display: flex;
  flex-direction: column;
}

.sku-card {
  display: flex;
  justify-content: space-between;
  gap: 20rpx;
  padding: 24rpx 4rpx;
  border-bottom: 1px solid var(--ui-color-border);
  background: transparent;
}

.sku-card:first-child {
  padding-top: 4rpx;
}

.sku-card:last-child {
  padding-bottom: 4rpx;
  border-bottom: 0;
}

.sku-card.selected .sku-name {
  color: var(--ui-color-primary);
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
  flex-wrap: wrap;
  align-items: center;
  gap: 16rpx;
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
  min-width: 120rpx;
}

.coupon-button--wide {
  min-width: 190rpx;
}

.coupon-feedback {
  display: flex;
  align-items: center;
  gap: 8rpx;
  margin-top: 18rpx;
  font-size: 24rpx;
  line-height: 1.45;
}

.coupon-feedback.is-error {
  color: var(--ui-color-danger);
}

.coupon-feedback.is-success {
  color: #14724a;
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
