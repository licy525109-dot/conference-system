<template>
  <section class="admin-page wecom-page">
    <AdminPageHeader title="企微客户群" eyebrow="WeCom" subtitle="企业微信客户联系配置、客户群同步、欢迎语、群发任务和回调事件。">
      <template #actions>
        <el-button @click="loadAll">刷新</el-button>
        <el-button type="primary" @click="goConfig">接入配置</el-button>
      </template>
    </AdminPageHeader>

    <section class="status-grid">
      <div v-for="item in statusCards" :key="item.label" class="status-card">
        <span>{{ item.label }}</span>
        <strong :class="item.ok ? 'is-ok' : 'is-warn'">{{ item.value }}</strong>
      </div>
    </section>

    <section v-if="section === 'config'" class="config-layout">
      <aside class="guide-panel">
        <h3>企微配置指引</h3>
        <ol>
          <li v-for="step in guideSteps" :key="step">{{ step }}</li>
        </ol>
        <div class="callback-box">
          <span>客户联系回调 URL</span>
          <code>{{ config.customerContactCallbackUrl || "-" }}</code>
          <el-button size="small" @click="copyText(config.customerContactCallbackUrl)">复制</el-button>
        </div>
        <div class="callback-box">
          <span>应用回调 URL</span>
          <code>{{ config.appCallbackUrl || "-" }}</code>
          <el-button size="small" @click="copyText(config.appCallbackUrl)">复制</el-button>
        </div>
      </aside>

      <section class="table-panel config-panel">
        <div class="panel-heading">
          <div>
            <h3>接入配置</h3>
            <p>敏感字段保存后加密入库，接口只返回脱敏状态。</p>
          </div>
          <el-switch v-model="configForm.enabled" active-text="启用企微客户群能力" />
        </div>
        <el-form label-position="top" :model="configForm" class="config-form">
          <el-row :gutter="16">
            <el-col :span="24">
              <el-form-item>
                <template #label>接入模式<FieldHelp content="推荐使用自建应用模式。新版企业微信可能不再展示客户联系 Secret，旧模式仅用于历史兼容。" /></template>
                <el-radio-group v-model="configForm.authMode" class="auth-mode-group">
                  <el-radio-button label="SELF_BUILT_APP">自建应用模式（推荐）</el-radio-button>
                  <el-radio-button label="LEGACY_CUSTOMER_CONTACT">旧客户联系 Secret 模式</el-radio-button>
                </el-radio-group>
                <p class="form-tip">{{ authModeTip }}</p>
              </el-form-item>
            </el-col>
            <el-col :span="12"><el-form-item><template #label>企业 ID CorpID<FieldHelp content="企业微信管理后台「我的企业」中的企业 ID，形如 ww 开头。" /></template><el-input v-model="configForm.corpId" placeholder="ww..." /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>自建应用 AgentID<FieldHelp content="自建应用详情页中的 AgentID。用于应用回调和自建应用 Secret 模式。" /></template><el-input v-model="configForm.agentId" placeholder="数字 AgentID" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>客户联系 Secret<FieldHelp content="旧版企业微信客户联系 Secret。自建应用模式不需要填写；新版企业微信未展示时请留空。" /></template><el-input v-model="configForm.customerContactSecret" :placeholder="secretPlaceholder('customerContactSecret')" show-password /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>自建应用 Secret<FieldHelp content="推荐模式使用的 Secret。请在企业微信自建应用详情页复制，保存后仅加密存储。" /></template><el-input v-model="configForm.appSecret" :placeholder="secretPlaceholder('appSecret')" show-password /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>回调 Token<FieldHelp content="填写到企业微信回调配置中的 Token，保存后加密存储，不返回明文。" /></template><el-input v-model="configForm.callbackToken" :placeholder="secretPlaceholder('callbackToken')" show-password /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>回调 EncodingAESKey<FieldHelp content="填写到企业微信回调配置中的 EncodingAESKey，保存后加密存储，不返回明文。" /></template><el-input v-model="configForm.callbackEncodingAesKey" :placeholder="secretPlaceholder('callbackEncodingAesKey')" show-password /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>客户联系回调 URL<FieldHelp content="复制到企业微信「客户联系」接收事件服务器配置中。" /></template><el-input v-model="configForm.customerContactCallbackUrl" /></el-form-item></el-col>
            <el-col :span="12"><el-form-item><template #label>应用回调 URL<FieldHelp content="复制到企业微信自建应用的接收消息/事件服务器配置中。" /></template><el-input v-model="configForm.appCallbackUrl" /></el-form-item></el-col>
            <el-col :span="24"><el-form-item label="备注"><el-input v-model="configForm.remark" type="textarea" :rows="3" /></el-form-item></el-col>
          </el-row>
        </el-form>
        <div class="action-row">
          <el-button type="primary" :loading="saving" @click="saveConfig">保存配置</el-button>
          <el-button :loading="testing" @click="testToken">测试 AccessToken</el-button>
          <el-button :loading="checking" @click="checkPermission">检测客户联系权限</el-button>
          <el-button :loading="syncing" @click="syncGroups">同步客户群</el-button>
        </div>
        <pre v-if="lastResult" class="json-panel">{{ lastResult }}</pre>
      </section>
    </section>

    <section v-else-if="section === 'groups' || section === 'bindings'" class="table-panel">
      <div class="panel-heading">
        <div>
          <h3>{{ section === "bindings" ? "群绑定会议" : "客户群列表" }}</h3>
          <p>{{ config.enabled ? `最近同步：${config.status?.lastGroupSyncedAt || "未同步"}` : "请先完成企微接入配置，然后同步企业微信客户群。" }}</p>
        </div>
        <div class="action-row">
          <el-input v-model="groupKeyword" placeholder="搜索客户群" clearable @keyup.enter="loadGroups" />
          <el-button @click="goConfig">配置入口</el-button>
          <el-button type="primary" :disabled="!config.enabled" :loading="syncing" @click="syncGroups">同步客户群</el-button>
        </div>
      </div>
      <el-empty v-if="!config.enabled" description="请先完成企微接入配置，然后同步企业微信客户群。" />
      <el-table v-else :data="groups" border>
        <el-table-column prop="name" label="客户群" min-width="180" />
        <el-table-column prop="chatId" label="chat_id" min-width="180" />
        <el-table-column prop="ownerName" label="群主" min-width="120" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column prop="conferenceTitle" label="绑定会议" min-width="180" />
        <el-table-column prop="lastSyncedAt" label="最近同步" min-width="170" />
        <el-table-column v-if="section === 'bindings'" label="操作" min-width="520">
          <template #default="{ row }">
            <div class="binding-form">
              <ConferenceSelect v-model="bindForms[row.id]" placeholder="选择绑定会议" />
              <div class="field-row">
                <el-input v-model="bindQrForms[row.id]" size="small" placeholder="群二维码 URL（可选）" />
                <MaterialSpecHelp spec-key="wecomQr" />
              </div>
              <el-input v-model="bindJoinForms[row.id]" size="small" placeholder="入群链接（可选）" />
            </div>
            <el-button size="small" type="primary" @click="bindGroup(row.id)">绑定</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="section === 'welcome'" class="table-panel">
      <div class="panel-heading">
        <div><h3>入群欢迎语</h3><p>{{ welcomeNotice }}</p></div>
        <el-button type="primary" @click="saveWelcome">保存欢迎语</el-button>
      </div>
      <el-form label-position="top" class="welcome-form">
        <el-form-item label="模板名称"><el-input v-model="welcomeForm.name" placeholder="如：报名成功入群欢迎语" /></el-form-item>
        <el-form-item label="欢迎语 JSON"><el-input v-model="welcomeForm.contentText" type="textarea" :rows="7" placeholder='{"text":"欢迎加入{会议名称}客户群","agendaUrl":"","advisorPhone":""}' /></el-form-item>
      </el-form>
      <el-table :data="welcomeTemplates" border>
        <el-table-column prop="name" label="模板" min-width="180" />
        <el-table-column prop="enabled" label="启用" width="90" />
        <el-table-column prop="updatedAt" label="更新时间" min-width="170" />
      </el-table>
    </section>

    <section v-else-if="section === 'tasks'" class="table-panel">
      <div class="risk-note">企业微信群发任务创建后，通常需要群主或成员在企业微信中确认后才会真正发送。请确认内容准确，避免频繁打扰参会人。</div>
      <div class="task-form">
        <el-input v-model="taskForm.name" placeholder="群发任务名称" />
        <ConferenceSelect v-model="taskForm.conferenceId" placeholder="会议（可选）" />
        <el-radio-group v-model="taskForm.targetScope">
          <el-radio-button label="SELECTED_GROUPS">指定客户群</el-radio-button>
          <el-radio-button label="CONFERENCE_GROUPS">会议关联群</el-radio-button>
          <el-radio-button label="ALL_GROUPS">全部客户群</el-radio-button>
        </el-radio-group>
        <el-select v-if="taskForm.targetScope === 'SELECTED_GROUPS'" v-model="taskForm.targetGroupIds" multiple filterable placeholder="选择客户群" style="width: 100%">
          <el-option v-for="group in groups" :key="group.id" :label="`${group.name || group.chatId} / ${group.ownerName || '未知群主'}`" :value="group.id" />
        </el-select>
        <el-input v-model="taskForm.contentText" type="textarea" :rows="4" placeholder='{"msgtype":"text","text":{"content":"会议提醒..."}}' />
        <div class="action-row">
          <el-button type="primary" @click="saveTask">创建任务</el-button>
          <el-button @click="sendTestTask">发送测试到指定群</el-button>
        </div>
      </div>
      <el-table :data="tasks" border>
        <el-table-column prop="name" label="任务" min-width="180" />
        <el-table-column prop="targetScope" label="范围" min-width="130" />
        <el-table-column prop="status" label="状态" width="150">
          <template #default="{ row }">{{ statusText(row.status) }}</template>
        </el-table-column>
        <el-table-column prop="wecomTaskId" label="企微任务 ID" min-width="200" />
        <el-table-column prop="wecomMsgId" label="企微 msgId" min-width="180" />
        <el-table-column prop="conferenceTitle" label="会议" min-width="160" />
        <el-table-column prop="errorMessage" label="失败/排查" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.errorMessage || row.troubleshooting || "-" }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-button size="small" type="primary" @click="createTask(row.id)">创建企微任务</el-button>
            <el-button size="small" @click="refreshTask(row.id)">刷新结果</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <section v-else-if="section === 'logs'" class="table-panel">
      <el-table :data="logs" border>
        <el-table-column prop="taskName" label="任务" min-width="180" />
        <el-table-column prop="groupName" label="客户群" min-width="160" />
        <el-table-column prop="chatId" label="chat_id" min-width="160" />
        <el-table-column prop="ownerUserId" label="群主/成员" min-width="160" />
        <el-table-column prop="status" label="确认/发送状态" min-width="160" />
        <el-table-column prop="providerMessageId" label="msgId" min-width="180" />
        <el-table-column prop="errorReason" label="失败原因" min-width="180" />
        <el-table-column prop="createdAt" label="创建时间" min-width="170" />
      </el-table>
    </section>

    <section v-else class="table-panel">
      <el-table :data="callbackEvents" border>
        <el-table-column prop="eventSource" label="来源" width="150" />
        <el-table-column prop="eventType" label="事件" width="140" />
        <el-table-column prop="changeType" label="变更" width="150" />
        <el-table-column prop="chatId" label="客户群" min-width="180" />
        <el-table-column prop="status" label="处理状态" width="120" />
        <el-table-column prop="errorMessage" label="异常" min-width="180" />
        <el-table-column prop="createdAt" label="接收时间" min-width="170" />
      </el-table>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import MaterialSpecHelp from "../../components/MaterialSpecHelp.vue";
