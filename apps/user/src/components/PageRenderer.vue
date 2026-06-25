<template>
  <view class="dsl-page" :style="rootStyle">
    <view v-if="governorWarnings.length > 0" class="dsl-warning">
      <text>页面已通过 DSL Runtime 渲染，存在 {{ governorWarnings.length }} 条治理提示。</text>
    </view>
    <DslRenderTree :nodes="renderTree.nodes" @action="handleAction" />
  </view>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PageDsl, ResolvedDslNode } from "@conference/dsl-runtime";
import { createGovernedRuntimeContext, governRender, type RenderGovernorWarning } from "@conference/render-governor";
import DslRenderTree from "@/components/design-system/DslRenderTree.vue";
import type { ThemeConfig } from "@/services/cms";
import type { ConferenceDetail, ConferenceListItem } from "@/services/conference";
import type { Product } from "@/services/mall";
import { createCmsThemeVars } from "@/theme/cmsTheme";
import { stringifyQuery } from "@/utils/query";

const emit = defineEmits<{
  openConference: [id: string];
  register: [];
}>();

const props = defineProps<{
  dsl: PageDsl;
  theme: ThemeConfig;
  conferences?: ConferenceListItem[];
  conference?: ConferenceDetail | null;
  products?: Product[];
  suppressRegistrationCta?: boolean;
}>();

const runtimeContext = computed(() =>
  createGovernedRuntimeContext({
    page: props.dsl.page,
    platform: typeof window === "undefined" ? "miniapp" : "h5",
    theme: {
      id: String(props.theme.visualPreset || "cms-theme"),
      name: "CMS Theme",
      overrides: {
        colors: {
          primary: props.theme.primaryColor,
          secondary: props.theme.secondaryColor,
          accent: props.theme.accentColor,
          background: props.theme.backgroundColor,
          surface: props.theme.cardBackground
        },
        radius: {
          md: `${props.theme.radius * 2}rpx`,
          lg: `${props.theme.radius * 3}rpx`
        }
      }
    },
    data: {
      conferences: props.conferences ?? [],
      conference: props.conference ?? null,
      products: props.products ?? []
    }
  })
);

const governedResult = computed(() => governRender(props.dsl, { context: runtimeContext.value, allowLegacyDslFallback: false }));
const governorWarnings = computed<RenderGovernorWarning[]>(() => governedResult.value.warnings);
const renderTree = computed(() => ({
  ...governedResult.value.tree,
  nodes: props.suppressRegistrationCta ? governedResult.value.tree.nodes.filter((node) => !isRegistrationNode(node)) : governedResult.value.tree.nodes
}));
const rootStyle = computed(() => ({
  ...createCmsThemeVars(props.theme)
}));

function isRegistrationNode(node: ResolvedDslNode): boolean {
  const action = node.props.action;
  return node.type === "ds-button" && isRecord(action) && action.type === "registration";
}

function handleAction(action: Record<string, unknown>): void {
  const type = readString(action.type);
  if (type === "registration") {
    emit("register");
    return;
  }
  if (type === "conference") {
    const conferenceId = readString(action.conferenceId || action.id);
    if (conferenceId) emit("openConference", conferenceId);
    return;
  }
  if (type === "page") {
    const pageKey = readString(action.pageKey);
    if (pageKey) navigateToPage(pageKey, action);
    return;
  }
  if (type === "url") {
    const url = readString(action.url);
    if (url) copyText(url, "链接已复制");
  }
}

function navigateToPage(pageKey: string, action: Record<string, unknown>): void {
  const builtin: Record<string, string> = {
    home: "/pages/index/index",
    "conference-list": "/pages/custom/index?pageKey=conference-list",
    "my-registrations": "/pages/registrations/my",
    cart: "/pages/cart/index",
    "member-center": "/pages/member/center",
    mall: "/pages/mall/index",
    "mall-orders": "/pages/mall/orders",
    invoice: "/pages/invoice/index",
    "ai-assistant": props.conference?.id ? `/pages/ai-assistant/index?conferenceId=${encodeURIComponent(props.conference.id)}` : "/pages/ai-assistant/index"
  };
  const query: Record<string, string> = {};
  const conferenceId = readString(action.conferenceId);
  const productId = readString(action.productId);
  if (conferenceId) query.conferenceId = conferenceId;
  if (productId) query.productId = productId;
  const path = builtin[pageKey] ?? `/pages/custom/index?pageKey=${encodeURIComponent(pageKey.startsWith("custom:") ? pageKey.slice("custom:".length) : pageKey)}`;
  const suffix = Object.keys(query).length > 0 ? `${path.includes("?") ? "&" : "?"}${stringifyQuery(query)}` : "";
  uni.navigateTo({ url: `${path}${suffix}` });
}

function copyText(text: string, title: string): void {
  uni.setClipboardData({
    data: text,
    success: () => uni.showToast({ title, icon: "none" })
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
</script>

<style scoped>
.dsl-page {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-section-y);
}

.dsl-warning {
  padding: 16rpx 24rpx;
  border: 1px solid var(--cms-warning-soft);
  border-radius: var(--cms-radius-md);
  background: var(--cms-warning-soft);
  color: var(--cms-warning);
  font-size: 24rpx;
  line-height: 34rpx;
}
</style>
