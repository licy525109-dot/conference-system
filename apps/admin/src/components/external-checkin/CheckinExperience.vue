<template>
  <main class="checkin-view" :class="[{ embedded: preview, 'is-plain': appearance.layout === 'plain', 'is-centered': appearance.titleAlign === 'center' }]" :style="appearanceStyle">
    <div class="checkin-content">
      <header v-if="appearance.brandName || logoUrl">
        <img v-if="logoUrl && !logoFailed" class="brand-logo" :src="logoUrl" alt="会议标识" @error="logoFailed = true" />
        <span v-else class="brand-mark" aria-hidden="true">✓</span><span>{{ appearance.brandName }}</span>
      </header>
      <img v-if="coverUrl && !coverFailed" class="cover" :src="coverUrl" alt="会议封面" @error="coverFailed = true" />
      <section class="intro">
        <p v-if="appearance.welcomeText" class="eyebrow">{{ appearance.welcomeText }}</p>
        <h1>{{ appearance.pageTitle || title || '会议签到' }}</h1>
        <p v-if="appearance.introText || description" class="description">{{ appearance.introText || description }}</p>
      </section>
      <section class="panel" :aria-busy="loading || submitting">
        <p v-if="loading" role="status" class="loading">正在加载签到信息…</p>
        <template v-else-if="result?.success">
          <div class="result" role="status"><div class="status-mark success" aria-label="签到成功">✓</div>
            <h2>{{ result.alreadyCheckedIn ? '您已签到' : appearance.successTitle }}</h2><p>{{ result.message }}</p>
            <p class="timestamp">首次签到时间<br /><strong>{{ formatTime(result.checkedInAt) }}</strong></p>
          </div><button type="button" class="secondary" :disabled="preview" @click="$emit('reset')">返回签到页</button>
        </template>
        <template v-else-if="available">
          <h2>{{ appearance.formTitle }}</h2><p v-if="appearance.helperText" class="hint">{{ appearance.helperText }}</p>
          <form @submit.prevent="$emit('submit')" autocomplete="off">
            <div v-for="field in fields" :key="field.key" class="form-field">
              <label :for="`checkin-field-${field.key}`">{{ field.label }}<span>{{ field.required ? '必填' : '选填' }}</span></label>
              <input :id="`checkin-field-${field.key}`" :value="modelValue[field.key] || ''" type="text" maxlength="300" :required="field.required" :placeholder="`请输入${field.label}`" :disabled="submitting || preview" autocapitalize="off" spellcheck="false" @input="updateValue(field.key, $event)" />
            </div>
            <div v-if="result && !result.success" role="alert" class="failure"><strong>{{ appearance.failureTitle }}</strong><p>{{ result.message }}</p></div>
            <p v-if="error" role="alert" class="error">{{ error }}</p>
            <button type="submit" :disabled="submitting || preview">{{ submitting ? '正在核对名单…' : appearance.submitText }}</button>
          </form><p class="privacy">填写内容仅用于本次会议名单核对与签到。</p>
        </template>
        <template v-else>
          <div class="result"><div class="status-mark neutral" aria-hidden="true">—</div><h2>{{ title ? '暂时无法签到' : '签到页未能加载' }}</h2><p role="status">{{ error || message || '请联系现场工作人员' }}</p></div>
          <button type="button" class="secondary" :disabled="preview" @click="$emit('reload')">重新加载</button>
        </template>
        <button v-if="error && available" type="button" class="text-button" @click="$emit('reload')">刷新签到信息</button>
      </section><footer v-if="appearance.footerText">{{ appearance.footerText }}</footer>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { externalCheckinAppearanceStyle, type ExternalCheckinAppearance } from "@conference/shared";
export interface CheckinResult { success: boolean; alreadyCheckedIn: boolean; checkedInAt: string | null; message: string }
const props = withDefaults(defineProps<{
  appearance: ExternalCheckinAppearance; title: string; description: string;
  fields: { key: string; label: string; required: boolean }[]; modelValue: Record<string, string>;
  available: boolean; result?: CheckinResult | null; logoUrl?: string; coverUrl?: string;
  loading?: boolean; submitting?: boolean; error?: string; message?: string; preview?: boolean;
}>(), { result: null, logoUrl: "", coverUrl: "", loading: false, submitting: false, error: "", message: "", preview: false });
const emit = defineEmits<{ (e: "update:modelValue", value: Record<string, string>): void; (e: "submit"): void; (e: "reload"): void; (e: "reset"): void }>();
const logoFailed = ref(false), coverFailed = ref(false);
watch(() => props.logoUrl, () => { logoFailed.value = false; });
watch(() => props.coverUrl, () => { coverFailed.value = false; });
const appearanceStyle = computed(() => externalCheckinAppearanceStyle(props.appearance));
function updateValue(key: string, event: Event) { emit("update:modelValue", { ...props.modelValue, [key]: (event.target as HTMLInputElement).value }); }
function formatTime(date: string | null) { return date ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(date)) : ""; }
</script>

