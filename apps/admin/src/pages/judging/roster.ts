import { defaultJudgingConfig, rehearsalUserId, roleLabels, type JudgingConfig } from "@conference/shared";
import { readExternalCheckinWorkbook } from "../../utils/external-checkin-sheet";
export type Section = "rooms" | "teachers" | "judges" | "sessions" | "merits";
export type Field = {
  key: string;
  label: string;
  kind?: "num" | "optionalNum" | "room" | "teacher" | "role" | "stage" | "image";
};
export const spec: Record<Section, { label: string; fields: Field[] }> = {
  rooms: {
    label: "教室",
    fields: [
      { key: "id", label: "教室编号" },
      { key: "name", label: "教室名称" },
      { key: "experience", label: "体验席配额", kind: "num" },
      { key: "observer", label: "观察席配额", kind: "num" }
    ]
  },
  teachers: {
    label: "选手",
    fields: [
      { key: "id", label: "教师编号" },
      { key: "name", label: "姓名" },
      { key: "orgId", label: "机构编号" },
      { key: "org", label: "机构名称" },
      { key: "topic", label: "课程题目" },
      { key: "speech", label: "TED题目" },
      { key: "photo", label: "照片", kind: "image" },
      { key: "poster", label: "入围海报", kind: "image" },
      { key: "prior", label: "复赛原分", kind: "optionalNum" },
      { key: "qualifierRank", label: "晋级名次", kind: "optionalNum" }
    ]
  },
  judges: {
    label: "评委",
    fields: [
      { key: "id", label: "评委编号" },
      { key: "name", label: "实名" },
      { key: "role", label: "评委身份", kind: "role" },
      { key: "room", label: "教室编号", kind: "room" },
      { key: "phone", label: "已验证手机号" },
      { key: "userId", label: "平台用户编号" }
    ]
  },
  sessions: {
    label: "场次",
    fields: [
      { key: "id", label: "场次编号" },
      { key: "kind", label: "环节", kind: "stage" },
      { key: "teacher", label: "教师编号", kind: "teacher" },
      { key: "room", label: "教室编号", kind: "room" },
      { key: "round", label: "轮次或演讲顺序", kind: "num" },
      { key: "time", label: "时间" }
    ]
  },
  merits: {
    label: "优秀奖",
    fields: [
      { key: "id", label: "教师编号" },
      { key: "name", label: "姓名" },
      { key: "org", label: "机构名称" }
    ]
  }
};
export const sections = Object.keys(spec) as Section[];
export type Row = Record<string, any>;
export function emptyRow(section: Section): Row {
  return Object.fromEntries(
    spec[section].fields.map((f) => [
      f.key,
      f.kind === "num"
        ? 1
        : f.kind === "optionalNum"
          ? null
          : f.kind === "stage"
            ? "class"
            : f.kind === "role"
              ? "experience"
              : ""
    ])
  );
}
export function displayField(f: Field, v: any, c: JudgingConfig): string {
  if (f.kind === "role") return roleLabels[v as keyof typeof roleLabels] || v;
  if (f.kind === "stage") return v === "ted" ? "TED" : "课堂";
  if (f.kind === "room") return c.rooms.find((r) => r.id === v)?.name || v || "—";
  if (f.kind === "teacher") return c.teachers.find((t) => t.id === v)?.name || v;
  return String(v ?? "");
}
export async function prepareImport(file: File, current: JudgingConfig, selected: Section) {
  const sheets = await readExternalCheckinWorkbook(file),
    next: JudgingConfig = JSON.parse(JSON.stringify(current)),
    changes: { name: string; count: number }[] = [];
  for (const sheet of sheets) {
    const section =
      sections.find((k) => spec[k].label === sheet.name) ?? (sheets.length === 1 ? selected : null);
    if (!section) continue;
    const fields = spec[section].fields,
      header = sheet.rows[0] ?? [],
      indexes = fields.map((f) => header.findIndex((h) => h.trim() === f.label || h.trim() === f.key));
    if (indexes[0] < 0) throw new Error(sheet.name + "缺少列：" + fields[0].label);
    const existing = new Map((next[section] as Row[]).map((row) => [row.id, row])),
      seen = new Set<string>();
    sheet.rows.slice(1).forEach((cells, i) => {
      if (!cells.some((x) => x.trim())) return;
      const id = cells[indexes[0]]?.trim();
      if (!id || seen.has(id)) throw new Error(sheet.name + " 第 " + (i + 2) + " 行编号为空或重复");
      seen.add(id);
      const record = { ...emptyRow(section), ...existing.get(id) };
      fields.forEach((f, j) => {
        if (indexes[j] < 0) return;
        const v = (cells[indexes[j]] ?? "").trim();
        if (f.kind === "num" || f.kind === "optionalNum") {
          if (v === "" && f.kind === "num")
            throw new Error(sheet.name + " 第 " + (i + 2) + " 行缺少" + f.label);
          record[f.key] = v === "" ? null : Number(v);
        } else if (f.kind === "role")
          record[f.key] = Object.entries(roleLabels).find(([, label]) => label === v)?.[0] || v;
        else if (f.kind === "stage") record[f.key] = v === "课堂" ? "class" : v === "TED" ? "ted" : v;
        else record[f.key] = v;
      });
      existing.set(id, record);
    });
    Object.assign(next, { [section]: [...existing.values()] });
    changes.push({ name: spec[section].label, count: seen.size });
  }
  if (!changes.some((x) => x.count > 0)) throw new Error("工作簿没有可导入的数据行");
  return { next, changes };
}
export async function rosterTemplate(c: JudgingConfig) {
  const x = await import("xlsx"),
    book = x.utils.book_new();
  for (const k of sections) {
    const f = spec[k].fields,
      data = (c[k] as Row[]).map((row) => f.map((field) => row[field.key] ?? ""));
    const ws = x.utils.aoa_to_sheet([f.map((v) => v.label), ...data]);
    ws["!cols"] = f.map(() => ({ wch: 22 }));
    x.utils.book_append_sheet(book, ws, spec[k].label);
  }
  x.writeFile(book, "赛事排场与实名名单.xlsx");
}
export function schedule(c: JudgingConfig) {
  if (!c.rooms.length) throw new Error("请先设置教室");
  const times = ["09:00–10:00", "10:15–11:15", "11:30–12:30"];
  return c.teachers.flatMap((t, i) => {
    const round = Math.floor(i / c.rooms.length) + 1;
    return [
      {
        id: "class-" + t.id,
        teacher: t.id,
        kind: "class" as const,
        room: c.rooms[i % c.rooms.length].id,
        round,
        time: times[round - 1] || ""
      },
      { id: "ted-" + t.id, teacher: t.id, kind: "ted" as const, room: "", round: i + 1, time: "14:00–17:00" }
    ];
  });
}
export function rehearsalRoster(eventId: string): JudgingConfig {
  const c = defaultJudgingConfig();
  c.rooms = c.rooms.slice(0, 1);
  c.teachers = [
    {
      id: "T01",
      name: "联排选手",
      orgId: "S01",
      org: "联排机构",
      topic: "用动作讲一个故事",
      speech: "我的课堂观察",
      photo: "",
      poster: "",
      prior: 88,
      qualifierRank: 1
    }
  ];
  c.sessions = schedule(c);
  c.judges = (["lecturer", "experience", "observer", "expert"] as const).map((role, i) => ({
    id: "J0" + (i + 1),
    name: "联排" + roleLabels[role],
    role,
    room: role === "expert" ? "" : "R1",
    userId: rehearsalUserId(eventId, "J0" + (i + 1)),
    phone: ""
  }));
  return c;
}
