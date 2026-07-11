<template>
  <section class="admin-page platform-page">
    <AdminPageHeader title="SaaS 平台控制台" eyebrow="平台运营" subtitle="管理租户、工作区、套餐、API 接入与生产能力就绪度。">
      <template #actions>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openTenantCreate">新增租户</el-button>
      </template>
    </AdminPageHeader>

    <el-alert
      v-if="overview"
      class="platform-isolation-alert"
      :closable="false"
      type="warning"
      show-icon
      title="控制面已启用，核心业务数据面尚未强制租户隔离"
      :description="overview.isolation.summary"
    />

    <section v-if="overview" class="platform-metrics" aria-label="平台指标">
      <article><span><OfficeBuilding /></span><div><strong>{{ overview.metrics.tenants }}</strong><small>活跃租户</small></div></article>
      <article><span><Grid /></span><div><strong>{{ overview.metrics.workspaces }}</strong><small>工作区</small></div></article>
      <article><span><Tickets /></span><div><strong>{{ overview.metrics.activeSubscriptions }}</strong><small>有效订阅</small></div></article>
      <article><span><Key /></span><div><strong>{{ overview.metrics.activeApiKeys }}</strong><small>有效 API Key</small></div></article>
    </section>

    <section class="platform-panel">
      <header class="platform-panel__head">
        <div><h2>生产能力就绪度</h2><p>“已配置”不等于“生产可用”，只有完成真实联调验证的能力才标记为就绪。</p></div>
      </header>
      <el-table :data="overview?.providers ?? []" empty-text="暂无能力检查结果">
        <el-table-column label="能力" min-width="170">
          <template #default="{ row }"><strong>{{ row.name }}</strong></template>
        </el-table-column>
        <el-table-column label="状态" width="130">
          <template #default="{ row }"><el-tag :type="readinessTagType(row.status)" effect="plain">{{ readinessLabel(row.status) }}</el-tag></template>
        </el-table-column>
        <el-table-column label="缺失项" min-width="260">
          <template #default="{ row }"><span class="platform-muted">{{ row.missing.length ? row.missing.join("、") : "无配置缺失" }}</span></template>
        </el-table-column>
        <el-table-column prop="summary" label="验证边界" min-width="340" />
      </el-table>
    </section>

    <section class="platform-panel platform-resource-panel">
      <el-tabs v-model="activeTab">
        <el-tab-pane label="租户与工作区" name="tenants">
          <div class="platform-table-toolbar">
            <el-input v-model="tenantKeyword" clearable :prefix-icon="Search" placeholder="搜索租户名称或标识" />
            <span>共 {{ filteredTenants.length }} 个租户</span>
          </div>
          <el-table :data="filteredTenants" row-key="id" empty-text="暂无租户">
            <el-table-column label="租户" min-width="220">
              <template #default="{ row }"><button class="platform-tenant-link" type="button" @click="openTenant(row)"><strong>{{ row.name }}</strong><small>{{ row.slug }}</small></button></template>
            </el-table-column>
            <el-table-column label="状态" width="110"><template #default="{ row }"><el-tag :type="tenantStatusType(row.status)" effect="plain">{{ tenantStatusLabel(row.status) }}</el-tag></template></el-table-column>
            <el-table-column label="工作区" width="110"><template #default="{ row }">{{ row.workspaces.length }}</template></el-table-column>
            <el-table-column label="当前套餐" min-width="160"><template #default="{ row }">{{ row.subscriptions[0]?.plan.name || "未订阅" }}</template></el-table-column>
            <el-table-column label="平台接入" min-width="180"><template #default="{ row }">{{ activeCount(row.apiKeys) }} Key · {{ activeCount(row.webhooks) }} Webhook</template></el-table-column>
            <el-table-column label="操作" width="150" fixed="right"><template #default="{ row }"><el-button link type="primary" @click="openTenant(row)">管理</el-button><el-button link @click="toggleTenant(row)">{{ row.status === "ACTIVE" ? "暂停" : "启用" }}</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="套餐与订阅" name="plans">
          <div class="platform-table-toolbar"><span>所有金额以整数分保存，页面仅格式化展示。</span><el-button :icon="Plus" @click="openPlanCreate">新增套餐</el-button></div>
          <el-table :data="plans" row-key="id" empty-text="暂无套餐">
            <el-table-column prop="name" label="套餐" min-width="150" />
            <el-table-column prop="code" label="编码" width="130" />
            <el-table-column label="月付" width="130"><template #default="{ row }">{{ formatCent(row.monthlyPriceCent) }}</template></el-table-column>
            <el-table-column label="年付" width="130"><template #default="{ row }">{{ formatCent(row.annualPriceCent) }}</template></el-table-column>
            <el-table-column label="限制" min-width="220"><template #default="{ row }">{{ planLimits(row) }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? "启用" : "停用" }}</el-tag></template></el-table-column>
            <el-table-column label="操作" width="90"><template #default="{ row }"><el-button link type="primary" @click="openPlanEdit(row)">编辑</el-button></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="插件注册表" name="plugins">
          <div class="platform-table-toolbar"><span>当前仅提供安装控制面；沙箱执行器尚未启用，不会加载第三方代码。</span><el-button :icon="Plus" @click="pluginDialogVisible = true">注册插件</el-button></div>
          <el-table :data="plugins" row-key="id" empty-text="暂无插件">
            <el-table-column prop="name" label="插件" min-width="180" />
            <el-table-column prop="code" label="编码" min-width="160" />
            <el-table-column prop="version" label="版本" width="110" />
            <el-table-column label="安装数" width="100"><template #default="{ row }">{{ row._count.installs }}</template></el-table-column>
            <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" effect="plain">{{ row.enabled ? "可安装" : "停用" }}</el-tag></template></el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="近 30 天用量" name="usage">
          <el-empty v-if="!overview?.usage30d.length" description="尚无用量事件" />
          <div v-else class="platform-usage-list"><article v-for="item in overview.usage30d" :key="`${item.metric}:${item.unit}`"><strong>{{ item.quantity }}</strong><span>{{ item.metric }}</span><small>{{ item.unit }}</small></article></div>
        </el-tab-pane>
      </el-tabs>
    </section>

    <el-dialog v-model="tenantCreateVisible" title="新增租户" width="620px">
      <el-form :model="tenantForm" label-width="110px">
        <el-form-item label="租户名称" required><el-input v-model="tenantForm.name" /></el-form-item>
        <el-form-item label="租户标识" required><el-input v-model="tenantForm.slug" placeholder="字母、数字、短横线" /></el-form-item>
        <el-form-item label="默认组织"><el-input v-model="tenantForm.organizationName" /></el-form-item>
        <el-form-item label="默认工作区"><el-input v-model="tenantForm.workspaceName" /></el-form-item>
        <el-form-item label="试用套餐"><el-select v-model="tenantForm.planCode" style="width: 100%"><el-option v-for="plan in plans.filter((item) => item.enabled)" :key="plan.code" :label="plan.name" :value="plan.code" /></el-select></el-form-item>
        <el-form-item label="联系人"><el-input v-model="tenantForm.contactName" /></el-form-item>
        <el-form-item label="联系电话"><el-input v-model="tenantForm.contactPhone" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="tenantCreateVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveTenant">创建租户</el-button></template>
    </el-dialog>

    <el-drawer v-model="tenantDrawerVisible" size="720px" :title="selectedTenant?.name || '租户管理'">
      <template v-if="selectedTenant">
        <div class="tenant-drawer-summary">
          <span><small>租户标识</small><strong>{{ selectedTenant.slug }}</strong></span>
          <span><small>工作区</small><strong>{{ selectedTenant.workspaces.length }}</strong></span>
          <span><small>成员</small><strong>{{ selectedTenant._count.members }}</strong></span>
          <span><small>用量事件</small><strong>{{ selectedTenant._count.usageEvents }}</strong></span>
        </div>
        <el-tabs v-model="tenantTab">
          <el-tab-pane label="工作区" name="workspaces">
            <el-table :data="selectedTenant.workspaces" empty-text="暂无工作区"><el-table-column prop="name" label="名称" /><el-table-column prop="slug" label="标识" /><el-table-column prop="status" label="状态" width="100" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="API Key" name="keys">
            <div class="drawer-toolbar"><span>密钥明文仅创建时显示一次。</span><el-button size="small" :icon="Plus" @click="openApiKeyCreate">新建 Key</el-button></div>
            <el-table :data="selectedTenant.apiKeys" empty-text="暂无 API Key"><el-table-column prop="name" label="名称" /><el-table-column prop="keyPrefix" label="前缀" /><el-table-column prop="status" label="状态" width="100" /><el-table-column label="操作" width="80"><template #default="{ row }"><el-button v-if="row.status === 'ACTIVE'" link type="danger" @click="revokeKey(row)">撤销</el-button></template></el-table-column></el-table>
          </el-tab-pane>
          <el-tab-pane label="Webhook" name="webhooks">
            <div class="drawer-toolbar"><span>签名密钥仅创建时显示；投递执行器尚未启用。</span><el-button size="small" :icon="Plus" @click="openWebhookCreate">新建 Webhook</el-button></div>
            <el-table :data="selectedTenant.webhooks" empty-text="暂无 Webhook"><el-table-column prop="name" label="名称" /><el-table-column prop="url" label="地址" min-width="260" show-overflow-tooltip /><el-table-column prop="status" label="状态" width="100" /></el-table>
          </el-tab-pane>
          <el-tab-pane label="功能开关" name="flags">
            <div class="drawer-toolbar"><span>功能开关只建立控制面记录，不自动改变受保护业务链路。</span><el-button size="small" :icon="Plus" @click="openFlagCreate">新增开关</el-button></div>
            <el-table :data="selectedTenant.featureFlags" empty-text="暂无功能开关"><el-table-column prop="key" label="标识" /><el-table-column prop="scopeKey" label="作用域" /><el-table-column label="启用" width="90"><template #default="{ row }"><el-switch :model-value="row.enabled" @change="toggleFlag(row, $event)" /></template></el-table-column></el-table>
          </el-tab-pane>
          <el-tab-pane label="插件安装" name="plugin-installs">
            <div class="drawer-toolbar"><span>仅登记安装状态，不执行插件代码。</span><el-button size="small" :icon="Plus" :disabled="plugins.length === 0" @click="openPluginInstall">安装插件</el-button></div>
            <el-table :data="selectedTenant.pluginInstalls" empty-text="暂无插件安装"><el-table-column label="插件"><template #default="{ row }">{{ row.plugin.name }} {{ row.plugin.version }}</template></el-table-column><el-table-column label="作用域"><template #default="{ row }">{{ row.workspace?.name || '整个租户' }}</template></el-table-column><el-table-column prop="status" label="状态" width="100" /></el-table>
          </el-tab-pane>
        </el-tabs>
      </template>
    </el-drawer>

    <el-dialog v-model="planDialogVisible" :title="planForm.id ? '编辑套餐' : '新增套餐'" width="640px">
      <el-form :model="planForm" label-width="110px">
        <el-form-item label="套餐编码" required><el-input v-model="planForm.code" :disabled="Boolean(planForm.id)" /></el-form-item>
        <el-form-item label="套餐名称" required><el-input v-model="planForm.name" /></el-form-item>
        <el-form-item label="月付金额"><el-input-number v-model="planForm.monthlyPriceCent" :min="0" :step="100" /><span class="field-unit">分</span></el-form-item>
        <el-form-item label="年付金额"><el-input-number v-model="planForm.annualPriceCent" :min="0" :step="100" /><span class="field-unit">分</span></el-form-item>
        <el-form-item label="工作区上限"><el-input-number v-model="planForm.workspaces" :min="1" /></el-form-item>
        <el-form-item label="管理员上限"><el-input-number v-model="planForm.admins" :min="1" /></el-form-item>
        <el-form-item label="功能"><el-checkbox-group v-model="planForm.features"><el-checkbox v-for="item in featureOptions" :key="item.value" :label="item.value">{{ item.label }}</el-checkbox></el-checkbox-group></el-form-item>
        <el-form-item label="启用"><el-switch v-model="planForm.enabled" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="planDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="savePlan">保存套餐</el-button></template>
    </el-dialog>

    <el-dialog v-model="apiKeyDialogVisible" title="新建 API Key" width="520px"><el-form :model="apiKeyForm" label-width="90px"><el-form-item label="名称" required><el-input v-model="apiKeyForm.name" /></el-form-item><el-form-item label="权限范围"><el-select v-model="apiKeyForm.scopes" multiple allow-create filterable style="width: 100%"><el-option v-for="scope in defaultScopes" :key="scope" :label="scope" :value="scope" /></el-select></el-form-item></el-form><template #footer><el-button @click="apiKeyDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveApiKey">创建</el-button></template></el-dialog>
    <el-dialog v-model="webhookDialogVisible" title="新建 Webhook" width="600px"><el-form :model="webhookForm" label-width="90px"><el-form-item label="名称" required><el-input v-model="webhookForm.name" /></el-form-item><el-form-item label="HTTPS 地址" required><el-input v-model="webhookForm.url" /></el-form-item><el-form-item label="事件"><el-select v-model="webhookForm.events" multiple style="width: 100%"><el-option v-for="event in webhookEvents" :key="event" :label="event" :value="event" /></el-select></el-form-item></el-form><template #footer><el-button @click="webhookDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveWebhook">创建</el-button></template></el-dialog>
    <el-dialog v-model="flagDialogVisible" title="新增功能开关" width="520px"><el-form :model="flagForm" label-width="100px"><el-form-item label="开关标识" required><el-input v-model="flagForm.key" /></el-form-item><el-form-item label="作用工作区"><el-select v-model="flagForm.workspaceId" clearable style="width: 100%"><el-option v-for="workspace in selectedTenant?.workspaces ?? []" :key="workspace.id" :label="workspace.name" :value="workspace.id" /></el-select></el-form-item><el-form-item label="启用"><el-switch v-model="flagForm.enabled" /></el-form-item></el-form><template #footer><el-button @click="flagDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="saveFlag">保存</el-button></template></el-dialog>
    <el-dialog v-model="pluginDialogVisible" title="注册插件" width="560px"><el-form :model="pluginForm" label-width="90px"><el-form-item label="插件名称" required><el-input v-model="pluginForm.name" /></el-form-item><el-form-item label="插件编码" required><el-input v-model="pluginForm.code" /></el-form-item><el-form-item label="版本" required><el-input v-model="pluginForm.version" /></el-form-item><el-form-item label="能力"><el-checkbox-group v-model="pluginForm.capabilities"><el-checkbox label="cms-component">CMS 组件</el-checkbox><el-checkbox label="data-source">数据源</el-checkbox><el-checkbox label="webhook">Webhook</el-checkbox></el-checkbox-group></el-form-item></el-form><template #footer><el-button @click="pluginDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="savePlugin">注册</el-button></template></el-dialog>
    <el-dialog v-model="pluginInstallDialogVisible" title="安装插件" width="520px"><el-form :model="pluginInstallForm" label-width="90px"><el-form-item label="插件" required><el-select v-model="pluginInstallForm.pluginId" style="width: 100%"><el-option v-for="plugin in plugins.filter((item) => item.enabled)" :key="plugin.id" :label="`${plugin.name} ${plugin.version}`" :value="plugin.id" /></el-select></el-form-item><el-form-item label="工作区"><el-select v-model="pluginInstallForm.workspaceId" clearable style="width: 100%"><el-option v-for="workspace in selectedTenant?.workspaces ?? []" :key="workspace.id" :label="workspace.name" :value="workspace.id" /></el-select></el-form-item></el-form><template #footer><el-button @click="pluginInstallDialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="savePluginInstall">安装</el-button></template></el-dialog>

    <el-dialog v-model="secretDialogVisible" title="请立即保存密钥" width="600px" :close-on-click-modal="false"><el-alert type="warning" :closable="false" show-icon :title="secretWarning" /><div class="platform-secret"><code>{{ oneTimeSecret }}</code><el-button :icon="CopyDocument" @click="copySecret">复制</el-button></div><template #footer><el-button type="primary" @click="closeSecret">我已保存</el-button></template></el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { CopyDocument, Grid, Key, OfficeBuilding, Plus, Refresh, Search, Tickets } from "@element-plus/icons-vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import {
  createPlatformApiKey,
  createPlatformTenant,
  createPlatformWebhook,
  getPlatformOverview,
  installPlatformPlugin,
  listPlatformPlugins,
  listPlatformTenants,
  listSaasPlans,
  revokePlatformApiKey,
  updatePlatformTenant,
  upsertPlatformFeatureFlag,
  upsertPlatformPlugin,
  upsertSaasPlan,
  type PlatformApiKey,
  type PlatformFeatureFlag,
  type PlatformOverview,
  type PlatformPlugin,
  type PlatformReadinessStatus,
  type SaasPlan,
  type SaasTenant
} from "../../services/platform";

