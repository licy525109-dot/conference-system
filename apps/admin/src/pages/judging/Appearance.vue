<template>
  <div class="design-head">
    <div class="design-mode" aria-label="设计页面">
      <button
        v-for="v in sections"
        :key="v.key"
        type="button"
        :aria-pressed="section === v.key"
        @click="section = v.key"
      >
        {{ v.label }}
      </button>
    </div>
    <div class="design-save">
      <small role="status">{{ !editable ? "本场已锁定" : changed ? "有未保存的设计" : "已保存" }}</small>
      <el-button type="primary" :loading="busy" :disabled="!editable || !changed" @click="$emit('save')"
        >保存页面设计</el-button
      >
    </div>
  </div>
  <div class="appearance">
    <section class="j-editor">
      <el-form label-position="top" :disabled="!editable || busy">
        <fieldset :disabled="!editable || busy">
          <template v-if="section === 'entry'">
            <h3>首页版式</h3>
            <div class="layout-options" aria-label="首页版式">
              <button
                v-for="item in layouts"
                :key="item.value"
                type="button"
                :aria-pressed="entry.layout === item.value"
                @click="entry.layout = item.value"
              >
                <i aria-hidden="true" :class="['layout-icon', 'icon-' + item.value]"><b></b><span></span></i>
                {{ item.label }}
              </button>
            </div>
          </template>
          <h3>主题配色</h3>
          <div class="palettes" aria-label="主题配色">
            <button
              v-for="p in judgingPalettes"
              :key="p.label"
              type="button"
              :aria-pressed="
                colors.every((c) => config.look[c.key].toLowerCase() === p.colors[c.key].toLowerCase())
              "
              @click="Object.assign(config.look, p.colors)"
            >
              <i
                :style="{ background: p.colors.accent, borderColor: p.colors.background }"
                aria-hidden="true"
              ></i
              >{{ p.label }}
            </button>
          </div>
          <template v-if="section === 'entry'">
            <el-form-item label="页面标题"
              ><el-input v-model="config.look.heading" maxlength="50"
            /></el-form-item>
            <el-form-item label="欢迎语（选填）"
              ><el-input
                v-model="entry.intro"
                type="textarea"
                :rows="2"
                maxlength="180"
                placeholder="例如：欢迎来到绘本舞蹈赛课现场"
            /></el-form-item>
            <el-form-item label="进入按钮文字"
              ><el-input v-model="entry.button" maxlength="25"
            /></el-form-item>
          </template>
          <template v-else>
            <el-form-item label="评分引导"
              ><el-input v-model="config.look.intro" type="textarea" :rows="2" maxlength="400"
            /></el-form-item>
            <el-form-item label="交分按钮文字"
              ><el-input v-model="config.look.submit" maxlength="25"
            /></el-form-item>
            <el-form-item label="成功回执"
              ><el-input v-model="config.look.receipt" maxlength="80"
            /></el-form-item>
            <div class="j-switches">
              <el-checkbox v-model="config.look.showPhoto">教师照片</el-checkbox>
              <el-checkbox v-model="config.look.showOrg">所属机构</el-checkbox>
              <el-checkbox v-model="config.look.showProgress">我的任务进度</el-checkbox>
            </div>
          </template>
          <details v-if="section === 'entry'" class="design-details" open>
            <summary>封面与标志</summary>
            <el-form-item v-if="entry.layout !== 'minimal'" label="赛事封面">
              <ImageField v-model="config.look.cover" :event-id="eventId" />
              <small class="design-hint">留空使用绘本舞蹈封面。可上传 JPG、PNG 或 WebP，最大 2 MB。</small>
            </el-form-item>
            <div class="j-pair" v-if="entry.layout !== 'minimal'">
              <el-form-item label="图片显示"
                ><el-select v-model="entry.fit"
                  ><el-option value="cover" label="铺满画面" /><el-option
                    value="contain"
                    label="完整显示" /></el-select
              ></el-form-item>
              <el-form-item label="取景位置"
                ><el-select v-model="entry.position"
                  ><el-option value="top" label="靠上" /><el-option value="center" label="居中" /><el-option
                    value="bottom"
                    label="靠下" /></el-select
              ></el-form-item>
            </div>
            <el-form-item label="主办方标志"
              ><ImageField v-model="config.look.logo" :event-id="eventId"
            /></el-form-item>
          </details>
          <details class="design-details">
            <summary>字体、细节与自定义配色</summary>
            <template v-if="section === 'entry'">
              <el-form-item label="标题字体"
                ><el-radio-group v-model="entry.typeface"
                  ><el-radio-button value="serif">宋体</el-radio-button
                  ><el-radio-button value="sans">黑体</el-radio-button></el-radio-group
                ></el-form-item
              >
              <el-form-item label="姓名栏标题"
                ><el-input v-model="entry.nameLabel" maxlength="32"
              /></el-form-item>
              <el-form-item label="姓名输入提示"
                ><el-input v-model="entry.placeholder" maxlength="60"
              /></el-form-item>
            </template>
            <div class="j-colors">
              <label v-for="x in colors" :key="x.key"
                >{{ x.label }}<input type="color" v-model="config.look[x.key]"
              /></label>
            </div>
            <div class="j-pair">
              <el-form-item label="正文字号"
                ><el-input-number
                  v-model="config.look.fontSize"
                  :min="14"
                  :max="23"
                  controls-position="right"
              /></el-form-item>
              <el-form-item label="卡片圆角"
                ><el-slider v-model="config.look.radius" :min="0" :max="32"
              /></el-form-item>
            </div>
          </details>
        </fieldset>
      </el-form>
    </section>
    <EntryDesignPreview v-if="section === 'entry'" :look="config.look" :title="title" />
    <section v-else class="j-preview">
      <div class="preview-tools">
        <strong>手机预览与试填</strong>
        <el-select v-model="role">
          <el-option v-for="r in roles" :key="r.id" :label="r.label" :value="r.id" />
        </el-select>
      </div>
      <el-empty v-if="!role || !form" description="请先在「评分表与规则」新增评委类型" />
      <div v-else class="preview-scroll judging-surface" :style="judgingStyle(config.look)">
        <div class="judging-hero">
          <img
            v-if="config.look.cover"
            class="judging-cover"
            :src="judgingImageUrl(config.look.cover)"
            alt="封面"
          />
          <img
            v-if="config.look.logo"
            class="judging-logo"
            :src="judgingImageUrl(config.look.logo)"
            alt="标志"
          />
          <small class="judging-kicker">{{ title }} · {{ judgingRoleLabel(config, role) }}</small>
          <strong class="judging-heading">{{ config.look.heading }}</strong>
          {{ config.look.intro }}
        </div>
        <div class="judging-panel">
          <div class="judging-person">
            <img
              v-if="config.look.showPhoto && (teacher?.photo || teacher?.poster)"
              class="judging-photo"
              :src="judgingImageUrl(teacher.photo || teacher.poster)"
              alt="选手"
            />
            <div>
              <small class="judging-note">
                {{
                  stageOf(role) === "ted" ? "TED 主会场" : "第 1 轮 · " + (config.rooms[0]?.name || "教室")
                }}
              </small>
              <strong class="judging-name">{{ teacher?.name || "示例教师" }}</strong>
              <small v-if="config.look.showOrg" class="judging-note">{{ teacher?.org || "示例机构" }}</small>
            </div>
          </div>
          <span class="judging-topic">
            {{ (stageOf(role) === "ted" ? teacher?.speech : teacher?.topic) || "课程或演讲题目" }}
          </span>
        </div>
        <div v-if="!received" class="judging-panel">
          <strong class="judging-name">{{ form.title }} · {{ maxPoints[stageOf(role)] }} 分</strong>
          <small class="judging-note">{{ form.description }}</small>
          <div v-for="f in form.fields" :key="f.id" class="judging-field">
            <label class="judging-field-label">{{ f.label }}{{ f.required ? " *" : "" }}</label>
            <small class="judging-note">{{ f.hint }}　{{ f.min }}–{{ f.max }} 分，步长 {{ f.step }}</small>
            <input
              v-if="answers[f.id] !== 'unseen'"
              type="number"
              class="judging-input"
              v-model="answers[f.id]"
              :min="f.min"
              :max="f.max"
              :step="f.step"
            />
            <button
              v-if="f.unseen !== 'forbid'"
              class="trial-link"
              @click="answers[f.id] = answers[f.id] === 'unseen' ? null : 'unseen'"
            >
              {{ answers[f.id] === "unseen" ? "已选未观察 · 重新评分" : "此项未观察" }}
            </button>
          </div>
          <button class="judging-submit" @click="tryForm">{{ config.look.submit }}</button>
        </div>
        <div v-else class="judging-panel">
          <strong class="judging-name">{{ config.look.receipt }}</strong>
          <span class="judging-note">试填回执 · 已提交</span>
          <button class="trial-link" @click="reset">重新试填</button>
        </div>
        <div v-if="config.look.showProgress" class="judging-panel">
          <strong>我的评审任务</strong>
          <div class="judging-task">
            {{ teacher?.name || "示例教师" }} · {{ received ? "已交" : "评分中" }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import {
  judgingStyle,
  judgingPalettes,
  judgingRoles,
  judgingRoleLabel,
  rubricFor,
  maxPoints,
  stageOf,
  type JudgingConfig,
  type JudgeRole,
  type Answers
} from "@conference/shared";
import ImageField from "./ImageField.vue";
import EntryDesignPreview from "./EntryDesignPreview.vue";
import { judgingImageUrl } from "../../services/judging";
const props = defineProps<{
  config: JudgingConfig;
  title: string;
  eventId: string;
  editable: boolean;
  changed: boolean;
  busy: boolean;
}>();
const sections = [
  { key: "entry", label: "扫码首页" },
  { key: "ballot", label: "评分表与回执" }
] as const;
const section = ref<"entry" | "ballot">("entry"),
  entry = computed(() => props.config.look.entry);
const layouts = [
  { value: "spread", label: "绘本对页" },
  { value: "poster", label: "横幅海报" },
  { value: "minimal", label: "简洁文字" }
] as const;
const palettes = [
  { label: "纸艺暖棕", accent: "#8D412D", background: "#F4EFE5", surface: "#FFFCF4", text: "#332C25" },
  { label: "林间青绿", accent: "#186859", background: "#F3F6F3", surface: "#FFFFFF", text: "#182E2A" },
  { label: "夜幕靛蓝", accent: "#414C78", background: "#EEF0F5", surface: "#FCFCFF", text: "#222B46" }
];
function applyPalette(p: (typeof palettes)[number]) {
  for (const c of colors) props.config.look[c.key] = p[c.key];
}
defineEmits<{ (e: "save"): void }>();
const colors = [
  { key: "accent", label: "主色" },
  { key: "background", label: "背景" },
  { key: "surface", label: "卡片" },
  { key: "text", label: "文字" }
] as const;
const roles = computed(() => judgingRoles(props.config)),
  role = ref<JudgeRole>(),
  answers = ref<Answers>({}),
  received = ref(false),
  form = computed(() => role.value && rubricFor(props.config, role.value)),
  teacher = computed(() => props.config.teachers[0]);
watch(
  roles,
  (list) => {
    if (!list.some((r) => r.id === role.value)) role.value = list[0]?.id;
  },
  { immediate: true }
);
function reset() {
  answers.value = {};
  received.value = false;
}
watch([role, form], reset, { deep: true });
function tryForm() {
  if (!form.value) return;
  for (const f of form.value.fields) {
    const v = answers.value[f.id];
    if ((v == null || String(v) === "") && f.required) {
      ElMessage.warning("请填写：" + f.label);
      return;
    }
    if (
      typeof v === "number" &&
      (v < f.min ||
        v > f.max ||
        (Math.round(v * 100) - Math.round(f.min * 100)) % Math.round(f.step * 100) !== 0)
    ) {
      ElMessage.warning("请按范围及步长填写：" + f.label);
      return;
    }
  }
  received.value = true;
}
</script>
<style scoped>
@import "../../../../../packages/shared/src/judging-surface.css";
.appearance {
  display: grid;
  grid-template-columns: minmax(290px, 365px) minmax(0, 1fr);
  gap: 30px;
  align-items: start;
}
.design-head,
.design-save,
.design-mode,
.palettes,
.layout-options {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.design-head {
  justify-content: space-between;
  gap: 16px;
  margin: 12px 0 18px;
}
.design-save small,
.design-hint {
  color: #59675f;
  font-size: 12px;
}
.design-hint {
  display: block;
  line-height: 1.6;
  margin-top: 6px;
}
.design-mode {
  padding: 3px;
  gap: 2px;
  border-radius: 7px;
  background: #eef2ee;
}
.design-mode button,
.layout-options button,
.palettes button {
  color: #384a3d;
  font: inherit;
  font-size: 13px;
  background: #fff;
  border: 1px solid #cfd9d1;
  border-radius: 6px;
  cursor: pointer;
}
.design-mode button {
  border: 0;
  padding: 7px 14px;
  background: transparent;
}
.design-mode button[aria-pressed="true"] {
  background: #fff;
  box-shadow: 0 1px 4px #29372829;
  font-weight: 650;
}
.j-editor fieldset {
  border: 0;
  padding: 0;
  margin: 0;
  min-width: 0;
}
.j-editor h3 {
  font-size: 15px;
  margin: 4px 0 10px;
}
.layout-options,
.palettes {
  margin-bottom: 20px;
}
.layout-options button {
  flex: 1;
  padding: 8px 5px;
  display: grid;
  justify-items: center;
  gap: 6px;
}
.layout-icon {
  width: 44px;
  height: 26px;
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px;
  box-sizing: border-box;
  border: 1px solid #b3beb2;
  border-radius: 3px;
}
.layout-icon b {
  flex: 1;
  height: 100%;
  background: #a7b5a3;
  border-radius: 1px;
}
.layout-icon span {
  flex: 1;
  height: 7px;
  border-top: 2px solid #899988;
  border-bottom: 2px solid #899988;
}
.icon-poster {
  flex-direction: column;
  align-items: stretch;
}
.icon-poster span {
  flex: none;
  height: 2px;
}
.icon-minimal b {
  display: none;
}
.icon-minimal span {
  flex: 0.7;
}
.palettes button {
  padding: 5px 7px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.palettes i {
  width: 17px;
  height: 17px;
  box-sizing: border-box;
  border: 3px solid;
  border-radius: 50%;
}
.layout-options button[aria-pressed="true"],
.palettes button[aria-pressed="true"] {
  border-color: #476b51;
  background: #f2f6f0;
  box-shadow: inset 0 0 0 1px #476b51;
}
.design-details {
  border-top: 1px solid #dde4dd;
}
.design-details summary {
  cursor: pointer;
  font-weight: 600;
  padding: 14px 0;
}
.j-preview {
  max-width: 400px;
  width: 100%;
  justify-self: center;
}
.j-colors,
.j-switches,
.preview-tools {
  display: flex;
  gap: 14px;
  align-items: center;
}
.j-colors {
  margin: 8px 0 20px;
}
.j-colors label {
  display: grid;
  gap: 4px;
  font-size: 13px;
}
.j-colors input {
  width: 48px;
  height: 32px;
  border: 1px solid #d8dedb;
  border-radius: 5px;
  background: white;
}
.j-switches {
  flex-wrap: wrap;
  margin-bottom: 16px;
}
.j-pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.j-preview {
  position: sticky;
  top: 8px;
}
.preview-tools {
  justify-content: space-between;
  margin-bottom: 12px;
}
.preview-tools .el-select {
  width: 118px;
}
.preview-scroll {
  max-height: 720px;
  overflow: auto;
  border: 1px solid #ccd7d1;
  border-radius: 24px;
}
.trial-link {
  padding: 4px 0;
  border: 0;
  background: none;
  color: var(--judging-accent);
  cursor: pointer;
}
@media (max-width: 900px) {
  .appearance {
    grid-template-columns: 1fr;
  }
  .j-preview {
    max-width: 420px;
  }
}
</style>
