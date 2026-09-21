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
  flex-wrap: wrap;
  padding: 0;
  min-width: 0;
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
  min-width: 0;
}

.admin-filter-bar__body {
  flex: 1;
}

.admin-filter-bar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.admin-filter-bar__body :deep(> .el-input),
.admin-filter-bar__body :deep(> .el-select),
.admin-filter-bar__body :deep(> .el-date-editor) {
  max-width: 100%;
}

@media (max-width: 760px) {
  .admin-filter-bar__body :deep(> .el-input),
  .admin-filter-bar__body :deep(> .el-select),
  .admin-filter-bar__body :deep(> .el-date-editor) {
    flex: 1 1 180px;
    min-width: 0;
  }
}
</style>
