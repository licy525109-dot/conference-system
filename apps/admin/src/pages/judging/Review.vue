<template>
  <div v-if="periods.length" class="j-tools">
    <el-radio-group v-model="view" aria-label="选择复核场别">
      <el-radio-button v-for="p in periods" :key="p" :value="p">{{ periodNames[p] }}复核</el-radio-button>
      <el-radio-button value="all">全天成绩</el-radio-button>
    </el-radio-group>
  </div>
  <div class="j-tools">
    <el-button @click="load">刷新内部成绩</el-button>
    <template v-if="canExport">
      <el-button @click="exportData('ballots')"
        >导出{{ view === "all" ? "原始" : periodNames[view] }}评分明细</el-button
      >
      <el-button v-if="view === 'all'" @click="exportData('review')">导出成绩复核对照表</el-button>
    </template>
  </div>
  <PeriodReviewPanel
    v-if="view !== 'all' && result"
    :period="view"
    :event="event"
    :result="result"
    :can-adjust="allowed('judging:adjust')"
    :operate="operate"
    @teacher="teacher = $event"
  />
  <el-table v-if="view === 'all'" :data="result?.rows || []" border max-height="530" @row-click="selectRow">
    <el-table-column prop="name" label="教师" fixed min-width="94" />
    <el-table-column v-for="x in columns" :key="x.key" :label="x.label" :min-width="x.width || 84">
      <template #default="{ row }">{{ score(row[x.key]) }}</template>
    </el-table-column>
    <el-table-column label="初排 / 最终" min-width="112">
      <template #default="{ row }">{{ row.initialRank || "待定" }} / {{ row.rank || "待处理" }}</template>
    </el-table-column>
    <el-table-column label="奖项预览" min-width="140">
      <template #default="{ row }">
        {{ row.originalAwards.join("、") || "待定" }} → {{ row.awards.join("、") || "待定" }}
      </template>
    </el-table-column>
    <el-table-column label="调分依据" min-width="170">
      <template #default="{ row }">
        {{ row.adjustment?.reason || "—" }} {{ row.adjustment?.recheck ? "· 需重新核对" : "" }}
      </template>
    </el-table-column>
    <el-table-column v-if="canEdit" fixed="right" width="130" label="复核">
      <template #default="{ row }">
        <el-button link type="primary" @click.stop="adjust(row)">调总分</el-button>
        <el-button v-if="row.tie.length" link @click.stop="tie(row)">同分裁定</el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-collapse v-if="result && view === 'all'" class="j-award-detail">
    <el-collapse-item :title="'优秀奖名单 · ' + result.merits.length + ' 人'" name="merits">
      <el-table :data="result.merits" max-height="300">
        <el-table-column prop="name" label="教师" />
        <el-table-column prop="org" label="机构" />
      </el-table>
    </el-collapse-item>
    <el-collapse-item :title="'教学示范校 · ' + result.schools.length + ' 所'" name="schools">
      <el-table :data="result.schools" max-height="280">
        <el-table-column prop="name" label="机构标准名称" />
      </el-table>
    </el-collapse-item>
  </el-collapse>
  <div class="j-tools">
    <el-select v-model="teacher" placeholder="选择教师查看原单" clearable filterable style="width: 220px">
      <el-option v-for="t in teachers" :key="t.id" :value="t.id" :label="t.name" />
    </el-select>
    <span>{{ filtered.length }} 份原单</span>
  </div>
  <el-table :data="filtered" max-height="300">
    <el-table-column label="场次" min-width="175"
      ><template #default="{ row }">{{
        sessionLabels.get(row.sessionKey) || row.sessionKey
      }}</template></el-table-column
    >
    <el-table-column label="评委">
      <template #default="{ row }">{{ judgeName(row.judgeKey) }}</template>
    </el-table-column>
    <el-table-column label="原始分">
      <template #default="{ row }">{{ row.units == null ? "待核" : row.units / 100 }}</template>
    </el-table-column>
    <el-table-column label="复核值">
      <template #default="{ row }">
        {{
          row.correction
            ? row.correction.units === null
              ? "无有效分"
              : row.correction.units / 100
            : "沿用原单"
        }}
      </template>
    </el-table-column>
    <el-table-column label="量表版本">
      <template #default="{ row }">V{{ row.rubric.version }}</template>
    </el-table-column>
    <el-table-column label="明细">
      <template #default="{ row }">
        <el-button link @click="openBallot(row)">查看{{ editableBallot(row) ? " / 更正" : "" }}</el-button>
      </template>
    </el-table-column>
  </el-table>
  <div v-if="view === 'all'" class="j-tools">
    <el-button
      v-if="allowed('judging:adjust') && event.phase === 'REVIEW'"
      :disabled="!allReviewed"
      type="primary"
      @click="action('send')"
    >
      将整份名单送交本人确认
    </el-button>
    <span v-if="event.phase === 'REVIEW' && !allReviewed" class="j-note"
      >各场评分复核完成后，可送交全天名单。</span
    >
    <el-button
      v-if="allowed('judging:confirm') && event.phase === 'SUBMITTED' && event.confirmerId === adminId"
      type="primary"
      @click="action('confirm')"
    >
      确认本版整份名单并锁定
    </el-button>
    <el-button v-if="allowed('judging:adjust') && event.phase === 'LOCKED'" @click="revision">
      建立修订版
    </el-button>
  </div>
  <el-collapse>
    <el-collapse-item title="调整与操作记录" name="log">
      <el-table :data="result?.log" max-height="340">
        <el-table-column label="时间" min-width="152">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column prop="edition" label="版本" width="70" />
        <el-table-column label="动作">
          <template #default="{ row }">{{ actions[row.action] || row.action }}</template>
        </el-table-column>
        <el-table-column prop="actor" label="经手账号" />
        <el-table-column label="记录">
          <template #default="{ row }">
            {{
              row.detail?.reason ||
              row.detail?.after?.reason ||
              row.detail?.teacher ||
              (row.detail?.period && periodNames[row.detail.period as JudgingPeriod]) ||
              row.detail?.session ||
              "—"
            }}
          </template>
        </el-table-column>
      </el-table>
    </el-collapse-item>
  </el-collapse>
  <el-dialog v-model="editing" title="组委会调整最终总分" width="min(480px,94vw)" append-to-body>
    <p>{{ chosen?.name }}　系统核算 {{ score(chosen?.system) }}　当前最终 {{ score(chosen?.total) }}</p>
    <el-form label-position="top">
      <el-form-item label="调整后的百分制总分">
        <el-input-number
          v-model="value"
          :min="0"
          :max="100"
          :precision="event.config.scoringPlan === 'withQualifiers' ? 4 : 2"
        />
      </el-form-item>
      <el-form-item label="调整或重新核对的原因"><el-input v-model="reason" type="textarea" /></el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :disabled="!reason.trim()" @click="commitAdjust">保存并重排</el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="ballotOpen" title="原始评分单" width="min(600px,94vw)" append-to-body>
    <template v-if="ballot">
      <p>{{ judgeName(ballot.judgeKey) }} · {{ ballot.rubric.title }} V{{ ballot.rubric.version }}</p>
      <div v-for="f in ballot.rubric.fields" :key="f.id" class="j-question">
        <strong>{{ f.label }}</strong>
        　原填 {{ showAnswer(ballot.answers[f.id]) }}　现用
        {{ showAnswer((ballot.correction?.answers || ballot.answers)[f.id]) }}
        <div v-if="editableBallot(ballot)">
          <el-input-number
            v-if="editAnswers[f.id] !== 'unseen'"
            :model-value="numberAnswer(f.id)"
            :min="f.min"
            :max="f.max"
            :step="f.step"
            @update:model-value="editAnswers[f.id] = $event ?? null"
          />
          <el-button
            v-if="f.unseen !== 'forbid'"
            link
            @click="editAnswers[f.id] = editAnswers[f.id] === 'unseen' ? null : 'unseen'"
          >
            {{ editAnswers[f.id] === "unseen" ? "移除未观察" : "标记未观察" }}
          </el-button>
        </div>
      </div>
      <p v-if="ballot.rubric.feedbackPrompt">
        <strong>{{ ballot.rubric.feedbackPrompt }}</strong
        ><br />{{ ballot.answers[feedbackKey] || "未填写" }}
      </p>
      <template v-if="editableBallot(ballot)">
        <el-checkbox v-model="voided">将本单列为无效</el-checkbox>
        <el-input v-model="reason" type="textarea" placeholder="更正或作废原因" />
      </template>
    </template>
    <template #footer>
      <el-button @click="ballotOpen = false">关闭</el-button>
      <el-button
        v-if="ballot && editableBallot(ballot)"
        type="primary"
        :disabled="!reason.trim()"
        @click="commitBallot"
      >
        保存更正记录
      </el-button>
    </template>
  </el-dialog>
  <el-dialog v-model="tied" title="全同分裁定" width="min(530px,94vw)" append-to-body>
    <p>依复赛原分或组委会留存的复赛依据排序。</p>
    <div v-for="(id, i) in tieIds" :key="id" class="j-tools">
      {{ i + 1 }} · {{ event.config.teachers.find((t) => t.id === id)?.name }}　复赛
      {{ result?.rows.find((r) => r.id === id)?.prior ?? "未录入" }}
      <el-button link :disabled="!i" @click="tieIds.splice(i - 1, 0, tieIds.splice(i, 1)[0])">上移</el-button>
    </div>
    <el-input v-model="reason" type="textarea" placeholder="复赛裁定依据" />
    <template #footer>
      <el-button type="primary" :disabled="!reason.trim()" @click="commitTie">保存裁定</el-button>
    </template>
  </el-dialog>