const loading = ref(false);
const saving = ref(false);
const overview = ref<PlatformOverview | null>(null);
const tenants = ref<SaasTenant[]>([]);
const plans = ref<SaasPlan[]>([]);
const plugins = ref<PlatformPlugin[]>([]);
const activeTab = ref("tenants");
const tenantTab = ref("workspaces");
const tenantKeyword = ref("");
const selectedTenantId = ref("");
const tenantCreateVisible = ref(false);
const tenantDrawerVisible = ref(false);
const planDialogVisible = ref(false);
const apiKeyDialogVisible = ref(false);
const webhookDialogVisible = ref(false);
const flagDialogVisible = ref(false);
const pluginDialogVisible = ref(false);
const pluginInstallDialogVisible = ref(false);
const secretDialogVisible = ref(false);
const oneTimeSecret = ref("");
const secretWarning = ref("");

const tenantForm = reactive({ name: "", slug: "", organizationName: "", workspaceName: "", planCode: "STARTER", contactName: "", contactPhone: "" });
const planForm = reactive({ id: "", code: "", name: "", monthlyPriceCent: 0, annualPriceCent: 0, workspaces: 1, admins: 3, features: ["cms", "conference"] as string[], enabled: true });
const apiKeyForm = reactive({ name: "", scopes: ["conference:read"] as string[] });
const webhookForm = reactive({ name: "", url: "", events: ["order.paid"] as string[] });
const flagForm = reactive({ key: "", workspaceId: "", enabled: false });
const pluginForm = reactive({ name: "", code: "", version: "1.0.0", capabilities: [] as string[] });
const pluginInstallForm = reactive({ pluginId: "", workspaceId: "" });
const featureOptions = [{ value: "cms", label: "页面装修" }, { value: "conference", label: "会议" }, { value: "mall", label: "商城" }, { value: "member", label: "会员" }, { value: "api", label: "API" }, { value: "plugins", label: "插件" }];
const defaultScopes = ["conference:read", "registration:read", "order:read", "mall:read", "member:read", "webhook:write"];
const webhookEvents = ["order.paid", "registration.confirmed", "refund.updated", "mall.order.paid", "member.updated"];

