<template>
  <header class="admin-page-header">
    <div class="admin-page-header__copy">
      <span v-if="eyebrow" class="admin-page-header__eyebrow">{{ eyebrow }}</span>
      <div class="admin-page-header__title-row">
        <h1 class="admin-page-header__title">{{ title }}</h1>
        <AdminFeatureBadge v-if="badge" :label="badge" :tone="badgeTone" compact />
      </div>
      <p v-if="subtitle" class="admin-page-header__subtitle">{{ subtitle }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="admin-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import AdminFeatureBadge from "./AdminFeatureBadge.vue";

type AdminFeatureTone = "info" | "success" | "warning" | "danger" | "neutral";

withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    eyebrow?: string;
    badge?: string;
    badgeTone?: AdminFeatureTone;
  }>(),
  {
    subtitle: "",
    eyebrow: "",
    badge: "",
    badgeTone: "info"
  }
);
</script>

<style scoped>
.admin-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px 20px;
  padding: 0;
}

.admin-page-header__copy {
  min-width: 0;
  flex: 1 1 280px;
}

.admin-page-header__eyebrow {
  display: inline-flex;
  margin-bottom: 4px;
  color: var(--admin-color-primary-strong);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0;
}

.admin-page-header__title-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.admin-page-header__title {
  margin: 0;
  color: var(--admin-color-text);
  font-size: 24px;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.admin-page-header__subtitle {
  max-width: 780px;
  margin: 6px 0 0;
  color: var(--admin-color-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.admin-page-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
  max-width: 100%;
}

.admin-page-header__actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

@media (max-width: 760px) {
  .admin-page-header__actions {
    justify-content: flex-start;
  }
}
</style>
