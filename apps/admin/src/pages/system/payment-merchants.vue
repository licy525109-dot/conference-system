<template>
  <section class="admin-page merchant-page">
    <AdminPageHeader title="收款单位" eyebrow="系统管理">
      <template #actions>
        <el-tooltip content="刷新收款单位" placement="top">
          <el-button :icon="Refresh" aria-label="刷新收款单位" :disabled="loading || Boolean(busy)" @click="load" />
        </el-tooltip>
        <el-button type="primary" :icon="Plus" :disabled="!ready || Boolean(busy)" @click="openMerchant()">新增收款单位</el-button>
      </template>
    </AdminPageHeader>
    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
    <el-alert v-if="actionError" :title="actionError" type="error" :closable="false" show-icon />
    <dl v-if="data" class="merchant-summary">
      <dt>默认收款单位</dt><dd>{{ data.defaultMerchant.companyName }}</dd>
      <dt>默认商户号</dt><dd>{{ data.defaultMerchant.mchId || '未配置' }}</dd>
      <dt>配置来源</dt><dd>服务器环境配置</dd>
    </dl>
    <el-alert v-if="data && !data.encryptionConfigured" title="服务器尚未配置支付凭据加密密钥，暂不能保存凭据版本。" type="warning" :closable="false" show-icon />
    <section v-loading="loading" class="table-panel">
      <el-table :data="data?.items ?? []" empty-text="暂无收款单位">
        <AdminTableIndex />
        <el-table-column prop="companyName" label="单位全称" min-width="240" />
        <el-table-column prop="mchId" label="商户号" min-width="150" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }"><AdminStatusBadge :label="merchantStatus(row)" :tone="isSelectablePaymentMerchant(row) ? 'success' : 'warning'" /></template>
        </el-table-column>
        <el-table-column label="启用版本" width="110">
          <template #default="{ row }">{{ activeVersion(row) }}</template>
        </el-table-column>
        <el-table-column label="关联会议" width="100"><template #default="{ row }">{{ row.conferenceCount ?? '-' }}</template></el-table-column>
        <el-table-column prop="remark" label="备注" min-width="180" show-overflow-tooltip />
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" :disabled="!ready || Boolean(busy)" @click="openVersions(row)">配置版本</el-button>
            <el-button size="small" :disabled="!ready || Boolean(busy)" @click="openMerchant(row)">备注</el-button>
            <el-button size="small" type="warning" :disabled="!ready || Boolean(busy) || !row.enabled" @click="disableMerchant(row)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>
    </section>

    <el-dialog v-model="merchantVisible" :title="merchantForm.id ? '编辑备注' : '新增收款单位'" width="min(580px, calc(100vw - 32px))" destroy-on-close :close-on-click-modal="false" @close="clearMerchantForm">
      <el-alert v-if="merchantError" :title="merchantError" type="error" :closable="false" show-icon class="dialog-alert" />
      <el-form ref="merchantFormRef" :model="merchantForm" :rules="merchantRules" label-position="top" :disabled="Boolean(busy)" @submit.prevent="saveMerchant">
        <el-form-item prop="companyName" label="单位全称">
          <el-input v-model="merchantForm.companyName" :disabled="Boolean(merchantForm.id)" maxlength="160" placeholder="与微信支付商户主体一致的单位全称" />
        </el-form-item>
        <el-form-item prop="mchId" label="微信支付商户号">
          <el-input v-model="merchantForm.mchId" :disabled="Boolean(merchantForm.id)" maxlength="20" inputmode="numeric" placeholder="6 至 20 位数字" />
        </el-form-item>
        <p class="muted-text">单位全称与商户号保存后不可修改。</p>
        <el-form-item prop="remark" label="备注"><el-input v-model="merchantForm.remark" type="textarea" :rows="3" maxlength="500" show-word-limit /></el-form-item>
      </el-form>
      <template #footer><el-button @click="merchantVisible = false">取消</el-button><el-button type="primary" :loading="busy === 'merchant'" :disabled="Boolean(busy) || !ready" @click="saveMerchant">保存</el-button></template>
    </el-dialog>

    <el-drawer v-model="versionsVisible" title="支付配置版本" size="min(1080px, 100vw)" destroy-on-close>
      <div v-if="selectedMerchant" class="version-content">
        <dl class="merchant-summary">
          <dt>收款单位</dt><dd>{{ selectedMerchant.companyName }}</dd>
          <dt>商户号</dt><dd>{{ selectedMerchant.mchId }}</dd>
          <dt>收款状态</dt><dd>{{ merchantStatus(selectedMerchant) }}</dd>
        </dl>
        <el-alert v-if="loadError || versionError" :title="loadError || versionError" type="error" :closable="false" show-icon />
        <div class="version-toolbar">
          <h3>配置版本</h3>
          <el-button type="primary" :icon="Plus" :disabled="!ready || Boolean(busy) || !data?.encryptionConfigured" @click="openRevision">新增凭据版本</el-button>
        </div>
        <el-table :data="selectedMerchant.revisions" empty-text="暂无凭据版本">
          <el-table-column label="版本" width="100">
            <template #default="{ row }"><strong>v{{ row.version }}</strong><div v-if="selectedMerchant.activeRevisionId === row.id" class="muted-text">{{ selectedMerchant.enabled ? '当前启用' : '停用前版本' }}</div></template>
          </el-table-column>
          <el-table-column label="公开配置" min-width="270">
            <template #default="{ row }">
              <div class="revision-identifiers">AppID：{{ row.appId }}<br />商户证书序列号：{{ row.mchSerialNo }}<br />微信支付公钥 ID / 平台证书序列号：{{ row.platformKeyId }}</div>
            </template>
          </el-table-column>
          <el-table-column label="凭据验证" min-width="180">
            <template #default="{ row }">
              <div>{{ row.credentialsConfigured ? (row.checkedAt ? (recentlyChecked(row) ? '验证通过' : '需重新验证') : '未验证') : '凭据未配置' }}</div>
              <div class="muted-text">{{ formatTime(row.checkedAt) }}</div>
            </template>
          </el-table-column>
          <el-table-column label="关联确认 / 创建时间" min-width="180">
            <template #default="{ row }"><div>{{ row.associationConfirmedAt ? formatTime(row.associationConfirmedAt) : '关联未确认' }}</div><div class="muted-text">创建：{{ formatTime(row.createdAt) }}</div></template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" :loading="busy === `check:${row.id}`" :disabled="!ready || Boolean(busy) || !row.credentialsConfigured" @click="checkRevision(row)">验证凭据</el-button>
              <el-button size="small" type="primary" :disabled="!ready || Boolean(busy) || !recentlyChecked(row) || (selectedMerchant.enabled && selectedMerchant.activeRevisionId === row.id)" @click="openActivation(row)">启用</el-button>
            </template>
          </el-table-column>
        </el-table>
        <p class="muted-text">签名与验签验证结果在 24 小时内可用于启用。API v3 密钥仅检查格式，回调解密需真实交易验证；JSAPI 支付权限及小程序关联需另行确认。</p>
      </div>
    </el-drawer>

    <el-dialog v-model="revisionVisible" title="新增凭据版本" width="min(680px, calc(100vw - 32px))" destroy-on-close :close-on-click-modal="false" @close="clearRevisionForm">
      <el-alert v-if="revisionError" :title="revisionError" type="error" :closable="false" show-icon class="dialog-alert" />
      <p class="muted-text">{{ revisionHasPrevious ? `密钥项留空将沿用 v${previousVersion} 的凭据。` : '首个版本必须提供全部凭据。' }}凭据不会回显。</p>
      <el-form ref="revisionFormRef" :model="revisionForm" :rules="revisionRules" label-position="top" :disabled="Boolean(busy)" autocomplete="off" @submit.prevent="saveRevision">
        <el-form-item prop="appId">
          <template #label>当前小程序 AppID <FieldHelp content="须与当前观潮会集小程序的 AppID 一致，不是公众号 AppID，也不是其他小程序的 AppID。" /></template>
          <el-input v-model="revisionForm.appId" maxlength="64" placeholder="wx 开头的小程序 AppID" />
        </el-form-item>
        <el-form-item prop="mchSerialNo">
          <template #label>商户 API 证书序列号 <FieldHelp content="微信支付商户平台的 API 安全配置中，商户 API 证书对应的序列号。" /></template>
          <el-input v-model="revisionForm.mchSerialNo" maxlength="128" />
        </el-form-item>
        <el-form-item prop="platformKeyId">
          <template #label>微信支付公钥 ID / 平台证书序列号 <FieldHelp content="须与下方微信支付公钥或平台证书对应，公钥 ID 通常以 PUB_KEY_ID_ 开头。不是商户 API 证书序列号。" /></template>
          <el-input v-model="revisionForm.platformKeyId" maxlength="128" />
        </el-form-item>
        <el-form-item prop="apiV3Key">
          <template #label>API v3 密钥 <FieldHelp content="微信支付商户平台设置的 32 字节 API v3 密钥，不是 AppSecret。" /></template>
          <el-input v-model="revisionForm.apiV3Key" type="password" autocomplete="new-password" :placeholder="secretPlaceholder" />
        </el-form-item>
        <el-form-item prop="privateKeyPem">
          <template #label>商户私钥（PEM） <FieldHelp content="商户 API 证书对应的 RSA 私钥，包含 PEM 起止行，RSA 至少 2048 位。" /></template>
          <el-input v-model="revisionForm.privateKeyPem" class="masked-pem" type="textarea" :rows="3" maxlength="16000" autocomplete="off" :spellcheck="false" :placeholder="secretPlaceholder" />
        </el-form-item>
        <el-form-item prop="platformPublicKeyPem">
          <template #label>微信支付公钥 / 平台证书（PEM） <FieldHelp content="微信支付提供的公钥或平台证书，包含 PEM 起止行，须与上述公钥 ID 或平台证书序列号对应。" /></template>
          <el-input v-model="revisionForm.platformPublicKeyPem" class="masked-pem" type="textarea" :rows="3" maxlength="16000" autocomplete="off" :spellcheck="false" :placeholder="secretPlaceholder" />
        </el-form-item>
      </el-form>
      <template #footer><el-button @click="revisionVisible = false">取消</el-button><el-button type="primary" :loading="busy === 'revision'" :disabled="Boolean(busy) || !ready || !data?.encryptionConfigured" @click="saveRevision">保存新版本</el-button></template>
    </el-dialog>

    <el-dialog v-model="activationVisible" title="确认启用支付配置" width="min(580px, calc(100vw - 32px))" destroy-on-close :close-on-click-modal="false" @close="associationConfirmed = false">
      <template v-if="selectedMerchant && activationRevision">
        <dl class="merchant-summary">
          <dt>收款单位</dt><dd>{{ selectedMerchant.companyName }}</dd>
          <dt>商户号</dt><dd>{{ selectedMerchant.mchId }}</dd>
          <dt>配置版本</dt><dd>v{{ activationRevision.version }}</dd>
          <dt>小程序 AppID</dt><dd>{{ activationRevision.appId }}</dd>
        </dl>
        <el-alert v-if="activationError" :title="activationError" type="error" :closable="false" show-icon class="dialog-alert" />
        <el-checkbox v-model="associationConfirmed" class="association-checkbox" :disabled="Boolean(busy)">已在微信商户平台确认开通 JSAPI 支付，并完成上述小程序与该商户的关联。</el-checkbox>
        <p class="muted-text">新建订单使用此版本。历史订单保留原收款单位和创建时快照，同一商户的后续支付操作使用已启用的最新凭据。</p>
      </template>
      <template #footer><el-button @click="activationVisible = false">取消</el-button><el-button type="primary" :loading="busy === 'activate'" :disabled="!associationConfirmed || Boolean(busy) || !ready" @click="activateRevision">确认启用</el-button></template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from "element-plus";
