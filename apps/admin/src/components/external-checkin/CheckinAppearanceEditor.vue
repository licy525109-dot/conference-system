<template>
  <section class="appearance-editor">
    <header class="editor-heading">
      <div><h2>签到页 UI</h2><p>本场会议独立配置，保存后在原签到链接生效。</p></div>
      <div class="actions"><span class="save-status" role="status">{{ dirty ? '有未保存的修改' : '已与当前配置同步' }}</span><el-button :disabled="saving || !!uploading" @click="close">返回签到管理</el-button><el-button type="primary" :disabled="!dirty || !!uploading" :loading="saving" @click="save">保存外观</el-button></div>
    </header>
    <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
    <div class="editor-columns">
      <el-form class="settings" label-position="top" :disabled="saving">
        <el-collapse v-model="sections">
          <el-collapse-item title="配色与布局" name="style">
            <div class="presets"><button v-for="preset in EXTERNAL_CHECKIN_COLOR_PRESETS" :key="preset.name" type="button" :disabled="saving" @click="applyPreset(preset)"><span :style="{ background: preset.primaryColor }" />{{ preset.name }}</button></div>
            <div class="two-columns">
              <el-form-item v-for="color in colors" :key="color.key" :label="color.label"><div class="color-control"><input type="color" :disabled="saving" :aria-label="`${color.label}选择器`" :value="draft[color.key]" @input="draft[color.key] = ($event.target as HTMLInputElement).value" /><el-input v-model="draft[color.key]" :aria-label="`${color.label}色值`" maxlength="7" /></div></el-form-item>
              <el-form-item label="页面布局"><el-select v-model="draft.layout" aria-label="页面布局"><el-option label="卡片式" value="card" /><el-option label="简洁式" value="plain" /></el-select></el-form-item>
              <el-form-item label="标题对齐"><el-select v-model="draft.titleAlign" aria-label="标题对齐"><el-option label="左对齐" value="left" /><el-option label="居中" value="center" /></el-select></el-form-item>
              <el-form-item label="正文字号"><el-radio-group v-model="draft.fontSize" aria-label="正文字号"><el-radio-button value="normal">标准</el-radio-button><el-radio-button value="large">大字</el-radio-button></el-radio-group></el-form-item>
              <el-form-item :label="`圆角 · ${draft.cornerRadius}px`"><el-slider v-model="draft.cornerRadius" :min="0" :max="28" aria-label="圆角大小" /></el-form-item>
            </div><p class="setting-hint">文字与背景需保持清晰可读。按钮文字会自动选择深色或浅色。</p>
          </el-collapse-item>
          <el-collapse-item title="Logo 与封面" name="images">
            <p class="setting-hint">支持 PNG、JPEG，每张不超过 5 MB。Logo 建议使用透明背景；封面按 16:9 展示。</p>
            <div v-for="item in imageFields" :key="item.kind" class="image-setting">
              <div class="image-label"><strong>{{ item.label }}</strong><el-button v-if="draft[item.key]" link type="danger" :disabled="!!uploading" @click="draft[item.key] = ''">移除{{ item.label }}</el-button></div>
              <img v-if="imageUrls[item.kind]" :src="imageUrls[item.kind]" :alt="`${item.label}预览`" :class="['asset-preview', item.kind]" />
              <label class="upload-button" :class="{ disabled: !!uploading || saving }">{{ uploading === item.kind ? '正在上传…' : draft[item.key] ? `替换${item.label}` : `上传${item.label}` }}<input type="file" accept="image/png,image/jpeg,.png,.jpg,.jpeg" :aria-label="`上传${item.label}`" :disabled="!!uploading || saving" @change="upload(item.kind, $event)" /></label>
            </div>
          </el-collapse-item>
          <el-collapse-item title="页眉与介绍" name="intro">
            <el-form-item label="页眉名称"><el-input v-model="draft.brandName" aria-label="页眉名称" maxlength="60" placeholder="留空可隐藏页眉名称" /></el-form-item>
            <el-form-item label="欢迎语"><el-input v-model="draft.welcomeText" aria-label="欢迎语" maxlength="40" /></el-form-item>
            <el-form-item label="页面标题"><el-input v-model="draft.pageTitle" aria-label="页面标题" maxlength="120" :placeholder="event.title" /><p class="setting-hint">留空时使用会议名称。</p></el-form-item>
            <el-form-item label="页面说明"><el-input v-model="draft.introText" aria-label="页面说明" type="textarea" :rows="3" maxlength="1000" :placeholder="event.description || '留空时使用会议的签到说明'" /></el-form-item>
          </el-collapse-item>
          <el-collapse-item title="表单与按钮" name="form">
            <el-form-item label="表单标题"><el-input v-model="draft.formTitle" aria-label="表单标题" maxlength="60" /></el-form-item>
            <el-form-item label="填写提示"><el-input v-model="draft.helperText" aria-label="填写提示" type="textarea" :rows="2" maxlength="300" /></el-form-item>
            <el-form-item label="签到按钮文字"><el-input v-model="draft.submitText" aria-label="签到按钮文字" maxlength="30" /></el-form-item>
            <p class="setting-hint">填写内容与核验规则在“配置会议与字段”中设置。</p>
          </el-collapse-item>
          <el-collapse-item title="签到结果与页脚" name="results">
            <el-form-item label="成功标题"><el-input v-model="draft.successTitle" aria-label="成功标题" maxlength="60" /></el-form-item>
            <el-form-item label="成功说明"><el-input v-model="draft.successMessage" aria-label="成功说明" type="textarea" :rows="2" maxlength="300" /></el-form-item>
            <el-form-item label="失败标题"><el-input v-model="draft.failureTitle" aria-label="失败标题" maxlength="60" /></el-form-item>
            <el-form-item label="失败说明"><el-input v-model="draft.failureMessage" aria-label="失败说明" type="textarea" :rows="2" maxlength="300" /></el-form-item>
            <el-form-item label="页脚说明"><el-input v-model="draft.footerText" aria-label="页脚说明" type="textarea" :rows="2" maxlength="300" /></el-form-item>
          </el-collapse-item>
        </el-collapse>
      </el-form>
      <aside class="preview-area" aria-label="签到页实时预览">
        <div class="preview-heading"><strong>实时预览</strong><el-radio-group v-model="previewState" size="small" aria-label="预览状态"><el-radio-button value="form">填写</el-radio-button><el-radio-button value="success">成功</el-radio-button><el-radio-button value="failure">失败</el-radio-button></el-radio-group></div>
        <p class="setting-hint">预览不会提交签到，也不会修改名单。</p>
        <div ref="phonePreview" class="phone-preview" :style="{ background: draft.backgroundColor }"><CheckinExperience :appearance="draft" :title="event.title" :description="event.description" :fields="event.fields.filter(field => field.input)" :model-value="{}" :available="true" :result="previewResult" :logo-url="imageUrls.logo" :cover-url="imageUrls.cover" preview /></div>
        <a :href="api.publicUrl(event)" target="_blank" rel="noopener" class="open-page">打开已保存的签到页 ↗</a>
      </aside>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { EXTERNAL_CHECKIN_COLOR_PRESETS, parseExternalCheckinAppearance, type ExternalCheckinAppearance } from "@conference/shared";
