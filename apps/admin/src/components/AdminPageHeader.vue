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
  gap: 18px;
  padding: 20px;
  border: 1px solid rgb(221 230 242 / 88%);
  border-radius: var(--admin-radius-lg);
  background: var(--admin-color-panel);
  box-shadow: var(--admin-shadow-soft);
}

.admin-page-header__copy {
  min-width: 0;
}

.admin-page-header__eyebrow {
  display: inline-flex;
  margin-bottom: 8px;
  color: var(--admin-color-primary);
  font-size: 12px;
  font-weight: 800;
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
  font-size: 23px;
  font-weight: 900;
  line-height: 1.25;
}

.admin-page-header__subtitle {
  max-width: 780px;
  margin: 8px 0 0;
  color: var(--admin-color-muted);
  font-size: 13px;
  line-height: 1.6;
}

.admin-page-header__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  flex-wrap: wrap;
}
</style>
