<template>
  <view class="judging-surface guest-entry" :style="surface">
    <view v-if="!info" class="guest-loading judging-panel">
      <text class="judging-heading">{{ busy ? "正在打开评分入口" : "评分入口" }}</text>
      <text v-if="message" class="judging-note">{{ message }}</text>
      <button v-if="!busy" @click="open">重新打开</button>
    </view>
    <EntryWelcome
      v-else-if="!desk"
      :title="info.title"
      :look="info.look"
      :busy="busy"
      :choices="choices"
      :matched-name="matchedName"
      :message="message"
      @identify="identify"
      @back="clearChoices"
    />
    <view v-else class="guest-score-desk">
      <view class="judging-hero">
        <image v-if="info.look.cover" class="judging-cover" :src="asset(info.look.cover)" mode="aspectFill" />
        <image v-if="info.look.logo" class="judging-logo" :src="asset(info.look.logo)" mode="aspectFit" />
        <text class="judging-kicker">{{ info.title }}</text>
        <text class="judging-heading">{{ info.look.heading }}</text>
        <text v-if="info.look.intro && desk">{{ info.look.intro }}</text>
      </view>
      <view class="judging-panel guest-identity">
        <view>
          <text class="judging-name"
            >{{ desk.judge.name }} · {{ desk.judge.roleLabel ?? judgingRoleLabel({}, desk.judge.role) }}</text
          >
          <text class="judging-note">
            编号 {{ desk.judge.id }}{{ desk.judge.org ? " · " + desk.judge.org : "" }}
          </text>
        </view>
        <button class="guest-link" :disabled="sending || busy" @click="signOut">切换姓名</button>
      </view>
      <BallotPanel
        v-if="desk.page"
        :page="desk.page"
        :sending="sending || busy"
        :message="message"
        @submit="submit"
        @refresh="refresh()"
      />
      <view v-else class="judging-panel">
        <text class="judging-name">等待分配场次</text>
        <text class="judging-note">场控分配并开放评分后，这里会显示你的评分表。</text>
        <button @click="refresh()">刷新场次</button>
      </view>
      <text v-if="message && (!desk.page?.open || desk.page.receipt)" class="judging-note guest-error">
        {{ message }}
      </text>
      <view v-if="desk.page?.look.showProgress && desk.page.tasks.length" class="judging-panel">
        <text class="judging-name">我的评审任务</text>
        <button
          v-for="task in desk.page.tasks"
          :key="task.sessionId"
          class="guest-task"
          :disabled="sending || busy"
          @click="refresh(task.sessionId)"
        >
          <text>{{ task.teacher }} · {{ task.room }}</text>
          <text>{{ task.status }}</text>
        </button>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow, onHide, onUnload } from "@dcloudio/uni-app";
import {
  defaultJudgingConfig,
  judgingStyle,
  judgingRoleLabel,
  type Answers,
  type GuestDesk,
  type GuestChoice,
  type JudgingLook
} from "@conference/shared";
import { guestScoring } from "@/services/judging-guest";
import { ApiRequestError } from "@/services/request";
import { API_BASE_URL } from "@/config/app";
import BallotPanel from "./BallotPanel.vue";
import EntryWelcome from "./EntryWelcome.vue";
const info = ref<{ title: string; rehearsal: boolean; look: JudgingLook } | null>(null),
  desk = ref<GuestDesk | null>(null);
const matchedName = ref(""),
  choices = ref<GuestChoice[]>([]),
  message = ref(""),
  busy = ref(false),
  sending = ref(false);