import { Plus, Refresh } from "@element-plus/icons-vue";
import AdminPageHeader from "../../components/AdminPageHeader.vue";
import AdminTableIndex from "../../components/AdminTableIndex.vue";
import AdminStatusBadge from "../../components/AdminStatusBadge.vue";
import FieldHelp from "../../components/FieldHelp.vue";
import { useAdminSession } from "../../stores/admin-session";
import {
  activatePaymentMerchantRevision, checkPaymentMerchantRevision, createPaymentMerchant,
  isSelectablePaymentMerchant, listPaymentMerchants, savePaymentMerchantRevision, updatePaymentMerchant,
  type PaymentMerchant, type PaymentMerchantList, type PaymentMerchantRevision, type PaymentMerchantRevisionInput
} from "../../services/payment-merchants";

const { hasPermission } = useAdminSession();
const data = ref<PaymentMerchantList | null>(null);
const loading = ref(false);
const busy = ref("");
const loadError = ref("");
const actionError = ref("");
const merchantError = ref("");
const versionError = ref("");
const revisionError = ref("");
const activationError = ref("");
const merchantVisible = ref(false);
const versionsVisible = ref(false);
const revisionVisible = ref(false);
const activationVisible = ref(false);
const selectedMerchantId = ref("");
const activationRevision = ref<PaymentMerchantRevision | null>(null);
const associationConfirmed = ref(false);
const revisionHasPrevious = ref(false);
const previousVersion = ref(0);
const merchantFormRef = ref<FormInstance>();
const revisionFormRef = ref<FormInstance>();
const merchantForm = reactive({ id: "", companyName: "", mchId: "", remark: "" });
const emptyRevision = (): PaymentMerchantRevisionInput => ({ appId: "", mchSerialNo: "", platformKeyId: "", apiV3Key: "", privateKeyPem: "", platformPublicKeyPem: "" });
const revisionForm = reactive(emptyRevision());
let disposed = false;

