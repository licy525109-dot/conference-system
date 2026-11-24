<template>
  <div class="appearance">
    <section class="j-editor">
      <h3>手机评分页</h3>
      <el-form label-position="top">
        <el-form-item label="页面标题">
          <el-input v-model="config.look.heading" maxlength="50" />
        </el-form-item>
        <el-form-item label="评分引导">
          <el-input v-model="config.look.intro" type="textarea" :rows="2" />
        </el-form-item>
        <div class="j-pair">
          <el-form-item label="提交按钮"><el-input v-model="config.look.submit" /></el-form-item>
          <el-form-item label="成功回执"><el-input v-model="config.look.receipt" /></el-form-item>
        </div>
        <el-form-item label="页首封面"><ImageField v-model="config.look.cover" /></el-form-item>
        <el-form-item label="主办方标志"><ImageField v-model="config.look.logo" /></el-form-item>
        <div class="j-colors">
          <label v-for="x in colors" :key="x.key">
            {{ x.label }}
            <input type="color" v-model="config.look[x.key]" />
          </label>
        </div>
        <div class="j-pair">
          <el-form-item label="正文字号">
            <el-input-number v-model="config.look.fontSize" :min="14" :max="23" />
          </el-form-item>
          <el-form-item label="卡片圆角">
            <el-slider v-model="config.look.radius" :min="0" :max="32" />
          </el-form-item>
        </div>
        <div class="j-switches">
          <el-checkbox v-model="config.look.showPhoto">教师照片</el-checkbox>
          <el-checkbox v-model="config.look.showOrg">所属机构</el-checkbox>
          <el-checkbox v-model="config.look.showProgress">我的任务进度</el-checkbox>
        </div>
        <el-button type="primary" :disabled="!editable" @click="$emit('save')">保存手机页面</el-button>
      </el-form>
    </section>
    <section class="j-preview">
      <div class="preview-tools">
        <strong>手机预览与试填</strong>
        <el-select v-model="role">
          <el-option v-for="r in judgeRoles" :key="r" :label="roleLabels[r]" :value="r" />
        </el-select>
      </div>
      <div class="preview-scroll judging-surface" :style="judgingStyle(config.look)">
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
          <small class="judging-kicker">{{ title }} · {{ roleLabels[role] }}</small>
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
                {{ role === "expert" ? "TED 主会场" : "第 1 轮 · " + (config.rooms[0]?.name || "教室") }}
              </small>
              <strong class="judging-name">{{ teacher?.name || "示例教师" }}</strong>
              <small v-if="config.look.showOrg" class="judging-note">{{ teacher?.org || "示例机构" }}</small>
            </div>
          </div>
          <span class="judging-topic">
            {{ (role === "expert" ? teacher?.speech : teacher?.topic) || "课程或演讲题目" }}
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
  judgeRoles,
  roleLabels,
  rubricFor,
  maxPoints,
  stageOf,
  type JudgingConfig,
  type JudgeRole,
  type Answers
} from "@conference/shared";
import ImageField from "./ImageField.vue";
import { judgingImageUrl } from "../../services/judging";
const props = defineProps<{ config: JudgingConfig; title: string; editable: boolean }>();
defineEmits<{ (e: "save"): void }>();
const colors = [
  { key: "accent", label: "主色" },
  { key: "background", label: "背景" },
  { key: "surface", label: "卡片" },
  { key: "text", label: "文字" }
] as const;
const role = ref<JudgeRole>("lecturer"),
  answers = ref<Answers>({}),
  received = ref(false),
  form = computed(() => rubricFor(props.config, role.value)),
  teacher = computed(() => props.config.teachers[0]);
function reset() {
  answers.value = {};
  received.value = false;
}
watch([role, form], reset, { deep: true });
function tryForm() {
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
  grid-template-columns: minmax(300px, 1fr) minmax(300px, 385px);
  gap: 30px;
  align-items: start;
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
  width: 52px;
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
