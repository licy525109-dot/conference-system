import {
  assigned,
  awardLabels,
  judgingRoleLabel,
  roleForSession,
  stageOf,
  stages,
  taskKey
} from "@conference/shared";
import type {
  JudgeRole,
  JudgingConfig,
  JudgingControl,
  ScoringRow,
  ScoringTask,
  Stage,
  AwardField
} from "@conference/shared";
export interface BallotRecord {
  id: string;
  sessionKey: string;
  judgeKey: string;
  teacherKey: string;
  role: string;
  units: number | null;
  status: string;
  createdAt: Date;
}
type Ratio = [bigint, bigint];
const zero: Ratio = [0n, 1n];
const add = (a: Ratio, b: Ratio): Ratio => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
const asNumber = (v: Ratio) => Number(v[0]) / Number(v[1]);
function rounded(v: Ratio, digits: number) {
  return (v[0] * 10n ** BigInt(digits) * 2n + v[1]) / (2n * v[1]);
}
export function scoringTasks(
  c: JudgingConfig,
  state: JudgingControl,
  ballots: Pick<BallotRecord, "id" | "sessionKey" | "judgeKey" | "status">[]
): ScoringTask[] {
  const byTask = new Map(ballots.map((b) => [taskKey(b.sessionKey, b.judgeKey), b]));
  return c.sessions.flatMap((session) =>
    c.judges
      .filter((j) => assigned(session, j))
      .map((j) => {
        const key = taskKey(session.id, j.id),
          b = byTask.get(key),
          exception = state.exceptions[key],
          frozen = state.sessionForms[session.id],
          role = roleForSession(frozen, j);
        return {
          session,
          judgeId: j.id,
          name: j.name,
          role,
          roleLabel: judgingRoleLabel(frozen ?? c, role),
          present: Boolean(b || state.present?.[key]),
          status: b ? (state.corrections[b.id]?.status ?? b.status) : (exception?.kind ?? "waiting"),
          receipt: b?.id,
          reason: exception?.reason
        };
      })
  );
}
const stageCounts = (): Record<Stage, number> => ({ professional: 0, audience: 0, ted: 0 });
export function calculate(c: JudgingConfig, control: JudgingControl, ballots: BallotRecord[]): ScoringRow[] {
  const data = new Map(c.teachers.map((t) => [t.id, { counts: stageCounts(), sums: stageCounts() }]));
  for (const b of ballots) {
    const found = data.get(b.teacherKey),
      fix = control.corrections[b.id],
      units = fix ? fix.units : b.units;
    if (!found || units === null || (fix ? fix.status : b.status) !== "valid") continue;
    const stage = stageOf(b.role as JudgeRole);
    found.counts[stage]++;
    found.sums[stage] += units;
  }
  const ranked = c.teachers.map((t) => {
    const { counts, sums } = data.get(t.id)!;
    const ratio = (s: Stage): Ratio => (counts[s] ? [BigInt(sums[s]), BigInt(counts[s]) * 100n] : zero);
    const val = (s: Stage) => (counts[s] >= c.minimum[s] ? asNumber(ratio(s)) : null);
    const p = val("professional"),
      d = val("audience"),
      ted = val("ted"),
      morning = p !== null && d !== null ? asNumber(add(ratio("professional"), ratio("audience"))) : null;
    const ready = morning !== null && ted !== null,
      systemRatio = stages.reduce((a, s) => add(a, ratio(s)), zero);
    const system = ready ? asNumber(systemRatio) : null,
      adjustment = control.adjustments[t.id] ?? null;
    const totalRatio: Ratio = adjustment ? [BigInt(Math.round(adjustment.value * 100)), 100n] : systemRatio;
    const parts = [ratio("professional"), ratio("ted"), ratio("audience")].map((v) =>
      rounded(v, c.precision)
    );
    const row: ScoringRow = {
      id: t.id,
      name: t.name,
      orgId: t.orgId,
      org: t.org,
      prior: t.prior,
      qualifierRank: t.qualifierRank,
      counts,
      sums,
      professional: p,
      audience: d,
      ted,
      morning,
      system,
      total: ready ? asNumber(totalRatio) : null,
      initialRank: null,
      rank: null,
      awards: [],
      originalAwards: [],
      tie: [],
      adjustment
    };
    return {
      row,
      ready,
      initial: [rounded(systemRatio, c.precision), ...parts],
      final: [rounded(totalRatio, c.precision), ...parts]
    };
  });
  for (const mode of ["initial", "final"] as const) {
    const eligible = ranked
      .filter((e) => e.ready)
      .sort((a, b) => {
        for (let k = 0; k < a[mode].length; k++) {
          if (a[mode][k] !== b[mode][k]) return a[mode][k] > b[mode][k] ? -1 : 1;
        }
        return a.row.id.localeCompare(b.row.id);
      });
    for (let i = 0; i < eligible.length;) {
      let end = i + 1;
      while (end < eligible.length && eligible[i][mode].every((v, k) => v === eligible[end][mode][k])) end++;
      const group = eligible.slice(i, end),
        ids = group.map((e) => e.row.id);
      const order =
        mode === "final"
          ? control.ties.find((t) => t.ids.length === ids.length && ids.every((id) => t.ids.includes(id)))
          : undefined;
      if (order) group.sort((a, b) => order.ids.indexOf(a.row.id) - order.ids.indexOf(b.row.id));
      group.forEach(({ row }, n) => {
        if (mode === "initial") {
          if (group.length === 1) {
            row.initialRank = i + n + 1;
            row.originalAwards = awardLabels(i + n + 1);
          }
        } else if (group.length === 1 || order) {
          row.rank = i + n + 1;
          row.awards = awardLabels(row.rank);
        } else row.tie = ids;
      });
      i = end;
    }
  }
  return ranked
    .sort((a, b) => {
      if (a.ready !== b.ready) return a.ready ? -1 : 1;
      for (let i = 0; i < a.final.length; i++) {
        if (a.final[i] !== b.final[i]) return a.final[i] > b.final[i] ? -1 : 1;
      }
      return (a.row.rank ?? 0) - (b.row.rank ?? 0) || a.row.id.localeCompare(b.row.id);
    })
    .map((value) => value.row);
}
export interface JudgingSnapshot {
  rows: ScoringRow[];
  merits: JudgingConfig["merits"];
  schools: { id: string; name: string }[];
  display: number;
  fields: AwardField[];
}
export function awardReport(s: JudgingSnapshot, fields: AwardField[]) {
  const project = (record: Record<string, unknown>) =>
    Object.fromEntries(fields.filter((f) => Object.hasOwn(record, f)).map((f) => [f, record[f]]));
  return {
    teachers: s.rows.map((r) =>
      project({
        name: r.name,
        org: r.org,
        rank: r.rank,
        award: r.awards.join("、"),
        total: r.total?.toFixed(s.display),
        professional: r.professional?.toFixed(s.display),
        audience: r.audience?.toFixed(s.display),
        ted: r.ted?.toFixed(s.display)
      })
    ),
    merits: s.merits.map((m) => project({ name: m.name, org: m.org, award: "优秀奖" })),
    schools: s.schools.map((o) => project({ name: o.name, org: o.name, award: "教学示范校" }))
  };
}
