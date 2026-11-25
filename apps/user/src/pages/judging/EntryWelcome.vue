<template>
  <view class="je-page" :class="['je-' + design.layout, 'je-' + design.typeface]" :style="theme">
    <view class="je-sheet">
      <view v-if="design.layout !== 'minimal'" class="je-art" aria-hidden="true" :style="art">
        <image v-if="cover" class="je-probe" :src="cover" @error="failedUrl = cover" />
      </view>
      <view class="je-content">
        <image v-if="look.logo" class="je-logo" :src="asset(look.logo)" mode="aspectFit" />
        <view class="je-heading-block">
          <text class="je-event">{{ title }}</text>
          <text class="je-heading" role="heading" aria-level="1">{{ look.heading }}</text>
          <text v-if="design.intro" class="je-intro">{{ design.intro }}</text>
        </view>
        <view v-if="choices.length" class="je-form">
          <text class="je-label">请选择你的名单记录</text>
          <text class="je-hint"
            >有 {{ choices.length }} 位评委叫「{{ matchedName }}」，请核对编号和机构。</text
          >
          <button
            v-for="j in choices"
            :key="j.id"
            class="je-choice"
            :disabled="busy"
            :aria-label="'编号 ' + j.id + ' ' + (j.org || '机构未填写')"
            @click="emit('identify', matchedName, j.id)"
          >
            <text class="je-number">编号 {{ j.id }}</text
            ><text>{{ j.org || "机构未填写" }}</text>
          </button>
          <button class="je-back" :disabled="busy" @click="emit('back')">重新输入姓名</button>
        </view>
        <form v-else class="je-form" @submit="emit('identify', submittedValues($event).judgeName)">
          <label class="je-label" for="judging-guest-name">{{ design.nameLabel }}</label>
          <input
            id="judging-guest-name"
            name="judgeName"
            class="je-input"
            maxlength="50"
            :aria-label="design.nameLabel"
            :placeholder="design.placeholder"
            confirm-type="go"
            @confirm="emit('identify', $event.detail.value)"
          />
          <button class="je-enter" :disabled="busy" form-type="submit">
            {{ busy ? "正在查询…" : design.button }}
          </button>
        </form>
        <text v-if="message" role="status" aria-live="polite" class="je-status">{{ message }}</text>
      </view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { defaultEntryDesign, judgingStyle, type GuestChoice, type JudgingLook } from "@conference/shared";
import { API_BASE_URL } from "@/config/app";
import { submittedValues } from "./form-values";
import paperStage from "./paper-stage.jpg";

const props = defineProps<{
  title: string;
  look: JudgingLook;
  busy: boolean;
  choices: GuestChoice[];
  matchedName: string;
  message: string;
}>();
const emit = defineEmits<{
  (e: "identify", name: string, number?: string): void;
  (e: "back"): void;
}>();
const design = computed(() => ({ ...defaultEntryDesign, ...props.look.entry }));
const asset = (url: string) =>
  url.startsWith("/uploads/") ? API_BASE_URL.replace(/\/api\/?$/, "") + url : url;
