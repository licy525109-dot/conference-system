<template>
  <view class="attendance-page ui-page">
    <view class="page-heading"><text class="heading">我的参会</text><button class="refresh-button" :disabled="loading" :aria-label="loading ? '同步中' : '刷新参会记录'" title="刷新参会记录" @click="load"><wd-icon name="refresh" size="22px" /></button></view>
    <LoadingState v-if="loading && !items.length" title="正在读取参会记录" />
    <ErrorState v-else-if="error" :message="error" primary-text="重新加载" @retry="load" />
    <EmptyState v-else-if="!items.length" title="暂无参会记录" description="如已报名但未显示，请联系会务组核对参会信息。" />
    <view v-else class="attendance-list">
      <view v-for="item in items" :key="item.id" class="attendance-item">
        <text class="conference-title">{{ item.registration.conference.title }}</text>
        <view class="facts"><text>参会人</text><text>{{ item.name }}</text></view>
        <view class="facts"><text>会议时间</text><text>{{ formatDateTime(item.registration.conference.startsAt) }} 至 {{ formatDateTime(item.registration.conference.endsAt) }}</text></view>
        <view v-if="item.registration.conference.location" class="facts"><text>会议地点</text><text>{{ item.registration.conference.location }}</text></view>
        <view class="facts"><text>签到状态</text><text class="checkin-status" :class="{ 'checkin-status--checked': item.checkInStatus === 'CHECKED_IN' }">{{ checkinLabels[item.checkInStatus] || '待核对' }}</text></view>
        <view v-if="item.qrPayload" class="credential">
          <QrCodeMatrix class="attendance-qr" :value="item.qrPayload" :label="`${item.name}的签到码`" />
          <text class="credential-label">本人签到码</text>
        </view>
        <text v-else-if="item.checkInStatus !== 'NOT_REQUIRED'" class="unavailable">{{ ['REFUNDED', 'CANCELLED'].includes(item.registration.status) ? '参会资格已失效' : '签到码暂不可用，请联系会务组核对' }}</text>
        <button class="ui-button-primary schedule-action" @click="viewSchedule(item.registration.conference.id)">查看本人会务安排</button>
      </view>
    </view>
    <button class="home-action" @click="goHome">返回首页</button>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { onShow } from "@dcloudio/uni-app";
import QrCodeMatrix from "@/components/QrCodeMatrix.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import { ensureAuthenticatedUser } from "@/services/auth";
import { getMyAttendance, type MyAttendance } from "@/services/guest-profiles";
import { formatDateTime } from "@/utils/date";
import { goHome } from "@/utils/navigation";
const loading = ref(false);
const error = ref("");
const items = ref<MyAttendance[]>([]);
const checkinLabels: Record<string, string> = { CHECKED_IN: '已签到', PENDING: '待签到', NOT_REQUIRED: '无需签到', CANCELLED: '已取消' };
onShow(() => { void load(); });
async function load() {
  if (loading.value) return;
  loading.value = true; error.value = "";
  try {
    await ensureAuthenticatedUser();
    items.value = (await getMyAttendance()).items;
  } catch {
    items.value = [];
    error.value = "参会记录暂时无法读取，请重试或联系会务组。";
  } finally { loading.value = false; }
}
function viewSchedule(conferenceId: string) { uni.navigateTo({ url: `/pages/registrations/schedule?conferenceId=${encodeURIComponent(conferenceId)}` }); }
</script>
<style scoped>
.attendance-page { display: flex; min-height: 100vh; flex-direction: column; gap: 24px; padding: 24px 20px calc(24px + env(safe-area-inset-bottom)); background: #fff; color: var(--ui-color-text, #18202d); font-size: 18px; line-height: 1.5; letter-spacing: 0; box-sizing: border-box; }
.page-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.heading { min-width: 0; font-size: 24px; font-weight: 700; overflow-wrap: anywhere; }
.attendance-list { display: flex; flex-direction: column; gap: 28px; }
.attendance-item { padding: 24px 0; border-top: 1px solid var(--ui-color-primary, #99732c); border-bottom: 1px solid var(--ui-color-border, #e2e5e9); display: flex; flex-direction: column; gap: 20px; }
.conference-title { font-size: 28px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.facts { display: flex; flex-direction: column; gap: 6px; line-height: 1.5; overflow-wrap: anywhere; }
.facts > text:first-child { color: var(--ui-color-muted, #667080); font-size: 18px; }
.facts > text:last-child { font-size: 24px; font-weight: 600; }
.checkin-status { align-self: flex-start; }
.checkin-status--checked { color: var(--ui-color-success, #287456); }
.credential { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px 0; border-top: 1px solid var(--ui-color-border, #e2e5e9); }
.attendance-qr { width: 240px; height: 240px; max-width: 100%; }
.credential-label { font-size: 18px; }
.unavailable { font-size: 18px; color: var(--ui-color-danger, #b83232); }
.attendance-page button { min-height: 48px; margin: 0; padding: 12px 16px; border-radius: 4px; font-size: 18px; line-height: 1.5; white-space: normal; overflow-wrap: anywhere; box-sizing: border-box; box-shadow: none; }
.attendance-page button::after { border: 0; }
.attendance-page .ui-button-primary { background: var(--ui-color-primary, #99732c); color: #fff; }
.attendance-page .ui-button-secondary { border: 1px solid var(--ui-color-border, #e2e5e9); background: #fff; color: var(--ui-color-primary, #99732c); }
.attendance-page .refresh-button { flex: 0 0 44px; display: flex; width: 44px; height: 44px; min-height: 44px; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--ui-color-border, #e2e5e9); background: #fff; color: var(--ui-color-primary, #99732c); }
.home-action { border: 0; background: transparent; color: var(--ui-color-muted, #667080); }
@media (min-width: 760px) { .attendance-page { max-width: 680px; margin: 0 auto; } }
</style>