const filteredTenants = computed(() => {
  const keyword = tenantKeyword.value.trim().toLowerCase();
  return keyword ? tenants.value.filter((item) => `${item.name} ${item.slug}`.toLowerCase().includes(keyword)) : tenants.value;
});
const selectedTenant = computed(() => tenants.value.find((item) => item.id === selectedTenantId.value) ?? null);

onMounted(() => void load());

async function load() {
  loading.value = true;
  try {
    const [overviewData, tenantData, planData, pluginData] = await Promise.all([getPlatformOverview(), listPlatformTenants(), listSaasPlans(), listPlatformPlugins()]);
    overview.value = overviewData;
    tenants.value = tenantData.items;
    plans.value = planData.items;
    plugins.value = pluginData.items;
  } finally {
    loading.value = false;
  }
}

function openTenantCreate() {
  Object.assign(tenantForm, { name: "", slug: "", organizationName: "", workspaceName: "", planCode: plans.value[0]?.code || "STARTER", contactName: "", contactPhone: "" });
  tenantCreateVisible.value = true;
}

async function saveTenant() {
  if (!tenantForm.name.trim() || !tenantForm.slug.trim()) return ElMessage.warning("请填写租户名称和标识");
  saving.value = true;
  try {
    await createPlatformTenant({ ...tenantForm });
    tenantCreateVisible.value = false;
    await load();
    ElMessage.success("租户已创建，并初始化默认组织、工作区和 14 天试用订阅");
  } finally { saving.value = false; }
}

