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
    <el-button v-if="current" @click="showCode">独立评分码</el-button>
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
        <template #default="{ row }">{{ roleLabels[row.role as JudgeRole] }}</template>
      </el-table-column>
      <el-table-column label="状态">
        <template #default="{ row }">{{ taskStatus[row.status] }} {{ row.present ? "· 已到" : "" }}</template>
      </el-table-column>
      <el-table-column prop="reason" label="现场记录" />
      <el-table-column v-if="event.rehearsal" label="模拟席位" width="108">
        <template #default="{ row }">
          <a v-if="row.canRehearse" :href="practiceLink(row)" target="_blank" rel="noopener noreferrer">
            打开评分页
          </a>
        </template>
      </el-table-column>
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
  <el-empty v-else description="配置名单和场次后即可生成独立评分码" />
  <div class="j-tools">
    <el-button v-if="state.phase === 'SETUP'" type="primary" @click="transition('start')">
      开始现场评分
    </el-button>
    <el-button v-if="state.phase === 'LIVE'" @click="transition('finish')">结束全部评分并进入复核</el-button>
  </div>
  <el-dialog v-model="qrOpen" title="独立评分码" width="min(440px,94vw)" append-to-body>
    <p>{{ current && slotLabel(current, event.config) }}</p>
    <img v-if="qr" :src="qr" alt="本场独立评分二维码" width="220" height="220" />
    <p v-if="qrError">{{ qrError }}</p>
    <p>{{ event.rehearsal ? "体验版" : "正式版" }}小程序页面路径</p>
    <el-input :model-value="miniPath" readonly />
    <p v-if="qr">仅实名名单中获分配的评委可以交分。此码自生成起有效 28 天。</p>
    <el-button v-if="qr" @click="download">下载二维码</el-button>
  </el-dialog>
</template>
<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { judgeRoles, roleLabels, type JudgeRole, type ScoringTask } from "@conference/shared";
import { judgingApi, slotLabel, taskStatus, type EventDetail, type Operate } from "../../services/judging";
import QRCode from "qrcode";
const props = defineProps<{ event: EventDetail; operate: Operate }>();
const tasks = ref<ScoringTask[]>([]),
  sid = ref(""),
  keyword = ref(""),
  status = ref(""),
  qr = ref(""),
  qrError = ref(""),
  qrOpen = ref(false),
  miniPath = ref("");
function practiceLink(t: ScoringTask) {
  const origin = import.meta.env.DEV
    ? import.meta.env.VITE_JUDGING_H5_ORIGIN || "http://localhost:5173"
    : "https://m.guanchaohuiji.com";
  const params = new URLSearchParams({ event: props.event.id, session: t.session.id, practice: t.judgeId });
  return origin + "/#/pages/judging/score?" + params.toString();
}
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
const stats = computed(() =>
  judgeRoles
    .filter((r) => (current.value?.kind === "ted" ? r === "expert" : r !== "expert"))
    .map((role) => {
      const list = here.value.filter((t) => t.role === role);
      return {
        label: roleLabels[role],
        capacity: role === "lecturer" ? 1 : role === "expert" ? list.length : (room.value?.[role] ?? 0),
        assigned: list.length,
        present: list.filter((t) => t.present).length,
        received: list.filter((t) => t.receipt).length,
        valid: list.filter((t) => t.status === "valid").length
      };
    })
);
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
    if (!current.value) sid.value = props.event.config.sessions[0]?.id || "";
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
async function showCode() {
  const id = props.event.id,
    s = sid.value;
  qr.value = "";
  qrError.value = "正在生成评分码…";
  miniPath.value = "pages/judging/score?event=" + id + "&session=" + s;
  qrOpen.value = true;
  try {
    const value = await judgingApi.link(id, s);
    if (s !== sid.value) return;
    qr.value = await QRCode.toDataURL(value.url, { width: 540, margin: 3 });
    qrError.value = "";
  } catch (e) {
    qrError.value = (e as Error).message;
  }
}
function download() {
  const a = document.createElement("a");
  a.href = qr.value;
  a.download = sid.value + "-评分码.png";
  a.click();
}
</script>
