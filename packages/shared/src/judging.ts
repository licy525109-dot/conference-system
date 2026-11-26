export const judgeRoles = ["lecturer", "experience", "observer", "expert"] as const;
export type BaseJudgeRole = (typeof judgeRoles)[number];
export type JudgeRole = BaseJudgeRole | `${BaseJudgeRole}_${string}`;
export const roleLabels: Record<BaseJudgeRole, string> = {
  lecturer: "总部讲师",
  experience: "体验席",
  observer: "观察席",
  expert: "TED 专家"
};
export interface JudgingRoleOption {
  id: JudgeRole;
  label: string;
}
export const baseJudgeRole = (role: JudgeRole) => role.split("_", 1)[0] as BaseJudgeRole;
export const isJudgeRoleId = (id: string): id is JudgeRole =>
  judgeRoles.some((base) => id === base || (id.startsWith(base + "_") && id.length > base.length + 1));
export const judgingRoles = (c: Pick<JudgingConfig, "roleOptions">): JudgingRoleOption[] =>
  c.roleOptions ?? judgeRoles.map((id) => ({ id, label: roleLabels[id] }));
export const judgingRoleLabel = (c: Pick<JudgingConfig, "roleOptions">, id: JudgeRole) =>
  c.roleOptions?.find((r) => r.id === id)?.label ?? roleLabels[baseJudgeRole(id)];