function openTenant(row: SaasTenant) {
  selectedTenantId.value = row.id;
  tenantTab.value = "workspaces";
  tenantDrawerVisible.value = true;
}

async function toggleTenant(row: SaasTenant) {
  const status = row.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
  await ElMessageBox.confirm(`确认${status === "ACTIVE" ? "启用" : "暂停"}租户“${row.name}”？`, "租户状态", { type: "warning" });
  await updatePlatformTenant(row.id, { status });
  await load();
}

function openPlanCreate() {
  Object.assign(planForm, { id: "", code: "", name: "", monthlyPriceCent: 0, annualPriceCent: 0, workspaces: 1, admins: 3, features: ["cms", "conference"], enabled: true });
  planDialogVisible.value = true;
}

function openPlanEdit(row: SaasPlan) {
  const limits = row.limitsJson ?? {};
  const features = row.featuresJson ?? {};
  Object.assign(planForm, { id: row.id, code: row.code, name: row.name, monthlyPriceCent: row.monthlyPriceCent, annualPriceCent: row.annualPriceCent, workspaces: Number(limits.workspaces || 1), admins: Number(limits.admins || 1), features: Object.keys(features).filter((key) => features[key] === true), enabled: row.enabled });
  planDialogVisible.value = true;
}

async function savePlan() {
  if (!planForm.code.trim() || !planForm.name.trim()) return ElMessage.warning("请填写套餐编码和名称");
  saving.value = true;
  try {
    await upsertSaasPlan({ code: planForm.code, name: planForm.name, monthlyPriceCent: planForm.monthlyPriceCent, annualPriceCent: planForm.annualPriceCent, limits: { workspaces: planForm.workspaces, admins: planForm.admins }, features: Object.fromEntries(planForm.features.map((key) => [key, true])), enabled: planForm.enabled });
    planDialogVisible.value = false;
    await load();
    ElMessage.success("套餐已保存");
  } finally { saving.value = false; }
}

