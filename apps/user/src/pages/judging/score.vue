<template>
  <view class="judging-surface" :style="style">
    <view v-if="loginNeeded && practice" class="judging-panel">
      <text class="judging-heading">联排账号登录</text>
      <text class="judging-note">使用获本场授权的后台账号进入模拟评委席。</text>
      <input class="judging-input" v-model="loginName" placeholder="后台用户名" maxlength="100" />
      <input
        class="judging-input"
        v-model="loginPassword"
        password
        placeholder="登录密码"
        @confirm="signIn"
      />
      <text v-if="message" class="judging-note">{{ message }}</text>
      <button
        class="judging-submit"
        :disabled="loading || !loginName.trim() || !loginPassword"
        @click="signIn"
      >
        进入模拟评分
      </button>
    </view>
    <view v-else-if="!page" class="judging-panel">
      <text class="judging-heading">{{ loading ? "正在核对评审资格" : "现场评审" }}</text>
      <text>{{ message }}</text>
      <!-- #ifdef MP-WEIXIN -->
      <button v-if="needPhone" open-type="getPhoneNumber" @getphonenumber="verifyPhone">
        验证报名手机号
      </button>
      <!-- #endif -->
      <button v-if="!loading" @click="load">重新核对</button>
      <button v-if="practice && !loading" @click="switchAccount">切换联排账号</button>
    </view>
    <template v-else>
      <view class="judging-hero">
        <text v-if="page.rehearsal" class="judging-test">
          {{ page.rehearsalSeat ? "模拟席位 · " + page.rehearsalSeat : "联排测试" }}
        </text>
        <image v-if="page.look.cover" class="judging-cover" :src="asset(page.look.cover)" mode="aspectFill" />
        <image v-if="page.look.logo" class="judging-logo" :src="asset(page.look.logo)" mode="aspectFit" />
        <text class="judging-kicker">{{ page.title }} · {{ roleLabels[page.role] }}</text>
        <text class="judging-heading">{{ page.look.heading }}</text>
        <text>{{ page.look.intro }}</text>
      </view>
      <BallotPanel :page="page" :sending="sending" :message="message" @refresh="load" @submit="send" />
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
import BallotPanel from "./BallotPanel.vue";
import { onLoad, onUnload } from "@dcloudio/uni-app";
import { defaultJudgingConfig, judgingStyle, roleLabels } from "@conference/shared";
import type { Answers, ScoreReceipt, ScoringView } from "@conference/shared";
import { ensureAuthenticatedUser } from "@/services/auth";
import { bindWechatPhone } from "@/services/profile";
import { ApiRequestError, request } from "@/services/request";
import { API_BASE_URL } from "@/config/app";
import {
  rehearsalScore,
  rehearsalToken,
  signIntoRehearsal,
  setRehearsalToken
} from "@/services/judging-rehearsal";
const practice = ref(""),
  loginNeeded = ref(false),
  loginName = ref(""),
  loginPassword = ref("");
function switchAccount() {
  setRehearsalToken("");
  loginPassword.value = "";
  message.value = "";
  page.value = null;
  loginNeeded.value = true;
}
async function signIn() {
  if (loading.value || !loginName.value.trim() || !loginPassword.value) return;
  loading.value = true;
  message.value = "";
  try {
    await signIntoRehearsal(loginName.value.trim(), loginPassword.value);
    loginPassword.value = "";
    loginNeeded.value = false;
  } catch (e) {
    message.value = problem(e);
    return;
  } finally {
    loading.value = false;
  }
  await load();
}
const page = ref<ScoringView | null>(null),
  message = ref(""),
  loading = ref(false),
  sending = ref(false),
  needPhone = ref(false);
const eventId = ref(""),
  sessionId = ref("");
const style = computed(() => judgingStyle(page.value?.look ?? defaultJudgingConfig().look));
const path = () =>
  "/judging/" + encodeURIComponent(eventId.value) + "/sessions/" + encodeURIComponent(sessionId.value);
const asset = (url: string) => (url.startsWith("/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url);
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
    let data: ScoringView;
    if (practice.value) {
      if (!rehearsalToken()) {
        loginNeeded.value = true;
        page.value = null;
        return;
      }
      data = await rehearsalScore(eventId.value, sessionId.value, practice.value);
    } else {
      const user = await ensureAuthenticatedUser();
      needPhone.value = !user.phoneVerifiedAt;
      data = await request<ScoringView>(path());
    }
    page.value = data;
    uni.setNavigationBarTitle({ title: data.look.heading });
  } catch (e) {
    page.value = null;
    if (practice.value && !rehearsalToken()) loginNeeded.value = true;
    message.value = problem(e);
  } finally {
    loading.value = false;
  }
}
function select(id: string) {
  if (sending.value || loading.value || sessionId.value === id) return;
  sessionId.value = id;
  page.value = null;
  void load();
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
async function send(answers: Answers) {
  if (sending.value || !page.value || page.value.receipt) return;
  sending.value = true;
  message.value = "";
  try {
    const payload = { answers, formVersion: page.value.formVersion };
    page.value.receipt = practice.value
      ? await rehearsalScore(eventId.value, sessionId.value, practice.value, payload)
      : await request<ScoreReceipt>(path() + "/submit", { method: "POST", data: payload });
    const task = page.value.tasks.find((t) => t.sessionId === sessionId.value);
    if (task) task.status = "已交";
  } catch (err) {
    message.value = problem(err);
    if (practice.value && !rehearsalToken()) {
      page.value = null;
      loginNeeded.value = true;
    }
  } finally {
    sending.value = false;
  }
}
// #ifdef H5
// uni-app reuses this page when a second scoring link is opened in the same browser tab.
function reloadLinkedScore(event: HashChangeEvent) {
  const route = "#/pages/judging/score?";
  const before = new URL(event.oldURL).hash;
  const after = new URL(event.newURL).hash;
  if (before !== after && before.startsWith(route) && after.startsWith(route)) window.location.reload();
}
onUnload(() => window.removeEventListener("hashchange", reloadLinkedScore));
// #endif
onLoad((q: any) => {
  // #ifdef H5
  window.addEventListener("hashchange", reloadLinkedScore);
  practice.value = String(q?.practice || "");
  // #endif
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