</template>
<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import {
  judgingRoleLabel,
  feedbackKey,
  stageCaps,
  periodNames,
  periodStatus,
  scheduledPeriods,
  sessionPeriod,
  type Answers,
  type ScoringRow,
  type JudgeRole,
  type JudgingPeriod
} from "@conference/shared";
import PeriodReviewPanel from "./PeriodReviewPanel.vue";
import {
  judgingApi,
  downloadJudgingBook,
  phaseNames,
  slotLabel,
  type EventDetail,
  type Operate,
  type ReviewData,
  type ReviewBallot
} from "../../services/judging";
const props = defineProps<{
  event: EventDetail;
  operate: Operate;
  allowed: (s: string) => boolean;
  adminId: string;
  initialPeriod?: JudgingPeriod;
}>();
const periods = computed(() => scheduledPeriods(props.event.config.sessions));
const view = ref<"all" | JudgingPeriod>(
  props.initialPeriod ??
    periods.value.find(
      (p) => periodStatus(props.event.phase, props.event.periodReviews?.[p]) === "reviewing"
    ) ??
    "all"
);
const sessions = computed(() => new Map(props.event.config.sessions.map((s) => [s.id, s])));
const sessionLabels = computed(
  () => new Map(props.event.config.sessions.map((s) => [s.id, slotLabel(s, props.event.config)]))
);
const scopeSessions = computed(() =>
  props.event.config.sessions.filter((s) => view.value === "all" || sessionPeriod(s) === view.value)
);
const teachers = computed(() => {
  const ids = new Set(scopeSessions.value.map((s) => s.teacher));
  return props.event.config.teachers.filter((t) => view.value === "all" || ids.has(t.id));
});
const result = ref<ReviewData | null>(null),
  teacher = ref(""),
  chosen = ref<ScoringRow>(),
  value = ref(0),
  reason = ref(""),
  editing = ref(false),
  tied = ref(false),
  tieIds = ref<string[]>([]),
  ballot = ref<ReviewBallot>(),
  ballotOpen = ref(false),
  editAnswers = ref<Answers>({}),
  voided = ref(false);
