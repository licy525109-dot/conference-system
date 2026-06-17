<template>
  <view class="page ui-page" :style="pageStyle">
    <video v-if="showBodyVideo" class="page-bg-video" :src="String(theme.backgroundVideoUrl)" autoplay loop muted object-fit="cover" :controls="false" />
    <ThemeDynamicBackground v-if="showBodyDynamicBackground" :theme="theme" placement="fixed" />
    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">扩展能力</text>
        <text class="title">会员与账号</text>
        <text class="subtitle">会员权益用于展示和后续运营，不参与当前会议报名价格计算。</text>
      </view>
      <button class="ui-button-secondary ui-button-compact" @click="goHome">首页</button>
    </view>

    <ExtensionStatusNotice
      status="后续参与定价"
      title="会员权益展示中"
      description="当前报名缴费金额仍以提交订单时系统计算结果为准，会员等级不会自动抵扣报名费。"
      tone="warning"
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

    <LoadingState v-if="loading" title="加载会员信息中" description="正在读取账号、会员等级和权益说明。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" secondary-text="返回首页" @retry="load" @secondary="goHome" />

    <view v-else class="section">
      <view class="member-card ui-card">
        <view class="section-head">
          <text class="section-title">当前会员</text>
          <StatusTag :label="membership ? '已可用' : '普通用户'" :tone="membership ? 'success' : 'neutral'" />
        </view>
        <template v-if="membership">
          <text class="member-name">{{ membership.level.name }}</text>
          <text class="muted">有效期至：{{ membership.endsAt ? formatDate(membership.endsAt) : "长期有效" }}</text>
          <text class="muted">权益展示已开通，报名定价仍以后端订单计算为准。</text>
        </template>
        <template v-else>
          <text class="member-name">普通用户</text>
          <text class="muted">暂无会员等级。会议报名价格不会因会员状态自动变化。</text>
        </template>
      </view>

      <view class="levels">
        <text class="section-title">可选等级</text>
        <EmptyState
          v-if="levels.length === 0"
          title="暂无会员等级"
          description="会员等级和权益会在后续运营中逐步开放。"
          mark="会"
        />
        <view v-for="level in levels" :key="level.id" class="level-card">
          <view>
            <view class="level-title-row">
              <text class="level-name">{{ level.name }}</text>
              <StatusTag label="仅展示" tone="info" />
            </view>
            <text class="muted">{{ level.description || "会员权益后续逐步开放" }}</text>
            <view v-if="level.benefits?.length" class="benefits">
              <text v-for="benefit in level.benefits" :key="benefit.id" class="benefit">{{ benefit.title }}</text>
            </view>
            <text v-else class="benefit muted-benefit">权益说明待完善</text>
          </view>
          <view class="level-side">
            <text class="price">¥{{ formatCent(level.priceCent) }}</text>
            <text v-if="level.discountPercent" class="muted discount">展示折扣 {{ formatDiscount(level.discountPercent) }}</text>
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
import { ensureLogin, getStoredUser, type CurrentUser } from "@/services/auth";
import { createMobileAdminSession } from "@/services/admin-mobile";
import { getMemberLevels, getMyMembership, type CurrentMembership, type MemberLevel } from "@/services/member";
import { goHome } from "@/utils/navigation";

const loading = ref(false);
const error = ref("");
const user = ref<CurrentUser | null>(getStoredUser());
const membership = ref<CurrentMembership | null>(null);
const levels = ref<MemberLevel[]>([]);
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
    const [levelData, membershipData] = await Promise.all([getMemberLevels(), getMyMembership()]);
    levels.value = levelData.items;
    membership.value = membershipData.membership;
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

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function formatDiscount(value: number) {
  return `${(value / 100).toFixed(2)}%`;
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
.level-card {
  padding: 28rpx;
}

.profile-card {
  justify-content: flex-start;
}

.admin-entry {
  width: 100%;
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
.section-title {
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
.level-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
}

.member-name {
  margin-top: 18rpx;
  font-size: 38rpx;
}

.levels {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.level-card {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  box-shadow: var(--ui-shadow-card);
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

.muted-benefit {
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
