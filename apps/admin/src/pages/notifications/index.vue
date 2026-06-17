<template>
  <section class="admin-page">
    <AdminPageHeader title="通知中心" eyebrow="运营触达" subtitle="管理订阅消息、短信和本地 mock 通知任务；真实外部通道默认关闭。">
      <template #actions>
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="openTemplateCreate">新建模板</el-button>
        <el-button type="primary" plain @click="openTaskCreate">新建任务</el-button>
      </template>
    </AdminPageHeader>

    <el-alert
      class="notice"
      type="warning"
      show-icon
      :closable="false"
      title="微信订阅消息和短信只通过官方能力发送；未开启对应 env 时，发送任务会记录为跳过。"
    />

    <section class="notification-section">
      <template v-if="visibleSection === 'templates'">
        <section class="table-panel">
          <el-table :data="templates" empty-text="暂无通知模板">
            <el-table-column prop="code" label="编码" min-width="180" />
            <el-table-column prop="name" label="名称" min-width="180" />
            <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
            <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="templateStatusType(row.status)">{{ templateStatusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column prop="templateKey" label="外部模板 Key" min-width="180" show-overflow-tooltip />
            <el-table-column prop="updatedAt" label="更新时间" width="180"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
            <el-table-column label="操作" width="100"><template #default="{ row }"><el-button size="small" @click="openTemplateEdit(row)">编辑</el-button></template></el-table-column>
          </el-table>
        </section>
      </template>

      <template v-else-if="visibleSection === 'tasks'">
        <section class="table-panel">
          <el-table :data="tasks" empty-text="暂无通知任务">
            <el-table-column prop="name" label="任务" min-width="200" />
            <el-table-column label="模板" min-width="180"><template #default="{ row }">{{ row.template?.name || row.templateId }}</template></el-table-column>
            <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
            <el-table-column label="状态" width="140"><template #default="{ row }"><el-tag :type="taskStatusType(row.status)">{{ taskStatusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column prop="logCount" label="日志" width="90" />
            <el-table-column label="发送时间" width="180"><template #default="{ row }">{{ row.sentAt ? formatTime(row.sentAt) : "-" }}</template></el-table-column>
            <el-table-column label="操作" width="160">
              <template #default="{ row }">
                <el-button size="small" @click="loadLogs(row.id)">日志</el-button>
                <el-button size="small" type="primary" :disabled="!canSend(row.status)" @click="sendNow(row.id)">发送</el-button>
              </template>
            </el-table-column>
          </el-table>
        </section>
      </template>

      <template v-else>
        <section class="table-panel">
          <el-table :data="logs" empty-text="暂无发送日志">
            <el-table-column label="任务" min-width="180"><template #default="{ row }">{{ row.task?.name || row.taskId || "-" }}</template></el-table-column>
            <el-table-column label="模板" min-width="160"><template #default="{ row }">{{ row.template?.name || row.templateId || "-" }}</template></el-table-column>
            <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
            <el-table-column prop="recipient" label="接收方" min-width="180" show-overflow-tooltip />
            <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="logStatusType(row.status)">{{ logStatusText(row.status) }}</el-tag></template></el-table-column>
            <el-table-column prop="errorMessage" label="说明" min-width="220" show-overflow-tooltip />
            <el-table-column label="创建时间" width="180"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
          </el-table>
        </section>
      </template>
    </section>

    <el-dialog v-model="templateDialogVisible" :title="templateForm.id ? '编辑模板' : '新建模板'" width="680px">
      <el-form :model="templateForm" label-width="116px">
        <el-form-item label="编码"><el-input v-model="templateForm.code" :disabled="Boolean(templateForm.id)" placeholder="registration_success" /></el-form-item>
        <el-form-item label="名称"><el-input v-model="templateForm.name" /></el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="templateForm.channel" style="width: 100%">
            <el-option label="Mock" value="MOCK" />
            <el-option label="微信订阅消息" value="WECHAT_SUBSCRIBE" />
            <el-option label="短信" value="SMS" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="templateForm.status" style="width: 100%">
            <el-option label="草稿" value="DRAFT" />
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item label="标题"><el-input v-model="templateForm.title" /></el-form-item>
        <el-form-item label="外部模板 Key"><el-input v-model="templateForm.templateKey" /></el-form-item>
        <el-form-item label="内容 JSON"><el-input v-model="templateForm.contentText" type="textarea" :rows="6" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="templateForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDialogVisible" title="新建任务" width="680px">
      <el-form :model="taskForm" label-width="116px">
        <el-form-item label="任务名"><el-input v-model="taskForm.name" /></el-form-item>
        <el-form-item label="模板">
          <el-select v-model="taskForm.templateId" style="width: 100%">
            <el-option v-for="template in activeTemplates" :key="template.id" :label="`${template.name} (${channelText(template.channel)})`" :value="template.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标类型"><el-input v-model="taskForm.targetType" /></el-form-item>
        <el-form-item label="Payload JSON"><el-input v-model="taskForm.payloadText" type="textarea" :rows="6" placeholder='{"userIds":["..."]}' /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask">保存</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { currentRoute } from "../../router";
import {
  createNotificationTask,
  createNotificationTemplate,
  listNotificationLogs,
  listNotificationTasks,
  listNotificationTemplates,
  sendNotificationTaskNow,
  updateNotificationTemplate
} from "../../services/admin";
import type { NotificationLog, NotificationTask, NotificationTaskStatus, NotificationTemplate } from "../../services/types";

const activeTab = ref("templates");
const templates = ref<NotificationTemplate[]>([]);
const tasks = ref<NotificationTask[]>([]);
const logs = ref<NotificationLog[]>([]);
const templateDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const templateForm = reactive({
  id: "",
  code: "",
  name: "",
  channel: "MOCK",
  status: "DRAFT",
  title: "",
  templateKey: "",
  contentText: "{\n  \"body\": \"\"\n}",
  remark: ""
});
const taskForm = reactive({
  name: "",
  templateId: "",
  targetType: "MANUAL",
  payloadText: "{}"
});
const activeTemplates = computed(() => templates.value.filter((item) => item.status === "ACTIVE"));
const routeSection = computed(() => {
  const path = currentRoute.value.path;
  if (path.endsWith("/tasks")) return "tasks";
  if (path.endsWith("/logs")) return "logs";
  if (path.endsWith("/templates")) return "templates";
  return "";
});
const visibleSection = computed(() => routeSection.value || activeTab.value);

onMounted(() => void loadAll());

async function loadAll() {
  const [templateData, taskData, logData] = await Promise.all([
    listNotificationTemplates({ page: 1, pageSize: 100 }),
    listNotificationTasks({ page: 1, pageSize: 100 }),
    listNotificationLogs({ page: 1, pageSize: 100 })
  ]);
  templates.value = templateData.items;
  tasks.value = taskData.items;
  logs.value = logData.items;
}

function openTemplateCreate() {
  Object.assign(templateForm, {
    id: "",
    code: "",
    name: "",
    channel: "MOCK",
    status: "DRAFT",
    title: "",
    templateKey: "",
    contentText: "{\n  \"body\": \"\"\n}",
    remark: ""
  });
  templateDialogVisible.value = true;
}

function openTemplateEdit(row: NotificationTemplate) {
  Object.assign(templateForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    channel: row.channel,
    status: row.status,
    title: row.title ?? "",
    templateKey: row.templateKey ?? "",
    contentText: JSON.stringify(row.contentJson ?? {}, null, 2),
    remark: row.remark ?? ""
  });
  templateDialogVisible.value = true;
}

async function saveTemplate() {
  const payload = {
    code: templateForm.code,
    name: templateForm.name,
    channel: templateForm.channel,
    status: templateForm.status,
    title: templateForm.title || null,
    templateKey: templateForm.templateKey || null,
    contentJson: parseJson(templateForm.contentText),
    remark: templateForm.remark || null
  };
  if (templateForm.id) await updateNotificationTemplate(templateForm.id, payload);
  else await createNotificationTemplate(payload);
  templateDialogVisible.value = false;
  await loadAll();
  ElMessage.success("模板已保存");
}

function openTaskCreate() {
  Object.assign(taskForm, {
    name: "",
    templateId: activeTemplates.value[0]?.id ?? "",
    targetType: "MANUAL",
    payloadText: "{}"
  });
  taskDialogVisible.value = true;
}

async function saveTask() {
  await createNotificationTask({
    name: taskForm.name,
    templateId: taskForm.templateId,
    targetType: taskForm.targetType,
    payloadJson: parseJson(taskForm.payloadText),
    status: "PENDING"
  });
  taskDialogVisible.value = false;
  activeTab.value = "tasks";
  await loadAll();
  ElMessage.success("任务已创建");
}

async function sendNow(id: string) {
  const response = await sendNotificationTaskNow(id);
  await loadAll();
  ElMessage.success(`发送完成：成功 ${response.result.successCount}，跳过 ${response.result.skippedCount}，失败 ${response.result.failedCount}`);
}

async function loadLogs(taskId: string) {
  logs.value = (await listNotificationLogs({ page: 1, pageSize: 100, taskId })).items;
  activeTab.value = "logs";
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || "{}") as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    // fall through
  }
  ElMessage.error("JSON 格式不正确");
  throw new Error("Invalid JSON");
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

function templateStatusType(status: string) {
  return status === "ACTIVE" ? "success" : status === "DISABLED" ? "info" : "warning";
}

function taskStatusType(status: string) {
  if (status === "SENT") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PARTIAL_FAILED") return "warning";
  return "info";
}

function logStatusType(status: string) {
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
.notice {
  margin-bottom: 16px;
}

.notification-section {
  margin-top: 12px;
}
</style>