const editRevision = ref<{ period: JudgingPeriod; periodVersion?: number; observedRevision: number }>();
const allReviewed = computed(() =>
  periods.value.every((p) => result.value?.periodReviews?.[p]?.status === "confirmed")
);
watch(view, () => {
  teacher.value = "";
  ballotOpen.value = false;
});
const caps = computed(() => stageCaps(props.event.config.scoringPlan));
const columns = computed(() => [
  ...(props.event.config.scoringPlan === "withQualifiers"
    ? [{ key: "qualifying", label: "初复赛折合 /10", width: 125 }]
    : []),
  { key: "professional", label: "专业 /40" },
  { key: "audience", label: "大众 /" + caps.value.audience },
  { key: "morning", label: "课堂 /" + (caps.value.professional + caps.value.audience) },
  { key: "ted", label: "TED /30" },
  { key: "system", label: "系统核算", width: 98 },
  { key: "total", label: "最终总分", width: 98 }
]);
const actions: Record<string, string> = {
  access: "人员授权",
  config: "保存配置",
  appearance: "手机页面",
  forms: "启用新版评分表",
  "entry-open": "发布评委评分入口",
  "entry-close": "停用评委评分入口",
  "rehearsal-seed": "导入模拟原单",
  "rehearsal-submit": "模拟席位交分",
  handover: "补录颁奖与复赛资料",
  start: "开始评分",
  gate: "场次开关",
  attendance: "出勤或补交",
  finish: "截止收分",
  "period-close": "结束分场评分",
  "period-resume": "恢复分场收分",
  "period-approve": "完成分场复核",
  "period-reopen": "重新复核",
  adjust: "调整总分",
  correction: "更正原单",
  tie: "同分裁定",
  send: "送审",
  confirm: "本人确认",
  revise: "建立修订版",
  publish: "正式公布",
  "export-awards": "导出颁奖名单",
  "export-ballots": "导出原单",
  "export-review": "导出复核对照"
};
const canExport = computed(() => props.allowed("judging:export")),
  canEdit = computed(
    () => props.allowed("judging:adjust") && ["REVIEW", "SUBMITTED"].includes(props.event.phase)
  );
