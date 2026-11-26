<template>
  <view class="task-picker">
    <button
      class="task-toggle"
      role="button"
      aria-label="选择评分选手"
      :aria-expanded="expanded"
      :disabled="disabled"
      @click="expanded = !expanded"
    >
      <text>选择评分选手</text
      ><text class="task-count">{{ page.tasks.length }} 位 · {{ expanded ? "收起" : "展开" }}</text>
    </button>
    <view v-if="expanded" class="task-options">
      <button
        v-for="task in page.tasks"
        :key="task.sessionId"
        class="task-option"
        role="button"
        :aria-label="task.teacher + ' · ' + task.room + ' · ' + task.round"
        :aria-pressed="task.sessionId === page.session.id"
        :disabled="disabled"
        @click="choose(task.sessionId)"
      >
        <view
          ><text class="task-name">{{ task.teacher }}</text
          ><text class="task-place"
            >{{ task.room }} · 第 {{ task.round }} {{ stageOf(task.role) === "ted" ? "位" : "轮" }}</text
          ></view
        >
        <text v-if="page.look.showProgress" class="task-count">{{ task.status }}</text>
      </button>
    </view>
  </view>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { stageOf, type ScoringView } from "@conference/shared";
const props = defineProps<{ page: ScoringView; disabled: boolean }>();
const emit = defineEmits<{ select: [id: string] }>();
const expanded = ref(false);
function choose(id: string) {
  if (props.disabled) return;
  expanded.value = false;
  if (id !== props.page.session.id) emit("select", id);
}
watch(
  () => props.page.session.id,
  () => {
    expanded.value = false;
  }
);
</script>
<style scoped>
.task-picker {
  background: var(--judging-card);
  border-radius: var(--judging-radius);
  padding: 0 16px;
  margin-bottom: 14px;
}
.task-toggle,
.task-option {
  display: flex;
  width: 100%;
  min-height: 48px;
  margin: 0;
  padding: 8px 2px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
  font: inherit;
  line-height: 1.45;
  color: var(--judging-accent);
  background: transparent;
}
.task-toggle {
  font-weight: 650;
}
.task-toggle::after,
.task-option::after {
  border: 0;
}
.task-options {
  max-height: 48vh;
  overflow-y: auto;
}
.task-option {
  border-top: 1px solid #dbe2df;
  border-radius: 0;
  color: var(--judging-text);
}
.task-option[aria-pressed="true"] {
  font-weight: 650;
  color: var(--judging-accent);
}
.task-name,
.task-place {
  display: block;
}
.task-place,
.task-count {
  font-size: 13px;
}
.task-count {
  flex-shrink: 0;
}
</style>