const ready = computed(() => Boolean(data.value) && !loading.value && !loadError.value && hasPermission("payment-merchant:manage"));
const selectedMerchant = computed(() => data.value?.items.find(item => item.id === selectedMerchantId.value));
const secretPlaceholder = computed(() => revisionHasPrevious.value ? "留空沿用上一版本" : "请输入完整凭据");
const merchantRules: FormRules = {
  companyName: [{ required: true, whitespace: true, message: "请输入单位全称", trigger: "blur" }],
  mchId: [{ required: true, pattern: /^\d{6,20}$/, message: "商户号须为 6 至 20 位数字", trigger: "blur" }]
};
const revisionRules: FormRules = {
  appId: [{ required: true, pattern: /^wx[0-9a-f]{16}$/i, message: "请输入有效的当前小程序 AppID", trigger: "blur" }],
  mchSerialNo: [{ required: true, whitespace: true, message: "请输入商户 API 证书序列号", trigger: "blur" }],
  platformKeyId: [{ required: true, whitespace: true, message: "请输入微信支付公钥 ID 或平台证书序列号", trigger: "blur" }],
  apiV3Key: [{ validator: (_rule, value: string, callback) => {
    const text = value.trim();
    callback(!text && revisionHasPrevious.value ? undefined : new TextEncoder().encode(text).length === 32 ? undefined : new Error("API v3 密钥必须为 32 字节"));
  }, trigger: "blur" }],
  privateKeyPem: [{ validator: (_rule, value: string, callback) => {
    callback(validPem(value, "PRIVATE KEY") ? undefined : new Error("请输入完整的 PEM 商户私钥（含起止行）"));
  }, trigger: "blur" }],
  platformPublicKeyPem: [{ validator: (_rule, value: string, callback) => {
    callback(validPem(value, "PUBLIC KEY") || validPem(value, "CERTIFICATE") ? undefined : new Error("请输入完整的 PEM 微信支付公钥或平台证书（含起止行）"));
  }, trigger: "blur" }]
};