export type Stage = "professional" | "audience" | "ted";
export const stages: Stage[] = ["professional", "audience", "ted"];
export const maxPoints: Record<Stage, number> = { professional: 40, audience: 30, ted: 30 };
export const stageOf = (role: JudgeRole): Stage => {
  const base = baseJudgeRole(role);
  return base === "lecturer" ? "professional" : base === "expert" ? "ted" : "audience";
};
export interface JudgingRoom {
  id: string;
  name: string;
  rounds?: number;
  allRoundsOpen?: boolean;
  experience: number;
  observer: number;
}
export interface JudgingTeacher {
  id: string;
  name: string;
  orgId: string;
  org: string;
  photo: string;
  poster: string;
  topic: string;
  speech: string;
  prior: number | null;
  qualifierRank: number | null;
}
export interface JudgingSession {
  id: string;
  teacher: string;
  kind: "class" | "ted";
  period?: JudgingPeriod;
  room: string;
  round: number;
  time: string;
}
export const judgingPeriods = ["am", "pm"] as const;
export type JudgingPeriod = (typeof judgingPeriods)[number];
export const periodNames = { am: "上午场", pm: "下午场" } as const;
export function sessionPeriod(s: Pick<JudgingSession, "kind" | "period">): JudgingPeriod {
  return s.period ?? (s.kind === "ted" ? "pm" : "am");
}
export function scheduledPeriods(sessions: JudgingSession[]): JudgingPeriod[] {
  return judgingPeriods.filter((p) => sessions.some((s) => sessionPeriod(s) === p));
}
export interface PeriodReview {
  status: "reviewing" | "confirmed";
  version: number;
  closedAt?: string;
  closedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
}
export type PeriodReviews = Partial<Record<JudgingPeriod, PeriodReview>>;
export type RoomPeriodModes = Partial<Record<JudgingPeriod, Record<string, boolean>>>;
export function periodStatus(phase: string, review?: PeriodReview) {
  if (review) return review.status;
  if (phase === "SETUP") return "upcoming";
  if (phase === "REVIEW") return "reviewing";
  if (phase === "SUBMITTED" || phase === "LOCKED") return "historical";
  return "scoring";
}
export const periodStatusNames = {
  upcoming: "待开场",
  scoring: "收分中",
  reviewing: "待复核",
  confirmed: "已复核",
  historical: "历史版本无分场记录"
} as const;
export function needsScoreReview(status: string) {
  return ["waiting", "makeup", "pending"].includes(status);
}
export function periodProgressLabel(
  phase: string,
  review: PeriodReview | undefined,
  sessions: JudgingSession[],
  gates: Record<string, string>
) {
  const status = periodStatus(phase, review);
  if (status !== "scoring") return periodStatusNames[status];
  if (sessions.some((s) => gates[s.id] === "open")) return "收分中";
  if (sessions.length && sessions.every((s) => gates[s.id] === "closed")) return "待结束收分";
  return sessions.some((s) => gates[s.id] === "closed") ? "等待下一场" : "待开放";
}
export function classroomRounds(room: JudgingRoom, sessions: JudgingSession[]): number {
  if (room.rounds !== undefined) return room.rounds;
  const scheduled = sessions.filter((s) => s.kind === "class" && s.room === room.id);
  return scheduled.length ? Math.max(...scheduled.map((s) => s.round)) : 3;
}
export interface Judge {
  id: string;
  name: string;
  org?: string;
  userId: string;
  phone: string;
  role: JudgeRole;
  room: string;
}
export interface Merit {
  id: string;
  name: string;
  org: string;
}
export interface RubricField {
  id: string;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  required: boolean;
  unseen: "forbid" | "review" | "prorate";
}
export interface Rubric {
  title: string;
  description: string;
  fields: RubricField[];
}
export interface JudgingGuidance {
  instructions: string;
  rules: string;
}
export const defaultJudgingGuidance: Readonly<JudgingGuidance> = {
  instructions: "选手可在此查看本场规则。评委请输入名单上的姓名，核对选手、教室和场次后评分。",
  rules: "请按每题标明的范围和步长评分。至少填写一项有效分数，并完成必填项后提交。"
};
export const entryLayouts = ["spread", "poster", "minimal"] as const;
export const entryTypefaces = ["serif", "sans"] as const;
export const coverPositions = ["top", "center", "bottom"] as const;
export const coverFits = ["cover", "contain"] as const;
export interface JudgingEntryDesign {
  layout: (typeof entryLayouts)[number];
  typeface: (typeof entryTypefaces)[number];
  position: (typeof coverPositions)[number];
  fit: (typeof coverFits)[number];
  intro: string;
  nameLabel: string;
  placeholder: string;
  button: string;
}
export const defaultEntryDesign: Readonly<JudgingEntryDesign> = {
  layout: "spread",
  typeface: "serif",
  position: "center",
  fit: "cover",
  intro: "",
  nameLabel: "评委姓名",
  placeholder: "请输入名单上的姓名",
  button: "进入评分"
};
export const judgingPalettes = [
  {
    label: "纸艺暖棕",
    colors: { accent: "#8D412D", background: "#F4EFE5", surface: "#FFFCF4", text: "#332C25" }
  },
  {
    label: "林间青绿",
    colors: { accent: "#186859", background: "#F3F6F3", surface: "#FFFFFF", text: "#182E2A" }
  },
  {
    label: "夜幕靛蓝",
    colors: { accent: "#414C78", background: "#EEF0F5", surface: "#FCFCFF", text: "#222B46" }
  }
] as const;
export const judgingPreviewChannel = "judging-entry-design-v1";
export interface JudgingLook {
  entry: JudgingEntryDesign;
  heading: string;
  intro: string;
  submit: string;
  receipt: string;
  logo: string;
  cover: string;
  accent: string;
  background: string;
  surface: string;
  text: string;
  radius: number;
  fontSize: number;
  showPhoto: boolean;
  showOrg: boolean;
  showProgress: boolean;
}
export const awardFieldOptions = {
  name: "姓名",
  org: "机构",
  rank: "名次",
  award: "奖项",
  total: "最终总分",
  professional: "专业分",
  audience: "大众分",
  ted: "TED 分"
};
export type AwardField = keyof typeof awardFieldOptions;
export interface JudgingConfig {
  look: JudgingLook;
  guidance: JudgingGuidance;
  rooms: JudgingRoom[];
  teachers: JudgingTeacher[];
  sessions: JudgingSession[];
  judges: Judge[];
  merits: Merit[];
  awardTargets?: { merits: number | null; schools: number | null };
  roleOptions?: JudgingRoleOption[];
  rubrics: Record<JudgeRole, Rubric>;
  sameAudienceForm: boolean;
  minimum: Record<Stage, number>;
  precision: number;
  display: number;
  publicDay: string;
  publicFields: AwardField[];
  formVersion: number;
  approvedForms: boolean;
}
export interface Correction {
  units: number | null;
  status: string;
  answers: Answers;
  reason: string;
  actor: string;
  at: string;
}
export interface Adjustment {
  value: number;
  before: number;
  reason: string;
  actor: string;
  at: string;
  recheck: boolean;
}
export interface TieOrder {
  ids: string[];
  reason: string;
  actor: string;
}
export interface SessionForms extends Pick<
  JudgingConfig,
  "rubrics" | "sameAudienceForm" | "formVersion" | "roleOptions"
