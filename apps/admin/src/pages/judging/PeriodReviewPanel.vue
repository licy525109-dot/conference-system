<template>
  <section class="period-review">
    <div class="j-statusline">
      <h3>{{ periodNames[period] }}评分复核</h3>
      <el-tag :type="status === 'confirmed' ? 'success' : 'info'">{{
        periodProgressLabel(result.phase, review, sessions, result.gates || event.gates)
      }}</el-tag>
      <span>{{ received }} / {{ tasks.length }} 份已交 · {{ pending.length }} 项待处理</span>
      <el-button
        v-if="canAdjust && status === 'reviewing'"
        type="primary"
        :disabled="pending.length > 0"
        @click="approve"
        >完成{{ periodNames[period] }}复核</el-button
      >
      <el-button
        v-if="canAdjust && status === 'confirmed' && ['LIVE', 'REVIEW', 'SUBMITTED'].includes(result.phase)"
        @click="reopen"
        >重新复核{{ periodNames[period] }}</el-button
      >
    </div>
    <p v-if="review?.confirmedAt" class="j-note">
      {{ review.confirmedBy }} 于 {{ new Date(review.confirmedAt).toLocaleString() }} 完成复核。
    </p>
    <p v-else-if="status === 'scoring'" class="j-note">场控在「现场收分」结束本场评分后，即可复核。</p>
    <el-table :data="rows" border max-height="390" @row-click="selectTeacher">
      <el-table-column prop="name" label="选手" min-width="100" />
      <el-table-column prop="place" label="教室 / 出场顺序" min-width="155" />
      <el-table-column prop="received" label="已交 / 应交" width="110" />
      <el-table-column prop="valid" label="有效份数" width="90" />
      <el-table-column v-if="hasClass" prop="professional" label="专业 /40" />
      <el-table-column v-if="hasClass" prop="audience" label="大众 /30" />
      <el-table-column v-if="hasClass" prop="classScore" label="课堂 /70" />
      <el-table-column v-if="hasTed" prop="ted" label="TED /30" />
      <el-table-column width="120" label="原单">
        <template #default="{ row }"
          ><el-button link type="primary" @click.stop="emit('teacher', row.id)"
            >查看评分单</el-button
          ></template
        >
      </el-table-column>
    </el-table>
    <el-collapse v-if="pending.length">
      <el-collapse-item :title="'待处理明细（' + pending.length + '）'" name="pending">
        <p class="j-note">待核原单可在下方更正。待交和待补交请场控在「现场收分」联系评委，或登记缺评原因。</p>
        <el-table :data="pending" max-height="260">
          <el-table-column label="选手"
            ><template #default="{ row }">{{
              names.get(sessionById.get(row.sessionId)?.teacher || "")
            }}</template></el-table-column
          >
          <el-table-column prop="name" label="评委" />
          <el-table-column prop="roleLabel" label="席别" />
          <el-table-column label="状态"
            ><template #default="{ row }">{{ taskStatus[row.status] }}</template></el-table-column
          >
        </el-table>
      </el-collapse-item>
    </el-collapse>
  </section>
</template>
<script setup lang="ts">
import { computed } from "vue";
import { ElMessageBox } from "element-plus";
import {
  needsScoreReview,
  periodNames,
  periodStatus,
  periodProgressLabel,
  sessionPeriod,
  type JudgingPeriod
} from "@conference/shared";
import { taskStatus, type EventDetail, type Operate, type ReviewData } from "../../services/judging";
const props = defineProps<{
  period: JudgingPeriod;
  event: EventDetail;
  result: ReviewData;
  canAdjust: boolean;
  operate: Operate;
}>();
const emit = defineEmits<{ teacher: [id: string] }>();
const selectTeacher = (row: { id: string }) => emit("teacher", row.id);
const review = computed(() => props.result.periodReviews?.[props.period]);
const status = computed(() => periodStatus(props.result.phase, review.value));
const sessions = computed(() => props.event.config.sessions.filter((s) => sessionPeriod(s) === props.period));
const sessionById = computed(() => new Map(sessions.value.map((s) => [s.id, s])));
const names = computed(() => new Map(props.event.config.teachers.map((t) => [t.id, t.name])));
const tasks = computed(() =>
  (props.result.periodTasks || []).filter((t) => sessionById.value.has(t.sessionId))
);
const received = computed(() => tasks.value.filter((t) => t.receipt).length);
const pending = computed(() => tasks.value.filter((t) => needsScoreReview(t.status)));
const hasClass = computed(() => sessions.value.some((s) => s.kind === "class"));
const hasTed = computed(() => sessions.value.some((s) => s.kind === "ted"));
const score = (n: number | null | undefined) => (n == null ? "—" : n.toFixed(props.event.config.display));
const rows = computed(() => {
  const scores = new Map(props.result.rows.map((r) => [r.id, r]));
  const counts = new Map(sessions.value.map((s) => [s.id, { received: 0, expected: 0, valid: 0 }]));
  for (const task of tasks.value) {
    const count = counts.get(task.sessionId)!;
    count.expected++;
    if (task.receipt) count.received++;
    if (task.status === "valid") count.valid++;
  }
  return sessions.value.map((s) => {
    const r = scores.get(s.teacher),
      c = counts.get(s.id)!,
      classroom = s.kind === "class";
    const place = classroom
      ? (props.event.config.rooms.find((room) => room.id === s.room)?.name || s.room) +
        " · 第 " +
        s.round +
        " 轮"
      : "TED 第 " + s.round + " 位";
    return {
      id: s.teacher,
      name: names.value.get(s.teacher),
      place,
      received: c.received + " / " + c.expected,
      valid: c.valid,
      professional: score(classroom ? r?.professional : null),
      audience: score(classroom ? r?.audience : null),
      classScore: score(classroom ? r?.morning : null),
      ted: score(classroom ? null : r?.ted)
    };
  });
});
async function approve() {
  const p = props.period,
    version = review.value?.version,
    revision = props.result.revision;
  try {
    await ElMessageBox.confirm(
      "确认已核对" + periodNames[p] + "的有效份数和评分原单？",
      "完成" + periodNames[p] + "复核",
      { confirmButtonText: "确认完成复核", cancelButtonText: "返回核对" }
    );
    await props.operate("period-approve", { period: p, periodVersion: version, observedRevision: revision });
  } catch {}
}
async function reopen() {
  const p = props.period,
    version = review.value?.version,
    revision = props.result.revision;
  try {
    const r = await ElMessageBox.prompt(
      "填写原因后可更正本场评分单。更正后需再次完成本场复核。",
      "重新复核" + periodNames[p],
      {
        inputPattern: /\S/,
        inputErrorMessage: "请填写原因",
        confirmButtonText: "重新复核",
        cancelButtonText: "取消"
      }
    );
    await props.operate("period-reopen", {
      period: p,
      periodVersion: version,
      observedRevision: revision,
      reason: r.value
    });
  } catch {}
}
</script>
