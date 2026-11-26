<template>
  <view class="judging-guide">
    <button
      v-if="compact"
      class="guide-toggle"
      role="button"
      aria-label="评审说明与评分规则"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <text>评审说明与评分规则</text><text class="guide-state">{{ expanded ? "收起" : "查看" }}</text>
    </button>
    <view v-if="!compact || expanded" class="guide-copy">
      <text class="guide-label">评审说明</text>
      <text class="guide-body">{{ guidance?.instructions || defaultJudgingGuidance.instructions }}</text>
      <text class="guide-label">评分规则</text>
      <text class="guide-body">{{ guidance?.rules || defaultJudgingGuidance.rules }}</text>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref } from "vue";
import { defaultJudgingGuidance, type JudgingGuidance } from "@conference/shared";
defineProps<{ guidance?: JudgingGuidance; compact?: boolean }>();
const expanded = ref(false);
</script>
<style scoped>
.judging-guide {
  border-top: 1px solid #dbe2df;
  margin-top: 14px;
  color: var(--judging-text);
}
.guide-toggle {
  width: 100%;
  min-height: 44px;
  margin: 0;
  padding: 8px 0;
  background: transparent;
  color: var(--judging-accent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  line-height: 1.5;
}
.guide-toggle::after {
  border: 0;
}
.guide-state {
  font-size: 13px;
}
.guide-copy {
  padding: 2px 0 4px;
}
.guide-label,
.guide-body {
  display: block;
}
.guide-label {
  margin: 10px 0 3px;
  font-weight: 650;
}
.guide-body {
  font-size: 0.94em;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
