<template>
  <view class="judging-surface" :style="style">
    <view v-if="!page" class="judging-panel">
      <text class="judging-heading">{{ loading ? "正在核对评审资格" : "现场评审" }}</text>
      <text>{{ message }}</text>
      <!-- #ifdef MP-WEIXIN -->
      <button v-if="needPhone" open-type="getPhoneNumber" @getphonenumber="verifyPhone">
        验证报名手机号
      </button>
      <!-- #endif -->
      <button v-if="!loading" @click="load">重新核对</button>
    </view>
    <template v-else>
      <view class="judging-hero">
        <text v-if="page.rehearsal" class="judging-test">联排测试</text>
        <image v-if="page.look.cover" class="judging-cover" :src="asset(page.look.cover)" mode="aspectFill" />
        <image v-if="page.look.logo" class="judging-logo" :src="asset(page.look.logo)" mode="aspectFit" />
        <text class="judging-kicker">{{ page.title }} · {{ roleLabels[page.role] }}</text>
        <text class="judging-heading">{{ page.look.heading }}</text>
        <text>{{ page.look.intro }}</text>
      </view>
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
        <text class="judging-note">提交成功 · {{ stamp(page.receipt.at) }}</text>
      </view>
      <view v-else-if="page.open" class="judging-panel">
        <text class="judging-name">{{ page.form.title }} · {{ page.max }} 分</text>
        <text class="judging-note">{{ page.form.description }}</text>
        <view v-for="f in page.form.fields" :key="f.id" class="judging-field">
          <text class="judging-field-label">{{ f.label }}{{ f.required ? " *" : "" }}</text>
          <text v-if="f.hint" class="judging-note">{{ f.hint }}</text>
          <text class="judging-note">{{ f.min }}–{{ f.max }} 分，步长 {{ f.step }}</text>
          <input
            v-if="values[f.id] !== 'unseen'"
            class="judging-input"
            type="digit"
            :value="values[f.id] ?? ''"
            placeholder="填写分数"
            @input="setValue(f.id, $event)"
          />
          <text v-if="f.unseen !== 'forbid'" class="judging-link" @click="switchUnseen(f.id)">
            {{ values[f.id] === "unseen" ? "已选未观察 · 重新评分" : "此项未观察" }}
          </text>
        </view>
        <text v-if="message" class="judging-note">{{ message }}</text>
        <button class="judging-submit" :disabled="sending" @click="send">
          {{ sending ? "正在提交…" : page.look.submit }}
        </button>
      </view>
      <view v-else class="judging-panel">
        <text>场控尚未开放本场评分，或本场已经截止。</text>
        <button @click="load">刷新场次</button>
      </view>
      <view v-if="page.look.showProgress" class="judging-panel">
        <text class="judging-name">我的评审任务</text>
        <view v-for="t in page.tasks" :key="t.sessionId" class="judging-task" @click="select(t.sessionId)">
          {{ t.teacher }} · {{ t.room }} · {{ t.status }}
        </view>
      </view>
    </template>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
import { defaultJudgingConfig, judgingStyle, roleLabels } from "@conference/shared";
import type { Answers, ScoreReceipt, ScoringView } from "@conference/shared";
import { ensureAuthenticatedUser } from "@/services/auth";
import { bindWechatPhone } from "@/services/profile";
import { ApiRequestError, request } from "@/services/request";
import { API_BASE_URL } from "@/config/app";
const page = ref<ScoringView | null>(null),
  message = ref(""),
  loading = ref(false),
  sending = ref(false),
  needPhone = ref(false);
const eventId = ref(""),
  sessionId = ref(""),
  values = ref<Record<string, string>>({});
const style = computed(() => judgingStyle(page.value?.look ?? defaultJudgingConfig().look));
const path = () =>
  "/judging/" + encodeURIComponent(eventId.value) + "/sessions/" + encodeURIComponent(sessionId.value);
const asset = (url: string) => (url.startsWith("/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url);
const stamp = (at: string) => new Date(at).toLocaleString();
function problem(e: unknown) {
  return e instanceof ApiRequestError
    ? e.responseMessage || "连接失败，请检查网络后重试"
    : e instanceof Error
      ? e.message
      : "请稍后重试";
}
async function load() {
  if (loading.value) return;
  loading.value = true;
  message.value = "";
  needPhone.value = false;
  try {
    if (!eventId.value || !sessionId.value) throw new Error("请扫描本场独立评分码");
    const user = await ensureAuthenticatedUser();
    needPhone.value = !user.phoneVerifiedAt;
    const data = await request<ScoringView>(path());
    page.value = data;
    uni.setNavigationBarTitle({ title: data.look.heading });
  } catch (e) {
    page.value = null;
    message.value = problem(e);
  } finally {
    loading.value = false;
  }
}
function select(id: string) {
  if (sending.value || loading.value || sessionId.value === id) return;
  sessionId.value = id;
  values.value = {};
  page.value = null;
  void load();
}
function setValue(id: string, e: any) {
  values.value[id] = String(e.detail.value);
}
function switchUnseen(id: string) {
  values.value[id] = values.value[id] === "unseen" ? "" : "unseen";
}
async function verifyPhone(e: any) {
  if (!e.detail?.code) {
    message.value = "请完成微信手机号授权后重试";
    return;
  }
  try {
    await bindWechatPhone(e.detail.code);
    await load();
  } catch (err) {
    message.value = problem(err);
  }
}
async function send() {
  if (sending.value || !page.value || page.value.receipt) return;
  const answers: Answers = {};
  for (const f of page.value.form.fields) {
    const v = values.value[f.id];
    if ((v === undefined || v === "") && f.required) {
      message.value = "请完成：" + f.label;
      return;
    }
    answers[f.id] = v === "unseen" ? v : v == null || v === "" ? null : Number(v);
  }
  sending.value = true;
  message.value = "";
  try {
    page.value.receipt = await request<ScoreReceipt>(path() + "/submit", {
      method: "POST",
      data: { answers, formVersion: page.value.formVersion }
    });
    const task = page.value.tasks.find((t) => t.sessionId === sessionId.value);
    if (task) task.status = "已交";
    values.value = {};
  } catch (err) {
    message.value = problem(err);
  } finally {
    sending.value = false;
  }
}
onLoad((q: any) => {
  eventId.value = String(q?.event || "");
  sessionId.value = String(q?.session || "");
  void load();
});
</script>
<style>
@import "../../../../../packages/shared/src/judging-surface.css";
page {
  min-height: 100%;
  background: #f3f6f3;
}
.judging-surface {
  min-height: 100vh;
}
</style>
