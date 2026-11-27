<template>
  <div class="j-tools">
    <el-radio-group v-if="roles.length" v-model="selected" aria-label="评委类型">
      <el-radio-button v-for="r in roles" :key="r.id" :value="r.id">{{ r.label }}</el-radio-button>
    </el-radio-group>
    <template v-if="!disabled">
      <el-button type="primary" plain @click="openAdd">新增评委类型</el-button>
      <el-button v-if="current" type="danger" plain @click="openRemove">删除当前类型</el-button>
    </template>
  </div>
  <el-checkbox v-if="canShare" v-model="config.sameAudienceForm" :disabled="disabled">
    体验席与观察席共用量表
  </el-checkbox>
  <el-dialog v-model="adding" title="新增评委类型" width="min(460px,94vw)" append-to-body>
    <el-form label-position="top" @submit.prevent="add">
      <el-form-item label="类型名称">
        <el-input v-model="name" aria-label="类型名称" placeholder="例如：教研观察员" maxlength="50" />
      </el-form-item>
      <el-form-item label="计分方式">
        <el-select v-model="base" aria-label="计分方式" @change="members = []">
          <el-option v-for="r in judgeRoles" :key="r" :value="r" :label="policyLabels[r]" />
        </el-select>
      </el-form-item>
      <el-form-item v-if="candidates.length" label="使用这张表的评委（可选）">
        <el-select
          v-model="members"
          multiple
          filterable
          aria-label="使用这张表的评委"
          placeholder="按姓名或编号选择"
        >
          <el-option v-for="j in candidates" :key="j.id" :value="j.id" :label="j.name + ' · ' + j.id" />
        </el-select>
      </el-form-item>
      <p v-if="live" class="j-note">新版评分表用于尚未开放的场次。</p>
    </el-form>
    <template #footer>
      <el-button @click="adding = false">取消</el-button>
      <el-button type="primary" :disabled="!name.trim()" @click="add">添加到草稿</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="removing" title="删除评委类型" width="min(460px,94vw)" append-to-body>
    <template v-if="current">
      <p>确定从本赛事删除「{{ current.label }}」及其评分表吗？</p>
      <template v-if="assignedJudges.length">
        <p>名单中有 {{ assignedJudges.length }} 位评委使用这张表。请选择处理方式。</p>
        <el-select v-model="destination" aria-label="已分配评委的处理方式" placeholder="请选择">
          <el-option v-for="r in replacements" :key="r.id" :value="r.id" :label="'转入「' + r.label + '」'" />
          <el-option
            v-if="!live"
            value="remove-members"
            :label="'同时从本赛事名单移除这 ' + assignedJudges.length + ' 位评委'"
          />
        </el-select>
        <p v-if="live && !replacements.length" class="j-note">
          请先新增一个计分方式相同的类型，再将这些评委转入。
        </p>
      </template>
      <p v-if="live" class="j-note">已开放场次、补交和历史评分沿用原表。</p>
    </template>
    <template #footer>
      <el-button @click="removing = false">取消</el-button>
      <el-button type="danger" :disabled="!!assignedJudges.length && !destination" @click="remove"
        >确认删除类型</el-button
      >
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import {
  baseJudgeRole,
  defaultJudgingRubric,
  judgeRoles,
  judgingRoles,
  roleLabels,
  stageOf,
  stageCaps,
  type BaseJudgeRole,
  type JudgeRole,
  type JudgingConfig
} from "@conference/shared";

const props = defineProps<{ config: JudgingConfig; disabled: boolean; live: boolean }>();
const selected = defineModel<JudgeRole>();
const roles = computed(() => judgingRoles(props.config));
const current = computed(() => roles.value.find((r) => r.id === selected.value));
const canShare = computed(
  () => roles.value.some((r) => r.id === "experience") && roles.value.some((r) => r.id === "observer")
);
const policyLabels = computed<Record<BaseJudgeRole, string>>(() => ({
  lecturer: "专业分 · 40 分（讲师席）",
  experience: "大众分 · " + stageCaps(props.config.scoringPlan).audience + " 分（体验席配额）",
  observer: "大众分 · " + stageCaps(props.config.scoringPlan).audience + " 分（观察席配额）",
  expert: "TED 分 · 30 分（主会场）"
}));
const adding = ref(false),
  removing = ref(false);
const name = ref(""),
  base = ref<BaseJudgeRole>("experience"),
  members = ref<string[]>([]);
const destination = ref<JudgeRole | "remove-members">();
const assignedJudges = computed(() => props.config.judges.filter((j) => j.role === selected.value));
const candidates = computed(() => props.config.judges.filter((j) => baseJudgeRole(j.role) === base.value));
const replacements = computed(() => {
  const source = current.value?.id;
  if (!source) return [];
  return roles.value.filter(
    (r) =>
      r.id !== source &&
      (props.live ? baseJudgeRole(r.id) === baseJudgeRole(source) : stageOf(r.id) === stageOf(source))
  );
});

function openAdd() {
  const currentBase = selected.value && baseJudgeRole(selected.value);
  base.value = currentBase ?? "experience";
  name.value = "";
  members.value = [];
  adding.value = true;
}
function add() {
  const label = name.value.trim();
  if (props.disabled || !label) return;
  if (roles.value.some((r) => r.label === label)) {
    ElMessage.warning("该类型名称已使用，请换一个名称");
    return;
  }
  const builtin = base.value;
  const restore = label === roleLabels[builtin] && !roles.value.some((r) => r.id === builtin);
  const id: JudgeRole = restore ? builtin : `${builtin}_${crypto.randomUUID()}`;
  props.config.rubrics[id] = defaultJudgingRubric(id, label, props.config.scoringPlan);
  props.config.roleOptions = [...roles.value, { id, label }];
  for (const j of candidates.value) if (members.value.includes(j.id)) j.role = id;
  selected.value = id;
  adding.value = false;
  ElMessage.success("已添加到草稿，请保存评分表");
}
function openRemove() {
  destination.value = undefined;
  removing.value = true;
}
function remove() {
  const source = current.value?.id;
  if (props.disabled || !source) return;
  if (assignedJudges.value.length) {
    const target = destination.value;
    if (target === "remove-members" && !props.live) {
      props.config.judges = props.config.judges.filter((j) => j.role !== source);
    } else {
      const replacement = replacements.value.find((r) => r.id === target);
      if (!replacement) return;
      for (const j of assignedJudges.value) j.role = replacement.id;
    }
  }
  if (source === "experience" || source === "observer") {
    if (source === "experience" && props.config.sameAudienceForm && props.config.rubrics.observer) {
      props.config.rubrics.observer = JSON.parse(JSON.stringify(props.config.rubrics.experience));
    }
    props.config.sameAudienceForm = false;
  }
  const remaining = roles.value.filter((r) => r.id !== source);
  props.config.roleOptions = remaining;
  delete props.config.rubrics[source];
  selected.value = remaining[0]?.id;
  removing.value = false;
  ElMessage.success("已从草稿移除，请保存评分表");
}
</script>
