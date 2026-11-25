<template>
  <section class="design-preview" aria-label="评分入口实时预览">
    <div class="preview-head">
      <strong>入口预览</strong>
      <div class="devices" aria-label="预览尺寸">
        <button
          v-for="d in devices"
          :key="d.value"
          type="button"
          :aria-pressed="device === d.value"
          @click="device = d.value"
        >
          {{ d.label }}
        </button>
      </div>
    </div>
    <div class="preview-board" ref="board">
      <div
        class="preview-device"
        :style="{ width: baseWidth * scale + 'px', height: baseHeight * scale + 'px' }"
      >
        <iframe
          ref="frame"
          :key="generation"
          :src="source"
          title="扫码首页实时预览"
          :style="{ width: baseWidth + 'px', height: baseHeight + 'px', transform: 'scale(' + scale + ')' }"
          @load="send"
        />
      </div>
    </div>
    <div class="preview-foot">
      <label
        >预览状态
        <select v-model="stage">
          <option value="name">姓名输入</option>
          <option value="choices">重名选择</option>
        </select>
      </label>
      <span v-if="!ready" role="status"
        >正在连接预览 <button type="button" @click="generation++">重新加载</button></span
      >
      <span v-else>可试填，评分数据不受影响</span>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from "vue";
import { judgingPreviewChannel, type JudgingLook } from "@conference/shared";
import { judgingH5Origin } from "../../services/judging";
const props = defineProps<{ title: string; look: JudgingLook }>();
const source = judgingH5Origin + "/#/pages/judging/design-preview";
const devices = [
  { value: "phone", label: "手机" },
  { value: "desktop", label: "电脑" }
] as const;
const board = ref<HTMLDivElement>(),
  frame = ref<HTMLIFrameElement>();
const generation = ref(0),
  ready = ref(false),
  device = ref<"phone" | "desktop">("phone"),
  stage = ref("name");
const available = ref(390),
  baseWidth = computed(() => (device.value === "phone" ? 390 : 1120)),
  baseHeight = computed(() => (device.value === "phone" ? 680 : 660)),
  scale = computed(() => Math.min(1, available.value / baseWidth.value));
function send() {
  frame.value?.contentWindow?.postMessage(
    {
      channel: judgingPreviewChannel,
      type: "design",
      stage: stage.value,
      title: props.title,
      look: JSON.parse(JSON.stringify(props.look))
    },
    judgingH5Origin
  );
}
function receive(e: MessageEvent) {
  if (
    e.source !== frame.value?.contentWindow ||
    e.origin !== judgingH5Origin ||
    e.data?.channel !== judgingPreviewChannel
  )
    return;
  if (e.data.type === "ready") send();
  if (e.data.type === "rendered") ready.value = true;
}
watch([() => props.look, () => props.title, stage], send, { deep: true, flush: "post" });
watch(generation, () => {
  ready.value = false;
});
let observer: ResizeObserver;
onMounted(() => {
  window.addEventListener("message", receive);
  observer = new ResizeObserver(([entry]) => {
    available.value = Math.max(1, Math.floor(entry.contentRect.width));
  });
  if (board.value) observer.observe(board.value);
  send();
});
onBeforeUnmount(() => {
  window.removeEventListener("message", receive);
  observer?.disconnect();
});
</script>
<style scoped>
.design-preview {
  position: sticky;
  top: 12px;
  min-width: 0;
  border: 1px solid #d6ded8;
  border-radius: 12px;
  overflow: hidden;
}
.preview-head,
.preview-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fafbf9;
  padding: 12px 16px;
}
.devices {
  display: flex;
  gap: 2px;
  border: 1px solid #cfd7d1;
  border-radius: 7px;
  padding: 2px;
  background: #fff;
}
.devices button,
.preview-foot button {
  font: inherit;
  cursor: pointer;
}
.devices button {
  background: transparent;
  color: #46564c;
  border: 0;
  border-radius: 4px;
  padding: 4px 13px;
  font-size: 13px;
}
.devices button[aria-pressed="true"] {
  color: #fff;
  background: #354b40;
}
.preview-board {
  padding: 16px;
  background: #e9ece6;
  display: flex;
  justify-content: center;
}
.preview-device {
  flex: none;
  border-radius: 8px;
  overflow: hidden;
  background: white;
  box-shadow: 0 2px 10px #2434261c;
}
.preview-device iframe {
  display: block;
  border: 0;
  transform-origin: top left;
}
.preview-foot {
  color: #526159;
  font-size: 12px;
}
.preview-foot select {
  margin-left: 6px;
  font: inherit;
  padding: 4px;
}
.preview-foot button {
  color: inherit;
  background: transparent;
  border: 0;
  text-decoration: underline;
}
@media (max-width: 900px) {
  .design-preview {
    position: static;
  }
}
</style>
