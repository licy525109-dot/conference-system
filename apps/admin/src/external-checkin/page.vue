<template>
  <main class="checkin-page">
    <header><span class="brand-mark" aria-hidden="true">✓</span><span>会议现场签到</span></header>
    <section class="intro"><p class="eyebrow">欢迎到来</p><h1>{{ meta?.title || '会议签到' }}</h1><p v-if="meta?.description" class="description">{{ meta.description }}</p></section>
    <section class="panel" :aria-busy="loading || submitting">
      <p v-if="loading" role="status" class="loading">正在加载签到信息…</p>
      <template v-else-if="result?.success">
        <div class="result success" role="status"><div class="status-mark" aria-hidden="true">✓</div><h2>{{ result.alreadyCheckedIn ? '您已签到' : '签到成功' }}</h2><p>{{ result.message }}</p><p class="timestamp">首次签到时间<br><strong>{{ formatTime(result.checkedInAt) }}</strong></p></div>
        <button type="button" class="secondary" @click="reset">返回签到页</button>
      </template>
      <template v-else-if="meta?.available">
        <h2>填写签到信息</h2><p class="hint">{{ meta.message }}</p>
        <form @submit.prevent="submit" autocomplete="off">
          <div v-for="field in meta.fields" :key="field.key" class="form-field"><label :for="`field-${field.key}`">{{ field.label }}<span>{{ field.required ? '必填' : '选填' }}</span></label><input :id="`field-${field.key}`" v-model="values[field.key]" type="text" maxlength="300" :required="field.required" :placeholder="`请输入${field.label}`" :disabled="submitting" autocapitalize="off" spellcheck="false" /></div>
          <div v-if="result && !result.success" role="alert" class="failure"><strong>签到失败</strong><p>{{ result.message }}</p></div>
          <p v-if="error" role="alert" class="error">{{ error }}</p>
          <button type="submit" :disabled="submitting">{{ submitting ? '正在核对名单…' : '确认签到' }}</button>
        </form><p class="privacy">填写内容仅用于本次会议名单核对与签到。</p>
      </template>
      <template v-else><div class="result"><div class="status-mark neutral" aria-hidden="true">—</div><h2>{{ meta ? '暂时无法签到' : '签到页未能加载' }}</h2><p role="status">{{ error || meta?.message || '请联系现场工作人员' }}</p></div><button type="button" class="secondary" @click="load">重新加载</button></template>
      <button v-if="error && meta?.available" type="button" class="text-button" @click="load">刷新签到信息</button>
    </section>
    <footer>信息未能匹配时，请联系现场工作人员。</footer>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
