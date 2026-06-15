<template>
  <section class="admin-section-card">
    <div v-if="title || subtitle || $slots.actions" class="admin-section-card__head">
      <div>
        <h2 v-if="title">{{ title }}</h2>
        <p v-if="subtitle">{{ subtitle }}</p>
      </div>
      <div v-if="$slots.actions" class="admin-section-card__actions">
        <slot name="actions" />
      </div>
    </div>
    <slot />
  </section>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    subtitle?: string;
  }>(),
  {
    title: "",
    subtitle: ""
  }
);
</script>

<style scoped>
.admin-section-card {
  padding: 16px;
  border: 1px solid var(--admin-color-border);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
  box-shadow: var(--admin-shadow);
}

.admin-section-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.admin-section-card h2 {
  margin: 0;
  color: var(--admin-color-text);
  font-size: 18px;
  font-weight: 900;
}

.admin-section-card p {
  margin: 6px 0 0;
  color: var(--admin-color-muted);
  font-size: 13px;
}

.admin-section-card__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
</style>
