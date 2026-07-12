<template>
  <view ref="previewRoot" class="cms-runtime-preview-page" :style="previewStyle">
    <PageRenderer
      v-if="dsl"
      :dsl="dsl"
      :theme="theme"
      :conferences="conferences"
      :products="products"
      :user-context="userContext"
      :platform="platform"
      editor-preview
      :selected-component-id="selectedComponentId"
      @select-component="postSelectComponent"
      @reorder-component="postReorderComponent"
    />
    <view v-else class="cms-runtime-preview-empty">
      <text>正在连接页面装修器</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import type { PageDsl } from "@conference/dsl-runtime";
import {
  CMS_RUNTIME_PREVIEW_CHANNEL,
  CMS_RUNTIME_PREVIEW_VERSION,
  isCmsRuntimePreviewPayload,
  type CmsRuntimePreviewPayload
} from "@conference/shared";
import PageRenderer from "@/components/PageRenderer.vue";
import { DEFAULT_THEME, type ThemeConfig } from "@/services/cms";
import type { ConferenceListItem } from "@/services/conference";
import type { Product } from "@/services/mall";
import { createCmsBackgroundStyle, createCmsThemeVars } from "@/theme/cmsTheme";

const dsl = ref<PageDsl | null>(null);
const theme = ref<ThemeConfig>({ ...DEFAULT_THEME });
const conferences = ref<ConferenceListItem[]>([]);
const products = ref<Product[]>([]);
const userContext = ref<Record<string, unknown> | null>(null);
const selectedComponentId = ref("");
const platform = ref<"h5" | "miniapp">("miniapp");
const sessionId = ref("");
let resizeObserver: ResizeObserver | undefined;
let hasAppliedPayload = false;
const previewStyle = computed(() => ({
  ...createCmsThemeVars(theme.value),
  ...createCmsBackgroundStyle(theme.value, "body")
}));

onLoad((query) => {
  sessionId.value = readText(query?.session);
});

onMounted(() => {
  // #ifdef H5
  window.addEventListener("message", handleParentMessage);
  resizeObserver = new ResizeObserver(() => postContentHeight());
  resizeObserver.observe(document.body);
  postReady();
  // #endif
});

onUnmounted(() => {
  // #ifdef H5
  window.removeEventListener("message", handleParentMessage);
  resizeObserver?.disconnect();
  // #endif
});

function handleParentMessage(event: MessageEvent<unknown>): void {
  if (!isCmsRuntimePreviewPayload(event.data)) return;
  if (sessionId.value && event.data.sessionId !== sessionId.value) return;
  applyPayload(event.data);
}

function applyPayload(payload: CmsRuntimePreviewPayload): void {
  try {
    const isFirstPayload = !hasAppliedPayload;
    sessionId.value = payload.sessionId;
    dsl.value = payload.dsl as PageDsl;
    theme.value = { ...DEFAULT_THEME, ...(payload.theme as Partial<ThemeConfig>) };
    conferences.value = payload.conferences as ConferenceListItem[];
    products.value = payload.products as Product[];
    userContext.value = payload.userContext;
    selectedComponentId.value = payload.selectedComponentId;
    platform.value = payload.platform;
    hasAppliedPayload = true;
    if (isFirstPayload) postReady();
    void nextTick(postContentHeight);
  } catch (error) {
    postMessageToParent({ type: "render-error", message: error instanceof Error ? error.message : "页面预览数据解析失败" });
  }
}

function postReady(): void {
  postMessageToParent({ type: "ready" });
}

function postSelectComponent(componentId: string): void {
  postMessageToParent({ type: "select-component", componentId });
}

function postReorderComponent(sourceId: string, targetId: string): void {
  postMessageToParent({ type: "reorder-component", sourceId, targetId });
}

function postContentHeight(): void {
  // #ifdef H5
  postMessageToParent({ type: "content-height", height: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) });
  // #endif
}

function postMessageToParent(payload: Record<string, unknown>): void {
  // #ifdef H5
  if (window.parent === window) return;
  window.parent.postMessage({
    channel: CMS_RUNTIME_PREVIEW_CHANNEL,
    version: CMS_RUNTIME_PREVIEW_VERSION,
    sessionId: sessionId.value,
    ...payload
  }, "*");
  // #endif
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
</script>

<style scoped>
.cms-runtime-preview-page {
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--cms-page-bg, #f5f7f5);
}

.cms-runtime-preview-empty {
  display: flex;
  min-height: 100vh;
  align-items: center;
  justify-content: center;
  color: #657083;
  font-size: 26rpx;
}

:global(html),
:global(body),
:global(#app),
:global(uni-app),
:global(uni-page),
:global(uni-page-wrapper),
:global(uni-page-body) {
  min-height: 100%;
  margin: 0;
  background: transparent;
}
</style>