import { externalCheckins as api, type ExternalCheckinEvent } from "../../services/external-checkin";
import CheckinExperience from "./CheckinExperience.vue";

const props = defineProps<{ event: ExternalCheckinEvent }>();
const emit = defineEmits<{ (e: "saved", event: ExternalCheckinEvent): void; (e: "close"): void }>();
const draft = reactive<ExternalCheckinAppearance>({ ...props.event.appearance });
const baseline = ref(JSON.stringify(draft)), revision = ref(props.event.revision);
const dirty = computed(() => JSON.stringify(draft) !== baseline.value);
const saving = ref(false), uploading = ref(""), error = ref("");
const sections = ref(["style", "images", "intro"]), previewState = ref("form"), previewTime = new Date().toISOString();
const colors = [{ key: "primaryColor", label: "主题色" }, { key: "backgroundColor", label: "页面背景" }, { key: "surfaceColor", label: "卡片背景" }, { key: "textColor", label: "文字颜色" }] as const;
const imageFields = [{ kind: "logo", key: "logoAssetId", label: "Logo" }, { kind: "cover", key: "coverAssetId", label: "封面" }] as const;
const imageUrls = reactive({ logo: "", cover: "" });
const phonePreview = ref<HTMLElement | null>(null);
const previewResult = computed(() => previewState.value === "form" ? null : { success: previewState.value === "success", alreadyCheckedIn: false, checkedInAt: previewState.value === "success" ? previewTime : null, message: previewState.value === "success" ? draft.successMessage : draft.failureMessage });
watch(previewState, async state => { await nextTick(); const phone = phonePreview.value; if (!phone) return; const result = phone.querySelector(state === "success" ? '[role="status"]' : '[role="alert"]'); phone.scrollTop = state === "form" || !result ? 0 : phone.scrollTop + result.getBoundingClientRect().top - phone.getBoundingClientRect().top - 24; });
function applyPreset(preset: typeof EXTERNAL_CHECKIN_COLOR_PRESETS[number]) { for (const { key } of colors) draft[key] = preset[key]; }
for (const item of imageFields) {
  watch(() => draft[item.key], async (assetId, _, onCleanup) => {
    let cancelled = false, objectUrl = "";
    onCleanup(() => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); });
    imageUrls[item.kind] = "";
    if (!assetId) return;
    try { const blob = await api.image(props.event.id, assetId); if (!cancelled) { objectUrl = URL.createObjectURL(blob); imageUrls[item.kind] = objectUrl; } }
    catch (e) { if (!cancelled) error.value = e instanceof Error ? e.message : "图片加载失败"; }
  }, { immediate: true });
}
async function upload(kind: "logo" | "cover", event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0];
  input.value = ""; if (!file || uploading.value || saving.value) return;
  error.value = ""; uploading.value = kind;
  try { if (file.size > 5 * 1024 * 1024) throw new Error("图片不能超过 5 MB"); const asset = await api.uploadImage(props.event.id, file); draft[kind === "logo" ? "logoAssetId" : "coverAssetId"] = asset.id; }
  catch (e) { error.value = e instanceof Error ? e.message : "上传失败，请重试"; }
  finally { uploading.value = ""; }
}
async function save() {
  if (saving.value || uploading.value) return;
  saving.value = true; error.value = "";
  try { const appearance = parseExternalCheckinAppearance(draft); const saved = await api.saveAppearance(props.event.id, appearance, revision.value); Object.assign(draft, saved.appearance); baseline.value = JSON.stringify(draft); revision.value = saved.revision; emit("saved", saved); ElMessage.success("外观已保存，原签到链接即时生效"); }
  catch (e) { error.value = e instanceof Error ? e.message : "保存失败，请重试"; }
  finally { saving.value = false; }
}
async function canLeave() {
  if (saving.value || uploading.value) { ElMessage.info("请等待保存或上传完成"); return false; }
  if (!dirty.value) return true;
  try { await ElMessageBox.confirm("外观修改还未保存，离开后将丢失这些修改。", "离开签到页配置？", { confirmButtonText: "放弃修改并离开", cancelButtonText: "继续编辑", type: "warning" }); return true; } catch { return false; }
}
async function close() { if (await canLeave()) emit("close"); }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value || saving.value || uploading.value) { event.preventDefault(); event.returnValue = ""; } }
window.addEventListener("beforeunload", beforeUnload);
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
</script>

