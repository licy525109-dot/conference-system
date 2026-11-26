<template>
  <section>
    <RoleOptions v-model="role" :config="config" :disabled="disabled" :live="live" />
    <el-empty v-if="!form || !role" description="请先新增评委类型" />
    <el-form v-else label-position="top" :disabled="disabled">
      <div class="j-pair">
        <el-form-item label="评分表标题"><el-input v-model="form.title" /></el-form-item>
        <el-form-item label="评分说明">
          <el-input v-model="form.description" type="textarea" :rows="2" />
        </el-form-item>
      </div>
      <div v-for="(f, i) in form.fields" :key="f.id" class="j-question">
        <div class="j-tools">
          <strong>第 {{ i + 1 }} 题</strong>
          <el-button link :disabled="i === 0" @click="move(i, -1)">上移</el-button>
          <el-button link :disabled="i === form.fields.length - 1" @click="move(i, 1)">下移</el-button>
          <el-button type="danger" link @click="form.fields.splice(i, 1)">删除</el-button>
        </div>
        <div class="j-pair">
          <el-form-item label="题目"><el-input v-model="f.label" /></el-form-item>
          <el-form-item label="给评委的说明"><el-input v-model="f.hint" /></el-form-item>
        </div>
        <div class="j-rulegrid">
          <label>
            最低分
            <el-input-number v-model="f.min" :min="0" :precision="2" />
          </label>
          <label>
            最高分
            <el-input-number v-model="f.max" :min="0.01" :max="40" :precision="2" />
          </label>
          <label>
            输入步长
            <el-input-number v-model="f.step" :min="0.01" :precision="2" :step="0.1" />
          </label>
          <label>
            未观察处理
            <el-select v-model="f.unseen">
              <el-option label="须填写分数" value="forbid" />
              <el-option label="原单转待核" value="review" />
              <el-option label="按已观察满分折算" value="prorate" />
            </el-select>
          </label>
          <el-checkbox v-model="f.required">必填</el-checkbox>
        </div>
      </div>
      <div class="j-tools">
        <el-button @click="add">添加评分项</el-button>
        <strong>题目满分合计 {{ sum }} / {{ maxPoints[stageOf(role)] }}</strong>
      </div>
      <el-checkbox v-model="config.approvedForms">本届正式评分细则已由业务方核对</el-checkbox>
    </el-form>
    <el-form label-position="top" :disabled="rulesLocked">
      <h3>有效份数与精度</h3>
      <div class="j-rulegrid">
        <label v-for="s in stages" :key="s">
          {{ stageNames[s] }}最低份数
          <el-input-number v-model="config.minimum[s]" :min="1" :max="1500" />
        </label>
        <label>
          显示小数位
          <el-input-number v-model="config.display" :min="0" :max="4" />
        </label>
        <label>
          同分比较小数位
          <el-input-number v-model="config.precision" :min="0" :max="6" />
        </label>
      </div>
      <h3>颁奖公布</h3>
      <div class="j-tools">
        <label>
          最早公布日期
          <el-date-picker
            v-model="config.publicDay"
            type="date"
            value-format="YYYY-MM-DD"
            :clearable="false"
          />
        </label>
        <el-checkbox-group v-model="config.publicFields">
          <el-checkbox v-for="(label, k) in awardFieldOptions" :key="k" :value="k" :disabled="k === 'name'">
            {{ label }}
          </el-checkbox>
        </el-checkbox-group>
      </div>
    </el-form>
  </section>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import RoleOptions from "./RoleOptions.vue";
import {
  awardFieldOptions,
  judgingRoles,
  stageOf,
  stages,
  maxPoints,
  rubricFor,
  type JudgeRole,
  type JudgingConfig
} from "@conference/shared";
const props = defineProps<{
  config: JudgingConfig;
  disabled: boolean;
  rulesLocked: boolean;
  live: boolean;
}>();
const role = ref<JudgeRole>(),
  roles = computed(() => judgingRoles(props.config)),
  form = computed(() => role.value && rubricFor(props.config, role.value)),
  sum = computed(() => Math.round((form.value?.fields ?? []).reduce((n, f) => n + f.max, 0) * 100) / 100);
watch(
  roles,
  (list) => {
    if (!list.some((r) => r.id === role.value)) role.value = list[0]?.id;
  },
  { immediate: true }
);
const stageNames = { professional: "专业", audience: "大众", ted: "TED" };
function move(i: number, n: number) {
  if (!form.value) return;
  const items = form.value.fields;
  items.splice(i + n, 0, items.splice(i, 1)[0]);
}
function add() {
  form.value?.fields.push({
    id: "q" + crypto.randomUUID().slice(0, 8),
    label: "新评分项",
    hint: "",
    min: 0,
    max: 1,
    step: 1,
    required: true,
    unseen: "review"
  });
}
</script>