onMounted(() => void load());
onBeforeUnmount(() => { disposed = true; clearRevisionForm(); });

function validPem(value: string, kind: string) {
  const text = value.trim();
  if (!text) return revisionHasPrevious.value;
  return text.length <= 16000 && [kind, `RSA ${kind}`].some(label => text.startsWith(`-----BEGIN ${label}-----`) && text.endsWith(`-----END ${label}-----`));
}

async function load() {
  if (!hasPermission("payment-merchant:manage")) return;
  loading.value = true;
  loadError.value = "";
  try { data.value = await listPaymentMerchants(); }
  catch (cause) { loadError.value = errorText(cause, "收款单位加载失败，请重试"); }
  finally { loading.value = false; }
}

function openMerchant(item?: PaymentMerchant) {
  merchantError.value = "";
  Object.assign(merchantForm, { id: item?.id ?? "", companyName: item?.companyName ?? "", mchId: item?.mchId ?? "", remark: item?.remark ?? "" });
  merchantVisible.value = true;
}

function clearMerchantForm() { Object.assign(merchantForm, { id: "", companyName: "", mchId: "", remark: "" }); }

async function saveMerchant() {
  if (!ready.value || busy.value || !await merchantFormRef.value?.validate().catch(() => false)) return;
  if (busy.value || !merchantVisible.value) return;
  busy.value = "merchant";
  merchantError.value = "";
  try {
    if (merchantForm.id) await updatePaymentMerchant(merchantForm.id, { remark: merchantForm.remark.trim() });
    else await createPaymentMerchant({ companyName: merchantForm.companyName.trim(), mchId: merchantForm.mchId.trim(), remark: merchantForm.remark.trim() });
    merchantVisible.value = false;
    ElMessage.success("收款单位已保存");
    await load();
  } catch (cause) { merchantError.value = errorText(cause, "收款单位保存失败"); }
  finally { busy.value = ""; }
}

