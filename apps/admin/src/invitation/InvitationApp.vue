<template>
  <div class="invitation-app">
    <div v-if="loading" class="invitation-loading" role="status">
      <div />
      <span>邀请函正在展开</span>
    </div>
    <main v-else-if="fatal" class="invitation-error">
      <span>观潮会集</span>
      <h1>邀请函暂不可用</h1>
      <p>{{ fatal }}</p>
      <button @click="refresh">重新加载</button>
    </main>
    <template v-else-if="invitation">
      <div v-if="offline" class="invitation-offline" role="status">
        网络暂不可用，恢复后将更新会议内容
      </div>
      <InvitationRuntime
        :document="invitation"
        @register="openRegistration"
        @share="shareVisible = true"
      >
        <template #registration
          ><div
            v-if="
              wechatReady && invitation.miniAppId && invitation.registrationOpen
            "
            ref="launchContainer"
            class="invitation-launch"
        /></template>
      </InvitationRuntime>
    </template>
    <div
      v-if="shareVisible || registrationVisible"
      class="invitation-dialog-mask"
      @click.self="closeDialog"
    >
      <section
        class="invitation-dialog"
        role="dialog"
        aria-modal="true"
        :aria-label="shareVisible ? '分享邀请函' : '小程序报名'"
      >
        <button
          class="invitation-dialog__close"
          aria-label="关闭"
          @click="closeDialog"
        >
          <Close />
        </button>
        <template v-if="shareVisible"
          ><h2>把这份邀请送给您</h2>
          <div class="invitation-share-card">
            <img
              v-if="
                invitation?.content.shareImageUrl ||
                invitation?.content.coverImageUrl
              "
              :src="
                invitation.content.shareImageUrl ||
                invitation.content.coverImageUrl
              "
              alt="分享封面"
            />
            <div>
              <strong>{{ shareCard?.title }}</strong>
              <p>{{ shareCard?.description }}</p>
              <small>guanchaohuiji.com</small>
            </div>
          </div>
          <p>
            {{
              inWechat
                ? wechatReady
                  ? "点击微信右上角，选择发送给朋友。"
                  : shareError || "正在准备微信分享，请稍候。"
                : "请在微信中打开此邀请函，再发送给朋友。"
            }}
          </p>
          <button class="invitation-dialog__button" @click="copyLink">
            {{ copied ? "已复制" : "复制邀请地址" }}
          </button></template
        >
        <template v-else
          ><h2>在观潮会集小程序报名</h2>
          <p>请使用微信识别小程序码</p>
          <img
            v-if="!codeFailed"
            class="invitation-code"
            :src="`${apiBase}/invitations/${token}/qrcode`"
            alt="观潮会集小程序报名码"
            @error="codeFailed = true"
          />
          <p v-else class="invitation-code-error">
            小程序码暂不可用，请稍后重试或联系会务。<button
              @click="codeFailed = false"
            >
              重试
            </button>
          </p>
          <a
            v-if="invitation?.content.contactPhone"
            :href="`tel:${invitation.content.contactPhone.replace(/[^0-9+\-]/g, '')}`"
            >联系会务 {{ invitation.content.contactPhone }}</a
          ></template
        >
      </section>
    </div>
  </div>