import ConferenceSelect from "../../components/selectors/ConferenceSelect.vue";
import { currentRoute, navigateTo } from "../../router";
import {
  bindWecomCustomerGroupConference,
  checkWecomPermissions,
  createOfficialWecomGroupMessageTask,
  createWecomGroupMessageTask,
  createWecomWelcomeTemplate,
  getWecomConfig,
  listWecomCallbackEvents,
  listWecomCustomerGroups,
  listWecomGroupMessageLogs,
  listWecomGroupMessageTasks,
  listWecomWelcomeTemplates,
  refreshWecomGroupMessageTaskResult,
  syncWecomCustomerGroups,
  testSendWecomGroupMessageTask,
  testWecomAccessToken,
  updateWecomConfig
} from "../../services/admin";

type AnyRecord = Record<string, any>;

const config = ref<AnyRecord>({});
const groups = ref<AnyRecord[]>([]);
const tasks = ref<AnyRecord[]>([]);
const logs = ref<AnyRecord[]>([]);
const callbackEvents = ref<AnyRecord[]>([]);
const welcomeTemplates = ref<AnyRecord[]>([]);
const welcomeNotice = ref("");
const groupKeyword = ref("");
const lastResult = ref("");
const saving = ref(false);
const testing = ref(false);
const checking = ref(false);
const syncing = ref(false);
const bindForms = reactive<Record<string, string>>({});
const bindQrForms = reactive<Record<string, string>>({});
const bindJoinForms = reactive<Record<string, string>>({});
const configForm = reactive({
  enabled: false,
  authMode: "SELF_BUILT_APP",
  corpId: "",
  agentId: "",
  customerContactSecret: "",
  appSecret: "",
  callbackToken: "",
  callbackEncodingAesKey: "",
  customerContactCallbackUrl: "",
  appCallbackUrl: "",
  remark: ""
});
const welcomeForm = reactive({ name: "", contentText: "{\"text\":\"欢迎加入会议客户群\",\"agendaUrl\":\"\",\"aiAssistantUrl\":\"\",\"advisorPhone\":\"\"}" });
const taskForm = reactive({ name: "", conferenceId: "", targetScope: "SELECTED_GROUPS", targetGroupIds: [] as string[], contentText: "{\"msgtype\":\"text\",\"text\":{\"content\":\"会议提醒：请关注最新会务通知。\"}}" });
const section = computed(() => currentRoute.value.path.split("/").pop() || "config");
const guideSteps = computed(() =>
  configForm.authMode === "LEGACY_CUSTOMER_CONTACT"
    ? [
        "登录企业微信管理后台。",
        "在「我的企业」复制企业 ID CorpID。",
        "确认企业仍可查看客户联系 Secret，并复制到本页。",
        "在客户联系接收事件服务器填写客户联系回调 URL、Token、EncodingAESKey。",
        "回到会务系统点击测试 AccessToken。",
        "检测客户联系权限。",
        "同步客户群并绑定会议。"
      ]
    : [
        "登录企业微信管理后台。",
        "在「我的企业」复制企业 ID CorpID。",
        "创建或选择自建应用，设置应用可见范围。",
        "复制自建应用 AgentID 和 Secret。",
        "在自建应用中开通或授权客户联系/客户群相关接口权限。",
        "在自建应用回调配置填写应用回调 URL、Token、EncodingAESKey。",
        "如需要客户联系事件，也在客户联系接收事件服务器填写客户联系回调 URL。",
        "回到会务系统点击测试 AccessToken 和检测客户联系权限。",
        "同步客户群并绑定会议。"
      ]
);
const authModeTip = computed(() =>
  configForm.authMode === "LEGACY_CUSTOMER_CONTACT"
    ? "兼容旧企业微信客户联系 Secret。若后台不再展示该 Secret，请改用自建应用模式。"
    : "推荐模式：使用自建应用 Secret 获取 AccessToken，并通过应用权限访问客户联系客户群接口。"
);
const statusCards = computed(() => {
  const status = config.value.status || {};
  return [
    { label: "企微客户群能力", value: status.enabled ? "已启用" : "未启用", ok: Boolean(status.enabled) },
    { label: "接入模式", value: authModeText(status.effectiveAuthMode || config.value.effectiveAuthMode), ok: Boolean(status.effectiveAuthMode || config.value.effectiveAuthMode) },
    { label: "CorpID", value: status.corpIdConfigured ? "已配置" : "未配置", ok: Boolean(status.corpIdConfigured) },
    { label: "旧客户联系 Secret", value: status.customerContactSecretConfigured ? "已配置" : "未配置", ok: config.value.effectiveAuthMode !== "legacy_customer_contact" || Boolean(status.customerContactSecretConfigured) },
    { label: "自建应用 Secret", value: status.appSecretConfigured ? "已配置" : "未配置", ok: Boolean(status.appSecretConfigured) },
    { label: "回调配置", value: status.callbackConfigured ? (status.callbackVerified ? "已验证" : "待验证") : "未配置", ok: Boolean(status.callbackConfigured && status.callbackVerified) },
    { label: "AccessToken", value: tokenStatusText(status.accessTokenStatus), ok: status.accessTokenStatus === "VALID" }
  ];
});

