<template>
  <section class="admin-page">
    <AdminPageHeader title="通知中心" eyebrow="运营触达" subtitle="管理 mock、微信订阅消息和短信任务；外部通道未配置时只记录跳过。">
      <template #actions>
        <el-button @click="loadAll">刷新</el-button>
        <el-button v-if="!isConfigSection" type="primary" @click="openTemplateCreate">新建模板</el-button>
        <el-button v-if="!isConfigSection" type="primary" plain @click="openTaskCreate">新建任务</el-button>
      </template>
    </AdminPageHeader>

    <el-alert
      class="notice"
      type="warning"
      show-icon
      :closable="false"
      title="微信订阅消息和短信只通过官方或供应商能力发送；未开启 env、未配置模板或用户未订阅时，任务会记录为 SKIPPED。"
    />

    <section class="notification-section">
      <section v-if="isConfigSection" class="table-panel">
        <div class="config-summary">
          <div>
            <h3>{{ visibleSection === "sms" ? "短信配置" : "微信订阅消息配置" }}</h3>
            <p>{{ channelConfig?.statusText || "正在读取配置" }}</p>
            <p class="muted-text">Provider 来源：{{ channelConfig?.providerSource || "disabled" }}；当前可发送：{{ channelConfig?.canSend ? "是" : "否" }}</p>
            <p v-if="channelConfig?.unavailableReason" class="muted-text">不可发送原因：{{ channelConfig.unavailableReason }}</p>
            <p v-if="visibleSection === 'sms'" class="muted-text">短信供应商未启用，相关任务会记录为 SKIPPED，不会伪造发送成功。</p>
            <p v-else class="muted-text">未配置微信模板 ID、用户未订阅或 provider 未启用时，发送日志会记录为 SKIPPED。</p>
          </div>
          <div class="tag-stack">
            <el-tag :type="channelConfig?.centerEnabled ? 'success' : 'info'">总开关 {{ channelConfig?.centerEnabled ? "开启" : "关闭" }}</el-tag>
            <el-tag :type="channelConfig?.enabled ? 'success' : 'info'">通道 {{ channelConfig?.enabled ? "启用" : "停用" }}</el-tag>
          </div>
        </div>
        <el-form :model="configForm" label-width="120px" class="config-form">
          <el-form-item label="通知总开关"><el-switch v-model="configForm.centerEnabled" /></el-form-item>
          <el-form-item label="启用开关"><el-switch v-model="configForm.enabled" /></el-form-item>
          <el-form-item v-if="visibleSection === 'sms'" label="供应商"><el-input v-model="configForm.provider" placeholder="aliyun / tencent" /></el-form-item>
          <el-form-item v-if="visibleSection === 'sms'" label="短信签名"><el-input v-model="configForm.signature" placeholder="短信签名" /></el-form-item>
          <el-form-item v-if="visibleSection === 'sms'" label="短信模板"><el-input v-model="configForm.smsTemplate" placeholder="供应商短信模板编码" /></el-form-item>
          <el-form-item v-else label="微信模板 ID"><el-input v-model="configForm.templateKey" placeholder="微信订阅消息模板 ID" /></el-form-item>
          <el-form-item label="API Key"><el-input v-model="configForm.apiKey" show-password :placeholder="secretPlaceholder(channelConfig?.secret?.apiKey)" /></el-form-item>
          <el-form-item label="API Secret"><el-input v-model="configForm.apiSecret" show-password :placeholder="secretPlaceholder(channelConfig?.secret?.apiSecret)" /></el-form-item>
          <el-form-item label="频率限制"><el-input-number v-model="configForm.rateLimitPerMinute" :min="0" :max="10000" /><span class="inline-help">次 / 分钟</span></el-form-item>
          <el-form-item label="失败重试"><div class="retry-row"><el-input-number v-model="configForm.retryMaxAttempts" :min="0" :max="10" /><span>次，间隔</span><el-input-number v-model="configForm.retryIntervalSeconds" :min="0" :max="86400" /><span>秒</span></div></el-form-item>
          <el-form-item label="说明"><el-input v-model="configForm.note" type="textarea" :rows="2" /></el-form-item>
          <el-form-item><el-button type="primary" @click="saveChannelConfig">保存配置说明</el-button></el-form-item>
        </el-form>
        <el-descriptions v-if="channelConfig?.envGuide?.length" class="env-guide" title="仍可通过服务器配置的项目" :column="1" border>
          <el-descriptions-item v-for="item in channelConfig.envGuide" :key="item.name" :label="item.name">{{ item.location }}；{{ item.restartRequired ? "需要重启 API" : "通常无需重启" }}</el-descriptions-item>
        </el-descriptions>
        <el-table :data="channelConfig?.templates ?? []" empty-text="暂无模板映射">
          <el-table-column prop="code" label="模板编码" min-width="160" />
          <el-table-column prop="name" label="模板名称" min-width="160" />
          <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="templateStatusType(row.status)">{{ templateStatusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column label="外部模板 Key" min-width="180"><template #default="{ row }">{{ row.templateKey || "未配置" }}</template></el-table-column>
        </el-table>
      </section>

      <section v-else-if="visibleSection === 'templates'" class="table-panel">
        <el-table :data="templates" empty-text="暂无通知模板">
          <el-table-column prop="code" label="编码" min-width="180" />
          <el-table-column prop="name" label="名称" min-width="180" />
          <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
          <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="templateStatusType(row.status)">{{ templateStatusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column prop="templateKey" label="外部模板 Key" min-width="180" show-overflow-tooltip />
          <el-table-column prop="updatedAt" label="更新时间" width="180"><template #default="{ row }">{{ formatTime(row.updatedAt) }}</template></el-table-column>
          <el-table-column label="操作" width="220">
            <template #default="{ row }">
              <el-button size="small" @click="openTemplateEdit(row)">编辑</el-button>
              <el-button size="small" @click="previewTemplate(row)">预览</el-button>
              <el-button size="small" type="primary" @click="testSendTemplate(row)">测试</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-else-if="visibleSection === 'tasks'" class="table-panel">
        <el-table :data="tasks" empty-text="暂无通知任务">
          <el-table-column prop="name" label="任务" min-width="200" />
          <el-table-column label="模板" min-width="180"><template #default="{ row }">{{ row.template?.name || row.templateId }}</template></el-table-column>
          <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
          <el-table-column label="Provider" min-width="220">
            <template #default="{ row }">
              <div>{{ row.providerStatus?.providerSource || "-" }}</div>
              <small>{{ row.providerStatus?.unavailableReason || row.providerStatus?.statusText || "-" }}</small>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="140"><template #default="{ row }"><el-tag :type="taskStatusType(row.status)">{{ taskStatusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column prop="logCount" label="日志" width="90" />
          <el-table-column label="发送时间" width="180"><template #default="{ row }">{{ row.sentAt ? formatTime(row.sentAt) : "-" }}</template></el-table-column>
          <el-table-column label="操作" width="210">
            <template #default="{ row }">
              <el-button size="small" @click="loadLogs(row.id)">日志</el-button>
              <el-button size="small" type="primary" :disabled="!canSend(row.status)" @click="sendNow(row.id)">发送</el-button>
              <el-button size="small" :disabled="!canRetry(row.status)" @click="retryTask(row.id)">重试</el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>

      <section v-else class="table-panel">
        <el-table :data="logs" empty-text="暂无发送日志">
          <el-table-column label="任务" min-width="180"><template #default="{ row }">{{ row.task?.name || row.taskId || "-" }}</template></el-table-column>
          <el-table-column label="模板" min-width="160"><template #default="{ row }">{{ row.template?.name || row.templateId || "-" }}</template></el-table-column>
          <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
          <el-table-column prop="recipient" label="接收方" min-width="180" show-overflow-tooltip />
          <el-table-column label="状态" width="130"><template #default="{ row }"><el-tag :type="logStatusType(row.status)">{{ logStatusText(row.status) }}</el-tag></template></el-table-column>
          <el-table-column prop="errorMessage" label="说明" min-width="220" show-overflow-tooltip />
          <el-table-column prop="errorCode" label="原因码" min-width="180" show-overflow-tooltip />
          <el-table-column label="创建时间" width="180"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
        </el-table>
      </section>
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
        <el-form-item label="目标类型"><el-input v-model="taskForm.targetType" placeholder="MANUAL / REGISTRATION_SUCCESS / PAYMENT_SUCCESS / REFUND_UPDATE / BEFORE_EVENT" /></el-form-item>
        <el-form-item label="Payload JSON"><el-input v-model="taskForm.payloadText" type="textarea" :rows="6" placeholder='{"userIds":["..."],"recipients":["..."]}' /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTask">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewDialogVisible" title="模板预览" width="620px">
      <pre class="preview-box">{{ previewText }}</pre>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import { currentRoute } from "../../router";
import {
  createNotificationTask,
  createNotificationTemplate,
  getSmsConfig,
  getWechatSubscribeConfig,
  listNotificationLogs,
  listNotificationTasks,
  listNotificationTemplates,
  previewNotificationTemplate,
  retryNotificationTask,
  sendNotificationTaskNow,
  testSendNotificationTemplate,
  updateNotificationTemplate,
  updateSmsConfig,
  updateWechatSubscribeConfig
} from "../../services/admin";
import type { NotificationChannelConfig, NotificationLog, NotificationTask, NotificationTaskStatus, NotificationTemplate } from "../../services/types";

const activeTab = ref("templates");
const templates = ref<NotificationTemplate[]>([]);
const tasks = ref<NotificationTask[]>([]);
const logs = ref<NotificationLog[]>([]);
const channelConfig = ref<NotificationChannelConfig | null>(null);
const templateDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const previewText = ref("");
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
const configForm = reactive({ centerEnabled: false, enabled: false, provider: "", signature: "", templateKey: "", smsTemplate: "", apiKey: "", apiSecret: "", rateLimitPerMinute: 60, retryMaxAttempts: 0, retryIntervalSeconds: 60, note: "" });
const activeTemplates = computed(() => templates.value.filter((item) => item.status === "ACTIVE"));
const routeSection = computed(() => {
  const path = currentRoute.value.path;
  if (path.endsWith("/tasks")) return "tasks";
  if (path.endsWith("/logs")) return "logs";
  if (path.endsWith("/templates")) return "templates";
  if (path.endsWith("/wechat-subscribe")) return "wechat";
  if (path.endsWith("/sms")) return "sms";
  return "";
});
const visibleSection = computed(() => routeSection.value || activeTab.value);
const isConfigSection = computed(() => visibleSection.value === "wechat" || visibleSection.value === "sms");

onMounted(() => void loadAll());
watch(visibleSection, () => void loadAll());

async function loadAll() {
  const [templateData, taskData, logData] = await Promise.all([
    listNotificationTemplates({ page: 1, pageSize: 100 }),
    listNotificationTasks({ page: 1, pageSize: 100 }),
    listNotificationLogs({ page: 1, pageSize: 100 })
  ]);
  templates.value = templateData.items;
  tasks.value = taskData.items;
  logs.value = logData.items;
  if (isConfigSection.value) await loadChannelConfig();
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

async function retryTask(id: string) {
  const response = await retryNotificationTask(id);
  await loadAll();
  ElMessage.success(`重试完成：成功 ${response.result.successCount}，跳过 ${response.result.skippedCount}，失败 ${response.result.failedCount}`);
}

async function loadLogs(taskId: string) {
  logs.value = (await listNotificationLogs({ page: 1, pageSize: 100, taskId })).items;
  activeTab.value = "logs";
}

async function previewTemplate(row: NotificationTemplate) {
  const response = await previewNotificationTemplate(row.id, { variables: { name: "测试用户", conference: "示例会议" } });
  previewText.value = JSON.stringify(response, null, 2);
  previewDialogVisible.value = true;
}

async function testSendTemplate(row: NotificationTemplate) {
  const response = await testSendNotificationTemplate(row.id, { recipients: ["test-recipient"], variables: { name: "测试用户" } });
  await loadAll();
  ElMessage.success(`测试发送完成：成功 ${response.result.successCount}，跳过 ${response.result.skippedCount}，失败 ${response.result.failedCount}`);
}

async function loadChannelConfig() {
  channelConfig.value = visibleSection.value === "sms" ? await getSmsConfig() : await getWechatSubscribeConfig();
  Object.assign(configForm, {
    centerEnabled: Boolean(channelConfig.value.centerEnabled),
    enabled: Boolean(channelConfig.value.enabled),
    provider: channelConfig.value.provider || "",
    signature: channelConfig.value.signature || "",
    templateKey: channelConfig.value.templateKey || "",
    smsTemplate: channelConfig.value.smsTemplate || "",
    apiKey: "",
    apiSecret: "",
    rateLimitPerMinute: Number(channelConfig.value.rateLimitPerMinute ?? 60),
    retryMaxAttempts: Number(channelConfig.value.retryMaxAttempts ?? 0),
    retryIntervalSeconds: Number(channelConfig.value.retryIntervalSeconds ?? 60),
    note: ""
  });
}

async function saveChannelConfig() {
  channelConfig.value = visibleSection.value === "sms" ? await updateSmsConfig(configForm) : await updateWechatSubscribeConfig(configForm);
  configForm.apiKey = "";
  configForm.apiSecret = "";
  ElMessage.success("配置已保存；敏感字段不会回显");
}

function secretPlaceholder(secret?: { configured: boolean; masked: string }) {
  return secret?.configured ? `已配置：${secret.masked || "******"}；留空不修改` : "未配置，填写后加密保存";
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

function canRetry(status: NotificationTaskStatus) {
  return ["FAILED", "PARTIAL_FAILED", "SKIPPED"].includes(status);
}

function channelText(channel: string) {
  return ({ MOCK: "Mock", WECHAT_SUBSCRIBE: "微信订阅消息", SMS: "短信" } as Record<string, string>)[channel] ?? channel;
}

function templateStatusText(status: string) {
  return ({ DRAFT: "草稿", ACTIVE: "启用", DISABLED: "停用" } as Record<string, string>)[status] ?? status;
}

function taskStatusText(status: string) {
  return ({ DRAFT: "草稿", PENDING: "待发送", SENDING: "发送中", SENT: "已发送", PARTIAL_FAILED: "部分失败", FAILED: "失败", CANCELLED: "已取消", SKIPPED: "已跳过" } as Record<string, string>)[status] ?? status;
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
  if (status === "PARTIAL_FAILED" || status === "SKIPPED") return "warning";
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

.config-summary {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}

.config-summary h3 {
  margin: 0 0 6px;
}

.config-summary p {
  margin: 0 0 4px;
}

.config-form {
  max-width: 760px;
}

.tag-stack,
.retry-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.inline-help {
  margin-left: 8px;
  color: #64748b;
  font-size: 13px;
}

.env-guide {
  margin: 12px 0 16px;
}

.preview-box {
  max-height: 420px;
  overflow: auto;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
  color: #1f2937;
  white-space: pre-wrap;
}
</style>
