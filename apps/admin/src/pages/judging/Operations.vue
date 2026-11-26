<template>
  <div class="j-tools">
    <el-select v-model="sid" placeholder="选择场次" style="width: min(420px, 90vw)">
      <el-option
        v-for="s in event.config.sessions"
        :key="s.id"
        :label="slotLabel(s, event.config)"
        :value="s.id"
      />
    </el-select>
    <el-button @click="load">刷新收分进度</el-button>
  </div>
  <template v-if="current">
    <div class="j-statusline">
      <strong>{{ slotLabel(current, event.config) }}</strong>
      <el-tag :type="state.gates[sid] === 'open' ? 'success' : 'info'">
        {{ state.gates[sid] === "open" ? "评分中" : "未开放或已截止" }}
      </el-tag>
      <el-button
        v-if="state.phase === 'LIVE'"
        type="primary"
        @click="operate('gate', { session: sid, open: state.gates[sid] !== 'open' })"
      >
        {{ state.gates[sid] === "open" ? "截止本场" : "开放本场" }}
      </el-button>
      <el-button
        v-if="state.phase === 'LIVE' && !state.gates[sid]"
        @click="operate('gate', { session: sid, open: false })"
      >
        标记本场截止
      </el-button>
    </div>
    <el-table :data="stats">
      <el-table-column prop="label" label="评委席别" />
      <el-table-column prop="capacity" label="计划配额" />
      <el-table-column prop="assigned" label="分配任务" />
      <el-table-column prop="present" label="实到" />
      <el-table-column prop="received" label="已交" />
      <el-table-column prop="valid" label="有效" />
    </el-table>
    <div class="j-tools">
      <el-input v-model="keyword" placeholder="搜索评委姓名或编号" style="width: 220px" />
      <el-select v-model="status" clearable placeholder="全部状态" style="width: 145px">
        <el-option v-for="(v, k) in taskStatus" :key="k" :label="v" :value="k" />
      </el-select>
    </div>
    <el-table :data="selected" max-height="380">
      <el-table-column prop="name" label="评委" />
      <el-table-column label="席别">
        <template #default="{ row }">{{
          row.roleLabel ?? judgingRoleLabel(event.config, row.role)
        }}</template>
      </el-table-column>
      <el-table-column label="状态">
        <template #default="{ row }">{{ taskStatus[row.status] }} {{ row.present ? "· 已到" : "" }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="现场记录" />
      <el-table-column v-if="['LIVE', 'REVIEW'].includes(state.phase)" width="200" label="现场操作">
        <template #default="{ row }">
          <template v-if="!row.receipt">
            <el-button link @click="attendance(row, 'present')">到场</el-button>
            <el-button link @click="attendance(row, 'absent')">缺评</el-button>
            <el-button link type="primary" @click="attendance(row, 'makeup')">补交</el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </template>
  <el-empty v-else description="请先在「赛前设置」中添加教师并安排场次" />
  <div class="j-tools">
    <el-button v-if="state.phase === 'SETUP'" type="primary" @click="transition('start')">
      开始现场评分
    </el-button>
    <el-button v-if="state.phase === 'LIVE'" @click="transition('finish')">结束全部评分并进入复核</el-button>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { baseJudgeRole, judgingRoleLabel, judgingRoles, stageOf, type ScoringTask } from "@conference/shared";
import { judgingApi, slotLabel, taskStatus, type EventDetail, type Operate } from "../../services/judging";
const props = defineProps<{ event: EventDetail; operate: Operate }>();
const tasks = ref<ScoringTask[]>([]),
  sid = ref(""),
  keyword = ref(""),
  status = ref("");
let timer: ReturnType<typeof setInterval> | undefined;
const observed = ref<{ revision: number; phase: string; gates: Record<string, string> } | null>(null);
const state = computed(() =>
  observed.value && observed.value.revision >= props.event.revision ? observed.value : props.event
);
const operate: Operate = (action, data = {}) =>
  props.operate(action, { ...data, observedRevision: state.value.revision });
watch(
  () => props.event.id,
  () => {
    sid.value = "";
    observed.value = null;
    tasks.value = [];
  }
);
const current = computed(() => props.event.config.sessions.find((s) => s.id === sid.value)),
  room = computed(() => props.event.config.rooms.find((r) => r.id === current.value?.room));
const here = computed(() => tasks.value.filter((t) => t.session.id === sid.value));
const selected = computed(() =>
  here.value.filter(
    (t) => (!status.value || t.status === status.value) && (t.name + t.judgeId).includes(keyword.value)
  )
);
const stats = computed(() => {
  const roles = new Map(
    judgingRoles(props.event.config)
      .filter((r) => (stageOf(r.id) === "ted") === (current.value?.kind === "ted"))
      .map((r) => [r.id, r.label])
  );
  for (const task of here.value)
    roles.set(task.role, task.roleLabel ?? judgingRoleLabel(props.event.config, task.role));
  const ids = [...roles.keys()];
  return ids.map((role) => {
    const list = here.value.filter((t) => t.role === role);
    const base = baseJudgeRole(role);
    const quota = base === "lecturer" ? 1 : base === "expert" ? list.length : (room.value?.[base] ?? 0);
    return {
      label: roles.get(role),
      capacity:
        base !== "expert" && ids.some((id) => id !== role && baseJudgeRole(id) === base)
          ? "共用 " + quota
          : quota,
      assigned: list.length,
      present: list.filter((t) => t.present).length,
      received: list.filter((t) => t.receipt).length,
      valid: list.filter((t) => t.status === "valid").length
    };
  });
});
async function load(quiet = false) {
  const id = props.event.id;
  try {
    const data = await judgingApi.progress(id);
    if (id === props.event.id && data.revision >= (observed.value?.revision ?? 0)) {
      observed.value = data;
      tasks.value = data.tasks;
    }
  } catch (e) {
    if (!quiet) ElMessage.error((e as Error).message);
  }
}
watch(
  () => [props.event.id, props.event.revision],
  () => {
    if (!current.value) {
      const sessions = props.event.config.sessions;
      sid.value = sessions.find((s) => props.event.gates[s.id] === "open")?.id || sessions[0]?.id || "";
    }
    void load();
  },
  { immediate: true }
);
onMounted(() => {
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void load(true);
  }, 12000);
});
onBeforeUnmount(() => clearInterval(timer));
async function attendance(t: ScoringTask, kind: string) {
  try {
    let reason = "";
    if (kind !== "present")
      reason = (
        await ElMessageBox.prompt("请填写" + (kind === "absent" ? "缺评" : "允许补交") + "原因", t.name, {
          inputPattern: /\S/,
          inputErrorMessage: "请填写原因"
        })
      ).value;
    await operate("attendance", { session: sid.value, judge: t.judgeId, kind, reason });
  } catch {}
}
async function transition(action: string) {
  try {
    await ElMessageBox.confirm(
      action === "start" ? "将启用本届配置，开始按场次接收评分。" : "所有场次均须截止，随后进入内部复核。",
      "确认赛事阶段"
    );
    await operate(action);
  } catch {}
}
</script>