onMounted(() => void loadAll());

async function loadAll() {
  await loadConfig();
  if (section.value === "groups" || section.value === "bindings") await loadGroups();
  if (section.value === "welcome") await loadWelcome();
  if (section.value === "tasks") await loadTasks();
  if (section.value === "logs") await loadLogs();
  if (section.value === "callback-events") await loadEvents();
}

async function loadConfig() {
  config.value = await getWecomConfig();
  Object.assign(configForm, {
    enabled: Boolean(config.value.enabled),
    authMode: String(config.value.authMode || config.value.effectiveAuthMode || "SELF_BUILT_APP").toUpperCase() === "LEGACY_CUSTOMER_CONTACT" ? "LEGACY_CUSTOMER_CONTACT" : "SELF_BUILT_APP",
    corpId: String(config.value.corpId || ""),
    agentId: String(config.value.agentId || ""),
    customerContactSecret: "",
    appSecret: "",
    callbackToken: "",
    callbackEncodingAesKey: "",
    customerContactCallbackUrl: String(config.value.customerContactCallbackUrl || ""),
    appCallbackUrl: String(config.value.appCallbackUrl || ""),
    remark: String(config.value.remark || "")
  });
}

async function loadGroups() {
  const result = await listWecomCustomerGroups({ page: 1, pageSize: 50, keyword: groupKeyword.value });
  groups.value = result.items;
  for (const item of result.items) {
    bindForms[String(item.id)] = String(item.conferenceId || "");
    bindQrForms[String(item.id)] = String(item.groupQrUrl || "");
    bindJoinForms[String(item.id)] = String(item.joinLink || "");
  }
}

