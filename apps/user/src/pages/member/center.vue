<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted object-fit="cover" :controls="false" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />

    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">会员</text>
        <text class="title">会员中心</text>
        <text class="subtitle">会员价会在报名报价和下单时由后端自动计算，前端金额不作为支付依据。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="goHome">首页</button>
    </view>

    <ExtensionStatusNotice
      status="运营中"
      title="会员购买支付暂未开放"
      :description="purchaseMessage"
      tone="info"
    />

    <view class="profile-card ui-card">
      <image v-if="user?.wechatAvatarUrl" class="avatar" :src="user.wechatAvatarUrl" mode="aspectFill" />
      <view v-else class="avatar placeholder">{{ displayName.slice(0, 1) }}</view>
      <view>
        <text class="name">{{ displayName }}</text>
        <text class="muted">{{ user?.phone || user?.openid || "已登录小程序账号" }}</text>
      </view>
    </view>

    <button v-if="hasAdminAccess" class="admin-entry ui-button-primary" @click="goAdminNotifications">管理员通知中心</button>
    <view class="quick-links ui-card">
      <button class="ui-button-secondary" @click="goPage('/pages/registrations/my')">我的报名</button>
      <button class="ui-button-secondary" @click="goPage('/pages/coupon/my')">我的优惠券</button>
      <button class="ui-button-secondary" @click="goPage('/pages/mall/orders')">商城订单</button>
      <button class="ui-button-secondary" @click="goPage('/pages/refund/index')">我的退款</button>
      <button class="ui-button-secondary" @click="goPage('/pages/invoice/index')">发票申请</button>
    </view>

    <LoadingState v-if="loading" title="加载会员信息中" description="正在读取会员等级、权益和发放记录。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回首页" @retry="load" @secondary="goHome" />

    <view v-else class="section">
      <view class="member-card ui-card">
        <view class="section-head">
          <text class="section-title">当前会员</text>
          <StatusTag :label="membership ? statusText(membership.status) : '普通用户'" :tone="membership ? 'success' : 'neutral'" />
        </view>
        <template v-if="membership">
          <text class="member-name">{{ membership.level.name }}</text>
          <text class="muted">有效期：{{ formatDate(membership.startsAt) }} 至 {{ membership.endsAt ? formatDate(membership.endsAt) : "长期有效" }}</text>
          <text class="muted">{{ membership.level.pricingEnabled === false ? "该等级当前不参与报名会员价。" : "报名会员价会以后端 quote/create order 计算结果为准。" }}</text>
        </template>
        <template v-else>
          <text class="member-name">普通用户</text>
          <text class="muted">暂无有效会员等级，报名按普通票价和可用营销优惠计算。</text>
        </template>
      </view>

      <view class="grants ui-card">
        <view class="section-head">
          <text class="section-title">我的权益</text>
          <StatusTag :label="`${grants.length} 项`" tone="info" />
        </view>
        <view v-if="grants.length" class="grant-list">
          <view v-for="grant in grants" :key="grant.id" class="grant-item">
            <view>
              <text class="benefit-title">{{ grant.benefit.title }}</text>
              <text class="muted">{{ grant.benefit.description || grant.benefit.grantRule || '会员权益' }}</text>
              <text class="muted">发放：{{ formatDate(grant.grantedAt) }} · 到期：{{ grant.expiredAt ? formatDate(grant.expiredAt) : '长期' }}</text>
            </view>
            <StatusTag :label="grantStatusText(grant.status)" :tone="grant.status === 'GRANTED' ? 'success' : 'neutral'" />
          </view>
        </view>
        <text v-else class="muted empty-line">暂无已发放权益。展示型权益可在下方等级说明中查看。</text>
      </view>

      <view class="levels">
        <text class="section-title">会员等级与权益说明</text>
        <EmptyState v-if="levels.length === 0" title="暂无会员等级" description="后台尚未配置可展示的会员等级。" mark="会" />
        <view v-for="level in levels" :key="level.id" class="level-card">
          <view>
            <view class="level-title-row">
              <text class="level-name">{{ level.name }}</text>
              <StatusTag :label="level.pricingEnabled === false ? '不参与会员价' : '参与会员价'" :tone="level.pricingEnabled === false ? 'neutral' : 'success'" />
            </view>
            <text class="muted">{{ level.description || "会员权益以后台配置为准" }}</text>
            <view v-if="level.benefits?.length" class="benefits">
              <text v-for="benefit in level.benefits" :key="benefit.id" class="benefit">{{ benefit.title }}</text>
            </view>
            <text v-else class="benefit muted-benefit">暂无展示权益</text>
          </view>
          <view class="level-side">
            <text class="price">¥{{ formatCent(level.priceCent) }}</text>
            <text v-if="level.discountPercent" class="muted discount">展示折扣 {{ formatDiscount(level.discountPercent) }}</text>
            <text class="muted discount">{{ level.defaultDays ? `${level.defaultDays} 天` : "长期" }}</text>
          </view>
        </view>
      </view>
    </view>

    <WechatProfilePrompt />
    <CustomTabbar active-page-key="member-center" />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import CustomTabbar from "@/components/CustomTabbar.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import ExtensionStatusNotice from "@/components/ui/ExtensionStatusNotice.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import ThemeDynamicBackground from "@/components/ThemeDynamicBackground.vue";
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { useCmsPageTheme } from "@/composables/useCmsPageTheme";
import { createMobileAdminSession } from "@/services/admin-mobile";
import { ensureLogin, getStoredUser, type CurrentUser } from "@/services/auth";
import { getMemberCenter, type CurrentMembership, type MemberBenefitGrant, type MemberLevel } from "@/services/member";
import { goHome } from "@/utils/navigation";