const filtered = computed(() => {
  const ids = new Set(scopeSessions.value.map((s) => s.id));
  return (result.value?.ballots || []).filter(
    (b) => ids.has(b.sessionKey) && (!teacher.value || b.teacherKey === teacher.value)
  );
});
function editableBallot(b: ReviewBallot) {
  const s = sessions.value.get(b.sessionKey),
    data = result.value;
  if (!s || !data || !props.allowed("judging:adjust")) return false;
  const status = periodStatus(data.phase, data.periodReviews?.[sessionPeriod(s)]);
  return status === "reviewing" || (data.phase === "SUBMITTED" && status === "historical");
}
const score = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(props.event.config.display));
const judgeName = (id: string) => props.event.config.judges.find((j) => j.id === id)?.name || id;
const selectRow = (r: ScoringRow) => {
  teacher.value = r.id;
};
async function load() {
  const id = props.event.id;
  try {
    const r = await judgingApi.results(id);
    if (id === props.event.id && (!result.value || r.revision >= result.value.revision)) result.value = r;
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
watch(() => [props.event.id, props.event.revision], load, { immediate: true });
function adjust(r: ScoringRow) {
  chosen.value = r;
  value.value = r.total ?? 0;
  reason.value = "";
  editing.value = true;
}
const act: Operate = (action, data = {}) =>
  props.operate(action, { ...data, observedRevision: result.value?.revision });
async function commitAdjust() {
  if (await act("adjust", { teacher: chosen.value?.id, value: value.value, reason: reason.value }))
    editing.value = false;
}
function tie(r: ScoringRow) {
  tieIds.value = [...r.tie];
  reason.value = "";
  tied.value = true;
}
async function commitTie() {
  if (await act("tie", { ids: tieIds.value, reason: reason.value })) tied.value = false;
}
function openBallot(b: ReviewBallot) {
  const s = sessions.value.get(b.sessionKey);
  if (!s || !result.value) return;
  const period = sessionPeriod(s);
  editRevision.value = {
    period,
    periodVersion: result.value.periodReviews?.[period]?.version,
    observedRevision: result.value.revision
  };
  ballot.value = b;
  editAnswers.value = { ...(b.correction?.answers || b.answers) };
  reason.value = "";
  voided.value = false;
  ballotOpen.value = true;
}
const numberAnswer = (key: string) =>
  typeof editAnswers.value[key] === "number" ? Number(editAnswers.value[key]) : undefined;
const showAnswer = (v: unknown) => (v == null ? "空白" : v === "unseen" ? "未观察" : v);
async function commitBallot() {
  if (
    await props.operate("correction", {
      ...editRevision.value,
      ballotId: ballot.value?.id,
      answers: editAnswers.value,
      void: voided.value,
      reason: reason.value
    })
  )
    ballotOpen.value = false;
}
async function action(name: string) {
  try {
    await ElMessageBox.confirm(
      name === "send"
        ? "送审整份排名与奖项？"
        : "确认当前展示版本的系统分、最终分、调分原因、排名和奖项，并锁定整份名单？",
      "名单确认"
    );
    await act(name, { reviewedRevision: result.value?.revision });
  } catch {}
}
async function revision() {
  try {
    const r = await ElMessageBox.prompt("请输入修订原因", "保留旧版并建立新版本", { inputPattern: /\S/ });
    await act("revise", { reason: r.value });
  } catch {}
}
async function exportData(kind: string) {
  try {
    const selected = view.value;
    const sessionIds = new Set(scopeSessions.value.map((s) => s.id));
    const r = await judgingApi.export(props.event.id, kind, props.event.edition);
    const rows =
      kind === "ballots"
        ? r
            .filter((b: ReviewBallot) => selected === "all" || sessionIds.has(b.sessionKey))
            .map((b: any) => ({
              教师: b.teacherName,
              场别: periodNames[sessionPeriod(sessions.value.get(b.sessionKey)!)],
              场次: b.sessionKey,
              评委: b.judgeName,
              席别: b.roleLabel ?? judgingRoleLabel(props.event.config, b.role as JudgeRole),
              量表版本: b.rubric.version,
              评分细则: b.rubric,
              提交时间: b.createdAt,
              原始逐项: b.answers,
              ...(b.rubric.feedbackPrompt && { 选填反馈: b.answers[feedbackKey] ?? "" }),
              原始分: b.units === null ? null : b.units / 100,
              原始状态: b.status,
              更正单: b.correction
            }))
        : r.rows.map((s: ScoringRow) => ({
            教师: s.name,
            机构: s.org,
            ...(props.event.config.scoringPlan === "withQualifiers" && {
              初赛原分: s.preliminaryScore,
              复赛原分: s.prior,
              初复赛折合分: s.qualifying
            }),
            专业: s.professional,
            大众: s.audience,
            TED: s.ted,
            有效份数: s.counts,
            课堂合计: s.morning,
            系统核算: s.system,
            拟定或确认总分: s.total,
            初排名: s.initialRank,
            最终排名: s.rank,
            奖项: s.awards.join("、"),
            调整原因: s.adjustment?.reason,
            经手人: s.adjustment?.actor,
            版本: r.edition,
            状态: phaseNames[r.phase]
          }));
    await downloadJudgingBook(
      props.event.title +
        (selected === "all" ? "" : "-" + periodNames[selected]) +
        (kind === "ballots" ? "-原始评分明细" : "-成绩复核对照"),
      [{ name: "内部复核", rows }]
    );
  } catch (e) {
    ElMessage.error((e as Error).message);
  }
}
</script>
