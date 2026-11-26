<template>
  <div v-if="['LIVE', 'REVIEW'].includes(state.phase)" class="j-periods">
    <div v-for="p in periods" :key="p" class="j-period-row">
      <strong>{{ periodNames[p] }}</strong>
      <span>{{ periodCounts[p].received }} / {{ periodCounts[p].assigned }} 份已交</span>
      <el-tag :type="statusOf(p) === 'confirmed' ? 'success' : 'info'">{{ labelOf(p) }}</el-tag>
      <el-button
        v-if="statusOf(p) === 'scoring'"
        :disabled="!observed || observed.revision < event.revision"
        @click="close(p)"
        >结束{{ periodNames[p] }}评分</el-button
      >
      <el-button v-else-if="canReview" @click="emit('review', p)">查看{{ periodNames[p] }}复核</el-button>
      <el-button v-if="state.periodReviews?.[p]?.status === 'reviewing'" link @click="resume(p)"
        >恢复收分</el-button
      >
    </div>
  </div>
  <div v-for="{ p, sessions, label } in tedGroups" :key="p" class="j-statusline">
    <strong>TED 专家评审</strong>
    <span
      >{{ sessions.filter((s) => state.gates[s.id] === "open").length }} /
      {{ sessions.length }} 位选手开放中</span
    >
    <el-button
      :disabled="sessions.every((s) => state.gates[s.id] === 'open')"
      @click="groupGate(sessions[0], true)"
      >开放{{ label }} TED</el-button
    >
    <el-button
      :disabled="sessions.every((s) => state.gates[s.id] === 'closed')"
      @click="groupGate(sessions[0], false)"
      >截止{{ label }} TED</el-button
    >
  </div>
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
      <template v-if="room && collecting">
        <el-switch
          :model-value="allRounds"
          :aria-label="room.name + '全部轮次评审'"
          active-text="全部轮次评审"
          @change="setMode($event === true)"
        />
        <template v-if="allRounds">
          <el-button
            :disabled="roomSessions.every((s) => state.gates[s.id] === 'open')"
            @click="groupGate(current, true)"
            >开放本教室全部轮次</el-button
          >
          <el-button
            :disabled="roomSessions.every((s) => state.gates[s.id] === 'closed')"
            @click="groupGate(current, false)"
            >截止本教室全部轮次</el-button
          >
        </template>
      </template>
      <el-button
        v-if="collecting && room && !allRounds"
        type="primary"
        @click="operate('gate', { session: sid, open: state.gates[sid] !== 'open' })"
      >
        {{ state.gates[sid] === "open" ? "截止本场" : "开放本场" }}
      </el-button>
      <el-button
        v-if="collecting && room && !allRounds && !state.gates[sid]"
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
      <el-table-column
        v-if="['LIVE', 'REVIEW'].includes(state.phase) && statusOf(sessionPeriod(current)) !== 'confirmed'"
        width="200"
        label="现场操作"
      >
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
    <el-button v-if="state.phase === 'SETUP'" type="primary" @click="start"> 开始现场评分 </el-button>
  </div>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  baseJudgeRole,
  judgingRoleLabel,
  judgingRoles,
  periodNames,
  periodStatus,
  periodProgressLabel,
  sessionPeriod,
  scheduledPeriods,
  type JudgingPeriod,
  type PeriodReviews,
  type RoomPeriodModes,
  stageOf,
  type JudgingSession,
  type ScoringTask
} from "@conference/shared";
import { judgingApi, slotLabel, taskStatus, type EventDetail, type Operate } from "../../services/judging";
const props = defineProps<{ event: EventDetail; operate: Operate; canReview: boolean }>();
const emit = defineEmits<{ review: [period: JudgingPeriod] }>();
const tasks = ref<ScoringTask[]>([]),
  sid = ref(""),
  keyword = ref(""),
  status = ref("");
let timer: ReturnType<typeof setInterval> | undefined;
const observed = ref<{
  revision: number;
  phase: string;
  gates: Record<string, string>;
  allRoundRooms?: string[];
  periodReviews?: PeriodReviews;
  roomPeriodModes?: RoomPeriodModes;
} | null>(null);
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
const periods = computed(() => scheduledPeriods(props.event.config.sessions));
const statusOf = (p: JudgingPeriod) => periodStatus(state.value.phase, state.value.periodReviews?.[p]);
const labelOf = (p: JudgingPeriod) =>
  periodProgressLabel(
    state.value.phase,
    state.value.periodReviews?.[p],
    props.event.config.sessions.filter((s) => sessionPeriod(s) === p),
    state.value.gates
  );
