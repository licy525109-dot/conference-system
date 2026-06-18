<template>
  <el-tooltip :content="content" placement="top" effect="dark" :show-after="160">
    <span class="field-help" aria-label="字段说明">?</span>
  </el-tooltip>
</template>

<script setup lang="ts">
defineProps<{ content: string }>();
</script>

<style scoped>
.field-help {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 4px;
  border-radius: 999px;
  background: #eef2f7;
  color: #64748b;
  font-size: 11px;
  font-weight: 800;
  cursor: help;
}
</style>
