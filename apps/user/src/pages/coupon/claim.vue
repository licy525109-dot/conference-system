<template>
  <view class="claim-page">
    <view class="claim-content">
      <view class="heading" :class="{ 'heading--success': success }">
        <wd-icon :name="success ? 'check-circle' : 'lock-on'" size="26px" />
        <text class="title" role="heading" aria-level="1">{{ title }}</text>
      </view>
      <text class="subtitle" role="status" aria-live="polite">{{ message }}</text>

      <view v-if="preview" class="coupon">
        <text class="coupon-name">{{ preview.coupon.name }}</text>
        <text class="coupon-value">{{ discountText }}</text>
        <view class="coupon-details">
          <text class="conditions-title">使用条件</text>
          <text v-if="preview.coupon.conferenceTitle">适用会议：{{ preview.coupon.conferenceTitle }}</text>
          <text v-for="condition in usageConditions" :key="condition" class="usage-condition">{{ condition }}</text>
          <text v-if="preview.coupon.endAt">优惠券有效期至 {{ dateText(preview.coupon.endAt) }}</text>
          <text>领取截止：{{ dateText(preview.expiresAt) }}</text>
          <text v-if="conditionsIncomplete" class="conditions-notice">部分使用条件暂未提供，请在领取前向发券方确认。</text>
        </view>
      </view>

      <view v-if="canClaim && mode === 'token'" class="recipient">
        <text class="recipient-label">受邀手机号</text>
        <text class="recipient-phone">{{ maskedPhone }}</text>
        <text class="recipient-note">仅受邀手机号对应的已验证账号可领取。</text>
      </view>
      <text v-if="feedback" class="feedback" role="alert">{{ feedback }}</text>

      <view class="actions">
        <button v-if="canClaim" role="button" class="ui-button-primary" :disabled="loading" :loading="loading" @click="doClaim">
          {{ loading ? '正在核对' : preview?.status === 'CLAIMED' ? '确认领取结果' : '领取优惠券' }}
        </button>
        <button v-if="previewState === 'error'" role="button" class="ui-button-primary" @click="loadPreview">重新加载</button>
        <button role="button" :class="success ? 'ui-button-primary' : 'ui-button-secondary'" :disabled="loading" @click="goMyCoupons">
          {{ success ? '我的优惠券 / 去使用' : '我的优惠券' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import { ensureLogin } from "@/services/auth";
import { ensureRegistrationProfile } from "@/services/registration-profile";
import { claimCoupon } from "@/services/operations";
import {
  claimCouponDistribution, CouponDistributionError, isCouponDistributionToken, previewCouponDistribution,
  type CouponDistributionPreview
} from "@/services/coupon-distributions";
import { formatCent } from "@/utils/money";

const mode = ref<"token" | "legacy" | "invalid">("invalid");
const token = ref("");
const claimCode = ref("");
const preview = ref<CouponDistributionPreview | null>(null);
const previewState = ref<"loading" | "ready" | "invalid" | "error">("invalid");
const loading = ref(false);
const success = ref(false);
const alreadyClaimed = ref(false);
const feedback = ref("");
const campaignName = ref("");
let pageVersion = 0;

const canClaim = computed(() => !success.value && (mode.value === "legacy" || (mode.value === "token"
  && previewState.value === "ready" && (preview.value?.status === "PENDING" || preview.value?.status === "CLAIMED"))));
const title = computed(() => {
  if (success.value) return alreadyClaimed.value ? "你已领取此优惠券" : "领取成功";
  if (mode.value === "legacy") return "优惠券领取";
  if (previewState.value === "loading") return "正在读取优惠券";
  if (previewState.value === "error") return "暂时无法读取";
  if (previewState.value === "invalid") return "领取链接不可用";
  if (preview.value?.status === "EXPIRED") return "领取邀请已过期";
  if (preview.value?.status === "REVOKED") return "领取邀请已撤销";
  if (preview.value?.status === "CLAIMED") return "此邀请已领取";
  return "领取专属优惠券";
});
const message = computed(() => {
  if (success.value) return `${campaignName.value || preview.value?.coupon.name || "优惠券"} 已在你的优惠券中，可查看使用条件。`;
  if (mode.value === "legacy") return "登录后可领取当前活动批次优惠券。";
  if (previewState.value === "loading") return "正在核对领取邀请，请稍候。";
  if (previewState.value === "error") return "请检查网络后重新加载。";
  if (previewState.value === "invalid") return "链接无效或已失效，请联系发券方核对。";
  if (preview.value?.status === "EXPIRED" || preview.value?.status === "REVOKED") return "本次邀请无法继续领取，请联系发券方。";
  if (preview.value?.status === "CLAIMED") return "受邀本人可确认领取结果，或前往我的优惠券查看。";
  return "请使用受邀手机号对应的微信账号领取。";
});
const maskedPhone = computed(() => {
  const phone = preview.value?.targetPhoneMasked || "";
  return /^\d{3}\s?\*{4}\s?\d{4}$/.test(phone) ? phone : "已隐藏";
});
const discountText = computed(() => {
  const coupon = preview.value?.coupon;
  if (coupon?.type === "AMOUNT" && typeof coupon.discountAmountCent === "number") return `立减 ¥${formatCent(coupon.discountAmountCent)}`;
  if (coupon?.type === "PERCENT" && typeof coupon.discountPercent === "number" && Number.isFinite(coupon.discountPercent)) return `减免 ${coupon.discountPercent / 100}%`;
  return "优惠券";
});
const conditionFields = ["minAmountCent", "minQuantity", "startAt", "maxDiscountCent", "scope", "allowedSkuNames"] as const;
const conditionsIncomplete = computed(() => Boolean(preview.value && conditionFields.some(key => preview.value!.coupon[key] === undefined)));
const usageConditions = computed(() => {
  const coupon = preview.value?.coupon;
  if (!coupon) return [];
  const conditions: string[] = [];
  if (coupon.scope) {
    const scopeLabel = { CONFERENCE: "会议报名", MALL: "商城商品", BOTH: "会议报名及商城商品" }[coupon.scope];
    if (scopeLabel) conditions.push(`适用范围：${scopeLabel}`);
  }
  const itemLabel = coupon.scope === "CONFERENCE" ? "票种" : coupon.scope === "MALL" ? "商品规格" : "票种/商品规格";
  const quantityUnit = coupon.scope === "CONFERENCE" ? "张" : coupon.scope === "MALL" ? "件" : "件/张";
  if (coupon.minAmountCent !== undefined) conditions.push(coupon.minAmountCent !== null && coupon.minAmountCent > 0
    ? `金额门槛：适用${itemLabel}满 ¥${formatCent(coupon.minAmountCent)}` : "金额门槛：无最低金额要求");
  if (coupon.minQuantity !== undefined) conditions.push(coupon.minQuantity !== null && coupon.minQuantity > 0
    ? `数量门槛：适用${itemLabel}满 ${coupon.minQuantity} ${quantityUnit}` : "数量门槛：无最低数量要求");
  if (coupon.startAt !== undefined) conditions.push(coupon.startAt
    ? `使用开始：${dateText(coupon.startAt)}` : "使用开始：无起始时间限制");
  if (coupon.maxDiscountCent !== undefined) conditions.push(coupon.maxDiscountCent !== null
    ? `减免上限：最多 ¥${formatCent(coupon.maxDiscountCent)}` : "减免上限：未设置金额上限");
  if (coupon.allowedSkuNames !== undefined) conditions.push(coupon.allowedSkuNames.length
    ? `适用${itemLabel}：${coupon.allowedSkuNames.join("、")}` : `适用${itemLabel}：不限定规格`);
  return conditions;
});

onLoad((query) => {
  pageVersion += 1;
  token.value = "";
  claimCode.value = "";
  preview.value = null;
  previewState.value = "invalid";
  success.value = false;
  alreadyClaimed.value = false;
  loading.value = false;
  feedback.value = "";
  campaignName.value = "";
  // An invalid private invitation must never fall back to a public campaign claim.
  if (query && Object.prototype.hasOwnProperty.call(query, "token")) {
    mode.value = "token";
    hideSharing();
    if (isCouponDistributionToken(query.token)) {
      token.value = query.token;
      void loadPreview();
    }
    return;
  }
  claimCode.value = typeof query?.claimCode === "string" ? query.claimCode : "";
  mode.value = claimCode.value.trim() ? "legacy" : "invalid";
});
onShow(hideSharing);
onUnload(() => { pageVersion += 1; });

function hideSharing() {
  if (mode.value !== "token") return;
  // #ifdef MP-WEIXIN
  uni.hideShareMenu({ menus: ["shareAppMessage", "shareTimeline"], hideShareItems: ["shareAppMessage", "shareTimeline"] });
  // #endif
}

async function loadPreview() {
  if (!token.value || previewState.value === "loading") return;
  const version = pageVersion;
  previewState.value = "loading";
  preview.value = null;
  feedback.value = "";
  try {
    const result = await previewCouponDistribution(token.value);
    if (version !== pageVersion) return;
    preview.value = result;
    previewState.value = "ready";
  } catch (error) {
    if (version !== pageVersion) return;
    previewState.value = error instanceof CouponDistributionError && error.kind === "INVALID_LINK" ? "invalid" : "error";
  }
}

async function doClaim() {
  if (loading.value || !canClaim.value) return;
  const version = pageVersion;
  loading.value = true;
  feedback.value = "";
  try {
    if (mode.value === "token") {
      await ensureLogin();
      if (version !== pageVersion) return;
      // The profile page owns WechatProfilePrompt and native phone verification.
      // navigateTo preserves this page and token; returning never submits a claim.
      const ready = await ensureRegistrationProfile();
      if (version !== pageVersion) return;
      if (!ready) {
        feedback.value = "请先完成本人手机号验证和资料确认，返回后再次点击领取。";
        return;
      }
      const result = await claimCouponDistribution(token.value);
      if (version !== pageVersion) return;
      alreadyClaimed.value = result.alreadyClaimed;
    } else {
      const result = await claimCoupon(claimCode.value);
      if (version !== pageVersion) return;
      campaignName.value = result.campaign.name;
    }
    success.value = true;
  } catch (error) {
    if (version !== pageVersion) return;
    if (error instanceof CouponDistributionError && error.kind === "INVALID_LINK") {
      preview.value = null;
      previewState.value = "invalid";
    } else {
      feedback.value = error instanceof CouponDistributionError ? error.message : "领取未完成，请确认登录及本人资料后重试。";
    }
  } finally {
    if (version === pageVersion) loading.value = false;
  }
}

function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "以发券方公布时间为准" : date.toLocaleString("zh-CN", { hour12: false });
}

function goMyCoupons() {
  uni.navigateTo({ url: "/pages/coupon/my" });
}
</script>

<style scoped>
.claim-page {
  min-height: 100vh;
  padding: 32px 20px calc(32px + env(safe-area-inset-bottom));
  box-sizing: border-box;
  background: var(--ui-color-bg);
  color: var(--ui-color-text);
  font-size: 16px;
  line-height: 1.65;
  letter-spacing: 0;
}

.claim-content {
  max-width: 560px;
  margin: 0 auto;
}

.heading {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--ui-color-primary-strong);
}

