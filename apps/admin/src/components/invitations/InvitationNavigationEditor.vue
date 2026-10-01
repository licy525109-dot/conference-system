<template>
  <section class="navigation-editor" aria-label="章节导航设置">
    <header class="navigation-heading">
      <h2>章节导航</h2>
      <el-switch
        :model-value="navigation.enabled"
        :disabled="disabled"
        aria-label="显示章节导航"
        @update:model-value="patch({ enabled: Boolean($event) })"
      />
    </header>
    <template v-if="navigation.enabled">
      <div class="navigation-options">
        <el-form-item label="吸顶显示"
          ><el-switch
            :model-value="navigation.sticky"
            :disabled="disabled"
            aria-label="导航吸顶显示"
            @update:model-value="patch({ sticky: Boolean($event) })"
        /></el-form-item>
        <el-button
          :icon="RefreshLeft"
          :disabled="disabled"
          @click="restoreOrder"
          >按正文顺序排列</el-button
        >
      </div>
      <div class="navigation-items">
        <div
          v-for="(item, index) in navigation.items"
          :key="item.moduleId"
          class="navigation-item"
          :class="{ 'is-hidden': !item.visible }"
          :data-navigation-id="item.moduleId"
        >
          <span class="navigation-index">{{
            String(index + 1).padStart(2, "0")
          }}</span>
          <div class="navigation-label">
            <el-input
              :model-value="item.label"
              :placeholder="moduleTitle(item.moduleId)"
              :aria-label="`${moduleTitle(item.moduleId)}导航名称`"
              :disabled="disabled"
              maxlength="40"
              clearable
              @update:model-value="updateItem(item.moduleId, { label: $event })"
            />
            <small
              >{{ moduleTitle(item.moduleId)
              }}<span v-if="!available.has(item.moduleId)">
                ·
                {{
                  modules.get(item.moduleId)?.enabled
                    ? "暂无内容"
                    : "模块已隐藏"
                }}</span
              ></small
            >
          </div>
          <div class="navigation-item-actions">
            <el-switch
              :model-value="item.visible"
              :disabled="disabled"
              :aria-label="`显示${moduleTitle(item.moduleId)}导航`"
              @update:model-value="
                updateItem(item.moduleId, { visible: Boolean($event) })
              "
            />
            <el-button
              :icon="ArrowUp"
              :disabled="disabled || index === 0"
              :aria-label="`上移${moduleTitle(item.moduleId)}导航`"
              title="上移"
              @click="move(index, -1)"
            />
            <el-button
              :icon="ArrowDown"
              :disabled="disabled || index === navigation.items.length - 1"
              :aria-label="`下移${moduleTitle(item.moduleId)}导航`"
              title="下移"
              @click="move(index, 1)"
            />
          </div>
        </div>
      </div>
      <el-empty
        v-if="!navigation.items.length"
        description="暂无内容模块"
        :image-size="48"
      />
      <div class="navigation-preview">
        <h3>导航预览</h3>
        <div
          v-if="links.length"
          class="navigation-preview-strip"
          :style="{ color: modelValue.primaryColor }"
        >
          <span v-for="item in links" :key="item.module.id">{{
            item.label
          }}</span>
        </div>
        <span v-else class="navigation-empty">暂无可显示的导航项</span>
      </div>
    </template>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { ArrowDown, ArrowUp, RefreshLeft } from "@element-plus/icons-vue";
import {
  INVITATION_MODULE_LABELS,
  normalizeInvitationNavigation,
  invitationVisibleModules,
  invitationNavigationLinks,
  type InvitationContent,
  type InvitationNavigation,
  type InvitationNavigationItem,
} from "@conference/shared";
const props = defineProps<{
  modelValue: InvitationContent;
  disabled?: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [value: InvitationContent] }>();
const navigation = computed(() =>
  normalizeInvitationNavigation(
    props.modelValue.navigation,
    props.modelValue.modules,
  ),
);
const modules = computed(
  () => new Map(props.modelValue.modules.map((module) => [module.id, module])),
);
const available = computed(
  () =>
    new Set(
      invitationVisibleModules(props.modelValue).map((module) => module.id),
    ),
);
const links = computed(() => invitationNavigationLinks(props.modelValue));
function moduleTitle(id: string) {
  const module = modules.value.get(id);
  return module ? module.title || INVITATION_MODULE_LABELS[module.type] : "";
}
function patch(value: Partial<InvitationNavigation>) {
  if (!props.disabled)
    emit("update:modelValue", {
      ...props.modelValue,
      navigation: { ...navigation.value, ...value },
    });
}
function updateItem(id: string, value: Partial<InvitationNavigationItem>) {
  patch({
    items: navigation.value.items.map((item) =>
      item.moduleId === id ? { ...item, ...value } : item,
    ),
  });
}
function move(index: number, direction: number) {
  const items = [...navigation.value.items],
    target = index + direction;
  if (target < 0 || target >= items.length) return;
  [items[index], items[target]] = [items[target], items[index]];
  patch({ items });
}
function restoreOrder() {
  const items = new Map(
    navigation.value.items.map((item) => [item.moduleId, item]),
  );
  patch({
    items: props.modelValue.modules.map((module) => items.get(module.id)!),
  });
}
</script>
<style scoped>
.navigation-editor {
  max-width: 880px;
}
.navigation-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 24px;
}
.navigation-heading h2 {
  font-size: 18px;
  margin: 0;
  font-weight: 600;
}
.navigation-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.navigation-options :deep(.el-form-item) {
  margin: 0;
}
.navigation-items {
  border-top: 1px solid var(--admin-color-border, #e1e6e7);
}
.navigation-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid var(--admin-color-border, #e1e6e7);
}
.navigation-index {
  font-size: 12px;
  color: #748087;
  font-variant-numeric: tabular-nums;
}
.navigation-label {
  min-width: 0;
}
.navigation-label small {
  display: block;
  font-size: 12px;
  line-height: 1.6;
  color: #707b81;
  margin-top: 5px;
  overflow-wrap: anywhere;
}
.navigation-item.is-hidden .navigation-index {
  opacity: 0.5;
}
.navigation-item-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.navigation-item-actions :deep(.el-button) {
  width: 32px;
  height: 32px;
  padding: 0;
  margin-left: 0;
}
.navigation-preview {
  margin-top: 32px;
}
.navigation-preview h3 {
  font-size: 13px;
  font-weight: 500;
  color: #65737a;
  margin: 0 0 12px;
}
.navigation-preview-strip {
  display: flex;
  gap: 24px;
  overflow-x: auto;
  border-top: 1px solid #e1e6e7;
  border-bottom: 1px solid #e1e6e7;
  padding: 16px 0;
}
.navigation-preview-strip span {
  flex-shrink: 0;
  white-space: nowrap;
  font-size: 14px;
}
.navigation-empty {
  font-size: 13px;
  color: #707b81;
}
@media (max-width: 600px) {
  .navigation-item {
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 10px;
  }
  .navigation-item-actions {
    grid-column: 2;
    justify-content: flex-end;
  }
}
</style>
