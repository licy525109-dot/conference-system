<template>
  <section class="admin-filter-bar">
    <div class="admin-filter-bar__body">
      <slot />
    </div>
    <div v-if="$slots.actions" class="admin-filter-bar__actions">
      <slot name="actions" />
    </div>
  </section>
</template>

<style scoped>
.admin-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border: 1px solid rgb(221 230 242 / 84%);
  border-radius: var(--admin-radius);
  background: var(--admin-color-panel);
  box-shadow: var(--admin-shadow-soft);
}

@media (max-width: 900px) {
  .admin-filter-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-filter-bar__actions {
    justify-content: flex-start;
  }
}

.admin-filter-bar__body,
.admin-filter-bar__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
</style>
