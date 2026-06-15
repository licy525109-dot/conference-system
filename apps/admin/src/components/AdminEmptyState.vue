<template>
  <div class="admin-empty-state">
    <span class="admin-empty-state__mark">{{ mark }}</span>
    <strong>{{ title }}</strong>
    <p>{{ description }}</p>
    <el-button v-if="actionText" type="primary" plain @click="$emit('action')">{{ actionText }}</el-button>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ action: [] }>();

withDefaults(
  defineProps<{
    title?: string;
    description?: string;
    mark?: string;
    actionText?: string;
  }>(),
  {
    title: "暂无数据",
    description: "调整筛选条件或新增内容后再查看。",
    mark: "空",
    actionText: ""
  }
);
</script>

<style scoped>
.admin-empty-state {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 38px 18px;
  color: var(--admin-color-muted);
  text-align: center;
}

.admin-empty-state__mark {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--admin-color-primary-soft);
  color: var(--admin-color-primary);
  font-weight: 900;
}

.admin-empty-state strong {
  color: var(--admin-color-text);
  font-size: 16px;
}

.admin-empty-state p {
  max-width: 360px;
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}
</style>
