<template>
  <section class="admin-page">
    <AdminPageHeader title="通知中心" eyebrow="运营触达" subtitle="通知模板、发送任务、发送日志和外部通道配置；未配置 provider 时只记录 SKIPPED。">
      <template #actions>
        <el-button @click="loadAll">刷新</el-button>
        <el-button v-if="visibleSection === 'templates'" type="primary" @click="openTemplateCreate">新建模板</el-button>
        <el-button v-if="visibleSection === 'tasks'" type="primary" @click="openTaskCreate">新建任务</el-button>
        <el-button v-if="isConfigSection" type="primary" @click="saveChannelConfig">保存配置</el-button>
        <el-button v-if="isConfigSection" plain @click="testChannelConfig">测试配置</el-button>
      </template>
    </AdminPageHeader>

    <nav class="section-nav">
      <el-button v-for="item in navItems" :key="item.key" :type="visibleSection === item.key ? 'primary' : 'default'" @click="goSection(item.path)">
        {{ item.label }}
      </el-button>
    </nav>

    <el-alert
      class="notice"
      type="info"
      show-icon
      :closable="false"
      title="页面关系：先在通道配置中开启微信订阅或短信，再在通知模板维护外部模板 ID，最后在通知任务中选择发送对象并发送。"
    />

    <section v-if="visibleSection === 'overview'" class="overview-grid">
      <div class="overview-card">
        <span>通知模板</span>
        <strong>{{ templates.length }}</strong>
        <p>维护模板名称、用途、正文和外部模板 ID。</p>
      </div>
      <div class="overview-card">
        <span>通知任务</span>
        <strong>{{ tasks.length }}</strong>
        <p>按报名用户、已支付用户、指定手机号或手动名单创建任务。</p>
      </div>
      <div class="overview-card">
        <span>发送日志</span>
        <strong>{{ logs.length }}</strong>
        <p>查看 SENT / FAILED / SKIPPED 结果和下一步处理建议。</p>
      </div>
    </section>

    <section v-else-if="isConfigSection" class="table-panel">
      <div class="config-summary">
        <div>
          <h3>{{ configTitle }}</h3>
          <p>{{ channelConfig?.statusText || "正在读取配置" }}</p>
          <p class="muted-text">当前配置来源：{{ providerSourceText(channelConfig?.providerSource) }}；当前可发送：{{ channelConfig?.canSend ? "是" : "否" }}</p>
          <p v-if="channelConfig?.unavailableReason" class="muted-text">不可发送原因：{{ channelConfig.unavailableReason }}</p>
        </div>
        <div class="tag-stack">
          <el-tag :type="channelConfig?.centerEnabled ? 'success' : 'info'">总开关 {{ channelConfig?.centerEnabled ? "开启" : "关闭" }}</el-tag>
          <el-tag :type="channelConfig?.enabled ? 'success' : 'info'">通道 {{ channelConfig?.enabled ? "启用" : "停用" }}</el-tag>
        </div>
      </div>

      <el-radio-group v-if="visibleSection === 'config'" v-model="configChannel" class="config-tabs" @change="loadChannelConfig">
        <el-radio-button label="wechat">微信订阅消息</el-radio-button>
        <el-radio-button label="sms">短信</el-radio-button>
      </el-radio-group>

      <el-form :model="configForm" label-width="140px" class="config-form">
        <el-form-item label="通知中心总开关"><el-switch v-model="configForm.centerEnabled" /></el-form-item>
        <el-form-item label="通道开关"><el-switch v-model="configForm.enabled" /></el-form-item>
        <template v-if="currentConfigKind === 'sms'">
          <el-form-item label="短信供应商"><el-input v-model="configForm.provider" placeholder="aliyun / tencent / custom" /></el-form-item>
          <el-form-item label="短信签名"><el-input v-model="configForm.signature" placeholder="短信签名，例如 会务通知" /></el-form-item>
          <el-form-item label="短信模板 ID"><el-input v-model="configForm.smsTemplate" placeholder="供应商短信模板编号，不是随便填写" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="微信订阅模板 ID"><el-input v-model="configForm.templateKey" placeholder="微信公众平台或小程序后台提供的模板 ID" /></el-form-item>
        </template>
        <el-form-item label="API Key"><el-input v-model="configForm.apiKey" show-password :placeholder="secretPlaceholder(channelConfig?.secret?.apiKey)" /></el-form-item>
        <el-form-item label="API Secret"><el-input v-model="configForm.apiSecret" show-password :placeholder="secretPlaceholder(channelConfig?.secret?.apiSecret)" /></el-form-item>
        <el-form-item label="发送频率限制"><el-input-number v-model="configForm.rateLimitPerMinute" :min="0" :max="10000" /><span class="inline-help">次 / 分钟</span></el-form-item>
        <el-form-item label="失败重试策略"><div class="retry-row"><el-input-number v-model="configForm.retryMaxAttempts" :min="0" :max="10" /><span>次，间隔</span><el-input-number v-model="configForm.retryIntervalSeconds" :min="0" :max="86400" /><span>秒</span></div></el-form-item>
        <el-form-item label="运营备注"><el-input v-model="configForm.note" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <el-descriptions v-if="channelConfig?.envGuide?.length" class="env-guide" title="环境变量 fallback" :column="1" border>
        <el-descriptions-item v-for="item in channelConfig.envGuide" :key="item.name" :label="item.name">{{ item.location }}；{{ item.restartRequired ? "需要重启 API" : "通常无需重启" }}</el-descriptions-item>
      </el-descriptions>
    </section>

    <section v-else-if="visibleSection === 'templates'" class="table-panel">
      <el-table :data="templates" empty-text="暂无通知模板">
        <el-table-column prop="code" label="模板编码" min-width="180" />
        <el-table-column prop="name" label="模板名称" min-width="180" />
        <el-table-column label="用途" min-width="130"><template #default="{ row }">{{ purposeText(templatePurpose(row)) }}</template></el-table-column>
        <el-table-column label="渠道" width="150"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="templateStatusType(row.status)">{{ templateStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="templateKey" label="外部模板 ID" min-width="180" show-overflow-tooltip />
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
        <el-table-column label="目标类型" min-width="140"><template #default="{ row }">{{ recipientTypeText(row.targetType) }}</template></el-table-column>
        <el-table-column label="渠道" width="140"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
        <el-table-column label="Provider" min-width="220">
          <template #default="{ row }">
            <div>{{ providerSourceText(row.providerStatus?.providerSource) }}</div>
            <small>{{ row.providerStatus?.unavailableReason || row.providerStatus?.statusText || "-" }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="taskStatusType(row.status)">{{ taskStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column label="运营提示" min-width="220">
          <template #default="{ row }">
            <span>{{ skippedAdvice(row).text }}</span>
            <el-button v-if="skippedAdvice(row).path" link type="primary" @click="goSection(skippedAdvice(row).path!)">去配置</el-button>
          </template>
        </el-table-column>
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
        <el-table-column label="渠道" width="140"><template #default="{ row }">{{ channelText(row.channel) }}</template></el-table-column>
        <el-table-column prop="recipient" label="接收方" min-width="170" show-overflow-tooltip />
        <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="logStatusType(row.status)">{{ logStatusText(row.status) }}</el-tag></template></el-table-column>
        <el-table-column prop="errorMessage" label="技术说明" min-width="200" show-overflow-tooltip />
        <el-table-column label="运营下一步" min-width="260"><template #default="{ row }">{{ logAdvice(row).text }}</template></el-table-column>
        <el-table-column prop="createdAt" label="创建时间" width="180"><template #default="{ row }">{{ formatTime(row.createdAt) }}</template></el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="templateDialogVisible" :title="templateForm.id ? '编辑模板' : '新建模板'" width="760px">
      <el-form :model="templateForm" label-width="130px">
        <el-form-item label="模板名称"><el-input v-model="templateForm.name" placeholder="例如：报名成功通知" /></el-form-item>
        <el-form-item><template #label>模板编码<span class="label-help">系统内部识别模板用途，例如 registration_success。</span></template><el-input v-model="templateForm.code" :disabled="Boolean(templateForm.id)" placeholder="registration_success" /></el-form-item>
        <el-form-item label="渠道">
          <el-select v-model="templateForm.channel" style="width: 100%">
            <el-option label="站内 / Mock" value="MOCK" />
            <el-option label="微信订阅消息" value="WECHAT_SUBSCRIBE" />
            <el-option label="短信" value="SMS" />
          </el-select>
        </el-form-item>
        <el-form-item label="用途"><el-select v-model="templateForm.purpose" style="width: 100%"><el-option v-for="item in purposeOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item label="启用状态"><el-select v-model="templateForm.status" style="width: 100%"><el-option label="草稿" value="DRAFT" /><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="DISABLED" /></el-select></el-form-item>
        <el-form-item label="微信订阅模板 ID" v-if="templateForm.channel === 'WECHAT_SUBSCRIBE'"><el-input v-model="templateForm.templateKey" placeholder="微信公众平台或小程序后台提供的模板编号" /></el-form-item>
        <el-form-item label="短信模板 ID" v-else-if="templateForm.channel === 'SMS'"><el-input v-model="templateForm.templateKey" placeholder="短信供应商提供的模板编号" /></el-form-item>
        <el-form-item label="标题"><el-input v-model="templateForm.title" /></el-form-item>
        <el-form-item label="正文内容"><el-input v-model="templateForm.bodyText" type="textarea" :rows="5" placeholder="请输入通知正文，可点击下方变量插入。" /></el-form-item>
        <el-form-item label="变量插入器"><div class="variable-row"><el-button v-for="item in variableButtons" :key="item.value" size="small" @click="insertTemplateVariable(item.value)">{{ item.label }}</el-button></div></el-form-item>
        <el-form-item label="高级模式"><el-switch v-model="templateForm.advanced" active-text="显示内容 JSON" inactive-text="隐藏" /></el-form-item>
        <el-form-item v-if="templateForm.advanced" label="内容 JSON"><el-input v-model="templateForm.contentText" type="textarea" :rows="6" placeholder="仅开发人员使用" /></el-form-item>
        <el-form-item label="备注"><el-input v-model="templateForm.remark" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="templateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="taskDialogVisible" title="新建任务" width="760px">
      <el-form :model="taskForm" label-width="130px">
        <el-form-item label="任务名称"><el-input v-model="taskForm.name" /></el-form-item>
        <el-form-item label="选择模板"><el-select v-model="taskForm.templateId" filterable style="width: 100%"><el-option v-for="template in activeTemplates" :key="template.id" :label="`${template.name} (${channelText(template.channel)})`" :value="template.id" /></el-select></el-form-item>
        <el-form-item label="发送渠道"><el-input :model-value="selectedTaskTemplate ? channelText(selectedTaskTemplate.channel) : '-'" disabled /></el-form-item>
        <el-form-item><template #label>发送对象类型<span class="label-help">决定这条通知发给谁，例如已支付用户只通知已完成缴费的人。</span></template><el-select v-model="taskForm.recipientType" style="width: 100%"><el-option v-for="item in recipientOptions" :key="item.value" :label="item.label" :value="item.value" /></el-select></el-form-item>
        <el-form-item v-if="needsConference" label="选择会议"><ConferenceSelect v-model="taskForm.conferenceId" placeholder="选择会议" /></el-form-item>
        <el-form-item v-if="taskForm.recipientType === 'MANUAL_PHONE'" label="指定手机号"><el-input v-model="taskForm.recipientText" type="textarea" :rows="3" placeholder="每行一个手机号，或用逗号分隔" /></el-form-item>
        <el-form-item v-if="taskForm.recipientType === 'SPECIFIC_USER'" label="指定用户 ID"><el-input v-model="taskForm.userIdsText" type="textarea" :rows="3" placeholder="每行一个 userId，或用逗号分隔" /></el-form-item>
        <el-form-item v-if="taskForm.recipientType === 'MANUAL_LIST'" label="手动导入名单"><el-input v-model="taskForm.recipientText" type="textarea" :rows="4" placeholder="每行一个接收方，手机号或 openid" /></el-form-item>
        <el-form-item label="计划发送时间"><el-date-picker v-model="taskForm.scheduledAt" type="datetime" value-format="YYYY-MM-DDTHH:mm:ss.SSSZ" placeholder="留空表示手动发送" /></el-form-item>
        <el-form-item label="立即发送"><el-switch v-model="taskForm.sendImmediately" /></el-form-item>
        <el-form-item label="变量预览"><pre class="inline-preview">{{ taskVariablePreview }}</pre></el-form-item>
        <el-form-item label="高级模式"><el-switch v-model="taskForm.advanced" active-text="显示 Payload JSON" inactive-text="隐藏" /></el-form-item>
        <el-form-item v-if="taskForm.advanced" label="Payload JSON"><el-input v-model="taskForm.payloadText" type="textarea" :rows="6" placeholder="仅开发人员使用" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="taskDialogVisible = false">取消</el-button>
        <el-button @click="testTaskTemplate">测试发送</el-button>
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
import { ElMessage, ElMessageBox } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import ConferenceSelect from "../../components/selectors/ConferenceSelect.vue";
import { currentRoute, navigateTo } from "../../router";
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

const navItems = [
  { key: "overview", label: "通知概览", path: "/notifications" },
  { key: "config", label: "通道配置", path: "/notifications/config" },
  { key: "templates", label: "通知模板", path: "/notifications/templates" },
  { key: "tasks", label: "通知任务", path: "/notifications/tasks" },
  { key: "logs", label: "发送日志", path: "/notifications/logs" },
  { key: "wechat", label: "微信订阅消息", path: "/notifications/wechat-subscribe" },
  { key: "sms", label: "短信配置", path: "/notifications/sms" }
];
const variableButtons = [
  { label: "会议名称", value: "{{会议名称}}" },
  { label: "参会人姓名", value: "{{参会人姓名}}" },
  { label: "手机号", value: "{{手机号}}" },
  { label: "订单号", value: "{{订单号}}" },
  { label: "报名号", value: "{{报名号}}" },
  { label: "支付金额", value: "{{支付金额}}" },
  { label: "会议时间", value: "{{会议时间}}" },
  { label: "会议地点", value: "{{会议地点}}" },
  { label: "签到链接", value: "{{签到链接}}" }
];
const purposeOptions = [
  { label: "报名成功", value: "REGISTRATION_SUCCESS" },
  { label: "支付成功", value: "PAYMENT_SUCCESS" },
  { label: "会前提醒", value: "BEFORE_EVENT" },
  { label: "签到提醒", value: "CHECKIN_REMINDER" },
  { label: "发票通知", value: "INVOICE_NOTICE" },
  { label: "自定义", value: "CUSTOM" }
];
const recipientOptions = [
  { label: "报名用户", value: "REGISTERED_USERS" },
  { label: "已支付用户", value: "PAID_USERS" },
  { label: "未支付用户", value: "UNPAID_USERS" },
  { label: "已签到用户", value: "CHECKED_IN_USERS" },
  { label: "未签到用户", value: "UNCHECKED_IN_USERS" },
  { label: "指定手机号", value: "MANUAL_PHONE" },
  { label: "指定用户", value: "SPECIFIC_USER" },
  { label: "手动导入名单", value: "MANUAL_LIST" }
];

const templates = ref<NotificationTemplate[]>([]);
const tasks = ref<NotificationTask[]>([]);
const logs = ref<NotificationLog[]>([]);
const channelConfig = ref<NotificationChannelConfig | null>(null);
const configChannel = ref<"wechat" | "sms">("wechat");
const templateDialogVisible = ref(false);
const taskDialogVisible = ref(false);
const previewDialogVisible = ref(false);
const previewText = ref("");
const templateForm = reactive({ id: "", code: "", name: "", channel: "MOCK", status: "DRAFT", purpose: "REGISTRATION_SUCCESS", title: "", templateKey: "", bodyText: "", contentText: "", advanced: false, remark: "" });
const taskForm = reactive({ name: "", templateId: "", recipientType: "PAID_USERS", conferenceId: "", recipientText: "", userIdsText: "", scheduledAt: "", sendImmediately: false, advanced: false, payloadText: "{}" });
const configForm = reactive({ centerEnabled: false, enabled: false, provider: "", signature: "", templateKey: "", smsTemplate: "", apiKey: "", apiSecret: "", rateLimitPerMinute: 60, retryMaxAttempts: 0, retryIntervalSeconds: 60, note: "" });
const activeTemplates = computed(() => templates.value.filter((item) => item.status === "ACTIVE"));
const routeSection = computed(() => {
  const path = currentRoute.value.path;
  if (path.endsWith("/config")) return "config";
  if (path.endsWith("/tasks")) return "tasks";
  if (path.endsWith("/logs")) return "logs";
  if (path.endsWith("/templates")) return "templates";
  if (path.endsWith("/wechat-subscribe")) return "wechat";
  if (path.endsWith("/sms")) return "sms";
  return "overview";
});
const visibleSection = computed(() => routeSection.value);
const isConfigSection = computed(() => ["config", "wechat", "sms"].includes(visibleSection.value));
const currentConfigKind = computed<"wechat" | "sms">(() => (visibleSection.value === "sms" ? "sms" : visibleSection.value === "wechat" ? "wechat" : configChannel.value));
const configTitle = computed(() => (currentConfigKind.value === "sms" ? "短信通道配置" : "微信订阅消息通道配置"));
const selectedTaskTemplate = computed(() => templates.value.find((item) => item.id === taskForm.templateId));
const needsConference = computed(() => ["REGISTERED_USERS", "PAID_USERS", "UNPAID_USERS", "CHECKED_IN_USERS", "UNCHECKED_IN_USERS"].includes(taskForm.recipientType));
const taskVariablePreview = computed(() => JSON.stringify({ 会议名称: "示例会议", 参会人姓名: "张三", 订单号: "REG2026..." }, null, 2));

onMounted(() => void loadAll());
watch(visibleSection, () => void loadAll());
watch(currentConfigKind, () => void loadChannelConfig());

async function loadAll() {
  const [templateData, taskData, logData] = await Promise.all([listNotificationTemplates({ page: 1, pageSize: 100 }), listNotificationTasks({ page: 1, pageSize: 100 }), listNotificationLogs({ page: 1, pageSize: 100 })]);
  templates.value = templateData.items;
  tasks.value = taskData.items;
  logs.value = logData.items;
  if (isConfigSection.value) await loadChannelConfig();
}

function goSection(path: string) {
  navigateTo(path);
}

function openTemplateCreate() {
  Object.assign(templateForm, { id: "", code: "", name: "", channel: "MOCK", status: "DRAFT", purpose: "REGISTRATION_SUCCESS", title: "", templateKey: "", bodyText: "", contentText: "", advanced: false, remark: "" });
  templateDialogVisible.value = true;
}

function openTemplateEdit(row: NotificationTemplate) {
  const content = row.contentJson ?? {};
  Object.assign(templateForm, {
    id: row.id,
    code: row.code,
    name: row.name,
    channel: row.channel,
    status: row.status,
    purpose: String(content.purpose || "CUSTOM"),
    title: row.title ?? "",
    templateKey: row.templateKey ?? "",
    bodyText: String(content.body || content.content || ""),
    contentText: JSON.stringify(content, null, 2),
    advanced: false,
    remark: row.remark ?? ""
  });
  templateDialogVisible.value = true;
}

async function saveTemplate() {
  const contentJson = templateForm.advanced ? parseJson(templateForm.contentText) : { purpose: templateForm.purpose, body: templateForm.bodyText, content: templateForm.bodyText, variables: variableButtons.map((item) => item.value) };
  const payload = { code: templateForm.code, name: templateForm.name, channel: templateForm.channel, status: templateForm.status, purpose: templateForm.purpose, title: templateForm.title || null, templateKey: templateForm.templateKey || null, bodyText: templateForm.bodyText, contentJson, remark: templateForm.remark || null };
  if (templateForm.id) await updateNotificationTemplate(templateForm.id, payload);
  else await createNotificationTemplate(payload);
  templateDialogVisible.value = false;
  await loadAll();
  ElMessage.success("模板已保存");
}

function openTaskCreate() {
  Object.assign(taskForm, { name: "", templateId: activeTemplates.value[0]?.id ?? "", recipientType: "PAID_USERS", conferenceId: "", recipientText: "", userIdsText: "", scheduledAt: "", sendImmediately: false, advanced: false, payloadText: "{}" });
  taskDialogVisible.value = true;
}

async function saveTask() {
  const payloadJson = taskForm.advanced ? parseJson(taskForm.payloadText) : buildTaskPayload();
  const created = await createNotificationTask({ name: taskForm.name, templateId: taskForm.templateId, recipientType: taskForm.recipientType, targetType: taskForm.recipientType, conferenceId: taskForm.conferenceId || null, scheduledAt: taskForm.scheduledAt || null, payloadJson, status: "PENDING" });
  if (taskForm.sendImmediately) await sendNotificationTaskNow(created.id);
  taskDialogVisible.value = false;
  await loadAll();
  ElMessage.success(taskForm.sendImmediately ? "任务已创建并发送，请查看日志" : "任务已创建");
}

async function testTaskTemplate() {
  if (!taskForm.templateId) return ElMessage.warning("请先选择模板");
  const response = await testSendNotificationTemplate(taskForm.templateId, { recipients: splitList(taskForm.recipientText || "test-recipient"), variables: { name: "测试用户" } });
  await loadAll();
  ElMessage.success(`测试完成：成功 ${response.result.successCount}，跳过 ${response.result.skippedCount}，失败 ${response.result.failedCount}`);
}

function buildTaskPayload() {
  return {
    recipientType: taskForm.recipientType,
    targetType: taskForm.recipientType,
    conferenceId: taskForm.conferenceId || undefined,
    recipients: splitList(taskForm.recipientText),
    userIds: splitList(taskForm.userIdsText),
    variables: { 会议名称: "示例会议" }
  };
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
  navigateTo("/notifications/logs");
}

async function previewTemplate(row: NotificationTemplate) {
  const response = await previewNotificationTemplate(row.id, { variables: { 会议名称: "示例会议", 参会人姓名: "测试用户" } });
  previewText.value = JSON.stringify(response, null, 2);
  previewDialogVisible.value = true;
}

async function testSendTemplate(row: NotificationTemplate) {
  const response = await testSendNotificationTemplate(row.id, { recipients: ["test-recipient"], variables: { 会议名称: "示例会议", 参会人姓名: "测试用户" } });
  await loadAll();
  ElMessage.success(`测试发送完成：成功 ${response.result.successCount}，跳过 ${response.result.skippedCount}，失败 ${response.result.failedCount}`);
}

async function loadChannelConfig() {
  channelConfig.value = currentConfigKind.value === "sms" ? await getSmsConfig() : await getWechatSubscribeConfig();
  Object.assign(configForm, { centerEnabled: Boolean(channelConfig.value.centerEnabled), enabled: Boolean(channelConfig.value.enabled), provider: channelConfig.value.provider || "", signature: channelConfig.value.signature || "", templateKey: channelConfig.value.templateKey || "", smsTemplate: channelConfig.value.smsTemplate || "", apiKey: "", apiSecret: "", rateLimitPerMinute: Number(channelConfig.value.rateLimitPerMinute ?? 60), retryMaxAttempts: Number(channelConfig.value.retryMaxAttempts ?? 0), retryIntervalSeconds: Number(channelConfig.value.retryIntervalSeconds ?? 60), note: "" });
}

async function saveChannelConfig() {
  channelConfig.value = currentConfigKind.value === "sms" ? await updateSmsConfig(configForm) : await updateWechatSubscribeConfig(configForm);
  configForm.apiKey = "";
  configForm.apiSecret = "";
  ElMessage.success("配置已保存；敏感字段不会回显");
}

async function testChannelConfig() {
  const config = channelConfig.value;
  await ElMessageBox.alert(config?.canSend ? "当前配置已具备发送条件。" : config?.unavailableReason || "当前配置不可发送，请按页面提示补齐。", "通道配置测试", { type: config?.canSend ? "success" : "warning" });
}

function insertTemplateVariable(value: string) {
  templateForm.bodyText = `${templateForm.bodyText}${value}`;
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

function splitList(value: string): string[] {
  return value.split(/[\n,，;；]+/).map((item) => item.trim()).filter(Boolean);
}

function skippedAdvice(row: NotificationTask): { text: string; path?: string } {
  return operatorAdvice(row.providerStatus?.unavailableReason || "", row.channel, row.status);
}

function logAdvice(row: NotificationLog): { text: string; path?: string } {
  return operatorAdvice(`${row.errorCode || ""} ${row.errorMessage || ""}`, row.channel, row.status);
}

function operatorAdvice(reason: string, channel: string, status: string): { text: string; path?: string } {
  if (status !== "SKIPPED" && !/未|missing|disabled|DISABLED|MISSING|RESERVED/.test(reason)) return { text: "无需处理" };
  if (/总开关|通知中心/.test(reason)) return { text: "通知中心未开启，请前往通道配置打开总开关。", path: "/notifications/config" };
  if (/模板|template|TEMPLATE/.test(reason)) return { text: "外部模板 ID 未配置，请前往通知模板或通道配置填写。", path: channel === "SMS" ? "/notifications/sms" : "/notifications/wechat-subscribe" };
  if (/订阅|SUBSCRIPTION/.test(reason)) return { text: "用户未订阅，小程序端需要引导用户授权订阅消息。" };
  if (/短信|供应商|SMS/.test(reason) || channel === "SMS") return { text: "短信供应商未配置，请前往短信配置补齐供应商、签名、模板和密钥。", path: "/notifications/sms" };
  if (channel === "WECHAT_SUBSCRIBE") return { text: "微信订阅消息未完成配置，请检查通道开关、模板 ID 和用户订阅状态。", path: "/notifications/wechat-subscribe" };
  return { text: reason || "已跳过，请查看技术说明。" };
}

function canSend(status: NotificationTaskStatus) {
  return !["SENDING", "SENT", "CANCELLED"].includes(status);
}

function canRetry(status: NotificationTaskStatus) {
  return ["FAILED", "PARTIAL_FAILED", "SKIPPED"].includes(status);
}

function channelText(channel: string) {
  return ({ MOCK: "站内 / Mock", WECHAT_SUBSCRIBE: "微信订阅消息", SMS: "短信" } as Record<string, string>)[channel] ?? channel;
}

function providerSourceText(value?: string) {
  return ({ DB: "后台配置", ENV: "环境变量", disabled: "未配置" } as Record<string, string>)[value || ""] ?? value ?? "未配置";
}

function templatePurpose(row: NotificationTemplate) {
  return String(row.contentJson?.purpose || "CUSTOM");
}

function purposeText(value: string) {
  return Object.fromEntries(purposeOptions.map((item) => [item.value, item.label]))[value] ?? value;
}

function recipientTypeText(value: string) {
  return Object.fromEntries(recipientOptions.map((item) => [item.value, item.label]))[value] ?? value;
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
.notice,
.section-nav {
  margin-bottom: 16px;
}

.section-nav,
.variable-row,
.config-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}

.overview-card,
.table-panel {
  padding: 18px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #fff;
}

.overview-card span,
.muted-text,
.label-help,
.inline-help {
  color: #64748b;
  font-size: 12px;
}

.overview-card strong {
  display: block;
  margin: 8px 0;
  font-size: 28px;
  color: #0f172a;
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

.config-form {
  max-width: 780px;
}

.tag-stack,
.retry-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.env-guide {
  margin-top: 14px;
}

.inline-preview,
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
