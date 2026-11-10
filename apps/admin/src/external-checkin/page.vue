<template>
  <CheckinExperience v-model="values" :appearance="appearance" :title="meta?.title || ''" :description="meta?.description || ''" :fields="meta?.fields || []" :available="meta?.available || false" :message="meta?.message" :logo-url="imageUrl(appearance.logoAssetId)" :cover-url="imageUrl(appearance.coverAssetId)" :loading="loading" :submitting="submitting" :error="error" :result="result" @submit="submit" @reload="load" @reset="reset" />
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { DEFAULT_EXTERNAL_CHECKIN_APPEARANCE, type ExternalCheckinAppearance } from "@conference/shared";
import CheckinExperience, { type CheckinResult } from "../components/external-checkin/CheckinExperience.vue";
interface Meta { title: string; description: string; fields: { key: string; label: string; required: boolean }[]; available: boolean; message: string; formVersion: string; appearance: ExternalCheckinAppearance }
const meta = ref<Meta | null>(null), result = ref<CheckinResult | null>(null), values = ref<Record<string, string>>({});
const loading = ref(true), submitting = ref(false), error = ref("");
const appearance = computed(() => meta.value?.appearance || DEFAULT_EXTERNAL_CHECKIN_APPEARANCE);
const token = window.location.pathname.match(/\/external-checkins\/([A-Za-z0-9_-]{32})\/page\/?$/)?.[1] || new URLSearchParams(window.location.search).get("token") || "";
const apiOrigin = window.location.pathname.includes("/api/external-checkins/") ? window.location.origin : String(import.meta.env.VITE_API_BASE_URL || window.location.origin + "/api").replace(/\/api\/?$/, "");
const imageUrl = (id: string) => id ? `${apiOrigin}/api/external-checkins/${token}/images/${id}` : "";
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
async function load() {
  if (submitting.value) return;
  loading.value = true; error.value = ""; result.value = null;
  try {
    const next = await request<Meta>();
    if (next.formVersion !== meta.value?.formVersion) values.value = {};
    meta.value = next; document.title = `${next.appearance.pageTitle || next.title} · 现场签到`;
    document.documentElement.style.backgroundColor = next.appearance.backgroundColor;
  } catch (e) { meta.value = null; error.value = e instanceof Error ? e.message : "加载失败，请重试"; }
  finally { loading.value = false; }
}
async function submit() {
  if (submitting.value || !meta.value?.available) return;
  submitting.value = true; result.value = null; error.value = "";
  try { result.value = await request<CheckinResult>("/submit", { values: values.value, formVersion: meta.value.formVersion }); if (result.value.success) values.value = {}; }
  catch (e) { error.value = e instanceof Error ? e.message : "签到未完成，请重试"; }
  finally { submitting.value = false; }
}
function reset() { values.value = {}; void load(); }
onMounted(load);
</script>

<style>body{margin:0}</style>