const cover = computed(() => asset(props.look.cover));
const failedUrl = ref("");
const art = computed(() => ({
  backgroundImage:
    "url(" + JSON.stringify(cover.value && failedUrl.value !== cover.value ? cover.value : paperStage) + ")",
  backgroundSize: design.value.fit,
  backgroundPosition: "center " + design.value.position
}));
const theme = computed(() => {
  const rgb = [1, 3, 5].map((i) => {
    const s = parseInt(props.look.accent.slice(i, i + 2), 16) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
  return { ...judgingStyle(props.look), "--je-button-ink": luminance > 0.179 ? "#080808" : "#ffffff" };
});
</script>
<style scoped>
.je-page {
  min-height: 100vh;
  min-height: 100svh;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 36px;
  background: var(--judging-bg);
  color: var(--judging-text);
  font:
    var(--judging-size)/1.55 -apple-system,
    BlinkMacSystemFont,
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}
.je-sheet {
  width: 100%;
  max-width: 1080px;
  display: grid;
  grid-template-columns: 1.12fr 1fr;
  overflow: hidden;
  border-radius: var(--judging-radius);
  background: var(--judging-card);
  border: 1px solid rgba(49, 40, 29, 0.13);
  box-shadow: 0 16px 52px -28px rgba(44, 34, 18, 0.27);
}
.je-art {
  position: relative;
  min-height: 510px;
  background-color: var(--judging-bg);
  background-repeat: no-repeat;
}
.je-probe {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
.je-content {
  box-sizing: border-box;
  min-width: 0;
  align-self: center;
  padding: 48px clamp(28px, 4.2vw, 62px);
}
.je-heading-block::after {
  content: "";
  display: block;
  width: 32px;
  height: 3px;
  background: var(--judging-accent);
  margin: 22px 0 0;
}
.je-logo {
  width: 100px;
  height: 40px;
  margin-bottom: 18px;
  display: block;
}
.je-event,
.je-heading,
.je-intro,
.je-label,
.je-hint,
.je-status {
  display: block;
  overflow-wrap: anywhere;
}
.je-event {
  font-size: 0.82em;
  font-weight: 600;
  letter-spacing: 0.07em;
  opacity: 0.77;
}
.je-heading {
  font-size: clamp(2.4em, 4.25vw, 3.65em);
  font-weight: 650;
  line-height: 1.22;
  margin-top: 12px;
  letter-spacing: 0.035em;
}
.je-serif .je-heading {
  font-family: "Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", Georgia, serif;
  font-weight: 700;
}
.je-intro {
  margin-top: 14px;
  font-size: 0.95em;
  opacity: 0.85;
  line-height: 1.75;
  white-space: pre-line;
}
.je-form {
  display: block;
  margin-top: 32px;
}
.je-label {
  font-weight: 650;
  font-size: 0.95em;
  margin-bottom: 9px;
}
.je-input {
  box-sizing: border-box;
  width: 100%;
  height: 52px;
  padding: 0 14px;
  font-size: 1em;
  background: var(--judging-card);
  color: var(--judging-text);
  border: 1px solid #a59e92;
  border-radius: min(var(--judging-radius), 8px);
}
.je-input:focus-within {
  outline: 2px solid var(--judging-accent);
  outline-offset: 2px;
}
.je-enter,
.je-choice,
.je-back {
  box-sizing: border-box;
  margin: 0;
  font-size: 1em;
  white-space: normal;
}
.je-enter::after,
.je-choice::after,
.je-back::after {
  border: 0;
}
.je-enter {
  position: relative;
  width: 100%;
  margin-top: 14px;
  padding: 13px 38px;
  min-height: 50px;
  line-height: 1.5;
  font-weight: 650;
  background: var(--judging-accent);
  color: var(--je-button-ink);
  border-radius: min(var(--judging-radius), 8px);
  letter-spacing: 0.07em;
}
.je-enter::before {
  content: "";
  position: absolute;
  right: 20px;
  top: 50%;
  width: 7px;
  height: 7px;
  border-top: 1.5px solid currentColor;
  border-right: 1.5px solid currentColor;
  transform: translateY(-50%) rotate(45deg);
}
.je-enter[disabled],
.je-choice[disabled] {
  opacity: 0.68;
}
.je-hint,
.je-status {
  font-size: 0.87em;
  line-height: 1.6;
}
.je-status {
  margin-top: 12px;
  padding-inline-start: 10px;
  border-inline-start: 2px solid var(--judging-accent);
}
.je-choice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin-top: 9px;
  padding: 12px 14px;
  text-align: left;
  line-height: 1.5;
  border: 1px solid #ada89d;
  border-radius: min(var(--judging-radius), 8px);
  color: inherit;
  background: var(--judging-card);
}
.je-choice:focus-visible,
.je-back:focus-visible,
.je-enter:focus-visible {
  outline: 2px solid var(--judging-accent);
  outline-offset: 2px;
}
.je-number {
  flex: none;
  font-weight: 650;
}
.je-back {
  margin-top: 7px;
  padding: 8px 0;
  background: transparent;
  color: inherit;
  text-align: left;
  text-decoration: underline;
  font-size: 0.85em;
  line-height: 1.5;
}
.je-poster .je-sheet {
  grid-template-columns: 1fr;
  max-width: 824px;
}
.je-poster .je-art {
  min-height: 0;
  height: clamp(200px, 25vw, 290px);
}
.je-poster .je-content {
  padding: 32px 44px 38px;
}
.je-minimal .je-sheet {
  grid-template-columns: 1fr;
  max-width: 540px;
  border-top: 4px solid var(--judging-accent);
}
.je-minimal .je-content {
  padding: 50px 52px 56px;
}
@media (max-width: 740px) {
  .je-page {
    align-items: flex-start;
    padding: max(24px, 6vh) 16px max(24px, env(safe-area-inset-bottom));
  }
  .je-sheet {
    max-width: 480px;
    grid-template-columns: minmax(0, 1fr);
  }
  .je-art,
  .je-poster .je-art {
    min-height: 0;
    height: clamp(154px, 52vw, 240px);
  }
  .je-content,
  .je-poster .je-content,
  .je-minimal .je-content {
    padding: 25px clamp(20px, 6.3vw, 34px) 28px;
  }
  .je-heading {
    font-size: 2.15em;
    margin-top: 6px;
  }
  .je-heading-block::after {
    margin-top: 13px;
    width: 25px;
    height: 2px;
  }
  .je-form {
    margin-top: 21px;
  }
  .je-input {
    height: 47px;
  }
  .je-enter {
    min-height: 46px;
    margin-top: 11px;
    padding-block: 11px;
  }
  .je-minimal .je-sheet {
    margin-top: 10vh;
  }
}
@media (max-height: 620px) and (max-width: 740px) {
  .je-page {
    padding-top: 16px;
  }
}
</style>