function openVersions(item: PaymentMerchant) {
  selectedMerchantId.value = item.id;
  versionError.value = "";
  versionsVisible.value = true;
}

function openRevision() {
  clearRevisionForm();
  const previous = selectedMerchant.value?.revisions[0];
  revisionHasPrevious.value = Boolean(previous?.credentialsConfigured);
  previousVersion.value = previous?.version ?? 0;
  Object.assign(revisionForm, { appId: previous?.appId ?? "", mchSerialNo: previous?.mchSerialNo ?? "", platformKeyId: previous?.platformKeyId ?? "" });
  revisionError.value = "";
  revisionVisible.value = true;
}

function clearRevisionForm() { Object.assign(revisionForm, emptyRevision()); }

async function saveRevision() {
  if (!ready.value || busy.value || !selectedMerchant.value || !data.value?.encryptionConfigured || !await revisionFormRef.value?.validate().catch(() => false)) return;
  if (busy.value || !revisionVisible.value) return;
  busy.value = "revision";
  revisionError.value = "";
  try {
    const request = savePaymentMerchantRevision(selectedMerchant.value.id, {
      appId: revisionForm.appId.trim(), mchSerialNo: revisionForm.mchSerialNo.trim(), platformKeyId: revisionForm.platformKeyId.trim(),
      apiV3Key: revisionForm.apiV3Key.trim(), privateKeyPem: revisionForm.privateKeyPem.trim(), platformPublicKeyPem: revisionForm.platformPublicKeyPem.trim()
    });
    // Clear sensitive inputs as soon as the request has captured them, including failed submissions.
    revisionForm.apiV3Key = revisionForm.privateKeyPem = revisionForm.platformPublicKeyPem = "";
    await request;
    revisionVisible.value = false;
    clearRevisionForm();
    ElMessage.success("新版本已保存，尚未启用");
    await load();
  } catch (cause) { revisionError.value = errorText(cause, "凭据保存失败，请重新填写密钥后重试"); }
  finally { revisionForm.apiV3Key = revisionForm.privateKeyPem = revisionForm.platformPublicKeyPem = ""; busy.value = ""; }
}

async function checkRevision(revision: PaymentMerchantRevision) {
  if (!ready.value || busy.value || !selectedMerchant.value) return;
  busy.value = `check:${revision.id}`;
  versionError.value = "";
  try {
    const result = await checkPaymentMerchantRevision(selectedMerchant.value.id, revision.id);
    ElMessage.success(result.message);
    await load();
  } catch (cause) { versionError.value = errorText(cause, "凭据验证失败"); }
  finally { busy.value = ""; }
}