<style scoped>
.appearance-editor .editor-heading{position:sticky;top:0;z-index:5;background:#fff;padding:14px 0;border-bottom:1px solid #e0e6e2}.appearance-editor .preview-area{top:104px}.appearance-editor .phone-preview{max-height:calc(100vh - 300px)}@media(max-width:1150px){.appearance-editor .preview-area{top:164px}.appearance-editor .phone-preview{max-height:calc(100vh - 360px)}}@media(max-width:850px){.appearance-editor .editor-heading{position:static}.appearance-editor .phone-preview{max-height:690px}}
.appearance-editor{margin-top:24px}.editor-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:22px}.editor-heading h2{font-size:22px;margin:0 0 6px}.editor-heading p{font-size:13px;color:#64716a;margin:0;line-height:1.8}.actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.actions :deep(.el-button+.el-button){margin-left:0}.save-status{font-size:12px;color:#68766f;margin-right:8px}.editor-columns{display:grid;grid-template-columns:minmax(360px,1fr) minmax(330px,440px);gap:32px;align-items:start}.settings{background:#fff;border:1px solid #dfe5e1;border-radius:10px;padding:8px 24px 20px;min-width:0}.settings :deep(.el-collapse){border:0}.settings :deep(.el-collapse-item__header){font-size:15px;font-weight:600;height:60px;line-height:1.5}.settings :deep(.el-form-item){margin-bottom:18px}.settings :deep(.el-collapse-item__content){padding-bottom:10px}.settings :deep(.el-form-item__label){font-size:13px}.settings :deep(.el-select){width:100%}.two-columns{display:grid;grid-template-columns:1fr 1fr;column-gap:20px}.color-control{display:flex;gap:8px;align-items:center;width:100%}.color-control>input{width:34px;height:32px;flex-shrink:0;padding:2px;border:1px solid #dcdfe6;border-radius:4px;background:#fff;cursor:pointer}.color-control :deep(input){font-variant-numeric:tabular-nums}.presets{display:flex;gap:10px;margin:0 0 22px}.presets button{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #dfe5e1;border-radius:6px;padding:8px 12px;color:#33493b;font:inherit;cursor:pointer}.presets span{width:15px;height:15px;border-radius:50%}.presets button:focus-visible,.upload-button:focus-within{outline:2px solid #9c7938;outline-offset:3px}.setting-hint{font-size:12px;line-height:1.8;color:#68766f;margin:0 0 14px}.el-form-item .setting-hint{margin:5px 0 0}.image-setting{padding:8px 0 18px}.image-label{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:13px}.asset-preview{display:block;max-width:100%;height:80px;object-fit:contain;border:1px solid #e2e7e3;border-radius:6px;margin-bottom:12px;background:#f5f6f4;padding:6px}.asset-preview.cover{width:100%;height:140px;object-fit:cover;padding:0}.upload-button{position:relative;display:inline-block;border:1px solid #dcdfe6;border-radius:4px;padding:6px 14px;font-size:13px;cursor:pointer}.upload-button input{position:absolute;inset:0;opacity:0;width:100%;cursor:pointer}.upload-button.disabled{opacity:.5;cursor:wait}.preview-area{position:sticky;top:24px;min-width:0}.preview-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 0 8px}.preview-heading strong{font-size:15px}.phone-preview{width:390px;max-width:100%;height:690px;max-height:calc(100vh - 190px);min-height:420px;margin:auto;border:1px solid #cdd6cf;border-radius:24px;overflow:auto;box-shadow:0 8px 28px #24372a0a;scrollbar-width:thin}.open-page{display:block;text-align:center;font-size:13px;margin-top:16px;color:#786030;text-decoration:none}.appearance-editor :deep(.el-alert){margin-bottom:18px}@media(max-width:1150px){.editor-heading{align-items:flex-start;flex-direction:column}.editor-columns{gap:22px;grid-template-columns:minmax(280px,1fr) minmax(280px,370px)}.settings{padding:4px 18px 16px}.two-columns{grid-template-columns:1fr}.save-status{width:100%}}@media(max-width:850px){.editor-columns{grid-template-columns:1fr}.preview-area{position:static}.phone-preview{max-height:690px;min-height:420px}.two-columns{grid-template-columns:1fr 1fr}.preview-heading{max-width:390px;margin:0 auto 8px}.preview-area>.setting-hint{text-align:center}}@media(max-width:480px){.two-columns{grid-template-columns:1fr}.presets{flex-wrap:wrap}}
</style>