function openApiKeyCreate() { Object.assign(apiKeyForm, { name: "", scopes: ["conference:read"] }); apiKeyDialogVisible.value = true; }
async function saveApiKey() {
  if (!selectedTenant.value || !apiKeyForm.name.trim()) return ElMessage.warning("请填写 Key 名称");
  saving.value = true;
  try {
    const result = await createPlatformApiKey({ tenantId: selectedTenant.value.id, name: apiKeyForm.name, scopes: apiKeyForm.scopes });
    apiKeyDialogVisible.value = false;
    showSecret(result.secret, result.warning);
    await load();
  } finally { saving.value = false; }
}
async function revokeKey(row: PlatformApiKey) { await ElMessageBox.confirm(`撤销 API Key“${row.name}”？撤销后不能恢复。`, "撤销 Key", { type: "warning" }); await revokePlatformApiKey(row.id); await load(); ElMessage.success("API Key 已撤销"); }

function openWebhookCreate() { Object.assign(webhookForm, { name: "", url: "", events: ["order.paid"] }); webhookDialogVisible.value = true; }
async function saveWebhook() {
  if (!selectedTenant.value || !webhookForm.name.trim() || !webhookForm.url.trim()) return ElMessage.warning("请填写名称和 HTTPS 地址");
  saving.value = true;
  try {
    const result = await createPlatformWebhook({ tenantId: selectedTenant.value.id, ...webhookForm });
    webhookDialogVisible.value = false;
    showSecret(result.secret, result.warning);
    await load();
  } finally { saving.value = false; }
}

