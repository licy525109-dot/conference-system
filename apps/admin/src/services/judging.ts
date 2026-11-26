import type {
  AwardField,
  Answers,
  Correction,
  JudgingConfig,
  JudgingSession,
  PeriodReviews,
  RoomPeriodModes,
  Rubric,
  ScoringRow,
  ScoringTask
} from "@conference/shared";
import { apiRequest } from "./api";
import { periodNames, sessionPeriod } from "@conference/shared";
import { API_BASE_URL } from "../config";
export const judgingH5Origin = new URL(
  import.meta.env.VITE_JUDGING_H5_ORIGIN ||
    (import.meta.env.DEV ? "http://localhost:5173" : "https://m.guanchaohuiji.com")
).origin;
export const judgingImageUrl = (url: string) =>
  url.startsWith("/uploads/") ? new URL(url, API_BASE_URL).href : url;
export interface EventSummary {
  id: string;
  title: string;
  rehearsal: boolean;
  phase: string;
  revision: number;
  edition: number;
  publishedEdition: number | null;
}
export interface EventDetail extends EventSummary {
  periodReviews?: PeriodReviews;
  roomPeriodModes?: RoomPeriodModes;
  entryCode: string | null;
  config: JudgingConfig;
  confirmerId: string | null;
  staffIds: string[];
  gates: Record<string, string>;
  editions: { edition: number; confirmedAt: string; fields: AwardField[] }[];
}
export interface ReviewBallot {
  id: string;
  judgeKey: string;
  sessionKey: string;
  teacherKey: string;
  role: string;
  roleLabel?: string;
  rubric: Rubric & { version: number };
  answers: Answers;
  units: number | null;
  status: string;
  createdAt: string;
  correction: Correction | null;
}
export interface ReviewData {
  phase: string;
  gates: Record<string, string>;
  periodReviews: PeriodReviews;
  periodTasks: (Pick<ScoringTask, "judgeId" | "name" | "roleLabel" | "status" | "receipt"> & {
    sessionId: string;
  })[];
  revision: number;
  merits: JudgingConfig["merits"];
  schools: { id: string; name: string }[];
  rows: ScoringRow[];
  ballots: ReviewBallot[];
  ties: { ids: string[]; reason: string }[];
  log: {
    id: string;
    edition: number;
    actor: string;
    action: string;
    detail: Record<string, unknown>;
    createdAt: string;
  }[];
}
const base = "/admin/judging";
const post = <T>(url: string, body: unknown) =>
  apiRequest<T>(url, { method: "POST", body: JSON.stringify(body) });
export const judgingApi = {
  uploadDesignImage(id: string, file: File) {
    const body = new FormData();
    body.set("file", file);
    return apiRequest<{ url: string }>(base + "/" + encodeURIComponent(id) + "/design-images", {
      method: "POST",
      body
    });
  },
  conferences: (id: string) =>
    apiRequest<{ id: string; title: string }[]>(base + "/" + id + "/sources/conferences"),
  registered: (id: string, cid: string, keyword: string) =>
    apiRequest<{ id: string; name: string; org: string; phone: string; userId: string }[]>(
      base +
        "/" +
        id +
        "/sources/conferences/" +
        encodeURIComponent(cid) +
        "?keyword=" +
        encodeURIComponent(keyword)
    ),
  list: () => apiRequest<EventSummary[]>(base),
  create: (title: string, roomCount: number, roundsPerRoom: number) =>
    post<EventSummary>(base, { title, roomCount, roundsPerRoom }),
  detail: (id: string) => apiRequest<EventDetail>(base + "/" + id),
  accounts: () =>
    apiRequest<{ id: string; username: string; displayName: string | null }[]>(base + "/accounts"),
  progress: (id: string) =>
    apiRequest<{
      revision: number;
      gates: Record<string, string>;
      allRoundRooms?: string[];
      periodReviews?: PeriodReviews;
      roomPeriodModes?: RoomPeriodModes;
      phase: string;
      tasks: ScoringTask[];
    }>(base + "/" + id + "/progress"),
  results: (id: string) => apiRequest<ReviewData>(base + "/" + id + "/results"),
  validate: (id: string, config: JudgingConfig) =>
    post<{ teachers: number; judges: number; sessions: number; warnings: string[]; readiness: string }>(
      base + "/" + id + "/preview-config",
      config
    ),
  change: (id: string, revision: number, body: Record<string, unknown>) =>
    post<EventSummary>(base + "/" + id + "/actions", { ...body, revision }),
  export: (id: string, kind: string, edition: number, fields?: AwardField[]) =>
    apiRequest<any>(
      base +
        "/" +
        id +
        "/export/" +
        kind +
        "?edition=" +
        edition +
        (fields ? "&fields=" + encodeURIComponent(fields.join(",")) : "")
    )
};
export const phaseNames: Record<string, string> = {
  SETUP: "赛前配置",
  LIVE: "现场评分",
  REVIEW: "组委会复核",
  SUBMITTED: "待本人确认",
  LOCKED: "已锁定"
};
export const taskStatus: Record<string, string> = {
  waiting: "待交",
  valid: "有效",
  pending: "待核",
  absent: "缺评",
  makeup: "待补交",
  void: "已作废"
};
export const slotLabel = (s: JudgingSession, c: JudgingConfig) =>
  periodNames[sessionPeriod(s)] +
  " · " +
  (s.kind === "ted"
    ? "TED 第 " + s.round + " 位"
    : (c.rooms.find((r) => r.id === s.room)?.name || s.room) + " · 第 " + s.round + " 轮") +
  " · " +
  (c.teachers.find((t) => t.id === s.teacher)?.name || s.teacher);
export type Operate = (action: string, data?: Record<string, unknown>) => Promise<boolean>;
export async function downloadJudgingBook(
  title: string,
  groups: { name: string; rows: Record<string, unknown>[] }[]
) {
  const x = await import("xlsx"),
    book = x.utils.book_new();
  for (const g of groups) {
    const rows = g.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [
          k,
          v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v
        ])
      )
    );
    const sheet = x.utils.json_to_sheet(rows);
    sheet["!cols"] = Object.keys(rows[0] || {}).map(() => ({ wch: 22 }));
    x.utils.book_append_sheet(book, sheet, g.name);
  }
  x.writeFile(book, title.replace(/[\\/:*?"<>|]/g, "_") + ".xlsx");
}