> {
  judgeRoles?: Record<string, JudgeRole>;
  guidance?: JudgingGuidance;
}
export const roleForSession = (snapshot: SessionForms | undefined, judge: Judge): JudgeRole =>
  snapshot?.judgeRoles?.[judge.id] ?? judge.role;
export interface JudgingControl {
  periodReviews?: PeriodReviews;
  roomPeriodModes?: RoomPeriodModes;
  sessionForms: Record<string, SessionForms>;
  present: Record<string, boolean>;
  gates: Record<string, "open" | "closed">;
  exceptions: Record<string, { kind: "absent" | "makeup"; reason: string }>;
  corrections: Record<string, Correction>;
  adjustments: Record<string, Adjustment>;
  ties: TieOrder[];
}
export type Answers = Record<string, number | null | "unseen">;
export type ScoreInputs = Record<string, string | number | null | undefined>;

export function scoreInputAnswers(form: Rubric, inputs: ScoreInputs): Answers {
  const answers: Answers = {};
  for (const { id } of form.fields) {
    const raw = inputs[id];
    if (raw === "unseen") answers[id] = raw;
    else if (raw == null || String(raw).trim() === "") answers[id] = null;
    else answers[id] = Number(raw);
  }
  return answers;
}

export function ballotIssue(
  form: Rubric,
  answers: Record<string, unknown>,
  purpose: "submission" | "correction" = "submission"
): { fieldId: string; message: string } | null {
  let scored = false;
  for (const f of form.fields) {
    const value = answers[f.id];
    if (value == null || value === "") {
      if (f.required) return { fieldId: f.id, message: "请填写「" + f.label + "」的分数" };
      continue;
    }
    if (value === "unseen") {
      if (f.unseen === "forbid") return { fieldId: f.id, message: f.label + "必须评分" };
      continue;
    }
    if (typeof value !== "number" || !Number.isFinite(value))
      return { fieldId: f.id, message: "请为「" + f.label + "」输入有效分数" };
    if (value < f.min || value > f.max)
      return { fieldId: f.id, message: f.label + "的分数范围是 " + f.min + "–" + f.max + " 分" };
    const units = Math.round(value * 100);
    if (
      Math.abs(value * 100 - units) > 0.000001 ||
      (units - Math.round(f.min * 100)) % Math.round(f.step * 100) !== 0
    )
      return { fieldId: f.id, message: f.label + "的计分步长是 " + f.step + " 分，最多保留两位小数" };
    scored = true;
  }
  if (!scored && purpose === "submission")
    return { fieldId: form.fields[0]?.id ?? "", message: "请至少填写一项分数后再提交" };
  return null;
}
export interface ScoringRow {
  id: string;
  name: string;
  orgId: string;
  org: string;
  prior: number | null;
  qualifierRank: number | null;
  counts: Record<Stage, number>;
  sums: Record<Stage, number>;
  professional: number | null;
  audience: number | null;
  ted: number | null;
  morning: number | null;
  system: number | null;
  total: number | null;
  initialRank: number | null;
  rank: number | null;
  awards: string[];
  originalAwards: string[];
  tie: string[];
  adjustment: Adjustment | null;
}
export interface ScoringTask {
  canRehearse?: boolean;
  session: JudgingSession;
  judgeId: string;
  name: string;
  role: JudgeRole;
  roleLabel?: string;
  present: boolean;
  status: string;
  receipt?: string;
  reason?: string;
}
export interface MobileTask {
  sessionId: string;
  period?: JudgingPeriod;
  teacher: string;
  time: string;
  room: string;
  round: number;
  role: JudgeRole;
  status: string;
}
export interface GuestSeat {
  id: string;
  name: string;
  org: string;
  role: JudgeRole;
  roleLabel?: string;
}
export type GuestChoice = Pick<GuestSeat, "id" | "org">;
export type GuestIdentification =
  | { kind: "choose"; choices: GuestChoice[] }
  | { kind: "ready"; ticket: string };