const loading = ref(false);
const error = ref("");
const user = ref<CurrentUser | null>(getStoredUser());
const membership = ref<CurrentMembership | null>(null);
const levels = ref<MemberLevel[]>([]);
const grants = ref<MemberBenefitGrant[]>([]);
const purchaseMessage = ref("会员购买支付暂未开放，可联系会务组或等待后台授予。");
const hasAdminAccess = ref(false);
const displayName = computed(() => user.value?.wechatNickname || user.value?.nickname || "微信用户");
const { theme, pageStyle, showBodyVideo, showBodyDynamicBackground, refreshTheme } = useCmsPageTheme("member-center");

onMounted(() => {
  void refreshTheme();
  void load();
  void checkAdminAccess();
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    await ensureLogin();
    user.value = getStoredUser();
    const data = await getMemberCenter();
    levels.value = data.levels;
    membership.value = data.membership;
    grants.value = data.grants;
    purchaseMessage.value = data.purchase.message;
  } catch (err) {
    console.error("[MEMBER_CENTER_LOAD_ERROR]", err);
    error.value = "会员信息加载失败，请稍后重试";
  } finally {
    loading.value = false;
  }
}

async function checkAdminAccess() {
  try {
    await createMobileAdminSession();
    hasAdminAccess.value = true;
  } catch {
    hasAdminAccess.value = false;
  }
}

function goAdminNotifications() {
  uni.navigateTo({ url: "/pages/admin/notifications/index" });
}

function goPage(url: string) {
  uni.navigateTo({ url });
}

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function formatDiscount(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}

function statusText(value: string) {
  return ({ ACTIVE: "有效会员", EXPIRED: "已过期", DISABLED: "已停用", CANCELLED: "已取消" } as Record<string, string>)[value] || value;
}

function grantStatusText(value: string) {
  return ({ GRANTED: "已领取", USED: "已使用", EXPIRED: "已过期", REVOKED: "已撤销", FAILED: "发放失败" } as Record<string, string>)[value] || value;
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.topbar,
.profile-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.topbar {
  padding: 28rpx;
}

.eyebrow,
.muted {
  display: block;
  color: var(--ui-color-muted);
  font-size: 24rpx;
}

.eyebrow {
  color: var(--ui-color-primary);
  font-weight: 800;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: var(--ui-color-text);
  font-size: 42rpx;
  font-weight: 900;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.profile-card,
.member-card,
.level-card,
.grants {
  padding: 28rpx;
}

.profile-card {
  justify-content: flex-start;
}

.admin-entry {
  width: 100%;
}

.quick-links {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16rpx;
  padding: 24rpx;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: var(--ui-color-primary-soft);
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ui-color-primary);
  font-weight: 800;
}

.name,
.member-name,
.level-name,
.section-title,
.benefit-title {
  display: block;
  color: var(--ui-color-text);
  font-weight: 800;
}

.name {
  font-size: 34rpx;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.section-head,
.level-title-row,
.grant-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.member-name {
  margin-top: 18rpx;
  font-size: 38rpx;
}

.levels,
.grant-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.level-card,
.grant-item {
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
}

.level-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  padding: 28rpx;
}

.grant-item {
  padding: 22rpx;
}

.benefits {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  margin-top: 14rpx;
}

.benefit {
  display: inline-flex;
  padding: 8rpx 14rpx;
  border-radius: 999px;
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-muted);
  font-size: 22rpx;
  line-height: 1.2;
}

.muted-benefit,
.empty-line {
  margin-top: 12rpx;
}

.level-side {
  flex: 0 0 164rpx;
  text-align: right;
}

.price {
  display: block;
  color: var(--ui-color-primary);
  font-size: 30rpx;
  font-weight: 800;
}

.discount {
  margin-top: 6rpx;
  font-size: 22rpx;
}
</style>