</template>
<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { Close } from "@element-plus/icons-vue";
import { invitationShare, type PublicInvitation } from "@conference/shared";
import InvitationRuntime from "../components/invitations/InvitationRuntime.vue";
import { API_BASE_URL } from "../config";
import {
  configureInvitationShare,
  updateInvitationShare,
} from "./wechat-share";
const apiBase = import.meta.env.PROD ? "/api" : API_BASE_URL;
const token = decodeURIComponent(
  window.location.pathname.match(/^\/i\/([A-Za-z0-9_-]+)\/?$/)?.[1] ||
    new URLSearchParams(window.location.search).get("token") ||
    "",
);
const inWechat = /MicroMessenger/i.test(navigator.userAgent);
const invitation = ref<PublicInvitation | null>(null);
const shareCard = computed(() =>
  invitation.value ? invitationShare(invitation.value) : null,
);
const loading = ref(true);
const fatal = ref("");
const offline = ref(false);
const shareVisible = ref(false);
const registrationVisible = ref(false);
const codeFailed = ref(false);
const copied = ref(false);
const wechatReady = ref(false);
const shareError = ref("");
const launchContainer = ref<HTMLElement>();
let timer: ReturnType<typeof setInterval> | undefined;
let request: AbortController | undefined;
let destroyed = false;
let configuring = false;
async function refresh() {
  if (request || destroyed) return;
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    fatal.value = "邀请地址不完整，请联系邀请您的工作人员。";
    loading.value = false;
    return;
  }
  request = new AbortController();
  const timeout = setTimeout(() => request?.abort(), 10000);
  try {
    const response = await fetch(`${apiBase}/invitations/${token}`, {
      signal: request.signal,
      cache: "no-store",
    });
    const body = await response.json();
    if (destroyed) return;
    if (!response.ok) {
      if ([400, 404, 410].includes(response.status)) {
        invitation.value = null;
        wechatReady.value = false;
        fatal.value = "请联系邀请您的工作人员，确认邀请是否仍然有效。";
        closeDialog();
        return;
      }
      throw new Error("network");
    }
    const data = body.data as PublicInvitation;
    if (!data?.content || !data.recipient) throw new Error("payload");
    invitation.value = data;
    offline.value = false;
    fatal.value = "";
    document.title = invitationShare(data).title;
    if (inWechat && !wechatReady.value && !configuring) void prepareWechat();
    else if (wechatReady.value && window.wx)
      updateInvitationShare(window.wx, data);
  } catch {
    if (!destroyed) {
      if (invitation.value) offline.value = true;
      else fatal.value = "网络连接暂不可用，请稍后重试。";
    }
  } finally {
    clearTimeout(timeout);
    request = undefined;
    loading.value = false;
  }
}
async function prepareWechat() {
  if (!invitation.value || configuring) return;
  configuring = true;
  try {
    await configureInvitationShare(apiBase, token, invitation.value);
    if (!destroyed && invitation.value) {
      wechatReady.value = true;
      shareError.value = "";
      await nextTick();
      renderLaunch();
    }
  } catch (error) {
    shareError.value =
      error instanceof Error ? error.message : "微信分享暂不可用";
  } finally {
    configuring = false;
  }
}
function renderLaunch() {
  const container = launchContainer.value;
  if (
    !container ||
    !invitation.value?.miniAppId ||
    !invitation.value.registrationOpen
  )
    return;
  const tag = document.createElement("wx-open-launch-weapp");
  tag.setAttribute("appid", invitation.value.miniAppId);
  tag.setAttribute("path", invitation.value.registrationPath);
  tag.addEventListener("error", () => {
    wechatReady.value = false;
    openRegistration();
  });
  const template = document.createElement("script");
  template.type = "text/wxtag-template";
  template.textContent =
    '<style>button{width:100%;height:52px;border:0;background:transparent;color:transparent;cursor:pointer}</style><button aria-label="前往小程序报名">前往小程序报名</button>';
  tag.appendChild(template);
  container.replaceChildren(tag);
}
watch(
  [launchContainer, () => invitation.value?.registrationOpen],
  () => {
    if (wechatReady.value) renderLaunch();
  },
  { flush: "post" },
);
function openRegistration() {
  if (invitation.value?.registrationOpen) {
    registrationVisible.value = true;
    codeFailed.value = false;
  }
}
function closeDialog() {
  shareVisible.value = false;
  registrationVisible.value = false;
}
async function copyLink() {
  try {
    await navigator.clipboard.writeText(
      invitation.value?.shareUrl || window.location.href,
    );
    copied.value = true;
  } catch {
    shareError.value = "请通过浏览器菜单复制邀请地址";
  }
}
function visible() {
  if (document.visibilityState === "visible") void refresh();
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") closeDialog();
}
onMounted(() => {
  void refresh();
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void refresh();
  }, 20000);
  document.addEventListener("visibilitychange", visible);
  window.addEventListener("online", visible);
  window.addEventListener("keydown", keydown);
});
onBeforeUnmount(() => {
  destroyed = true;
  request?.abort();
  clearInterval(timer);
  document.removeEventListener("visibilitychange", visible);
  window.removeEventListener("online", visible);
  window.removeEventListener("keydown", keydown);
});
</script>
<style>
html,
body,
#invitation-app {
  margin: 0;
  min-height: 100%;
  background: #f5f7f3;
}
html {
  scroll-behavior: smooth;
}
body {
  font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
}
.invitation-app {
  max-width: 1440px;
  margin: 0 auto;
}
.invitation-launch {
  position: absolute;
  inset: 0;
}
.invitation-launch wx-open-launch-weapp {
  display: block;
  width: 100%;
  height: 100%;
}
.invitation-offline {
  padding: 10px 16px;
  text-align: center;
  color: #775414;
  background: #fcf3d9;
  font-size: 13px;
}
.invitation-loading {
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 22px;
  color: #385847;
  font-size: 15px;
}
.invitation-loading > div {
  width: 56px;
  height: 72px;
  border: 1px solid #bac9bc;
  border-top: 3px solid #385847;
  background: #fefefd;
}
.invitation-error {
  max-width: 540px;
  padding: 100px 24px;
  margin: 0 auto;
  color: #334e40;
}
.invitation-error > span {
  font-size: 14px;
}
.invitation-error h1 {
  font-size: 28px;
  margin: 28px 0 18px;
}
.invitation-error p {
  line-height: 1.8;
}
.invitation-error button {
  padding: 12px 24px;
  background: #285441;
  color: #fefefd;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  font: inherit;
}
.invitation-dialog-mask {
  position: fixed;
  inset: 0;
  background: rgb(20 35 27 / 50%);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.invitation-dialog {
  position: relative;
  width: 100%;
  max-width: 420px;
  max-height: 85svh;
  overflow: auto;
  box-sizing: border-box;
  background: #fefefd;
  border-radius: 8px;
  padding: 36px 24px;
  color: #26362f;
}
.invitation-dialog h2 {
  font-size: 22px;
  line-height: 1.5;
  margin: 0 24px 24px 0;
}
.invitation-dialog p {
  font-size: 14px;
  line-height: 1.8;
}
.invitation-dialog a {
  color: #285441;
}
.invitation-dialog__close {
  position: absolute;
  right: 12px;
  top: 12px;
  width: 36px;
  height: 36px;
  padding: 8px;
  border: 0;
  background: none;
  color: #58675d;
  cursor: pointer;
}
.invitation-dialog__close svg {
  width: 20px;
}
.invitation-share-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  background: #f2f5ef;
  padding: 16px;
}
.invitation-share-card img {
  width: 72px;
  height: 72px;
  object-fit: cover;
}
.invitation-share-card > div {
  min-width: 0;
  overflow-wrap: anywhere;
}
.invitation-share-card strong {
  font-size: 15px;
  line-height: 1.5;
}
.invitation-share-card p {
  margin: 6px 0;
  font-size: 12px;
  color: #667466;
}
.invitation-share-card small {
  color: #7b887a;
  font-size: 11px;
}
.invitation-dialog__button {
  width: 100%;
  padding: 12px;
  margin-top: 18px;
  color: #fefefd;
  background: #285441;
  border: 0;
  border-radius: 4px;
  font: inherit;
  cursor: pointer;
}
.invitation-code {
  display: block;
  width: 100%;
  max-width: 260px;
  aspect-ratio: 1;
  margin: 20px auto;
}
.invitation-code-error {
  padding: 32px 0;
}
.invitation-code-error button {
  display: block;
  margin: 16px auto;
  padding: 8px 20px;
}
.invitation-document .invitation-launch {
  z-index: 2;
}
@media (prefers-reduced-motion: reduce) {
  html {
    scroll-behavior: auto;
  }
}
</style>