const collecting = computed(
  () => current.value && state.value.phase === "LIVE" && statusOf(sessionPeriod(current.value)) === "scoring"
);
const tedGroups = computed(() => {
  const groups = periods.value
    .map((p) => ({
      p,
      sessions: props.event.config.sessions.filter((s) => s.kind === "ted" && sessionPeriod(s) === p)
    }))
    .filter((g) => g.sessions.length);
  return groups
    .filter((g) => state.value.phase === "LIVE" && statusOf(g.p) === "scoring")
    .map((g) => ({ ...g, label: groups.length === 1 ? "全部" : periodNames[g.p] }));
});
const periodCounts = computed(() => {
  const counts = { am: { assigned: 0, received: 0 }, pm: { assigned: 0, received: 0 } };
  for (const task of tasks.value) {
    const count = counts[sessionPeriod(task.session)];
    count.assigned++;
    if (task.receipt) count.received++;
  }
  return counts;
});
const roomSessions = computed(() =>
  props.event.config.sessions.filter(
    (s) =>
      s.kind === "class" &&
      s.room === room.value?.id &&
      current.value &&
      sessionPeriod(s) === sessionPeriod(current.value)
  )
);
const allRounds = computed(() => {
  if (!room.value || !current.value) return false;
  const override = state.value.roomPeriodModes?.[sessionPeriod(current.value)]?.[room.value.id];
  if (override !== undefined) return override;
  const latest = observed.value;
  return latest && latest.revision >= props.event.revision && latest.allRoundRooms
    ? latest.allRoundRooms.includes(room.value.id)
    : !!room.value.allRoundsOpen;
});
async function setMode(allRoundsOpen: boolean) {
  const s = current.value,
    selected = room.value;
  if (!s || !selected || allRoundsOpen === allRounds.value) return;
  const message = allRoundsOpen
    ? "将开放「" + selected.name + "」的所有已排选手，评委可自行选择评分顺序。"
    : "将恢复逐轮开放并截止本教室其他正在评分的轮次。当前场次保留现有状态。";
  try {
    await ElMessageBox.confirm(message, "调整教室开放方式");
  } catch {
    return;
  }
  await operate("room-mode", { session: s.id, allRoundsOpen });
}
async function groupGate(s: JudgingSession, open: boolean) {
  const name =
    periodNames[sessionPeriod(s)] +
    (s.kind === "ted" ? "所有 TED 选手" : (room.value?.name || "本教室") + "的全部轮次");
  try {
    await ElMessageBox.confirm("确定" + (open ? "开放" : "截止") + name + "的评分？", "批量调整评分");
  } catch {
    return;
  }
  await operate("gate", { session: s.id, scope: "group", open });
}
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
async function close(p: JudgingPeriod) {
  try {
    const count = periodCounts.value[p];
    await ElMessageBox.confirm(
      periodNames[p] +
        "已收到 " +
        count.received +
        " / " +
        count.assigned +
        " 份评分单。结束后关闭本场收分，交组委会复核。",
      "结束" + periodNames[p] + "评分",
      { confirmButtonText: "结束并进入复核", cancelButtonText: "取消" }
    );
    await operate("period-close", { period: p });
  } catch {}
}
async function resume(p: JudgingPeriod) {
  const version = state.value.periodReviews?.[p]?.version;
  try {
    const r = await ElMessageBox.prompt(
      "填写原因后，可在本场重新开放教室或 TED 评分。",
      "恢复" + periodNames[p] + "收分",
      {
        inputPattern: /\S/,
        inputErrorMessage: "请填写原因",
        confirmButtonText: "恢复收分",
        cancelButtonText: "取消"
      }
    );
    await operate("period-resume", { period: p, periodVersion: version, reason: r.value });
  } catch {}
}
async function start() {
  try {
    await ElMessageBox.confirm("将启用本届配置，开始按场次接收评分。", "确认赛事阶段");
    await operate("start");
  } catch {}
}
</script>
<style scoped>
.j-periods {
  display: grid;
  gap: 8px;
  margin: 12px 0 18px;
}
.j-period-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 10px 14px;
  border: 1px solid #d9e1dc;
  border-radius: 8px;
}
.j-period-row .el-button {
  margin-left: auto;
}
</style>
