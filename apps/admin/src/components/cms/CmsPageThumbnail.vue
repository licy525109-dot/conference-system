<template>
  <div class="cms-page-thumbnail" :style="thumbnailStyle" aria-hidden="true">
    <div class="cms-page-thumbnail__status">
      <span>9:41</span>
      <span class="cms-page-thumbnail__signal">5G</span>
    </div>
    <div class="cms-page-thumbnail__nav">
      <strong>{{ title || "页面预览" }}</strong>
      <span>•••</span>
    </div>
    <div class="cms-page-thumbnail__surface">
      <template v-if="visualComponents.length > 0">
        <CmsThumbnailNode v-for="component in visualComponents" :key="component.id" :component="component" />
      </template>
      <AdminDslRenderTree v-else-if="nodes.length > 0" :nodes="nodes" />
      <div v-else class="cms-page-thumbnail__empty">页面暂无内容</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { PageDsl, ResolvedDslNode } from "@conference/dsl-runtime";
import { createGovernedRuntimeContext, governRender } from "@conference/render-governor";
import AdminDslRenderTree from "../design-system/AdminDslRenderTree.vue";
import CmsThumbnailNode from "./CmsThumbnailNode.vue";

const props = defineProps<{
  dsl?: PageDsl | null;
  title?: string;
  theme?: Record<string, unknown> | null;
}>();

const safeDsl = computed<PageDsl>(() =>
  props.dsl?.schemaVersion === "p9"
    ? props.dsl
    : {
        schemaVersion: "p9",
        page: "template-preview",
        dsl: { nodes: [] }
      }
);

const nodes = computed<ResolvedDslNode[]>(() => {
  const context = createGovernedRuntimeContext({
    page: safeDsl.value.page,
    platform: "admin",
    data: {}
  });
  return governRender(safeDsl.value, { context, allowLegacyDslFallback: false }).tree.nodes;
});

const visualComponents = computed(() => {
  const metaValue = props.dsl?.meta?.editorComponents;
  const items = Array.isArray(metaValue)
    ? metaValue
    : isRecord(metaValue) && Array.isArray(metaValue.items)
      ? metaValue.items
      : [];
  const normalized = items.filter(isRecord).map((item, index) => normalizeComponent(item, index));
  if (normalized.length > 0) return normalized;
  return (props.dsl?.dsl.nodes ?? []).map((node, index) => ({
    id: node.id || `node-${index}`,
    type: readText(node.meta?.originalType) || node.type,
    enabled: node.enabled !== false,
    config: { ...node.props }
  }));
});

const thumbnailStyle = computed(() => {
  const source = props.theme ?? {};
  return {
    "--cms-thumb-bg": readColor(source.backgroundColor, "var(--admin-color-bg)"),
    "--cms-thumb-primary": readColor(source.primaryColor, "var(--admin-color-primary)"),
    "--cms-thumb-card": readColor(source.cardBackground, "var(--admin-color-panel)")
  };
});

function readColor(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function normalizeComponent(value: Record<string, unknown>, index: number) {
  return {
    id: readText(value.id) || `component-${index}`,
    type: readText(value.type) || "content",
    enabled: value.enabled !== false,
    config: isRecord(value.config) ? value.config : isRecord(value.props) ? value.props : {}
  };
}

function readText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
</script>

<style scoped>
.cms-page-thumbnail {
  width: 375px;
  min-height: 720px;
  overflow: hidden;
  background: var(--cms-thumb-bg);
  color: var(--admin-color-text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}

.cms-page-thumbnail__status,
.cms-page-thumbnail__nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-inline: 20px;
  background: var(--cms-thumb-card);
}

.cms-page-thumbnail__status {
  height: 36px;
  font-size: 12px;
  font-weight: 700;
}

.cms-page-thumbnail__signal {
  letter-spacing: 0;
}

.cms-page-thumbnail__nav {
  height: 52px;
  border-bottom: 1px solid var(--admin-color-border);
}

.cms-page-thumbnail__nav strong {
  margin-left: auto;
  font-size: 16px;
}

.cms-page-thumbnail__nav span {
  min-width: 52px;
  margin-left: auto;
  border-radius: 16px;
  background: var(--admin-color-panel-muted);
  text-align: center;
  line-height: 28px;
}

.cms-page-thumbnail__surface {
  min-height: 632px;
  padding: 12px;
  background: var(--cms-thumb-bg);
}

.cms-page-thumbnail__surface :deep(.admin-ds-tree) {
  gap: 10px;
}

.cms-page-thumbnail__surface :deep(.admin-ds-node) {
  border-radius: 10px;
  box-shadow: none;
}

.cms-page-thumbnail__surface :deep(.admin-ds-node--ds-banner) {
  min-height: 190px;
}

.cms-page-thumbnail__empty {
  display: grid;
  min-height: 540px;
  place-items: center;
  color: var(--admin-color-muted);
  font-size: 14px;
}
</style>
