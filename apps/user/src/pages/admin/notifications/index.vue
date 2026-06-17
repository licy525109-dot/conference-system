<template>
  <view class="page ui-page">
    <view class="topbar ui-card">
      <view>
        <text class="eyebrow">管理员</text>
        <text class="title">通知中心</text>
        <text class="subtitle">{{ admin ? `当前账号：${admin.displayName || admin.username}` : "绑定后台账号后可在手机端查看和发送通知任务" }}</text>
      </view>
      <button v-if="admin" class="ui-button-secondary ui-button-compact" @click="logout">退出</button>
    </view>

    <view v-if="!admin" class="bind-card ui-card">
      <text class="section-title">绑定后台账号</text>
      <input v-model="loginForm.username" class="field" placeholder="后台用户名" />
      <input v-model="loginForm.password" class="field" password placeholder="后台密码" />
      <button class="ui-button-primary" :loading="loading" @click="bindAdmin">登录并绑定当前微信</button>
      <text v-if="error" class="error">{{ error }}</text>
    </view>

    <template v-else>
      <view class="tabs ui-card">
        <button :class="tabClass('tasks')" @click="activeTab = 'tasks'">任务</button>
        <button :class="tabClass('templates')" @click="activeTab = 'templates'">模板</button>
        <button :class="tabClass('logs')" @click="activeTab = 'logs'">日志</button>
      </view>

      <LoadingState v-if="loading" title="加载通知中心" description="正在读取模板、任务和发送记录。" />
      <ErrorState v-else-if="error" :message="error" primary-text="重试" @retry="loadAll" />

      <view v-else-if="activeTab === 'tasks'" class="list">
        <view v-for="task in tasks" :key="task.id" class="item ui-card">
          <view class="item-head">
            <text class="item-title">{{ task.name }}</text>
            <StatusTag :label="taskStatusText(task.status)" :tone="taskTone(task.status)" />
          </view>
          <text class="muted">{{ task.template?.name || task.templateId }} · {{ channelText(task.channel) }}</text>
          <text class="muted">日志 {{ task.logCount }} 条 · {{ task.sentAt ? formatTime(task.sentAt) : "尚未发送" }}</text>
          <view class="actions">
            <button class="ui-button-secondary ui-button-compact" @click="openTaskLogs(task.id)">查看日志</button>
            <button class="ui-button-primary ui-button-compact" :disabled="!canSend(task.status)" @click="sendNow(task.id)">一键发送</button>
          </view>
        </view>
        <EmptyState v-if="tasks.length === 0" title="暂无通知任务" description="请先在后台创建允许手机端发送的通知任务。" mark="通" />
      </view>

      <view v-else-if="activeTab === 'templates'" class="list">
        <view v-for="template in templates" :key="template.id" class="item ui-card">
          <view class="item-head">
            <text class="item-title">{{ template.name }}</text>
            <StatusTag :label="templateStatusText(template.status)" :tone="template.status === 'ACTIVE' ? 'success' : 'neutral'" />
          </view>
          <text class="muted">{{ template.code }} · {{ channelText(template.channel) }}</text>
          <text class="muted">{{ template.title || "未设置标题" }}</text>
        </view>
        <EmptyState v-if="templates.length === 0" title="暂无通知模板" description="后台创建模板后会显示在这里。" mark="模" />
      </view>

      <view v-else class="list">
        <view v-for="log in logs" :key="log.id" class="item ui-card">
          <view class="item-head">
            <text class="item-title">{{ log.task?.name || log.template?.name || "发送记录" }}</text>
            <StatusTag :label="logStatusText(log.status)" :tone="logTone(log.status)" />
          </view>
          <text class="muted">{{ channelText(log.channel) }} · {{ log.recipient || "无接收方" }}</text>
          <text class="muted">{{ log.errorMessage || formatTime(log.createdAt) }}</text>
        </view>
        <EmptyState v-if="logs.length === 0" title="暂无发送日志" description="发送任务后会记录每次结果。" mark="志" />
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import EmptyState from "@/components/ui/EmptyState.vue";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import StatusTag from "@/components/ui/StatusTag.vue";
import {
  clearMobileAdminSession,
  createMobileAdminSession,
  getStoredMobileAdmin,
  listNotificationLogs,
  listNotificationTasks,
  listNotificationTemplates,
  loginAndBindMobileAdmin,
  sendNotificationTaskNow,
  type MobileAdminUser,
  type NotificationLog,
  type NotificationLogStatus,
  type NotificationTask,
  type NotificationTaskStatus,
  type NotificationTemplate
} from "@/services/admin-mobile";

