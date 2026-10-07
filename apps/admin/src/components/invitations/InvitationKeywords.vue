<template>
  <ol class="invitation-keywords" aria-label="会议关键词">
    <li v-for="(keyword, index) in keywords" :key="index">
      <span class="keyword-number" aria-hidden="true">{{
        String(index + 1).padStart(2, "0")
      }}</span>
      <strong>{{ keyword }}</strong>
    </li>
  </ol>
</template>
<script setup lang="ts">
import { computed } from "vue";
import type { InvitationRichNode } from "@conference/shared";
const props = defineProps<{ body: InvitationRichNode[] }>();
function text(node: InvitationRichNode): string {
  if ("text" in node) return node.text;
  if (node.tag === "br") return "\n";
  return (node.children || []).map(text).join("");
}
const keywords = computed(() =>
  props.body
    .flatMap((node) => text(node).split(/[·|｜\n]/))
    .map((value) => value.trim())
    .filter(Boolean),
);
</script>
<style scoped>
.invitation-keywords {
  list-style: none;
  margin: 0;
  padding: 8px 0;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px 28px;
}
.invitation-keywords li {
  min-height: 72px;
  padding: 16px 0 20px;
  display: flex;
  align-items: baseline;
  gap: 12px;
  border-bottom: 1px solid
    color-mix(in srgb, var(--invite-primary) 25%, transparent);
}
.keyword-number {
  font-size: 12px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  color: var(--invite-accent);
  flex-shrink: 0;
}
.invitation-keywords strong {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.6;
  color: inherit;
  min-width: 0;
  overflow-wrap: anywhere;
}
@container (max-width: 600px) {
  .invitation-keywords {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 20px;
  }
  .invitation-keywords li {
    min-height: 64px;
    gap: 10px;
    padding: 12px 0 16px;
  }
  .invitation-keywords strong {
    font-size: 17px;
  }
}
</style>
