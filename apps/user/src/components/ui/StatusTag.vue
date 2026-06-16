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
  border: 1px solid transparent;
  border-radius: var(--cms-radius-full);
  font-size: 22rpx;
  font-weight: 800;
  line-height: 42rpx;
  white-space: nowrap;
}

.tag-info {
  border-color: var(--cms-primary-soft);
  background: var(--cms-primary-soft);
  color: var(--cms-primary-strong);
}

.tag-success {
  border-color: var(--cms-success-soft);
  background: var(--cms-success-soft);
  color: var(--cms-success);
}

.tag-warning {
  border-color: var(--cms-warning-soft);
  background: var(--cms-warning-soft);
  color: var(--cms-warning);
}

.tag-danger {
  border-color: var(--cms-danger-soft);
  background: var(--cms-danger-soft);
  color: var(--cms-danger);
}

.tag-neutral {
  border-color: var(--cms-border);
  background: var(--cms-surface-muted);
  color: var(--cms-text-secondary);
}
</style>