function openFlagCreate() { Object.assign(flagForm, { key: "", workspaceId: "", enabled: false }); flagDialogVisible.value = true; }
async function saveFlag() { if (!selectedTenant.value || !flagForm.key.trim()) return ElMessage.warning("请填写开关标识"); saving.value = true; try { await upsertPlatformFeatureFlag({ tenantId: selectedTenant.value.id, ...flagForm, workspaceId: flagForm.workspaceId || undefined }); flagDialogVisible.value = false; await load(); ElMessage.success("功能开关已保存"); } finally { saving.value = false; } }
async function toggleFlag(row: PlatformFeatureFlag, value: string | number | boolean) { await upsertPlatformFeatureFlag({ tenantId: row.tenantId, workspaceId: row.workspaceId || undefined, key: row.key, enabled: Boolean(value) }); await load(); }

async function savePlugin() { if (!pluginForm.name.trim() || !pluginForm.code.trim() || !pluginForm.version.trim()) return ElMessage.warning("请填写插件名称、编码和版本"); saving.value = true; try { await upsertPlatformPlugin({ name: pluginForm.name, code: pluginForm.code, version: pluginForm.version, manifest: { capabilities: pluginForm.capabilities }, enabled: true }); pluginDialogVisible.value = false; await load(); ElMessage.success("插件已登记，沙箱执行仍保持关闭"); } finally { saving.value = false; } }
function openPluginInstall() { Object.assign(pluginInstallForm, { pluginId: plugins.value.find((item) => item.enabled)?.id || "", workspaceId: "" }); pluginInstallDialogVisible.value = true; }
async function savePluginInstall() { if (!selectedTenant.value || !pluginInstallForm.pluginId) return ElMessage.warning("请选择插件"); saving.value = true; try { await installPlatformPlugin({ tenantId: selectedTenant.value.id, pluginId: pluginInstallForm.pluginId, workspaceId: pluginInstallForm.workspaceId || undefined }); pluginInstallDialogVisible.value = false; await load(); ElMessage.success("插件安装状态已登记，未执行任何第三方代码"); } finally { saving.value = false; } }

