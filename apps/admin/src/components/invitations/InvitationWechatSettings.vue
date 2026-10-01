<template>
  <el-drawer
    :model-value="modelValue"
    title="公众号配置"
    size="min(100vw, 560px)"
    :close-on-click-modal="!busy"
    :close-on-press-escape="!busy"
    :show-close="!busy"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <el-skeleton v-if="loading" :rows="8" animated />
    <el-alert
      v-if="error"
      :title="error"
      type="error"
      show-icon
      :closable="false"
      class="settings-feedback"
    />
    <el-form
      v-if="settings"
      label-position="top"
      :disabled="busy"
      class="official-settings"
      @submit.prevent="save"
    >
      <section>
        <div class="settings-heading">
          <h3>微信分享</h3>
          <el-switch v-model="enabled" aria-label="启用公众号分享" />
        </div>
        <el-form-item label="公众号 AppID"
          ><el-input
            v-model="appId"
            aria-label="公众号 AppID"
            maxlength="18"
            autocomplete="off"
            placeholder="wx…"
        /></el-form-item>
        <el-form-item label="公众号 AppSecret">
          <el-input
            v-model="appSecret"
            aria-label="公众号 AppSecret"
            type="password"
            show-password
            maxlength="64"
            autocomplete="new-password"
            :placeholder="
              settings.secretConfigured
                ? '已配置，留空保留原密钥'
                : '填写公众号 AppSecret'
            "
          />
        </el-form-item>
        <div class="settings-status">
          <el-tag :type="settings.secretConfigured ? 'success' : 'info'">{{
            settings.secretConfigured ? "密钥已配置" : "密钥未配置"
          }}</el-tag
          ><span v-if="settings.source === 'environment'"
            >当前来源：服务器环境</span
          >
        </div>
      </section>
      <section>
        <div class="settings-heading">
          <h3>域名校验</h3>
          <el-link
            href="https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html"
            target="_blank"
            rel="noopener noreferrer"
            :icon="Link"
            >微信文档</el-link
          >
        </div>
        <el-form-item label="JS 接口安全域名"
          ><el-input
            :model-value="settings.domain"
            readonly
            aria-label="JS 接口安全域名"
            ><template #append
              ><el-button
                :icon="CopyDocument"
                title="复制安全域名"
                aria-label="复制安全域名"
                @click="copyDomain" /></template></el-input
        ></el-form-item>
        <div class="verification-file">
          <el-button :icon="Upload" @click="fileInput?.click()"
            >上传校验文件</el-button
          >
          <input
            ref="fileInput"
            type="file"
            accept=".txt,text/plain"
            aria-label="公众号域名校验文件"
            hidden
            @change="chooseFile"
          />
          <div v-if="fileName" class="verification-name">
            <el-link
              v-if="!fileChanged && settings.verificationUrl"
              :href="settings.verificationUrl"
              target="_blank"
              rel="noopener noreferrer"
              >{{ fileName }}</el-link
            ><span v-else>{{ fileName }}</span
            ><el-button
              :icon="Delete"
              text
              title="移除校验文件"
              aria-label="移除校验文件"
              @click="
                fileChanged = true;
                verificationFile = null;
              "
            />
          </div>
        </div>
      </section>
      <section class="settings-check">
        <div class="settings-heading">
          <h3>接口检测</h3>
          <el-button
            :icon="Connection"
            :loading="testing"
            :disabled="dirty || !settings.secretConfigured"
            @click="testConnection"
            >检测连接</el-button
          >
        </div>
        <el-alert
          v-if="testResult"
          :title="testResult"
          type="success"
          show-icon
          :closable="false"
        />
      </section>
    </el-form>
    <template #footer
      ><div class="settings-footer">
        <el-button :disabled="busy" @click="$emit('update:modelValue', false)"
          >关闭</el-button
        ><el-button
          type="primary"
          :icon="DocumentChecked"
          :loading="saving"
          :disabled="!settings || testing || !dirty"
          @click="save"
          >保存配置</el-button
        >
      </div></template
    >
  </el-drawer>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  Connection,
  CopyDocument,
  Delete,
  DocumentChecked,
  Link,
  Upload,
} from "@element-plus/icons-vue";
import {
  getInvitationWechatSettings,
  saveInvitationWechatSettings,
  testInvitationWechatSettings,
  type InvitationWechatSettings as Settings,
} from "../../services/invitations";
const props = defineProps<{ modelValue: boolean }>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
const settings = ref<Settings | null>(null),
  appId = ref(""),
  appSecret = ref(""),
  enabled = ref(false);
