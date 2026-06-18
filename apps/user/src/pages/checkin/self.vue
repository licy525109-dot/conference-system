<template>
  <view class="page ui-page">
    <view class="hero ui-card">
      <text class="eyebrow">签到核销</text>
      <text class="title">自助签到</text>
      <text class="subtitle">{{ config?.availability.message || "读取会议签到配置中" }}</text>
    </view>

    <LoadingState v-if="loading" title="加载签到配置" description="正在读取当前会议核验方式。" />
    <ErrorState v-else-if="error" :message="error" primary-text="重试" @retry="load" />

    <view v-else-if="config && !canSelfCheckin" class="ui-card state-card">
      <text class="state-title">{{ config.availability.message }}</text>
      <text class="state-desc">{{ disabledDescription }}</text>
    </view>

    <view v-else-if="config" class="ui-card form-card">
      <text class="section-title">{{ method === "SELF_CUSTOM_FIELDS" ? "核验报名字段" : "核验手机号和姓名" }}</text>
      <view v-for="field in activeFields" :key="field.fieldKey" class="field-row">
        <text class="field-label">{{ field.label }}</text>
        <input v-model="formValues[field.fieldKey]" class="field-input" :placeholder="`请输入${field.label}`" />
      </view>
      <button class="ui-button-primary submit" :loading="submitting" @click="submit">提交签到</button>
    </view>

    <view v-if="result" class="ui-card result-card">
      <text class="result-title">{{ result.message }}</text>
      <text class="result-line">报名号：{{ result.registrationNo }}</text>
      <text class="result-line">参会人：{{ result.attendeeName }}</text>
      <text class="result-line">签到时间：{{ result.checkedInAt ? formatDateTime(result.checkedInAt) : "-" }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import ErrorState from "@/components/ui/ErrorState.vue";
import LoadingState from "@/components/ui/LoadingState.vue";
import { ensureLogin } from "@/services/auth";
import { getCheckinConfig, selfCheckin, type CheckinConfig, type CheckinField, type CheckinResult } from "@/services/checkin";
import { formatDateTime } from "@/utils/date";

const conferenceId = ref("");
const registrationId = ref("");
const config = ref<CheckinConfig | null>(null);
const loading = ref(false);
const submitting = ref(false);
const error = ref("");
const result = ref<CheckinResult | null>(null);
const formValues = reactive<Record<string, string>>({});

const method = computed<"SELF_PHONE_NAME" | "SELF_CUSTOM_FIELDS">(() =>
  config.value?.methods.includes("SELF_PHONE_NAME") ? "SELF_PHONE_NAME" : "SELF_CUSTOM_FIELDS"
);
const activeFields = computed<CheckinField[]>(() => {
  if (!config.value) return [];
  if (method.value === "SELF_PHONE_NAME") {
    return [config.value.fieldBindings.phoneFieldKey, config.value.fieldBindings.nameFieldKey]
      .map((fieldKey) => config.value!.fields.find((field) => field.fieldKey === fieldKey))
      .filter((field): field is CheckinField => Boolean(field));
  }
  const keys = config.value.fieldBindings.customFieldKeys || [];
  return keys.map((fieldKey) => config.value!.fields.find((field) => field.fieldKey === fieldKey)).filter((field): field is CheckinField => Boolean(field));
});
const canSelfCheckin = computed(() =>
  Boolean(config.value?.enabled && config.value.availability.status === "OPEN" && (config.value.methods.includes("SELF_PHONE_NAME") || config.value.methods.includes("SELF_CUSTOM_FIELDS")) && activeFields.value.length > 0)
);
const disabledDescription = computed(() => {
  if (!config.value?.enabled) return "本会议无需签到核销";
  if (config.value.availability.status !== "OPEN") return "请在签到开放时间内再试";
  return "当前会议未启用客户自助签到，请出示报名凭证二维码由工作人员扫码。";
});

onLoad((query) => {
  conferenceId.value = String(query?.conferenceId || "");
  registrationId.value = String(query?.registrationId || "");
  void load();
});

async function load() {
  loading.value = true;
  error.value = "";
  result.value = null;
  try {
    await ensureLogin();
    config.value = await getCheckinConfig(conferenceId.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : "签到配置加载失败";
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (!config.value) return;
  submitting.value = true;
  error.value = "";
  try {
    result.value = await selfCheckin({
      conferenceId: conferenceId.value,
      registrationId: registrationId.value || undefined,
      method: method.value,
      values: formValues
    });
    uni.showToast({ title: result.value.message, icon: "success" });
  } catch (err) {
    error.value = err instanceof Error ? err.message : "签到失败";
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 22rpx;
}

.hero,
.form-card,
.state-card,
.result-card {
  padding: 28rpx;
}

.eyebrow {
  display: block;
  color: var(--ui-color-primary);
  font-size: 24rpx;
  font-weight: 800;
}

.title,
.section-title,
.state-title,
.result-title {
  display: block;
  color: var(--ui-color-text);
  font-weight: 900;
}

.title {
  margin-top: 8rpx;
  font-size: 44rpx;
}

.subtitle,
.state-desc,
.result-line {
  display: block;
  margin-top: 10rpx;
  color: var(--ui-color-muted);
  font-size: 25rpx;
  line-height: 1.5;
}

.field-row {
  margin-top: 22rpx;
}

.field-label {
  display: block;
  margin-bottom: 10rpx;
  color: var(--ui-color-text);
  font-size: 25rpx;
  font-weight: 800;
}

.field-input {
  height: 82rpx;
  padding: 0 22rpx;
  border: 1px solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface-muted);
  color: var(--ui-color-text);
  font-size: 27rpx;
}

.submit {
  width: 100%;
  margin-top: 28rpx;
}
</style>
