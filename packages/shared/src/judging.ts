export const judgeRoles = ["lecturer", "experience", "observer", "expert"] as const;
export type JudgeRole = (typeof judgeRoles)[number];
export const roleLabels: Record<JudgeRole, string> = {
  lecturer: "总部讲师",
  experience: "体验席",
  observer: "观察席",
  expert: "TED 专家"
};
export type Stage = "professional" | "audience" | "ted";
export const stages: Stage[] = ["professional", "audience", "ted"];
export const maxPoints: Record<Stage, number> = { professional: 40, audience: 30, ted: 30 };
export const stageOf = (role: JudgeRole): Stage =>
  role === "lecturer" ? "professional" : role === "expert" ? "ted" : "audience";
export interface JudgingRoom {
  id: string;
  name: string;
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
  room: string;
  round: number;
  time: string;
}
export interface Judge {
  id: string;
  name: string;
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
export interface JudgingLook {
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
  rooms: JudgingRoom[];
  teachers: JudgingTeacher[];
  sessions: JudgingSession[];
  judges: Judge[];
  merits: Merit[];
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
export interface JudgingControl {
  sessionForms: Record<string, Pick<JudgingConfig, "rubrics" | "sameAudienceForm" | "formVersion">>;
  present: Record<string, boolean>;
  gates: Record<string, "open" | "closed">;
  exceptions: Record<string, { kind: "absent" | "makeup"; reason: string }>;
  corrections: Record<string, Correction>;
  adjustments: Record<string, Adjustment>;
  ties: TieOrder[];
}
export type Answers = Record<string, number | null | "unseen">;
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
  session: JudgingSession;
  judgeId: string;
  name: string;
  role: JudgeRole;
  present: boolean;
  status: string;
  receipt?: string;
  reason?: string;
}
export interface MobileTask {
  sessionId: string;
  teacher: string;
  time: string;
  room: string;
  round: number;
  role: JudgeRole;
  status: string;
}
export interface ScoreReceipt {
  id: string;
  teacher: string;
  session: string;
  at: string;
  status: "received";
}
export interface ScoringView {
  title: string;
  rehearsal: boolean;
  look: JudgingLook;
  teacher: { name: string; org: string; photo: string; poster: string; topic: string };
  session: { id: string; room: string; round: number; time: string; kind: "class" | "ted" };
  role: JudgeRole;
  form: Rubric;
  formVersion: number;
  max: number;
  open: boolean;
  tasks: MobileTask[];
  receipt: ScoreReceipt | null;
}
export const taskKey = (session: string, judge: string) => session + "/" + judge;
export const assigned = (s: JudgingSession, j: Judge) =>
  s.kind === "ted" ? j.role === "expert" : j.role !== "expert" && s.room === j.room;
export const rubricFor = (c: Pick<JudgingConfig, "rubrics" | "sameAudienceForm">, role: JudgeRole) =>
  c.rubrics[role === "observer" && c.sameAudienceForm ? "experience" : role];
export function defaultJudgingConfig(): JudgingConfig {
  const rubrics = {} as Record<JudgeRole, Rubric>;
  for (const role of judgeRoles) {
    rubrics[role] = {
      title: roleLabels[role] + "评分表",
      description: "请核对本场教师，依照现场公布的细则评分。",
      fields: [
        {
          id: "score",
          label: "综合评价",
          hint: "联排示例，正式赛前请录入经确认的评分细则。",
          min: 0,
          max: maxPoints[stageOf(role)],
          step: 0.5,
          required: true,
          unseen: "review"
        }
      ]
    };
  }
  return {
    look: {
      heading: "现场评审",
      intro: "请核对教师与场次后填写。",
      submit: "确认提交",
      receipt: "本场评分已收到",
      logo: "",
      cover: "",
      accent: "#186859",
      background: "#F3F6F3",
      surface: "#FFFFFF",
      text: "#182E2A",
      radius: 14,
      fontSize: 16,
      showPhoto: true,
      showOrg: true,
      showProgress: true
    },
    rooms: Array.from({ length: 5 }, (_, i) => ({
      id: "R" + (i + 1),
      name: i + 1 + " 号教室",
      experience: 16,
      observer: 16
    })),
    teachers: [],
    sessions: [],
    judges: [],
    merits: [],
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
