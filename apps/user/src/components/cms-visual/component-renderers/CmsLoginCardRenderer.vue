<template>
  <view :class="rootClass" :style="rootStyle">
    <image v-if="avatarUrl" class="cms-login-card__avatar" :src="avatarUrl" mode="aspectFill" />
    <view v-else class="cms-login-card__avatar is-placeholder"><text>{{ initial }}</text></view>
    <view class="cms-login-card__copy">
      <text class="cms-login-card__title">{{ displayTitle }}</text>
      <text v-if="displaySubtitle" class="cms-login-card__subtitle">{{ displaySubtitle }}</text>
      <view v-if="loggedIn" class="cms-login-card__status">
        <text>{{ memberLevel }}</text>
        <text v-if="phone">{{ phone }}</text>
      </view>
    </view>
    <button class="cms-login-card__button" @click.stop="emit('activate')">{{ displayButton }}</button>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { numberConfig, stringConfig } from "./config";

const props = defineProps<{
  component: CmsComponent;
  userContext?: Record<string, unknown> | null;
}>();
const emit = defineEmits<{ activate: [] }>();

const loggedIn = computed(() => Boolean(props.userContext?.loggedIn || props.userContext?.userId));
const nickname = computed(() => contextText("nickname") || "微信用户");
const avatarUrl = computed(() => loggedIn.value ? contextText("avatarUrl") : stringConfig(props.component, "logoUrl"));
const phone = computed(() => contextText("phone"));
const memberLevel = computed(() => contextText("memberLevel") || contextText("memberStatus") || "普通用户");
const displayTitle = computed(() => {
  if (!loggedIn.value) return stringConfig(props.component, "title", "欢迎登录");
  return stringConfig(props.component, "loggedInTitle") || `欢迎回来，${nickname.value}`;
});
const displaySubtitle = computed(() => loggedIn.value
  ? stringConfig(props.component, "loggedInSubtitle", "查看报名、订单、待参会和会员权益")
  : stringConfig(props.component, "subtitle", "登录后查看会议排期、报名权益和会员信息"));
const displayButton = computed(() => loggedIn.value
  ? stringConfig(props.component, "loggedInButtonText", "个人中心")
  : stringConfig(props.component, "buttonText", "立即登录"));
const initial = computed(() => (loggedIn.value ? nickname.value : stringConfig(props.component, "title", "观")).slice(0, 1));
const rootClass = computed(() => ["cms-login-card", `is-${stringConfig(props.component, "cardStyle", "elevated")}`, loggedIn.value ? "is-logged-in" : ""]);
const rootStyle = computed(() => ({
  borderRadius: `${Math.min(48, Math.max(0, numberConfig(props.component, "radius", 18)))}rpx`,
  ...(stringConfig(props.component, "backgroundColor") ? { background: stringConfig(props.component, "backgroundColor") } : {})
}));

function contextText(key: string): string {
  const value = props.userContext?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
</script>

<style scoped>
.cms-login-card {
  position: relative;
  display: grid;
  grid-template-columns: 92rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 24rpx;
  min-height: 150rpx;
  padding: 28rpx 30rpx;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  background: var(--cms-surface-elevated);
  box-shadow: var(--cms-shadow-md);
}

.cms-login-card::after {
  position: absolute;
  right: -12rpx;
  bottom: -52rpx;
  width: 190rpx;
  height: 190rpx;
  border: 22rpx solid rgba(169, 126, 56, 0.1);
  border-radius: 50%;
  content: "";
  pointer-events: none;
}

.cms-login-card__avatar {
  position: relative;
  z-index: 1;
  width: 92rpx;
  height: 92rpx;
  border: 1rpx solid rgba(169, 126, 56, 0.42);
  border-radius: 50%;
  background: var(--cms-surface-muted);
}

.cms-login-card__avatar.is-placeholder {
  display: grid;
  place-items: center;
  color: var(--cms-primary);
  font-size: 38rpx;
  font-weight: 700;
}

.cms-login-card__copy {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 8rpx;
}

.cms-login-card__title {
  color: var(--cms-text-primary);
  font-size: 30rpx;
  font-weight: 700;
  line-height: 1.35;
}

.cms-login-card__subtitle {
  display: -webkit-box;
  overflow: hidden;
  color: var(--cms-text-secondary);
  font-size: 23rpx;
  line-height: 1.5;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.cms-login-card__status {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
  color: var(--cms-accent);
  font-size: 21rpx;
}

.cms-login-card__button {
  position: relative;
  z-index: 1;
  min-width: 152rpx;
  min-height: 68rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 12rpx;
  color: #f8faf8;
  font-size: 24rpx;
  line-height: 68rpx;
  background: var(--cms-primary);
}

.cms-login-card__button::after {
  border: 0;
}

@media (max-width: 360px) {
  .cms-login-card {
    grid-template-columns: 78rpx minmax(0, 1fr);
  }

  .cms-login-card__avatar {
    width: 78rpx;
    height: 78rpx;
  }

  .cms-login-card__button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