function showSecret(secret: string, warning: string) { oneTimeSecret.value = secret; secretWarning.value = warning; secretDialogVisible.value = true; }
async function copySecret() { await navigator.clipboard.writeText(oneTimeSecret.value); ElMessage.success("密钥已复制"); }
function closeSecret() { oneTimeSecret.value = ""; secretWarning.value = ""; secretDialogVisible.value = false; }

function activeCount(items: Array<{ status: string }>) { return items.filter((item) => item.status === "ACTIVE").length; }
function formatCent(value: number) { return `¥${(value / 100).toFixed(2)}`; }
function planLimits(row: SaasPlan) { return `工作区 ${String(row.limitsJson?.workspaces ?? "-")} · 管理员 ${String(row.limitsJson?.admins ?? "-")}`; }
function readinessLabel(status: PlatformReadinessStatus) { return ({ READY: "生产就绪", CONFIGURED: "已配置待验证", PARTIAL: "部分配置", NOT_CONFIGURED: "未配置", FOUNDATION_ONLY: "仅基础控制面" } as Record<string, string>)[status] || status; }
function readinessTagType(status: PlatformReadinessStatus): "success" | "warning" | "info" | "danger" { if (status === "READY") return "success"; if (status === "CONFIGURED" || status === "PARTIAL") return "warning"; if (status === "NOT_CONFIGURED") return "danger"; return "info"; }
function tenantStatusLabel(status: SaasTenant["status"]) { return status === "ACTIVE" ? "启用" : status === "SUSPENDED" ? "暂停" : "归档"; }
function tenantStatusType(status: SaasTenant["status"]): "success" | "warning" | "info" { return status === "ACTIVE" ? "success" : status === "SUSPENDED" ? "warning" : "info"; }
</script>