async function loadWelcome() {
  const result = await listWecomWelcomeTemplates();
  welcomeTemplates.value = result.items || [];
  welcomeNotice.value = result.syncNotice || "当前仅支持在会务系统维护欢迎语素材，请复制内容到企业微信后台配置。";
}

async function loadTasks() {
  if (groups.value.length === 0) await loadGroups();
  tasks.value = (await listWecomGroupMessageTasks({ page: 1, pageSize: 50 })).items;
}

async function loadLogs() {
  logs.value = (await listWecomGroupMessageLogs({ page: 1, pageSize: 50 })).items;
}

async function loadEvents() {
  callbackEvents.value = (await listWecomCallbackEvents({ page: 1, pageSize: 50 })).items;
}

async function saveConfig() {
  saving.value = true;
  try {
    const payload = Object.fromEntries(Object.entries(configForm).filter(([, value]) => typeof value !== "string" || value.trim()));
    config.value = await updateWecomConfig(payload);
    lastResult.value = "配置已保存。敏感字段已加密存储，接口不会返回明文。";
    ElMessage.success("企微接入配置已保存");
  } finally {
    saving.value = false;
  }
}

async function testToken() {
  testing.value = true;
  try {
    lastResult.value = JSON.stringify(await testWecomAccessToken(), null, 2);
    await loadConfig();
  } finally {
    testing.value = false;
  }
}

