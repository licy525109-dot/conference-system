<template>
  <article class="admin-stat-card" :class="`is-${tone}`">
    <span class="admin-stat-card__label">{{ label }}</span>
    <strong class="admin-stat-card__value">{{ value }}</strong>
    <span v-if="note" class="admin-stat-card__note">{{ note }}</span>
    <slot />
  </article>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    value: string | number;
    note?: string;
    tone?: "default" | "primary" | "success" | "warning" | "danger";
  }>(),
  {
    note: "",
    tone: "default"
  }
);
</script>

<style scoped>
.admin-stat-card {
  min-width: 0;
  min-height: 96px;
  padding: 14px 16px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
}

.admin-stat-card__label,
.admin-stat-card__note {
  display: block;
  color: var(--admin-color-muted);
  font-size: 13px;
  line-height: 1.5;
  overflow-wrap: anywhere;
}

.admin-stat-card__value {
  display: block;
  margin-top: 8px;
  color: var(--admin-color-text);
  font-size: 24px;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}

.admin-stat-card__note {
  margin-top: 8px;
  font-size: 12px;
}

.admin-stat-card.is-primary .admin-stat-card__value {
  color: var(--admin-color-primary-strong);
}

.admin-stat-card.is-success .admin-stat-card__value {
  color: var(--admin-color-success);
}

.admin-stat-card.is-warning .admin-stat-card__value {
  color: var(--admin-color-warning);
}

.admin-stat-card.is-danger .admin-stat-card__value {
  color: var(--admin-color-danger);
}
</style>