<style scoped>
.platform-page { --platform-navy: #10233d; --platform-green: #2f7868; --platform-gold: #a97e38; }
.platform-isolation-alert { margin-bottom: 18px; border-radius: 6px; }
.platform-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 18px; }
.platform-metrics article { display: flex; min-height: 96px; align-items: center; gap: 14px; padding: 18px; border: 1px solid var(--admin-color-border); border-radius: 6px; background: #fff; }
.platform-metrics article > span { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 6px; color: var(--platform-navy); background: #edf2f5; }
.platform-metrics svg { width: 21px; }
.platform-metrics div { display: flex; flex-direction: column; }
.platform-metrics strong { color: var(--platform-navy); font-size: 25px; line-height: 1.1; }
.platform-metrics small { margin-top: 6px; color: var(--admin-color-text-secondary); }
.platform-panel { margin-bottom: 18px; overflow: hidden; border: 1px solid var(--admin-color-border); border-radius: 6px; background: #fff; }
.platform-panel__head { display: flex; align-items: center; justify-content: space-between; padding: 18px 20px; border-bottom: 1px solid var(--admin-color-border); }
.platform-panel__head h2 { margin: 0; color: var(--platform-navy); font-size: 17px; }
.platform-panel__head p { margin: 5px 0 0; color: var(--admin-color-text-secondary); font-size: 13px; }
.platform-resource-panel { padding: 0 18px 18px; }
.platform-table-toolbar, .drawer-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 4px 0 14px; color: var(--admin-color-text-secondary); font-size: 13px; }
.platform-table-toolbar .el-input { width: min(360px, 100%); }
.platform-tenant-link { display: flex; flex-direction: column; gap: 4px; padding: 0; border: 0; color: var(--platform-navy); text-align: left; background: transparent; cursor: pointer; }
.platform-tenant-link small, .platform-muted { color: var(--admin-color-text-secondary); }
.tenant-drawer-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; border: 1px solid var(--admin-color-border); border-radius: 6px; }
.tenant-drawer-summary span { display: flex; flex-direction: column; gap: 5px; padding: 15px; }
.tenant-drawer-summary span + span { border-left: 1px solid var(--admin-color-border); }
.tenant-drawer-summary small { color: var(--admin-color-text-secondary); }
.tenant-drawer-summary strong { color: var(--platform-navy); font-size: 18px; }
.platform-secret { display: flex; align-items: center; gap: 10px; margin-top: 18px; }
.platform-secret code { flex: 1; overflow-wrap: anywhere; padding: 13px; border: 1px solid var(--admin-color-border); border-radius: 4px; color: var(--platform-navy); background: #f5f7f8; }
.platform-usage-list { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.platform-usage-list article { display: flex; min-height: 90px; flex-direction: column; justify-content: center; padding: 16px; border: 1px solid var(--admin-color-border); border-radius: 6px; }
.platform-usage-list strong { color: var(--platform-gold); font-size: 24px; }
.platform-usage-list span { margin-top: 5px; color: var(--platform-navy); }
.platform-usage-list small, .field-unit { margin-left: 8px; color: var(--admin-color-text-secondary); }
@media (max-width: 1100px) { .platform-metrics, .platform-usage-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 700px) { .platform-metrics, .platform-usage-list, .tenant-drawer-summary { grid-template-columns: 1fr; } .tenant-drawer-summary span + span { border-top: 1px solid var(--admin-color-border); border-left: 0; } }
</style>
