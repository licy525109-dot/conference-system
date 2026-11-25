<template>
  <view class="judging-panel">
    <view class="judging-person">
      <image
        v-if="page.look.showPhoto && (page.teacher.photo || page.teacher.poster)"
        :src="asset(page.teacher.photo || page.teacher.poster)"
        class="judging-photo"
        mode="aspectFill"
      />
      <view>
        <text class="judging-note">
          {{ page.session.room }} · 第 {{ page.session.round }}
          {{ page.session.kind === "ted" ? "位" : "轮" }}　{{ page.session.time }}
        </text>
        <text class="judging-name">{{ page.teacher.name }}</text>
        <text v-if="page.look.showOrg" class="judging-note">{{ page.teacher.org }}</text>
      </view>
    </view>
    <text class="judging-topic">{{ page.teacher.topic }}</text>
  </view>
  <view v-if="page.receipt" class="judging-panel">
    <text class="judging-name">{{ page.look.receipt }}</text>
    <text class="judging-note">{{ page.receipt.teacher }} · {{ page.receipt.session }}</text>
    <text class="judging-note">提交成功 · {{ new Date(page.receipt.at).toLocaleString() }}</text>
  </view>
  <view v-else-if="page.open" class="judging-panel">
    <text class="judging-name">{{ page.form.title }} · {{ page.max }} 分</text>
    <text class="judging-note">{{ page.form.description }}</text>
    <form :key="page.session.id + ':' + page.formVersion" @submit="send">
      <view v-for="f in page.form.fields" :key="f.id" class="judging-field">
        <text class="judging-field-label">{{ f.label }}{{ f.required ? " *" : "" }}</text>
        <text v-if="f.hint" class="judging-note">{{ f.hint }}</text>
        <text class="judging-note">{{ f.min }}–{{ f.max }} 分，步长 {{ f.step }}</text>
        <input
          v-if="!unseen[f.id]"
          class="judging-input"
          type="digit"
          :name="f.id"
          :aria-label="f.label"
          placeholder="填写分数"
        />
        <text v-if="f.unseen !== 'forbid'" class="judging-link" @click="switchUnseen(f.id)">
          {{ unseen[f.id] ? "已选未观察 · 重新评分" : "此项未观察" }}
        </text>
      </view>
      <text v-if="validation || message" class="judging-note">{{ validation || message }}</text>
      <button class="judging-submit" :disabled="sending" form-type="submit">
        {{ sending ? "正在提交…" : page.look.submit }}
      </button>
    </form>
  </view>
  <view v-else class="judging-panel">
    <text>场控尚未开放本场评分，或本场已经截止。</text>
    <button @click="$emit('refresh')">刷新场次</button>
  </view>
</template>
<script setup lang="ts">
import { ref, watch } from "vue";
import { submittedValues } from "./form-values";
import type { Answers, ScoringView } from "@conference/shared";
import { API_BASE_URL } from "@/config/app";
const props = defineProps<{ page: ScoringView; sending: boolean; message: string }>();
const emit = defineEmits<{ submit: [answers: Answers]; refresh: [] }>();
const unseen = ref<Record<string, boolean>>({}),
  validation = ref("");
watch([() => props.page.session.id, () => props.page.formVersion, () => props.page.receipt?.id], () => {
  unseen.value = {};
  validation.value = "";
});
const asset = (url: string) => (url.startsWith("/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url);
function switchUnseen(id: string) {
  unseen.value[id] = !unseen.value[id];
}

function send(event: Event) {
  if (props.sending || props.page.receipt) return;
  validation.value = "";
  const entries = submittedValues(event);
  const answers: Answers = {};
  for (const f of props.page.form.fields) {
    const v = unseen.value[f.id] ? "unseen" : entries[f.id];
    if ((v === undefined || v === "") && f.required) {
      validation.value = "请完成" + f.label;
      return;
    }
    answers[f.id] = v === "unseen" ? v : v == null || v === "" ? null : Number(v);
  }

  emit("submit", answers);
}
</script>
