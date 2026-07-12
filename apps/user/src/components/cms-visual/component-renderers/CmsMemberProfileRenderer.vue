<template>
  <view class="cms-member-profile" :class="`is-${cardStyle}`" :style="rootStyle" @click="emit('activate')">
    <view class="cms-member-profile__shade" />
    <image v-if="avatarUrl" class="cms-member-profile__avatar" :src="avatarUrl" mode="aspectFill" />
    <view v-else class="cms-member-profile__avatar is-placeholder"><text>{{ initial }}</text></view>
    <view class="cms-member-profile__copy">
      <view class="cms-member-profile__name-row">
        <text class="cms-member-profile__name">{{ name }}</text>
        <wd-tag v-if="loggedIn" round plain type="warning">{{ memberLevel }}</wd-tag>
      </view>
      <text class="cms-member-profile__summary">{{ summary }}</text>
      <text v-if="loggedIn && memberStatus" class="cms-member-profile__status">{{ memberStatus }}</text>
    </view>
    <wd-button custom-class="cms-member-profile__button" size="small" :round="false" :custom-style="profileButtonStyle" @click.stop="emit('activate')">{{ buttonText }}</wd-button>
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { CmsComponent } from "@/services/cms";
import { stringConfig } from "./config";

const props = defineProps<{ component: CmsComponent; userContext?: Record<string, unknown> | null }>();
const emit = defineEmits<{ activate: [] }>();

const loggedIn = computed(() => Boolean(props.userContext?.loggedIn || props.userContext?.userId));
const name = computed(() => loggedIn.value ? contextText("nickname") || "微信用户" : stringConfig(props.component, "title", "登录后查看资料"));
const avatarUrl = computed(() => contextText("avatarUrl"));
const memberLevel = computed(() => contextText("memberLevel") || "普通用户");
const memberStatus = computed(() => contextText("memberStatus"));
const summary = computed(() => loggedIn.value
  ? [contextText("phone"), stringConfig(props.component, "loggedInDescription", "查看会议报名与会员权益")].filter(Boolean).join(" · ")
  : stringConfig(props.component, "description", "登录后展示头像、昵称、手机号和会员等级"));
const buttonText = computed(() => loggedIn.value ? stringConfig(props.component, "buttonText", "编辑资料") : stringConfig(props.component, "loginButtonText", "立即登录"));
const initial = computed(() => name.value.slice(0, 1));
const cardStyle = computed(() => stringConfig(props.component, "cardStyle", "brand"));
const rootStyle = computed(() => stringConfig(props.component, "imageUrl")
  ? { backgroundImage: `url(${stringConfig(props.component, "imageUrl")})` }
  : {});
const profileButtonStyle = "position:relative;z-index:1;min-height:68rpx;padding:0 24rpx;border-radius:12rpx;background:var(--cms-primary);color:#f8faf8;border:0;";

function contextText(key: string): string {
  const value = props.userContext?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
}
</script>

<style scoped>
.cms-member-profile {
  position: relative;
  box-sizing: border-box;
  display: grid;
  grid-template-columns: 110rpx minmax(0, 1fr) auto;
  align-items: center;
  gap: 24rpx;
  min-height: 220rpx;
  padding: 34rpx;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 16rpx;
  background-color: var(--cms-surface-elevated);
  background-position: center;
  background-size: cover;
  box-shadow: var(--cms-shadow-md);
}

.cms-member-profile__shade {
  position: absolute;
  inset: 0;
  background: rgba(250, 250, 247, 0.9);
}

.cms-member-profile.is-brand .cms-member-profile__shade {
  background: rgba(250, 250, 247, 0.82);
}

.cms-member-profile__avatar,
.cms-member-profile__copy,
.cms-member-profile__button {
  position: relative;
  z-index: 1;
}

.cms-member-profile__avatar {
  width: 108rpx;
  height: 108rpx;
  border: 2rpx solid rgba(169, 126, 56, 0.5);
  border-radius: 50%;
  background: var(--cms-surface-muted);
}

.cms-member-profile__avatar.is-placeholder {
  display: grid;
  place-items: center;
  color: var(--cms-primary);
  font-size: 40rpx;
  font-weight: 700;
}

.cms-member-profile__copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 9rpx;
}

.cms-member-profile__name-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.cms-member-profile__name {
  min-width: 0;
  overflow: hidden;
  color: var(--cms-text-primary);
  font-size: 34rpx;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cms-member-profile__badge {
  flex: none;
  padding: 5rpx 13rpx;
  border-radius: 999rpx;
  color: #72501f;
  font-size: 19rpx;
  background: rgba(169, 126, 56, 0.14);
}

.cms-member-profile__summary,
.cms-member-profile__status {
  color: var(--cms-text-secondary);
  font-size: 22rpx;
  line-height: 1.45;
}

.cms-member-profile__status {
  color: var(--cms-secondary);
}

.cms-member-profile__button {
  min-height: 68rpx;
  margin: 0;
  padding: 0 24rpx;
  border-radius: 12rpx;
  color: #f8faf8;
  font-size: 23rpx;
  line-height: 68rpx;
  background: var(--cms-primary);
}

.cms-member-profile__button::after {
  border: 0;
}

@media (max-width: 430px) {
  .cms-member-profile {
    grid-template-columns: 88rpx minmax(0, 1fr);
  }

  .cms-member-profile__avatar {
    width: 86rpx;
    height: 86rpx;
  }

  .cms-member-profile__button {
    grid-column: 2;
    justify-self: start;
  }
}
</style>