export interface GuestDesk {
  judge: GuestSeat;
  page: ScoringView | null;
}
export interface ScoreReceipt {
  id: string;
  teacher: string;
  session: string;
  at: string;
  status: "received";
}
export interface ScoringView {
  rehearsalSeat?: string;
  title: string;
  rehearsal: boolean;
  look: JudgingLook;
  guidance?: JudgingGuidance;
  teacher: { name: string; org: string; photo: string; poster: string; topic: string };
  session: {
    id: string;
    room: string;
    round: number;
    time: string;
    kind: "class" | "ted";
    period?: JudgingPeriod;
    reviewStatus?: PeriodReview["status"];
  };
  role: JudgeRole;
  roleLabel?: string;
  form: Rubric;
  formVersion: number;
  max: number;
  open: boolean;
  tasks: MobileTask[];
  receipt: ScoreReceipt | null;
}
export const guestScoringPath = (event: string, code: string) =>
  "pages/judging/entry?event=" + encodeURIComponent(event) + "&entry=" + encodeURIComponent(code);
export const rehearsalUserId = (eventId: string, judgeId: string) => "rehearsal:" + eventId + ":" + judgeId;
export const taskKey = (session: string, judge: string) => session + "/" + judge;
export const assigned = (s: JudgingSession, j: Judge) =>
  stageOf(j.role) === "ted" ? s.kind === "ted" : s.kind === "class" && s.room === j.room;
export const rubricFor = (c: Pick<JudgingConfig, "rubrics" | "sameAudienceForm">, role: JudgeRole) =>
  c.rubrics[role === "observer" && c.sameAudienceForm && c.rubrics.experience ? "experience" : role];
export function defaultJudgingRubric(role: JudgeRole, label = roleLabels[baseJudgeRole(role)]): Rubric {
  return {
    title: label + "评分表",
    description: "请核对本场教师，依照现场公布的细则评分。",
    fields: [
      {
        id: "score",
        label: "综合评价",
        hint: "请根据本场评分细则打分。",
        min: 0,
        max: maxPoints[stageOf(role)],
        step: 0.5,
        required: true,
        unseen: "review"
      }
    ]
  };
}
export function defaultJudgingConfig(roomCount = 5, rounds?: number): JudgingConfig {
  const roleOptions = judgingRoles({});
  const rubrics = Object.fromEntries(
    roleOptions.map(({ id }) => [id, defaultJudgingRubric(id)])
  ) as JudgingConfig["rubrics"];
  return {
    guidance: { ...defaultJudgingGuidance },
    look: {
      entry: { ...defaultEntryDesign },
      heading: "现场评审",
      intro: "请核对教师与场次后填写。",
      submit: "确认提交",
      receipt: "本场评分已收到",
      logo: "",
      cover: "",
      ...judgingPalettes[0].colors,
      radius: 14,
      fontSize: 16,
      showPhoto: true,
      showOrg: true,
      showProgress: true
    },
    rooms: Array.from({ length: roomCount }, (_, i) => ({
      id: "R" + (i + 1),
      name: i + 1 + " 号教室",
      ...(rounds !== undefined && { rounds }),
      experience: 16,
      observer: 16
    })),
    teachers: [],
    sessions: [],
    judges: [],
    merits: [],
    roleOptions,
    rubrics,
    sameAudienceForm: true,
    minimum: { professional: 1, audience: 1, ted: 1 },
    precision: 2,
    display: 2,
    publicDay: "2026-12-16",
    publicFields: ["name", "org", "rank", "award"],
    formVersion: 1,
    approvedForms: false
  };
}
export function defaultJudgingControl(): JudgingControl {
  return {
    sessionForms: {},
    present: {},
    gates: {},
    exceptions: {},
    corrections: {},
    adjustments: {},
    ties: []
  };
}
export function judgingStyle(look: JudgingLook): Record<string, string> {
  return {
    "--judging-accent": look.accent,
    "--judging-bg": look.background,
    "--judging-card": look.surface,
    "--judging-text": look.text,
    "--judging-radius": look.radius + "px",
    "--judging-size": look.fontSize + "px"
  };
}
export function awardLabels(rank: number): string[] {
  return [rank <= 3 ? "一等奖" : rank <= 8 ? "二等奖" : "三等奖", ...(rank <= 10 ? ["十佳教师"] : [])];
}
