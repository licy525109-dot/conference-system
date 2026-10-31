<template>
  <section v-if="hasPermission('payment-merchant:manage')" v-loading="loading" class="payment-settings">
    <div class="payment-heading">
      <h3>收款单位</h3>
      <el-tooltip content="刷新收款设置" placement="top">
        <el-button :icon="Refresh" aria-label="刷新收款设置" :disabled="loading || saving" @click="load" />
      </el-tooltip>
    </div>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <template v-if="settings && merchants">
      <dl class="payment-summary">
        <dt>当前收款单位</dt><dd>{{ settings.companyName }}</dd>
        <dt>默认收款单位</dt><dd>{{ merchants.defaultMerchant.companyName }}</dd>
        <dt>默认商户号</dt><dd>{{ merchants.defaultMerchant.mchId || '未配置' }}</dd>
      </dl>
      <el-alert v-if="currentUnavailable" title="当前收款单位已停用或配置无效，不会自动改用默认单位收款。" type="warning" :closable="false" show-icon />
      <el-form label-position="top" @submit.prevent="save">
        <el-form-item label="会议收款单位">
          <el-select v-model="selectedId" filterable :empty-values="[null, undefined]" :disabled="saving" class="merchant-select" placeholder="选择收款单位">
            <el-option :value="''" :label="`${merchants.defaultMerchant.companyName}（默认）`" />
            <el-option v-for="item in choices" :key="item.id" :value="item.id" :label="`${item.companyName}（${item.mchId}）`" />
            <el-option v-if="currentUnavailable && settings.paymentMerchantId" :value="settings.paymentMerchantId" :label="`${settings.companyName}（不可用）`" disabled />
          </el-select>
        </el-form-item>
        <p class="muted-text">变更仅适用于新建订单；历史订单保留原收款单位及支付配置。</p>
        <el-button type="primary" native-type="submit" :loading="saving" :disabled="!canSave">保存收款设置</el-button>
      </el-form>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Refresh } from "@element-plus/icons-vue";
import { useAdminSession } from "../../stores/admin-session";
import {
  getConferencePaymentSettings, isSelectablePaymentMerchant, listPaymentMerchants, setConferencePaymentSettings,
  type ConferencePaymentSettings, type PaymentMerchantList
} from "../../services/payment-merchants";

const props = defineProps<{ conferenceId: string }>();
const { hasPermission } = useAdminSession();
const settings = ref<ConferencePaymentSettings | null>(null);
const merchants = ref<PaymentMerchantList | null>(null);
const selectedId = ref("");
const loading = ref(false);
const saving = ref(false);
const error = ref("");
let requestVersion = 0;
let disposed = false;

const choices = computed(() => merchants.value?.items.filter(isSelectablePaymentMerchant) ?? []);
const currentUnavailable = computed(() => Boolean(settings.value?.paymentMerchantId
  && !choices.value.some(item => item.id === settings.value?.paymentMerchantId)));
const canSave = computed(() => !loading.value && Boolean(settings.value) && selectedId.value !== (settings.value?.paymentMerchantId ?? "")
  && (!selectedId.value || choices.value.some(item => item.id === selectedId.value)));

watch(() => [props.conferenceId, hasPermission("payment-merchant:manage")] as const, () => void load(), { immediate: true });
onBeforeUnmount(() => { disposed = true; requestVersion++; });

async function load() {
  const version = ++requestVersion;
  const id = props.conferenceId;
  settings.value = null;
  merchants.value = null;
  selectedId.value = "";
  error.value = "";
  if (!id || !hasPermission("payment-merchant:manage")) { loading.value = false; return; }
  loading.value = true;
  try {
    const [current, list] = await Promise.all([getConferencePaymentSettings(id), listPaymentMerchants()]);
    if (version !== requestVersion) return;
    settings.value = current;
    merchants.value = list;
    selectedId.value = current.paymentMerchantId ?? "";
  } catch (cause) {
    if (version === requestVersion) error.value = cause instanceof Error ? cause.message : "收款设置加载失败，请重试";
  } finally {
    if (version === requestVersion) loading.value = false;
  }
}

async function save() {
  if (!canSave.value || saving.value || !hasPermission("payment-merchant:manage")) return;
  const id = props.conferenceId;
  const merchantId = selectedId.value || null;
  const company = choices.value.find(item => item.id === merchantId)?.companyName ?? merchants.value!.defaultMerchant.companyName;
  const version = requestVersion;
  saving.value = true;
  error.value = "";
  try {
    const confirmed = await ElMessageBox.confirm(`将本会议新建订单的收款单位变更为「${company}」？历史订单不变。`, "确认收款单位", {
      type: "warning", confirmButtonText: "确认变更", cancelButtonText: "取消"
    }).then(() => true, () => false);
    if (!confirmed || disposed || version !== requestVersion || !hasPermission("payment-merchant:manage")) return;
    const result = await setConferencePaymentSettings(id, merchantId);
    if (version !== requestVersion) return;
    settings.value = result;
    selectedId.value = result.paymentMerchantId ?? "";
    ElMessage.success("收款设置已保存");
  } catch (cause) {
    if (version === requestVersion) error.value = cause instanceof Error ? cause.message : "收款设置保存失败";
  } finally {
    saving.value = false;
  }
}
</script>

<style scoped>
.payment-settings { display: grid; gap: 20px; max-width: 760px; padding: 16px 0; }
.payment-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.payment-heading h3 { margin: 0; font-size: 16px; }
.payment-summary { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 12px 16px; margin: 0; font-size: 14px; }
.payment-summary dt { color: var(--admin-color-muted); }
.payment-summary dd { margin: 0; overflow-wrap: anywhere; }
.merchant-select { width: 100%; }
.payment-settings :deep(.el-select__selected-item) { white-space: normal; overflow-wrap: anywhere; }
.payment-settings :deep(.el-alert__title) { overflow-wrap: anywhere; }
</style>
