<template>
  <view v-if="authenticated" class="home-message-notice">
    <button class="message-entry" @click="openMessages">
      <wd-icon name="notification" size="20px" />
      <text class="message-label">{{ unreadCount ? '有新的消息通知' : '消息通知' }}</text>
      <text v-if="unreadCount" class="unread">{{ unreadCount > 99 ? '99+' : unreadCount }}</text>
      <wd-icon name="chevron-right" size="18px" />
    </button>
  </view>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { getToken } from "@/services/session";
import { getUnreadNotificationCount } from "@/services/user-notifications";

const authenticated = ref(Boolean(getToken()));
const unreadCount = ref(0);
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
    const result = await getUnreadNotificationCount();
    if (id !== requestId || token !== getToken()) return;
    unreadCount.value = result.count;
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
function openMessages() { uni.reLaunch({ url: "/pages/notifications/index" }); }
defineExpose({ refresh });
</script>

<style scoped>
.home-message-notice { background: var(--cms-surface, #fff); color: var(--cms-text-primary); }
.message-entry { display: flex; align-items: center; gap: 10px; min-height: 56px; width: 100%; font-size: 17px; line-height: 1.5; padding: 12px 20px; background: transparent; text-align: left; color: inherit; border-radius: 0; }
.message-entry::after { border: 0; }
.message-label { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.unread { flex-shrink: 0; min-width: 20px; padding: 0 5px; border-radius: 10px; color: #fff; background: var(--cms-danger); text-align: center; font-size: 13px; line-height: 20px; }
@media (min-width: 768px) { .message-entry { max-width: 640px; margin: 0 auto; } }
</style>