const loading = ref(false),
  saving = ref(false),
  testing = ref(false),
  error = ref(""),
  testResult = ref("");
const fileInput = ref<HTMLInputElement>(),
  fileChanged = ref(false),
  verificationFile = ref<{ name: string; content: string } | null>(null);
const busy = computed(() => loading.value || saving.value || testing.value);
const fileName = computed(() =>
  fileChanged.value
    ? verificationFile.value?.name || ""
    : settings.value?.verificationFileName || "",
);
const dirty = computed(() =>
  Boolean(
    settings.value &&
      (appId.value !== settings.value.appId ||
        enabled.value !== settings.value.enabled ||
        appSecret.value ||
        fileChanged.value),
  ),
);
watch(dirty, (changed) => {
  if (changed) testResult.value = "";
});
let generation = 0;
function adopt(value: Settings) {
  settings.value = value;
  appId.value = value.appId;
  enabled.value = value.enabled;
  appSecret.value = "";
  fileChanged.value = false;
  verificationFile.value = null;
  testResult.value = "";
}
watch(
  () => props.modelValue,
  async (open) => {
    const request = ++generation;
    appSecret.value = "";
    verificationFile.value = null;
    fileChanged.value = false;
    error.value = "";
    testResult.value = "";
    if (!open) return;
    settings.value = null;
    loading.value = true;
    try {
      const value = await getInvitationWechatSettings();
      if (request === generation) adopt(value);
    } catch (cause) {
      if (request === generation)
        error.value = cause instanceof Error ? cause.message : "配置读取失败";
    } finally {
      if (request === generation) loading.value = false;
    }
  },
  { immediate: true },
);
async function save() {
  if (!settings.value || busy.value) return;
  saving.value = true;
  error.value = "";
  testResult.value = "";
  try {
    adopt(
      await saveInvitationWechatSettings({
        revision: settings.value.revision,
        enabled: enabled.value,
        appId: appId.value,
        appSecret: appSecret.value,
        ...(fileChanged.value
          ? { verificationFile: verificationFile.value }
          : {}),
      }),
    );
    ElMessage.success("公众号配置已保存");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "配置保存失败";
  } finally {
    appSecret.value = "";
    saving.value = false;
  }
}
async function testConnection() {
  if (busy.value || dirty.value) return;
  testing.value = true;
  error.value = "";
  testResult.value = "";
  try {
    testResult.value = (await testInvitationWechatSettings()).message;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : "接口检测失败";
  } finally {
    testing.value = false;
  }
}
async function chooseFile(event: Event) {
  const request = generation;
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (
    file.size > 1024 ||
    !/^MP_verify_[A-Za-z0-9]{1,80}\.txt$/.test(file.name)
  ) {
    ElMessage.error("请选择微信提供的 MP_verify_*.txt 校验文件");
    return;
  }
  try {
    const content = (await file.text()).trim();
    if (request !== generation) return;
    if (!/^[A-Za-z0-9_-]{8,256}$/.test(content))
      throw new Error("校验文件内容无效");
    verificationFile.value = { name: file.name, content };
    fileChanged.value = true;
    testResult.value = "";
  } catch {
    ElMessage.error("无法读取校验文件，请重新选择微信下载的原文件");
  }
}
async function copyDomain() {
  try {
    await navigator.clipboard.writeText(settings.value!.domain);
    ElMessage.success("域名已复制");
  } catch {
    ElMessage.error("复制失败，请手动选择域名");
  }
}
</script>
<style scoped>
.official-settings section {
  padding: 0 0 24px;
  margin: 0 0 24px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.official-settings section:last-child {
  border: 0;
}
.settings-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.settings-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.settings-status {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.verification-name {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.verification-name :deep(.el-link__inner) {
  overflow-wrap: anywhere;
}
.settings-feedback {
  margin-bottom: 20px;
}
.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.settings-check :deep(.el-alert__title) {
  line-height: 1.6;
}
</style>
