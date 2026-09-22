<template>
  <view v-if="authenticated && visible && unreadCount > 0" class="home-message-notice" role="status">
    <button class="message-entry" @click="openMessages">
      <wd-icon name="notification" size="20px" />
      <text class="message-label">你有新的消息通知</text>
      <text v-if="unreadCount" class="unread">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
      <wd-icon name="chevron-right" size="18px" />
    </button>
    <button class="dismiss-button" aria-label="关闭消息提醒" title="关闭消息提醒" @click="dismiss"><wd-icon name="close" size="18px" /></button>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { getStoredUser, getToken } from "@/services/session";
import { getMyNotifications } from "@/services/user-notifications";

const authenticated = ref(Boolean(getToken()));
const unreadCount = ref(0);
const visible = ref(false);
let notificationIds: string[] = [];
let noticeUserId = "";
let requestId = 0;
let pending = false;
let refreshAfterPending = false;
let loadedAt = 0;
let loadedToken = "";

onMounted(() => {
  uni.$on("auth:changed", resetAndRefresh);
  uni.$on("notifications:changed", resetAndRefresh);
  void refresh();
});
onUnmounted(() => {
  requestId += 1;
  uni.$off("auth:changed", resetAndRefresh);
  uni.$off("notifications:changed", resetAndRefresh);
});

async function refresh(force = false) {
  const token = getToken();
  authenticated.value = Boolean(token);
  if (loadedToken !== token || !token) {
    requestId += 1;
    unreadCount.value = 0;
    visible.value = false;
    notificationIds = [];
    noticeUserId = "";
    loadedAt = 0;
    pending = false;
    refreshAfterPending = false;
    loadedToken = token;
  }
  if (force) loadedAt = 0;
  if (!token) return;
  if (pending) { refreshAfterPending ||= force; return; }
  if (Date.now() - loadedAt < 30_000) return;
  const id = ++requestId;
  pending = true;
  try {
    const result = await getMyNotifications(true);
    if (id !== requestId || token !== getToken()) return;
    unreadCount.value = result.unreadCount;
    noticeUserId = getStoredUser()?.id || "";
    notificationIds = result.items.filter(item => !item.readAt).map(item => item.id);
    const dismissed = dismissedIds();
    visible.value = notificationIds.some(item => !dismissed.includes(item));
    loadedAt = Date.now();
  } catch { /* A failed badge refresh must not replace the platform homepage. */ }
  finally {
    if (id === requestId) {
      pending = false;
      if (refreshAfterPending) { refreshAfterPending = false; void refresh(true); }
    }
  }
}
function resetAndRefresh() { void refresh(true); }
function dismissedIds(): string[] {
  if (!noticeUserId) return [];
  try {
    const value = uni.getStorageSync(`home_notice_dismissed:${noticeUserId}`);
    return Array.isArray(value) ? value.filter(id => typeof id === "string").slice(-100) : [];
  } catch { return []; }
}
function dismiss() {
  visible.value = false;
  if (!noticeUserId) return;
  try {
    uni.setStorageSync(`home_notice_dismissed:${noticeUserId}`, [...new Set([...dismissedIds(), ...notificationIds])].slice(-100));
  } catch { /* Dismissing a prompt never changes the read state of the messages. */ }
}
function openMessages() { dismiss(); uni.reLaunch({ url: "/pages/notifications/index" }); }
defineExpose({ refresh });
</script>

<style scoped>
.home-message-notice { position: fixed; z-index: 80; top: calc(var(--window-top, 0px) + 12px); left: 14px; right: 14px; display: flex; align-items: center; border: 1px solid var(--cms-border, #e4e5e7); border-left: 3px solid var(--cms-primary, #987627); border-radius: 6px; background: var(--cms-surface, #fff); color: var(--cms-text-primary); box-shadow: 0 6px 20px rgba(32, 36, 44, 0.12); }
.message-entry { display: flex; flex: 1; min-width: 0; align-items: center; gap: 10px; min-height: 56px; margin: 0; font-size: 17px; line-height: 1.5; padding: 12px; background: transparent; text-align: left; color: inherit; border-radius: 0; }
.message-entry::after, .dismiss-button::after { border: 0; }
.dismiss-button { display: flex; align-items: center; justify-content: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; margin: 0; border-radius: 0; background: transparent; color: var(--cms-text-secondary, #667080); }
.message-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.unread { flex-shrink: 0; min-width: 20px; padding: 0 5px; border-radius: 10px; color: #fff; background: var(--cms-danger); text-align: center; font-size: 13px; line-height: 20px; }
@media (min-width: 768px) { .home-message-notice { max-width: 640px; margin: 0 auto; } }
</style>
