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
          {{ periodNames[sessionPeriod(page.session)] }} · {{ page.session.room }} · 第
          {{ page.session.round }} {{ page.session.kind === "ted" ? "位" : "轮" }}　{{ page.session.time }}
        </text>
        <text class="judging-name">{{ page.teacher.name }}</text>
        <text v-if="page.look.showOrg" class="judging-note">{{ page.teacher.org }}</text>
      </view>
    </view>
    <text class="judging-topic">{{ page.teacher.topic }}</text>
    <JudgingGuide :guidance="page.guidance" />
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
        <text class="judging-field-label"
          >{{ f.label }}<text v-if="f.required" class="judging-required">必填</text></text
        >
        <text v-if="f.hint" class="judging-note">{{ f.hint }}</text>
        <view class="judging-score-meta">
          <text>本项得分</text>
          <text class="judging-note">{{ f.min }}–{{ f.max }} 分，步长 {{ f.step }}</text>
        </view>
        <view v-if="inputs[f.id] !== 'unseen'" class="judging-score-box">
          <input
            v-model="inputs[f.id]"
            class="judging-score-input"
            type="digit"
            inputmode="decimal"
            :name="f.id"
            :aria-label="f.label + '得分'"
            :aria-describedby="issue?.fieldId === f.id ? 'judging-score-feedback' : undefined"
            placeholder="请输入分数"
            placeholder-class="judging-score-placeholder"
            :disabled="sending"
          />
          <text class="judging-score-unit">分</text>
        </view>
        <button
          v-if="f.unseen !== 'forbid'"
          class="judging-unseen"
          :disabled="sending"
          :aria-pressed="inputs[f.id] === 'unseen'"
          @click="inputs[f.id] = inputs[f.id] === 'unseen' ? '' : 'unseen'"
        >
          {{ inputs[f.id] === "unseen" ? "已选未观察 · 重新评分" : "此项未观察" }}
        </button>
      </view>
      <view v-if="page.form.feedbackPrompt" class="judging-field">
        <text class="judging-field-label">{{ page.form.feedbackPrompt }}（选填）</text>
        <textarea
          v-model="inputs[feedbackKey]"
          class="judging-feedback-input"
          :maxlength="1000"
          :aria-label="page.form.feedbackPrompt"
          placeholder="写下你的感受"
          :disabled="sending"
        />
      </view>
      <text
        v-if="message || issue"
        id="judging-score-feedback"
        class="judging-score-feedback"
        aria-live="polite"
        >{{ issue?.message || message }}</text
      >
      <button class="judging-submit judging-score-submit" :disabled="sending || !!issue" form-type="submit">
        {{ sending ? "正在提交…" : page.look.submit }}
      </button>
    </form>
  </view>
  <view v-else class="judging-panel">
    <text v-if="page.session.reviewStatus"
      >{{ periodNames[sessionPeriod(page.session)] }}评分已结束，{{
        page.session.reviewStatus === "confirmed" ? "已完成复核" : "正在复核"
      }}。</text
    >
    <text v-else>场控尚未开放本场评分，或本场已经截止。</text>
    <button @click="$emit('refresh')">刷新场次</button>
  </view>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import {
  ballotIssue,
  feedbackKey,
  periodNames,
  sessionPeriod,
  scoreInputAnswers,
  type Answers,
  type ScoreInputs,
  type ScoringView
} from "@conference/shared";
import { API_BASE_URL } from "@/config/app";
import JudgingGuide from "./JudgingGuide.vue";
const props = defineProps<{ page: ScoringView; sending: boolean; message: string }>();
const emit = defineEmits<{ submit: [answers: Answers]; refresh: [] }>();
const inputs = ref<ScoreInputs>({});
const answers = computed(() => scoreInputAnswers(props.page.form, inputs.value));
const issue = computed(() => ballotIssue(props.page.form, answers.value));
watch(
  [
    () => props.page.session.id,
    () => props.page.formVersion,
    () => props.page.role,
    () => props.page.receipt?.id
  ],
  () => {
    inputs.value = {};
  }
);
const asset = (url: string) => (url.startsWith("/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url);
function send() {
  if (props.sending || !props.page.open || props.page.receipt || issue.value) return;
  emit("submit", answers.value);
}
</script>
<style scoped>
@import "../../../../../packages/shared/src/judging-surface.css";
</style>