async function checkPermission() {
  checking.value = true;
  try {
    lastResult.value = JSON.stringify(await checkWecomPermissions(), null, 2);
  } finally {
    checking.value = false;
  }
}

async function syncGroups() {
  syncing.value = true;
  try {
    const result = await syncWecomCustomerGroups();
    lastResult.value = JSON.stringify(result, null, 2);
    await Promise.all([loadConfig(), loadGroups()]);
    ElMessage.success("客户群同步完成");
  } finally {
    syncing.value = false;
  }
}

async function bindGroup(id: string) {
  await bindWecomCustomerGroupConference(id, { conferenceId: bindForms[id] || null, groupQrUrl: bindQrForms[id] || null, joinLink: bindJoinForms[id] || null });
  await loadGroups();
  ElMessage.success("客户群绑定已更新");
}

async function saveWelcome() {
  await createWecomWelcomeTemplate({ name: welcomeForm.name, contentJson: parseJson(welcomeForm.contentText) });
  Object.assign(welcomeForm, { name: "", contentText: welcomeForm.contentText });
  await loadWelcome();
  ElMessage.success("欢迎语已保存");
}

async function saveTask() {
  await createWecomGroupMessageTask({
    name: taskForm.name,
    conferenceId: taskForm.conferenceId || null,
    targetScope: taskForm.targetScope,
    targetGroupIds: taskForm.targetScope === "SELECTED_GROUPS" ? taskForm.targetGroupIds : [],
    contentJson: parseJson(taskForm.contentText)
  });
  taskForm.name = "";
  await loadTasks();
  ElMessage.success("群发任务已创建");
}

