<template>
  <div class="cms-runtime-preview">
    <iframe
      ref="frame"
      class="cms-runtime-preview__frame"
      :src="frameSrc"
      title="用户端真实运行时预览"
      sandbox="allow-scripts allow-same-origin"
      @load="handleFrameLoad"
      @error="handleFrameError"
    />
    <div v-if="!ready" class="cms-runtime-preview__state" :class="{ 'is-error': Boolean(errorText) }">
      <span class="cms-runtime-preview__indicator" />
      <strong>{{ errorText ? "真实预览暂不可用" : "正在连接用户端运行时" }}</strong>
      <small>{{ errorText || "预览使用与 H5、小程序相同的 PageRenderer 和组件源码。" }}</small>
      <button v-if="errorText" type="button" @click="reloadFrame">立即重试</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  CMS_RUNTIME_PREVIEW_CHANNEL,
  CMS_RUNTIME_PREVIEW_VERSION,
  isCmsRuntimePreviewChildMessage,
  type CmsRuntimePreviewPayload
} from "@conference/shared";

type PreviewInput = Omit<CmsRuntimePreviewPayload, "channel" | "version" | "sessionId" | "type">;

const props = defineProps<{
  src: string;
  payload: PreviewInput;
}>();

const emit = defineEmits<{
  selectComponent: [componentId: string];
  reorderComponent: [sourceId: string, targetId: string];
  contentHeight: [height: number];
}>();

const frame = ref<HTMLIFrameElement | null>(null);
const ready = ref(false);
const errorText = ref("");
const reloadKey = ref(0);
const retryCount = ref(0);
const sessionId = createSessionId();
let readyTimer: number | undefined;
let retryTimer: number | undefined;
const READY_TIMEOUT_MS = 7000;
const AUTO_RETRY_DELAY_MS = 2400;
const MAX_AUTO_RETRIES = 5;

const frameSrc = computed(() => appendSession(props.src, sessionId, reloadKey.value));
const targetOrigin = computed(() => {
  try {
    return new URL(props.src, window.location.href).origin;
  } catch {
    return "*";
  }
});

watch(() => props.payload, () => sendPayload(), { deep: true, flush: "post" });

onMounted(() => {
  window.addEventListener("message", handleMessage);
  startReadyTimer();
});

onBeforeUnmount(() => {
  window.removeEventListener("message", handleMessage);
  if (readyTimer) clearTimeout(readyTimer);
  if (retryTimer) clearTimeout(retryTimer);
});

function handleFrameLoad(): void {
  ready.value = false;
  errorText.value = "";
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  startReadyTimer();
  window.setTimeout(sendPayload, 120);
}

function handleFrameError(): void {
  markUnavailable();
}

function handleMessage(event: MessageEvent<unknown>): void {
  if (event.source !== frame.value?.contentWindow || !isCmsRuntimePreviewChildMessage(event.data)) return;
  if (event.data.sessionId !== sessionId) return;
  if (event.data.type === "ready") {
    ready.value = true;
    retryCount.value = 0;
    errorText.value = "";
    if (readyTimer) {
      clearTimeout(readyTimer);
      readyTimer = undefined;
    }
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    sendPayload();
    return;
  }
  if (event.data.type === "select-component") emit("selectComponent", event.data.componentId);
  if (event.data.type === "reorder-component") emit("reorderComponent", event.data.sourceId, event.data.targetId);
  if (event.data.type === "content-height") emit("contentHeight", event.data.height);
  if (event.data.type === "render-error") errorText.value = event.data.message;
}

function sendPayload(): void {
  if (!frame.value?.contentWindow) return;
  try {
    const payload = JSON.parse(JSON.stringify(props.payload)) as PreviewInput;
    frame.value.contentWindow.postMessage({
      channel: CMS_RUNTIME_PREVIEW_CHANNEL,
      version: CMS_RUNTIME_PREVIEW_VERSION,
      sessionId,
      type: "render",
      ...payload
    } satisfies CmsRuntimePreviewPayload, targetOrigin.value);
  } catch (error) {
    errorText.value = error instanceof Error ? `预览数据无法同步：${error.message}` : "预览数据无法同步";
  }
}

function startReadyTimer(): void {
  if (readyTimer) clearTimeout(readyTimer);
  readyTimer = window.setTimeout(() => {
    readyTimer = undefined;
    if (!ready.value) markUnavailable();
  }, READY_TIMEOUT_MS);
}

function reloadFrame(): void {
  retryCount.value = 0;
  reconnectFrame();
}

function markUnavailable(): void {
  if (ready.value) return;
  errorText.value = "用户端预览服务暂未响应，系统正在自动重试；保存与发布不受影响。";
  scheduleAutoRetry();
}

function scheduleAutoRetry(): void {
  if (retryTimer || retryCount.value >= MAX_AUTO_RETRIES) return;
  retryTimer = window.setTimeout(() => {
    retryTimer = undefined;
    retryCount.value += 1;
    reconnectFrame();
  }, AUTO_RETRY_DELAY_MS);
}

function reconnectFrame(): void {
  if (readyTimer) {
    clearTimeout(readyTimer);
    readyTimer = undefined;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  ready.value = false;
  errorText.value = "";
  reloadKey.value += 1;
}

function appendSession(source: string, session: string, key: number): string {
  const url = new URL(source, window.location.href);
  const hash = url.hash || "#/pages/cms-preview/index";
  const separator = hash.includes("?") ? "&" : "?";
  url.hash = `${hash}${separator}session=${encodeURIComponent(session)}&reload=${key}`;
  return url.toString();
}

function createSessionId(): string {
  return `cms-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
</script>

<style scoped>
.cms-runtime-preview {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #f5f7f5;
}

.cms-runtime-preview__frame {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
  background: #f5f7f5;
}

.cms-runtime-preview__state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  padding: 28px;
  background: #f5f7f5;
  color: #142238;
  text-align: center;
}

.cms-runtime-preview__state small {
  max-width: 260px;
  color: #657083;
  font-size: 12px;
  line-height: 1.6;
}

.cms-runtime-preview__state button {
  min-height: 34px;
  margin-top: 8px;
  padding: 0 14px;
  border: 1px solid #315d7d;
  border-radius: 6px;
  background: #315d7d;
  color: #f8faf9;
  cursor: pointer;
}

.cms-runtime-preview__indicator {
  width: 20px;
  height: 20px;
  border: 2px solid #d8e0dd;
  border-top-color: #315d7d;
  border-radius: 50%;
  animation: cms-runtime-spin 0.8s linear infinite;
}

.cms-runtime-preview__state.is-error .cms-runtime-preview__indicator {
  display: none;
}

@keyframes cms-runtime-spin {
  to { transform: rotate(360deg); }
}
</style>