.heading--success {
  color: var(--ui-color-success);
}

.title {
  min-width: 0;
  color: var(--ui-color-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.4;
}

.subtitle {
  display: block;
  margin-top: 16px;
  color: var(--ui-color-muted);
}

.coupon {
  margin-top: 28px;
  padding: 24px;
  border: 1px solid var(--ui-color-border);
  border-radius: 8px;
  background: var(--ui-color-surface);
}

.coupon-name,
.coupon-value,
.recipient-label,
.recipient-phone,
.recipient-note {
  display: block;
}

.coupon-name {
  font-size: 18px;
  font-weight: 600;
}

.coupon-value {
  margin-top: 8px;
  color: var(--ui-color-primary-strong);
  font-size: 28px;
  font-weight: 700;
}

.coupon-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--ui-color-border);
  color: var(--ui-color-muted);
  font-size: 14px;
}

.conditions-title {
  color: var(--ui-color-text);
  font-size: 16px;
  font-weight: 600;
}

.conditions-notice {
  color: var(--ui-color-warning);
}

.recipient {
  margin-top: 24px;
}

.recipient-label,
.recipient-note {
  color: var(--ui-color-muted);
  font-size: 14px;
}

.recipient-phone {
  margin: 4px 0;
  font-size: 20px;
  font-weight: 600;
}

.feedback {
  display: block;
  margin-top: 24px;
  color: var(--ui-color-danger);
}

.actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 28px;
}

.actions button {
  width: 100%;
  min-height: 48px;
  white-space: normal;
  box-sizing: border-box;
}

.actions .ui-button-primary {
  background: var(--ui-color-primary-strong);
  color: var(--cms-text-inverse);
}

.actions button[disabled] {
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-muted);
}

.claim-content text,
.actions button {
  overflow-wrap: anywhere;
}
</style>
