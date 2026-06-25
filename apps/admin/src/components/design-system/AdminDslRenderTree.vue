<template>
  <div class="admin-ds-tree">
    <AdminDslNodeRenderer v-for="node in nodes" :key="node.id" :node="node" />
  </div>
</template>

<script setup lang="ts">
import type { ResolvedDslNode } from "@conference/dsl-runtime";
import AdminDslNodeRenderer from "./AdminDslNodeRenderer.vue";

defineProps<{
  nodes: ResolvedDslNode[];
}>();
</script>

<style scoped>
.admin-ds-tree {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
</style>
