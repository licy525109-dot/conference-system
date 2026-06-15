<template>
  <span class="admin-feature-badge" :class="[`is-${tone}`, { 'is-compact': compact }]">
    <strong>{{ label }}</strong>
    <span v-if="description && !compact">{{ description }}</span>
  </span>
</template>

<script setup lang="ts">
export type AdminFeatureTone = "info" | "success" | "warning" | "danger" | "neutral";

withDefaults(
  defineProps<{
    label: string;
    description?: string;
    tone?: AdminFeatureTone;
    compact?: boolean;
  }>(),
  {
    description: "",
    tone: "info",
    compact: false
  }
);
</script>

<style scoped>
.admin-feature-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--admin-color-border);
  border-radius: 999px;
  background: #f8fbff;
  color: var(--admin-color-muted);
  font-size: 12px;
  line-height: 1.2;
}

.admin-feature-badge strong {
  color: var(--admin-color-text);
  font-weight: 900;
}

.admin-feature-badge.is-compact {
  padding: 5px 9px;
}

.admin-feature-badge.is-info {
  border-color: rgb(20 99 255 / 18%);
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary-strong);
}

.admin-feature-badge.is-info strong {
  color: var(--admin-color-primary-strong);
}

.admin-feature-badge.is-success {
  border-color: rgb(15 159 110 / 18%);
  background: #e9f8f2;
  color: #0f7a52;
}

.admin-feature-badge.is-success strong {
  color: #0f7a52;
}

.admin-feature-badge.is-warning {
  border-color: rgb(183 110 0 / 18%);
  background: #fff7e8;
  color: #8a4b00;
}

.admin-feature-badge.is-warning strong {
  color: #8a4b00;
}

.admin-feature-badge.is-danger {
  border-color: rgb(217 45 32 / 18%);
  background: #fff1f2;
  color: #b42318;
}

.admin-feature-badge.is-danger strong {
  color: #b42318;
}

.admin-feature-badge.is-neutral {
  border-color: #d8e0eb;
  background: #f1f5f9;
  color: #64748b;
}
</style>
