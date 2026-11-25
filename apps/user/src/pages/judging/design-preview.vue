<template>
  <EntryWelcome
    v-if="draft"
    :key="draft.stage"
    :look="draft.look"
    :title="draft.title"
    :choices="choices"
    :matched-name="matchedName"
    :message="message"
    :busy="false"
    @identify="tryName"
    @back="reset"
  />
  <view v-else class="preview-wait">请从赛事后台打开入口设计预览</view>
</template>
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import { judgingPreviewChannel, type GuestChoice, type JudgingLook } from "@conference/shared";
import EntryWelcome from "./EntryWelcome.vue";

const draft = ref<{ look: JudgingLook; title: string; stage: "name" | "choices" }>();
const samples: GuestChoice[] = [
  { id: "J02", org: "晨光舞蹈中心" },
  { id: "J03", org: "星禾艺术学校" }
];
const choices = ref<GuestChoice[]>([]),
  matchedName = ref(""),
  message = ref("");
function reset() {
  choices.value = [];
  matchedName.value = "";
  message.value = "";
}
function tryName(name: string, number?: string) {
  if (!name?.trim()) {
    message.value = "请输入名单上的姓名";
    return;
  }
  if (name.trim() === "林小雨" && !number) {
    matchedName.value = name.trim();
    choices.value = samples;
    return;
  }
  message.value = "预览试填成功";
}
// #ifdef H5
function permitted(origin: string) {
  if (origin === "https://admin.guanchaohuiji.com") return true;
  const loopback = (s: string) => ["127.0.0.1", "localhost", "[::1]"].includes(s);
  return loopback(location.hostname) && loopback(new URL(origin).hostname);
}
function receive(e: MessageEvent) {
  if (e.source !== window.parent || e.origin === "null" || !permitted(e.origin)) return;
  const data = e.data;
  if (
    data?.channel !== judgingPreviewChannel ||
    data.type !== "design" ||
    typeof data.title !== "string" ||
    !data.look?.entry ||
    !["choices", "name"].includes(data.stage)
  )
    return;
  if (draft.value?.stage !== data.stage) {
    reset();
    if (data.stage === "choices") {
      choices.value = samples;
      matchedName.value = "林小雨";
    }
  }
  draft.value = { title: data.title, look: data.look, stage: data.stage };
  window.parent.postMessage({ channel: judgingPreviewChannel, type: "rendered" }, e.origin);
}
onMounted(() => {
  window.addEventListener("message", receive);
  if (window.parent !== window && document.referrer) {
    const origin = new URL(document.referrer).origin;
    if (permitted(origin))
      window.parent.postMessage({ channel: judgingPreviewChannel, type: "ready" }, origin);
  }
});
onBeforeUnmount(() => window.removeEventListener("message", receive));
// #endif
</script>
<style scoped>
.preview-wait {
  padding: 24px;
  color: #5c594f;
  font: 14px/1.5 sans-serif;
}
</style>