<style scoped>
.checkin-view{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:var(--checkin-text);background:var(--checkin-bg);min-height:100dvh;font-synthesis:none;font-size:var(--checkin-body-size)}
.checkin-view *{box-sizing:border-box}.checkin-content{max-width:520px;margin:auto;padding:28px 22px max(28px,env(safe-area-inset-bottom))}.embedded{min-height:0}.embedded .checkin-content{padding:24px 20px}
header{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;line-height:1.6;overflow-wrap:anywhere}.brand-mark{display:grid;place-items:center;flex-shrink:0;width:28px;height:28px;background:var(--checkin-primary);border-radius:50%;color:var(--checkin-on-primary)}.brand-logo{max-width:140px;height:40px;object-fit:contain}.cover{display:block;width:100%;max-height:240px;aspect-ratio:16/9;object-fit:cover;border-radius:var(--checkin-radius);margin:24px 0 0}
.intro{padding:34px 4px 25px}.eyebrow{font-size:12px;letter-spacing:3px;margin:0 0 10px}h1{font-size:30px;line-height:1.45;margin:0;font-weight:650;letter-spacing:-.6px;overflow-wrap:anywhere}.description{font-size:var(--checkin-body-size);line-height:1.85;white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0 0}.is-centered .intro{text-align:center}.is-centered header{justify-content:center}
.panel{background:var(--checkin-surface);border:1px solid var(--checkin-border);border-radius:var(--checkin-radius);padding:28px 24px}.is-plain .panel{border:0;background:transparent;padding:12px 4px}.is-plain .intro{padding-bottom:22px}h2{font-size:20px;line-height:1.6;margin:0 0 10px;font-weight:650;overflow-wrap:anywhere}.hint{font-size:var(--checkin-body-size);line-height:1.8;margin:0 0 26px;white-space:pre-wrap;overflow-wrap:anywhere}.form-field{margin:0 0 21px}label{display:flex;justify-content:space-between;gap:12px;font-size:var(--checkin-body-size);font-weight:600;margin-bottom:10px;overflow-wrap:anywhere}label span{flex-shrink:0;font-size:11px;font-weight:400}
button,input{font:inherit}input{width:100%;min-width:0;height:50px;border:1px solid var(--checkin-border);border-radius:var(--checkin-control-radius);background:var(--checkin-surface);padding:0 14px;font-size:var(--checkin-input-size);color:var(--checkin-text)}input::placeholder{color:var(--checkin-text);opacity:.65;font-size:var(--checkin-body-size)}input:focus{outline:2px solid var(--checkin-primary);outline-offset:2px}button{border:0;border-radius:var(--checkin-control-radius);background:var(--checkin-primary);color:var(--checkin-on-primary);min-height:50px;padding:12px 16px;width:100%;font-size:var(--checkin-input-size);font-weight:600;line-height:1.6;cursor:pointer;margin-top:6px;overflow-wrap:anywhere}button:disabled{opacity:.6;cursor:default}.embedded button:disabled,.embedded input:disabled{opacity:1}button:focus-visible{outline:3px solid var(--checkin-primary);outline-offset:3px}.privacy{text-align:center;font-size:11px;line-height:1.7;margin:17px 0 0}
.error,.failure{color:#8d301f;font-size:var(--checkin-body-size);line-height:1.8;background:#fff2ec;padding:13px 15px;border:1px solid #efd6c9;border-radius:var(--checkin-control-radius);margin:0 0 18px;white-space:pre-wrap;overflow-wrap:anywhere}.failure p{margin:4px 0 0}.failure strong{font-size:16px}.result{text-align:center;padding:8px 0 24px}.status-mark{display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:#e7f2e7;color:#256343;font-size:36px;margin:6px auto 24px}.status-mark.neutral{color:#746435;background:#f4f1e6}.result p{font-size:var(--checkin-body-size);line-height:1.9;white-space:pre-wrap;overflow-wrap:anywhere}.timestamp{border-top:1px solid var(--checkin-border);padding-top:24px;margin-top:25px}.timestamp strong{font-size:15px;font-weight:500}.secondary{background:var(--checkin-surface);color:var(--checkin-text);border:1px solid var(--checkin-border)}.text-button{color:var(--checkin-text);background:transparent;font-size:13px;font-weight:400;margin:12px 0 -8px;min-height:35px}.loading{text-align:center;padding:30px 0}footer{font-size:11px;text-align:center;line-height:1.8;white-space:pre-wrap;overflow-wrap:anywhere;margin:24px 0 0}
@media(max-width:360px){.checkin-content{padding:22px 16px}.panel{padding:24px 20px}h1{font-size:26px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