const loading = ref(false);
const error = ref("");
const admin = ref<MobileAdminUser | null>(getStoredMobileAdmin());
const activeTab = ref<"tasks" | "templates" | "logs">("tasks");
const templates = ref<NotificationTemplate[]>([]);
const tasks = ref<NotificationTask[]>([]);
const logs = ref<NotificationLog[]>([]);
const loginForm = reactive({ username: "", password: "" });

onMounted(() => void bootstrap());

async function bootstrap() {
  if (!admin.value) {
    try {
      const session = await createMobileAdminSession();
      admin.value = session.admin;
    } catch {
      return;
    }
  }
  await loadAll();
}

async function bindAdmin() {
  loading.value = true;
  error.value = "";
  try {
    const session = await loginAndBindMobileAdmin(loginForm.username, loginForm.password);
    admin.value = session.admin;
    await loadAll();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "绑定失败";
  } finally {
    loading.value = false;
  }
}

async function loadAll() {
  loading.value = true;
  error.value = "";
  try {
    const [templateData, taskData, logData] = await Promise.all([listNotificationTemplates(), listNotificationTasks(), listNotificationLogs()]);
    templates.value = templateData.items;
    tasks.value = taskData.items;
    logs.value = logData.items;
  } catch (err) {
    error.value = err instanceof Error ? err.message : "通知中心加载失败";
  } finally {
    loading.value = false;
  }
}

async function sendNow(id: string) {
  loading.value = true;
  error.value = "";
  try {
    const response = await sendNotificationTaskNow(id);
    uni.showToast({ title: `成功${response.result.successCount} 跳过${response.result.skippedCount}`, icon: "none" });
    await loadAll();
  } catch (err) {
    error.value = err instanceof Error ? err.message : "发送失败";
  } finally {
    loading.value = false;
  }
}

async function openTaskLogs(taskId: string) {
  loading.value = true;
  try {
    logs.value = (await listNotificationLogs(taskId)).items;
    activeTab.value = "logs";
  } catch (err) {
    error.value = err instanceof Error ? err.message : "日志加载失败";
  } finally {
    loading.value = false;
  }
}

function logout() {
  clearMobileAdminSession();
  admin.value = null;
  tasks.value = [];
  templates.value = [];
  logs.value = [];
}

function tabClass(tab: string) {
  return ["tab", activeTab.value === tab ? "active" : ""];
}

function canSend(status: NotificationTaskStatus) {
  return !["SENDING", "SENT", "CANCELLED"].includes(status);
}

function channelText(channel: string) {
  return ({ MOCK: "Mock", WECHAT_SUBSCRIBE: "微信订阅消息", SMS: "短信" } as Record<string, string>)[channel] ?? channel;
}

function templateStatusText(status: string) {
  return ({ DRAFT: "草稿", ACTIVE: "启用", DISABLED: "停用" } as Record<string, string>)[status] ?? status;
}

function taskStatusText(status: string) {
  return ({ DRAFT: "草稿", PENDING: "待发送", SENDING: "发送中", SENT: "已发送", PARTIAL_FAILED: "部分失败", FAILED: "失败", CANCELLED: "已取消" } as Record<string, string>)[status] ?? status;
}

function logStatusText(status: string) {
  return ({ PENDING: "待处理", SUCCESS: "成功", FAILED: "失败", SKIPPED: "跳过" } as Record<string, string>)[status] ?? status;
}

function taskTone(status: NotificationTaskStatus) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PARTIAL_FAILED") return "warning";
  return "info";
}

function logTone(status: NotificationLogStatus) {
  if (status === "SUCCESS") return "success";
  if (status === "FAILED") return "danger";
  if (status === "SKIPPED") return "warning";
  return "info";
}

function formatTime(value: string) {
  return value ? new Date(value).toLocaleString() : "-";
}
</script>

<style scoped>
.page,
.list {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.topbar,
.item-head,
.actions,
.tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18rpx;
}

.topbar,
.bind-card,
.item,
.tabs {
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

.title,
.section-title,
.item-title {
  display: block;
  color: var(--ui-color-text);
  font-weight: 900;
}

.title {
  margin-top: 8rpx;
  font-size: 42rpx;
  line-height: 1.25;
}

.subtitle {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.section-title,
.item-title {
  font-size: 30rpx;
}

.bind-card {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.field {
  min-height: 88rpx;
  box-sizing: border-box;
  padding: 0 24rpx;
  border: 1rpx solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: #fff;
  color: var(--ui-color-text);
  font-size: 28rpx;
}

.tab {
  flex: 1;
  min-height: 72rpx;
  border-radius: var(--ui-radius-md);
  background: transparent;
  color: var(--ui-color-muted);
  font-size: 26rpx;
}

.tab.active {
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
  font-weight: 800;
}

.actions {
  margin-top: 18rpx;
  justify-content: flex-end;
}

.error {
  color: var(--ui-color-danger);
  font-size: 24rpx;
}
</style>