interface Meta { title: string; description: string; fields: { key: string; label: string; required: boolean }[]; available: boolean; message: string; formVersion: string }
interface Result { success: boolean; alreadyCheckedIn: boolean; checkedInAt: string | null; message: string }
const meta = ref<Meta | null>(null), result = ref<Result | null>(null), values = reactive<Record<string, string>>({}), loading = ref(true), submitting = ref(false), error = ref("");
const token = window.location.pathname.match(/\/external-checkins\/([A-Za-z0-9_-]{32})\/page\/?$/)?.[1] || new URLSearchParams(window.location.search).get("token") || "";
const apiOrigin = window.location.pathname.includes("/api/external-checkins/") ? window.location.origin : String(import.meta.env.VITE_API_BASE_URL || window.location.origin + "/api").replace(/\/api\/?$/, "");
async function request<T>(suffix = "", body?: unknown): Promise<T> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new Error("签到二维码无效，请重新扫描现场二维码");
  const controller = new AbortController(), timer = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${apiOrigin}/api/external-checkins/${token}${suffix}`, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}), credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.code !== "OK") throw new Error(typeof payload.message === "string" ? payload.message : "签到服务暂不可用，请稍后重试");
    return payload.data as T;
  } catch (e) { if (e instanceof TypeError || (e instanceof DOMException && e.name === "AbortError")) throw new Error("网络连接未完成，请重试；重复提交不会重复签到"); throw e; }
  finally { window.clearTimeout(timer); }
}
function clearValues() { for (const key of Object.keys(values)) delete values[key]; }
async function load() { if (submitting.value) return; loading.value = true; error.value = ""; result.value = null; try { const next = await request<Meta>(); if (next.formVersion !== meta.value?.formVersion) clearValues(); meta.value = next; document.title = `${next.title} · 现场签到`; } catch (e) { meta.value = null; error.value = e instanceof Error ? e.message : "加载失败，请重试"; } finally { loading.value = false; } }
async function submit() { if (submitting.value || !meta.value?.available) return; submitting.value = true; result.value = null; error.value = ""; try { result.value = await request<Result>("/submit", { values, formVersion: meta.value.formVersion }); if (result.value.success) clearValues(); } catch (e) { error.value = e instanceof Error ? e.message : "签到未完成，请重试"; } finally { submitting.value = false; } }
function reset() { clearValues(); void load(); }
function formatTime(date: string | null) { return date ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "medium", hour12: false }).format(new Date(date)) : ""; }
onMounted(load);
</script>

<style>
:root{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;color:#223c31;background:#f2f5ef;font-synthesis:none}*{box-sizing:border-box}body{margin:0}button,input{font:inherit}.checkin-page{max-width:520px;min-height:100dvh;margin:auto;padding:28px 22px max(28px,env(safe-area-inset-bottom))}header{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:600;letter-spacing:.5px;color:#45634f}.brand-mark{display:grid;place-items:center;width:28px;height:28px;background:#1e5940;border-radius:50%;color:#fff}.intro{padding:37px 4px 25px}.eyebrow{font-size:12px;letter-spacing:3px;color:#6e816d;margin:0 0 10px}h1{font-size:30px;line-height:1.45;margin:0;letter-spacing:-.6px;overflow-wrap:anywhere}.description{font-size:14px;line-height:1.85;color:#58705f;white-space:pre-wrap;overflow-wrap:anywhere;margin:16px 0 0}.panel{background:#fff;border:1px solid #dfe7da;border-radius:16px;padding:28px 24px;box-shadow:0 8px 30px #243e2e05}h2{font-size:20px;margin:0 0 10px;font-weight:650}.hint{font-size:13px;line-height:1.75;color:#738071;margin:0 0 26px}.form-field{margin:0 0 21px}label{display:flex;justify-content:space-between;gap:12px;font-size:14px;font-weight:600;margin-bottom:10px;overflow-wrap:anywhere}label span{flex-shrink:0;font-size:11px;font-weight:400;color:#8b9587}input{width:100%;min-width:0;height:50px;border:1px solid #d8e0d4;border-radius:7px;background:#fcfdfb;padding:0 14px;font-size:16px;color:#223c31}input::placeholder{color:#98a092;font-size:14px}input:focus{outline:2px solid #669d78;outline-offset:2px}button{border:0;border-radius:7px;background:#205c42;color:#fff;min-height:50px;width:100%;font-size:16px;font-weight:600;cursor:pointer;margin-top:6px}button:disabled{opacity:.6;cursor:wait}button:focus-visible{outline:3px solid #7bab84;outline-offset:3px}.privacy{text-align:center;font-size:11px;line-height:1.7;color:#899280;margin:17px 0 0}.error,.failure{color:#9d3d26;font-size:13px;line-height:1.8;background:#fff2ec;padding:13px 15px;border-radius:7px;margin:0 0 18px}.failure p{margin:4px 0 0}.failure strong{font-size:16px}.result{text-align:center;padding:8px 0 24px}.status-mark{display:grid;place-items:center;width:70px;height:70px;border-radius:50%;background:#e7f2e7;color:#2c7650;font-size:36px;margin:6px auto 24px}.status-mark.neutral{color:#82754c;background:#f4f1e6}.result p{color:#6d7c69;font-size:14px;line-height:1.9}.timestamp{border-top:1px solid #e7ece3;padding-top:24px;margin-top:25px}.timestamp strong{font-size:15px;font-weight:500;color:#3c5645}.secondary{background:#edf3e9;color:#345d42}.text-button{color:#426d4e;background:transparent;font-size:13px;font-weight:400;margin:12px 0 -8px;min-height:35px}.loading{text-align:center;padding:30px 0;color:#6c7d68}footer{font-size:11px;text-align:center;line-height:1.7;color:#89937f;margin:24px 0 0}@media(max-width:360px){.checkin-page{padding:22px 16px}.panel{padding:24px 20px}h1{font-size:26px}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
</style>