async function sendTestTask() {
  if (taskForm.targetGroupIds.length === 0) {
    ElMessage.warning("请选择至少一个测试客户群");
    return;
  }
  lastResult.value = JSON.stringify(
    await testSendWecomGroupMessageTask({
      name: taskForm.name || "企微客户群测试发送",
      targetGroupIds: taskForm.targetGroupIds,
      contentJson: parseJson(taskForm.contentText)
    }),
    null,
    2
  );
  await loadTasks();
  ElMessage.success("测试任务已提交，请查看任务状态和日志");
}

async function createTask(id: string) {
  await ElMessageBox.confirm("企业微信群发任务创建后通常需要群主或成员在企业微信中确认后才会真正发送，请确认内容准确。", "创建企微群发任务", { type: "warning" });
  lastResult.value = JSON.stringify(await createOfficialWecomGroupMessageTask(id), null, 2);
  await loadTasks();
}

async function refreshTask(id: string) {
  lastResult.value = JSON.stringify(await refreshWecomGroupMessageTaskResult(id), null, 2);
  await loadTasks();
}

async function copyText(text: string) {
  if (!text) return ElMessage.warning("暂无可复制内容");
  await navigator.clipboard.writeText(text);
  ElMessage.success("已复制");
}

function goConfig() {
  navigateTo("/wecom/config");
}

function secretPlaceholder(key: string): string {
  const item = config.value.secrets?.[key];
  return item?.configured ? `已配置：${item.masked}` : "未配置，输入后保存";
}

function parseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function tokenStatusText(value: string) {
  if (value === "VALID") return "有效";
  if (value === "EXPIRED") return "失效";
  return "未获取";
}

function authModeText(value: string) {
  if (value === "self_built_app" || value === "SELF_BUILT_APP") return "自建应用";
  if (value === "legacy_customer_contact" || value === "LEGACY_CUSTOMER_CONTACT") return "旧客户联系";
  return "未配置";
}

function statusText(value: string) {
  const map: Record<string, string> = {
    DRAFT: "草稿",
    CREATED: "已创建",
    WAITING_CONFIRM: "待成员确认",
    SENDING: "发送中",
    SENT: "已发送",
    PARTIAL_FAILED: "部分失败",
    FAILED: "失败",
    SKIPPED: "已跳过",
    CANCELLED: "已取消"
  };
  return map[value] || value;
}
</script>

<style scoped>
.wecom-page {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.status-card {
  padding: 16px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #fff;
}

.status-card span,
.panel-heading p,
.guide-panel li {
  color: #64748b;
  font-size: 13px;
}

.status-card strong {
  display: block;
  margin-top: 8px;
  font-size: 18px;
}

.is-ok {
  color: #0f766e;
}

.is-warn {
  color: #b45309;
}

.config-layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
}

.guide-panel,
.table-panel {
  padding: 18px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #fff;
}

.guide-panel h3,
.panel-heading h3 {
  margin: 0 0 8px;
  color: #0f172a;
}

.guide-panel ol {
  margin: 0;
  padding-left: 20px;
}

.guide-panel li {
  margin-bottom: 8px;
  line-height: 1.5;
}

.callback-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 8px;
  background: #f8fafc;
}

.callback-box code {
  color: #1d4ed8;
  font-size: 12px;
  overflow-wrap: anywhere;
}

.panel-heading {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.config-form {
  max-width: 980px;
}

.auth-mode-group {
  display: flex;
  flex-wrap: wrap;
}

.form-tip {
  margin: 8px 0 0;
  color: #64748b;
  font-size: 12px;
  line-height: 1.5;
}

.action-row,
.task-form {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.action-row .el-input {
  width: 220px;
}

.json-panel {
  max-height: 280px;
  overflow: auto;
  margin-top: 14px;
  padding: 14px;
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
  line-height: 1.6;
}

.welcome-form {
  max-width: 760px;
}

.task-form {
  margin-bottom: 16px;
}

.task-form .el-input {
  max-width: 320px;
}

.task-form :deep(.el-select) {
  width: 260px;
}

.task-form .el-textarea {
  width: 520px;
}

.binding-form {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(170px, 1fr) minmax(150px, 1fr);
  gap: 8px;
  margin-bottom: 8px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.field-row :deep(.el-input) {
  min-width: 0;
}

.risk-note {
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 8px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 13px;
  line-height: 1.5;
}

@media (max-width: 1280px) {
  .status-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .config-layout {
    grid-template-columns: 1fr;
  }
}
</style>
