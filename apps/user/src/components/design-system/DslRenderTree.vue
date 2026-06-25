<template>
  <view class="ds-tree">
    <DslNodeRenderer v-for="node in nodes" :key="node.id" :node="node" @action="emit('action', $event)" />
  </view>
</template>

<script setup lang="ts">
import type { ResolvedDslNode } from "@conference/dsl-runtime";
import DslNodeRenderer from "@/components/design-system/DslNodeRenderer.vue";

defineProps<{
  nodes: ResolvedDslNode[];
}>();

const emit = defineEmits<{
  action: [Record<string, unknown>];
}>();
</script>

<style scoped>
.ds-tree {
  display: flex;
  flex-direction: column;
  gap: var(--cms-space-section-y);
}
</style>
