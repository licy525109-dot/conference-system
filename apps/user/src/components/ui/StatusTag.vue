<template>
  <text :class="['tag', `tag-${tone}`]">{{ label }}</text>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    label: string;
    tone?: "info" | "success" | "warning" | "danger" | "neutral";
  }>(),
  {
    tone: "info"
  }
);
</script>

<style scoped>
.tag {
  display: inline-flex;
  align-items: center;
  min-height: 42rpx;
  padding: 0 16rpx;
  border-radius: 999px;
  font-size: 22rpx;
  font-weight: 800;
  line-height: 42rpx;
  white-space: nowrap;
}

.tag-info {
  background: var(--ui-color-primary-soft);
  color: var(--ui-color-primary);
}

.tag-success {
  background: #e8f7f1;
  color: var(--ui-color-success);
}

.tag-warning {
  background: #fff6df;
  color: var(--ui-color-warning);
}

.tag-danger {
  background: #fff1ef;
  color: var(--ui-color-danger);
}

.tag-neutral {
  background: #eef2f7;
  color: var(--ui-color-muted);
}
</style>