function openActivation(revision: PaymentMerchantRevision) {
  activationRevision.value = revision;
  associationConfirmed.value = false;
  activationError.value = "";
  activationVisible.value = true;
}

async function activateRevision() {
  if (!ready.value || busy.value || !associationConfirmed.value || !selectedMerchant.value || !activationRevision.value) return;
  if (!recentlyChecked(activationRevision.value)) { activationError.value = "验证已过期，请关闭此窗口并重新验证凭据"; return; }
  const merchant = selectedMerchant.value;
  const revision = activationRevision.value;
  busy.value = "activate";
  activationError.value = "";
  try {
    const confirmed = await ElMessageBox.confirm(`确认启用「${merchant.companyName}」的 v${revision.version}？该单位关联会议的新建订单将使用此版本。`, "最终确认", {
      type: "warning", confirmButtonText: "启用此版本", cancelButtonText: "取消"
    }).then(() => true, () => false);
    if (!confirmed || disposed || !activationVisible.value || !associationConfirmed.value || !ready.value) return;
    await activatePaymentMerchantRevision(merchant.id, revision.id, { associationConfirmed: true });
    activationVisible.value = false;
    associationConfirmed.value = false;
    ElMessage.success("支付配置已启用");
    await load();
  } catch (cause) { activationError.value = errorText(cause, "启用失败"); }
  finally { busy.value = ""; }
}

async function disableMerchant(merchant: PaymentMerchant) {
  if (!ready.value || busy.value) return;
  busy.value = `disable:${merchant.id}`;
  actionError.value = "";
  try {
    const confirmed = await ElMessageBox.confirm(`停用「${merchant.companyName}」后，其关联会议无法使用该单位发起新支付，也不会自动改用默认单位。确认停用？`, "停用收款单位", {
      type: "warning", confirmButtonText: "确认停用", cancelButtonText: "取消"
    }).then(() => true, () => false);
    if (!confirmed || disposed || !ready.value) return;
    await updatePaymentMerchant(merchant.id, { enabled: false });
    ElMessage.success("收款单位已停用");
    await load();
  } catch (cause) { actionError.value = errorText(cause, "停用失败"); }
  finally { busy.value = ""; }
}

function recentlyChecked(revision: PaymentMerchantRevision) {
  const time = revision.checkedAt ? Date.parse(revision.checkedAt) : NaN;
  return Number.isFinite(time) && Date.now() - time < 24 * 60 * 60 * 1000;
}
function merchantStatus(merchant: PaymentMerchant) {
  return !merchant.enabled ? "已停用" : isSelectablePaymentMerchant(merchant) ? "可收款" : "待配置启用";
}
function activeVersion(merchant: PaymentMerchant) {
  const version = merchant.revisions.find(item => item.id === merchant.activeRevisionId)?.version;
  return version ? `v${version}` : "-";
}
function formatTime(value: string | null) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
function errorText(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }
</script>

<style scoped>
.merchant-page, .version-content { display: grid; gap: 20px; min-width: 0; }
.merchant-summary { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 10px 16px; margin: 0; padding: 16px 0; border-bottom: 1px solid var(--admin-color-border); font-size: 14px; }
.merchant-summary dt { color: var(--admin-color-muted); }
.merchant-summary dd { margin: 0; overflow-wrap: anywhere; }
.version-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; }
.version-toolbar h3 { margin: 0; font-size: 16px; }
.revision-identifiers { font-size: 13px; overflow-wrap: anywhere; }
.dialog-alert { margin-bottom: 18px; }
.masked-pem :deep(textarea) { -webkit-text-security: disc; }
.association-checkbox { height: auto; align-items: flex-start; margin-top: 20px; }
.association-checkbox :deep(.el-checkbox__input) { margin-top: 4px; }
.association-checkbox :deep(.el-checkbox__label) { white-space: normal; line-height: 1.6; overflow-wrap: anywhere; }
.merchant-page :deep(.el-alert__title) { overflow-wrap: anywhere; }
</style>
