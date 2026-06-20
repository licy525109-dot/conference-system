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
  min-height: 118px;
  padding: 16px;
  border: 1px solid rgb(221 230 242 / 86%);
  border-radius: var(--admin-radius);
  background: linear-gradient(180deg, #ffffff 0%, #fbfcfd 100%);
  box-shadow: var(--admin-shadow-soft);
}

.admin-stat-card__label,
.admin-stat-card__note {
  display: block;
  color: var(--admin-color-muted);
  font-size: 13px;
}

.admin-stat-card__value {
  display: block;
  margin-top: 9px;
  color: var(--admin-color-text);
  font-size: 28px;
  font-weight: 900;
  line-height: 1.1;
}

.admin-stat-card__note {
  margin-top: 11px;
  font-size: 12px;
}

.admin-stat-card.is-primary {
  border-color: rgb(49 93 125 / 18%);
  background: linear-gradient(180deg, #ffffff 0%, #f3f7fa 100%);
}

.admin-stat-card.is-success {
  border-color: rgb(31 122 91 / 18%);
}

.admin-stat-card.is-warning {
  border-color: rgb(165 107 31 / 22%);
}

.admin-stat-card.is-danger {
  border-color: rgb(185 56 56 / 20%);
}
</style>