const surface = computed(() => judgingStyle(info.value?.look || defaultJudgingConfig().look));
const asset = (url: string) => (url.startsWith("/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url);
let client: ReturnType<typeof guestScoring> | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let version = 0,
  polling = false;
function clearChoices() {
  choices.value = [];
  matchedName.value = "";
  message.value = "";
}
function signOut() {
  version++;
  client?.remember("");
  desk.value = null;
  busy.value = false;
  sending.value = false;
  clearChoices();
}
function errorText(e: unknown) {
  return e instanceof ApiRequestError
    ? e.responseMessage || "网络连接失败，请重试"
    : e instanceof Error
      ? e.message
      : "请稍后再试";
}
function problem(e: unknown) {
  if (e instanceof ApiRequestError && e.statusCode === 401) signOut();
  if (e instanceof ApiRequestError && e.statusCode === 404 && desk.value) {
    signOut();
    info.value = null;
  }
  message.value = errorText(e);
}
async function open() {
  if (!client) {
    message.value = "请使用主办方发布的评分链接或二维码进入";
    return;
  }
  const rev = ++version;
  busy.value = true;
  message.value = "";
  try {
    const meta = await client.info();
    if (rev !== version) return;
    info.value = meta;
    uni.setNavigationBarTitle({ title: meta.look.heading });
    if (client.signedIn()) {
      const next = await client.desk();
      if (rev === version) desk.value = next;
    }
  } catch (e) {
    if (rev === version) problem(e);
  } finally {
    if (rev === version) busy.value = false;
  }
}
async function identify(name: string, number?: string) {
  if (!client || busy.value) return;
  const currentName = (name || "").trim();
  if (!currentName) {
    message.value = "请输入名单上的姓名";
    return;
  }
  const rev = ++version;
  busy.value = true;
  message.value = "";
  try {
    const result = await client.identify(currentName, number);
    if (rev !== version) return;
    if (result.kind === "choose") {
      matchedName.value = currentName;
      choices.value = result.choices;
      return;
    }
    client.remember(result.ticket);
    const next = await client.desk();
    if (rev !== version) return;
    desk.value = next;
    clearChoices();
  } catch (e) {
    if (rev === version) problem(e);
  } finally {
    if (rev === version) busy.value = false;
  }
}
async function refresh(session?: string, quiet = false) {
  if (!client || !desk.value || sending.value || busy.value || (quiet && polling)) return;
  const rev = quiet ? version : ++version;
  if (quiet) polling = true;
  else busy.value = true;
  try {
    const next = await client.desk(session);
    if (rev !== version) return;
    if (!(quiet && desk.value?.page?.receipt && (!next.page?.open || next.page.receipt))) desk.value = next;
    if (!quiet) message.value = "";
  } catch (e) {
    if (
      rev === version &&
      (!quiet || (e instanceof ApiRequestError && [401, 404].includes(e.statusCode || 0)))
    )
      problem(e);
  } finally {
    if (quiet) polling = false;
    else if (rev === version) busy.value = false;
  }
}
async function submit(answers: Answers) {
  const page = desk.value?.page;
  if (!client || !page || !page.open || page.receipt || sending.value || busy.value) return;
  const rev = ++version;
  sending.value = true;
  message.value = "";
  try {
    const receipt = await client.submit(page.session.id, { answers, formVersion: page.formVersion });
    if (rev !== version) return;
    page.receipt = receipt;
    const task = page.tasks.find((t) => t.sessionId === page.session.id);
    if (task) task.status = "已交";
  } catch (e) {
    if (rev === version) {
      problem(e);
      if (e instanceof ApiRequestError && e.statusCode === 409 && client && desk.value) {
        try {
          const updated = await client.desk(page.session.id);
          if (rev === version) desk.value = updated;
        } catch {
          /* keep the original submission error */
        }
      }
    }
  } finally {
    if (rev === version) sending.value = false;
  }
}
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
function poll() {
  if (!desk.value?.page?.open || desk.value.page.receipt) void refresh(undefined, true);
}
onShow(() => {
  stop();
  poll();
  timer = setInterval(poll, 10000);
});
onHide(stop);
onLoad((q: any) => {
  const event = String(q?.event || ""),
    entry = String(q?.entry || "");
  if (event && entry) client = guestScoring(event, entry);
  // #ifdef H5
  window.addEventListener("hashchange", entryChanged);
  // #endif
  void open();
});
// #ifdef H5
function entryChanged(e: HashChangeEvent) {
  const route = "#/pages/judging/entry?",
    a = new URL(e.oldURL).hash,
    b = new URL(e.newURL).hash;
  if (a !== b && a.startsWith(route) && b.startsWith(route)) window.location.reload();
}
// #endif
onUnload(() => {
  version++;
  stop();
  // #ifdef H5
  window.removeEventListener("hashchange", entryChanged);
  // #endif
});
</script>
<style>
@import "../../../../../packages/shared/src/judging-surface.css";
page {
  min-height: 100%;
  background: #f3f6f3;
}
.guest-entry {
  min-height: 100vh;
  box-sizing: border-box;
  padding: 0;
}
.guest-score-desk {
  max-width: 720px;
  margin: 0 auto;
  padding: 22px 16px 40px;
}
.guest-loading {
  max-width: 440px;
  margin: 0 auto;
  padding: 36px 24px;
}
.guest-identity {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.guest-identity .judging-name {
  font-size: 1.05em;
}
.guest-entry .guest-link,
.guest-entry .guest-task {
  background: transparent;
  color: var(--judging-accent);
  margin: 0;
  font-size: 1em;
  line-height: 1.5;
}
.guest-entry .guest-link {
  font-size: 0.9em;
  padding: 8px 0;
  white-space: nowrap;
}
.guest-entry .guest-task {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px;
  margin-top: 8px;
  text-align: left;
  border: 1px solid #d6e2dd;
  border-radius: 8px;
}
.guest-entry .guest-link::after,
.guest-entry .guest-task::after {
  border: 0;
}
.guest-entry .guest-error {
  color: #964328;
}
</style>
