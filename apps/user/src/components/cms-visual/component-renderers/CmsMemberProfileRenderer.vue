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
      <text v-if="loggedIn && contextText('phone')" class="cms-member-profile__phone">{{ contextText('phone') }}</text>
      <text v-if="summary" class="cms-member-profile__summary">{{ summary }}</text>
      <text v-if="loggedIn && memberStatus && memberStatus !== memberLevel" class="cms-member-profile__status">{{ memberStatus }}</text>
    </view>
    <button class="cms-member-profile__button" @click.stop="emit('activate')">
      <wd-icon :name="loggedIn ? 'edit' : 'user'" size="20px" />
      <text>{{ buttonText }}</text>
      <wd-icon name="chevron-right" size="18px" />
    </button>
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
  ? stringConfig(props.component, "loggedInDescription", "")
  : stringConfig(props.component, "description", "登录后展示头像、昵称、手机号和会员等级"));
const buttonText = computed(() => loggedIn.value ? stringConfig(props.component, "buttonText", "编辑资料") : stringConfig(props.component, "loginButtonText", "立即登录"));
const initial = computed(() => name.value.slice(0, 1));
const cardStyle = computed(() => stringConfig(props.component, "cardStyle", "brand"));
const rootStyle = computed(() => stringConfig(props.component, "imageUrl")
  ? { backgroundImage: `url(${stringConfig(props.component, "imageUrl")})` }
  : {});

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
  grid-template-columns: 52px minmax(0, 1fr);
  align-items: center;
  gap: 14px;
  padding: 18px 18px 0;
  overflow: hidden;
  border: 1rpx solid var(--cms-border);
  border-radius: 8px;
  background-color: var(--cms-surface-elevated);
  background-position: center;
  background-size: cover;
  box-shadow: none;
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
  width: 52px;
  height: 52px;
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
  flex-wrap: wrap;
  gap: 12rpx;
}

.cms-member-profile__name {
  min-width: 0;
  color: var(--cms-text-primary);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
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
.cms-member-profile__phone,
.cms-member-profile__status {
  display: block;
  min-width: 0;
  color: var(--cms-text-secondary);
  font-size: 14px;
  line-height: 1.45;
  white-space: normal;
  word-break: break-word;
}

.cms-member-profile__status {
  color: var(--cms-secondary);
}

.cms-member-profile__button {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  gap: 10px;
  box-sizing: border-box;
  width: 100%;
  min-height: 52px;
  margin: 0;
  padding: 12px 0;
  border-radius: 0;
  border-top: 1px solid var(--cms-border, #e4e5e7);
  color: var(--cms-primary, #987627);
  font-size: 16px;
  line-height: 1.5;
  background: transparent;
  text-align: left;
  white-space: normal;
  overflow-wrap: anywhere;
}
.cms-member-profile__button text { flex: 1; min-width: 0; }
.cms-member-profile__phone { font-size: 16px; }

.cms-member-profile__button::after {
  border: 0;
}

</style>
