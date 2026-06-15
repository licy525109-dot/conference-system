<template>
  <view class="page">
    <view class="topbar">
      <view>
        <text class="eyebrow">个人中心</text>
        <text class="title">会员与账号</text>
      </view>
      <button class="ghost-button compact" @click="goHome">首页</button>
    </view>

    <view class="profile-card">
      <image v-if="user?.wechatAvatarUrl" class="avatar" :src="user.wechatAvatarUrl" mode="aspectFill" />
      <view v-else class="avatar placeholder">{{ displayName.slice(0, 1) }}</view>
      <view>
        <text class="name">{{ displayName }}</text>
        <text class="muted">{{ user?.phone || user?.openid || "已登录小程序账号" }}</text>
      </view>
    </view>

    <view v-if="loading" class="state">加载会员信息中...</view>
    <view v-else-if="error" class="state error">
      <text>{{ error }}</text>
      <button class="primary-button compact" @click="load">重试</button>
    </view>

    <view v-else class="section">
      <view class="member-card">
        <text class="section-title">当前会员</text>
        <template v-if="membership">
          <text class="member-name">{{ membership.level.name }}</text>
          <text class="muted">有效期至：{{ membership.endsAt ? formatDate(membership.endsAt) : "长期有效" }}</text>
        </template>
        <template v-else>
          <text class="member-name">普通用户</text>
          <text class="muted">会员体系第一版仅展示权益，报名价格仍以后端订单重算为准。</text>
        </template>
      </view>

      <view class="levels">
        <text class="section-title">可选等级</text>
        <view v-for="level in levels" :key="level.id" class="level-card">
          <view>
            <text class="level-name">{{ level.name }}</text>
            <text class="muted">{{ level.description || "会员权益后续逐步开放" }}</text>
          </view>
          <text class="price">¥{{ formatCent(level.priceCent) }}</text>
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
import WechatProfilePrompt from "@/components/WechatProfilePrompt.vue";
import { ensureLogin, getStoredUser, type CurrentUser } from "@/services/auth";
import { getMemberLevels, getMyMembership, type CurrentMembership, type MemberLevel } from "@/services/member";
import { goHome } from "@/utils/navigation";

const loading = ref(false);
const error = ref("");
const user = ref<CurrentUser | null>(getStoredUser());
const membership = ref<CurrentMembership | null>(null);
const levels = ref<MemberLevel[]>([]);
const displayName = computed(() => user.value?.wechatNickname || user.value?.nickname || "微信用户");

onMounted(() => void load());

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

function formatCent(value: number) {
  return (value / 100).toFixed(2);
}

function formatDate(value: string) {
  return value.slice(0, 10);
}
</script>

<style scoped>
.page {
  min-height: 100vh;
  padding: 28rpx 28rpx 140rpx;
  box-sizing: border-box;
}

.topbar,
.profile-card,
.level-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.topbar {
  margin-bottom: 24rpx;
}

.eyebrow,
.muted {
  display: block;
  color: #627087;
  font-size: 24rpx;
}

.title {
  display: block;
  margin-top: 8rpx;
  color: #172033;
  font-size: 42rpx;
  font-weight: 800;
}

.profile-card,
.member-card,
.level-card {
  padding: 28rpx;
  border: 1px solid #dce3ef;
  border-radius: 8px;
  background: #ffffff;
}

.profile-card {
  justify-content: flex-start;
}

.avatar {
  width: 96rpx;
  height: 96rpx;
  border-radius: 48rpx;
  background: #e8eef8;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #2452a8;
  font-weight: 800;
}

.name,
.member-name,
.level-name,
.section-title {
  display: block;
  color: #172033;
  font-weight: 800;
}

.name {
  font-size: 34rpx;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-top: 20rpx;
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

.price {
  color: #2452a8;
  font-size: 30rpx;
  font-weight: 800;
}

.primary-button,
.ghost-button {
  min-height: 72rpx;
  border-radius: 8px;
  font-size: 27rpx;
  line-height: 72rpx;
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

.compact {
  width: 176rpx;
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
