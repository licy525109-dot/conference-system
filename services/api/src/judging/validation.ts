import { BadRequestException } from "@nestjs/common";
import { awardFieldOptions, judgeRoles, maxPoints, rubricFor, stageOf, stages } from "@conference/shared";
import type { Answers, JudgeRole, JudgingConfig, JudgingLook, Rubric } from "@conference/shared";

export function fail(message: string): never {
  throw new BadRequestException(message);
}
export function object(value: unknown): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("请提供有效的数据对象");
  return value as Record<string, any>;
}
export function str(v: unknown, label: string, max = 120, required = true): string {
  if ((v === undefined || v === null || v === "") && !required) return "";
  if (typeof v !== "string" || v.trim().length > max || (required && !v.trim()))
    fail(label + "不能为空或超出长度");
  return v.trim();
}
export function key(v: unknown, label: string) {
  const id = str(v, label, 64);
  if (!/^[A-Za-z0-9_-]+$/.test(id) || id in Object.prototype || id === "prototype")
    fail(label + "须为字母、数字、短横线或下划线");
  return id;
}
export function num(v: unknown, label: string, min: number, max: number, integer = false) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v)))
    fail(label + "数值超出范围");
  return v;
}
export function points(v: unknown, label: string, max = 100) {
  const n = num(v, label, 0, max);
  if (Math.abs(n * 100 - Math.round(n * 100)) > 0.000001) fail(label + "最多支持两位小数");
  return n;
}
function bool(v: unknown, label: string) {
  if (typeof v !== "boolean") fail(label + "请选择是或否");
  return v;
}
export function imageUrl(v: unknown) {
  const value = str(v, "图片地址", 1800, false);
  if (value && !/^https:\/\/[^\s]+$/i.test(value) && !/^\/uploads\/[\w%./-]+$/.test(value))
    fail("图片请使用 HTTPS 地址或平台上传地址");
  return value;
}
export function validateLook(v: unknown): JudgingLook {
  const o = object(v),
    color = (n: string) => {
      const s = str(o[n], n, 7);
      if (!/^#[a-f0-9]{6}$/i.test(s)) fail("颜色须使用六位色值");
      return s;
    };
  return {
    heading: str(o.heading, "页标题", 50),
    intro: str(o.intro, "引导语", 400, false),
    submit: str(o.submit, "按钮文案", 25),
    receipt: str(o.receipt, "回执文案", 80),
    cover: imageUrl(o.cover),
    logo: imageUrl(o.logo),
    accent: color("accent"),
    background: color("background"),
    surface: color("surface"),
    text: color("text"),
    fontSize: num(o.fontSize, "字号", 14, 23, true),
    radius: num(o.radius, "圆角", 0, 32, true),
    showPhoto: bool(o.showPhoto, "照片"),
    showOrg: bool(o.showOrg, "机构"),
    showProgress: bool(o.showProgress, "任务进度")
  };
}
function rows<T extends { id: string }>(
  v: unknown,
  label: string,
  max: number,
  read: (r: Record<string, any>) => T
): T[] {
  if (!Array.isArray(v) || v.length > max) fail(label + "数据格式或数量不正确");
  const ids = new Set<string>();
  return v.map((record, i) => {
    try {
      const row = read(object(record));
      if (ids.has(row.id)) fail("编号重复 " + row.id);
      ids.add(row.id);
      return row;
    } catch (error) {
      fail(label + "第 " + (i + 1) + " 行：" + (error instanceof Error ? error.message : "数据有误"));
    }
  });
}
export function validateRubric(value: unknown, role: JudgeRole): Rubric {
  const r = object(value),
    cap = maxPoints[stageOf(role)];
  const fields = rows(r.fields, "评分题目", 40, (f) => {
    const min = points(f.min, "最低分", cap),
      max = points(f.max, "最高分", cap),
      step = points(f.step, "步长", cap);
    if (!step || max <= min || (Math.round(max * 100) - Math.round(min * 100)) % Math.round(step * 100) !== 0)
      fail("范围与步长无法整除");
    if (!["forbid", "review", "prorate"].includes(f.unseen)) fail("未观察规则无效");
    return {
      id: key(f.id, "题号"),
      label: str(f.label, "题目", 120),
      hint: str(f.hint, "说明", 500, false),
      min,
      max,
      step,
      required: bool(f.required, "必填"),
      unseen: f.unseen as "forbid" | "review" | "prorate"
    };
  });
  if (!fields.length || fields.reduce((n, f) => n + Math.round(f.max * 100), 0) !== cap * 100)
    fail("评分表各题的满分合计必须为 " + cap + " 分");
  return {
    title: str(r.title, "评分表标题"),
    description: str(r.description, "评分说明", 1000, false),
    fields
  };
}
export function validateConfig(value: unknown, rehearsal: boolean): JudgingConfig {
  const c = object(value),
    forms = object(c.rubrics),
    minimum = object(c.minimum);
  const rooms = rows(c.rooms, "教室", 50, (r) => ({
    id: key(r.id, "教室编号"),
    name: str(r.name, "教室名"),
    experience: num(r.experience, "体验配额", 0, 500, true),
    observer: num(r.observer, "观察配额", 0, 500, true)
  }));
  const teachers = rows(c.teachers, "选手", 150, (r) => ({
    id: key(r.id, "教师编号"),
    name: str(r.name, "姓名", 50),
    orgId: key(r.orgId, "机构编号"),
    org: str(r.org, "机构"),
    photo: imageUrl(r.photo),
    poster: imageUrl(r.poster),
    topic: str(r.topic, "课题", 180),
    speech: str(r.speech, "演讲题目", 180),
    prior: r.prior == null ? null : num(r.prior, "复赛成绩", 0, 10000),
    qualifierRank: r.qualifierRank == null ? null : num(r.qualifierRank, "晋级名次", 1, 10000, true)
  }));
  const orgNames = new Map<string, string>();
  for (const t of teachers) {
    if (orgNames.has(t.orgId) && orgNames.get(t.orgId) !== t.org)
      fail("同一机构编号对应多个名称：" + t.orgId);
    orgNames.set(t.orgId, t.org);
  }
  const roomIds = new Set(rooms.map((r) => r.id)),
    teacherIds = new Set(teachers.map((t) => t.id));
  const slots = new Set<string>(),
    teacherSlots = new Set<string>(),
    topics = new Set<string>();
  const sessions = rows(c.sessions, "场次", 350, (r) => {
    const id = key(r.id, "场次编号"),
      teacher = key(r.teacher, "教师编号"),
      round = num(r.round, "轮次或顺序", 1, 250, true);
    if (!teacherIds.has(teacher) || !["class", "ted"].includes(r.kind)) fail("教师或场次类型有误");
    const room = r.kind === "class" ? key(r.room, "教室编号") : "";
    if (r.kind === "class" && !roomIds.has(room)) fail("教室不存在");
    const slot = [r.kind, room, round].join("/"),
      assigned = [r.kind, teacher].join("/");
    if (slots.has(slot) || teacherSlots.has(assigned)) fail("同一时段教室或教师重复排场");
    slots.add(slot);
    teacherSlots.add(assigned);
    if (room) {
      const topic = room + "/" + teachers.find((t) => t.id === teacher)!.topic.trim();
      if (topics.has(topic)) fail("同室三轮课题应互异");
      topics.add(topic);
    }
    return {
      id,
      teacher,
      kind: r.kind as "class" | "ted",
      room,
      round,
      time: str(r.time, "场次时间", 80, false)
    };
  });
  const identities = new Set<string>();
  const judges = rows(c.judges, "评委", 1500, (r) => {
    if (!judgeRoles.includes(r.role)) fail("评委身份有误");
    const userId = str(r.userId, "用户编号", 100, false),
      phone = str(r.phone, "实名手机号", 24, false),
      role = r.role as JudgeRole;
    if (!userId && !phone) fail("需要已验证手机号或平台用户编号");
    if (phone && !/^1\d{10}$/.test(phone)) fail("手机号格式有误");
    for (const identity of [userId && "u:" + userId, phone && "p:" + phone].filter(Boolean)) {
      const bucket = (role === "expert" ? "ted/" : "class/") + identity;
      if (identities.has(bucket)) fail("同一实名身份在同一环节重复分配");
      identities.add(bucket);
    }
    const room = role === "expert" ? "" : key(r.room, "教室编号");
    if (room && !roomIds.has(room)) fail("分配教室不存在");
    return { id: key(r.id, "评委编号"), name: str(r.name, "实名", 50), role, room, userId, phone };
  });
  const merits = rows(c.merits, "优秀奖名单", 500, (r) => ({
    id: key(r.id, "教师编号"),
    name: str(r.name, "姓名", 50),
    org: str(r.org, "机构")
  }));
  if (merits.some((m) => teacherIds.has(m.id))) fail("优秀奖名单与总决赛教师编号重复");
  const day = str(c.publicDay, "允许公布日期", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    !Number.isFinite(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day ||
    (!rehearsal && day < "2026-12-16")
  )
    fail("正式赛事最早可于 2026-12-16 公布");
  if (
    !Array.isArray(c.publicFields) ||
    !c.publicFields.includes("name") ||
    c.publicFields.some((f: unknown) => typeof f !== "string" || !Object.hasOwn(awardFieldOptions, f))
  )
    fail("公开字段须包含姓名并从允许的字段中选择");
  return {
    look: validateLook(c.look),
    rooms,
    teachers,
    sessions,
    judges,
    merits,
    rubrics: Object.fromEntries(
      judgeRoles.map((role) => [role, validateRubric(forms[role], role)])
    ) as JudgingConfig["rubrics"],
    sameAudienceForm: bool(c.sameAudienceForm, "观察席共用表"),
    minimum: Object.fromEntries(
      stages.map((s) => [s, num(minimum[s], "最低有效份数", 1, 1500, true)])
    ) as JudgingConfig["minimum"],
    display: num(c.display, "显示精度", 0, 4, true),
    precision: num(c.precision, "同分精度", 0, 6, true),
    publicDay: day,
    publicFields: [...new Set(c.publicFields)] as JudgingConfig["publicFields"],
    formVersion: 1,
    approvedForms: bool(c.approvedForms, "正式细则确认")
  };
}
export function validateStart(c: JudgingConfig, rehearsal: boolean) {
  if (!c.teachers.length || !c.rooms.length || !c.judges.length) fail("先补齐教室、选手和评委名单");
  if (!rehearsal && (c.teachers.length !== 15 || c.rooms.length !== 5 || !c.approvedForms))
    fail("正式赛需要 15 位教师、5 间教室和已确认的正式评分表");
  for (const t of c.teachers)
    if (c.sessions.filter((s) => s.teacher === t.id).length !== 2) fail(t.name + " 缺少课堂或 TED 场次");
  for (const r of c.rooms) {
    const js = c.judges.filter((j) => j.room === r.id);
    if (js.filter((j) => j.role === "lecturer").length !== 1) fail(r.name + " 需分配一位总部讲师");
    if (
      js.filter((j) => j.role === "experience").length > r.experience ||
      js.filter((j) => j.role === "observer").length > r.observer
    )
      fail(r.name + " 已分配人数超过配额");
    if (js.filter((j) => j.role === "experience" || j.role === "observer").length < c.minimum.audience)
      fail(r.name + " 大众名单人数低于最低有效份数");
    if (c.minimum.professional > 1) fail(r.name + " 仅分配一位总部讲师，专业最低有效份数应为 1");
    if (!rehearsal && [1, 2, 3].some((n) => !c.sessions.some((s) => s.room === r.id && s.round === n)))
      fail(r.name + " 必须排齐三轮");
  }
  if (c.judges.filter((j) => j.role === "expert").length < c.minimum.ted)
    fail("TED 专家名单人数低于最低有效份数");
  if (!rehearsal && c.teachers.some((t) => !t.photo && !t.poster))
    fail("正式评分需要每位教师的照片或入围海报");
}
export function evaluate(
  form: Rubric,
  raw: unknown
): { answers: Answers; units: number | null; status: string } {
  const source = object(raw),
    answers: Answers = {};
  if (Object.keys(source).some((k) => !form.fields.some((f) => f.id === k)))
    fail("提交的题目与评分表版本不符");
  let sum = 0,
    seenMax = 0,
    cap = 0,
    pending = false;
  for (const f of form.fields) {
    const v = source[f.id],
      max = Math.round(f.max * 100);
    cap += max;
    if (v === "unseen") {
      if (f.unseen === "forbid") fail(f.label + " 必须评分");
      answers[f.id] = "unseen";
      if (f.unseen === "review") pending = true;
      continue;
    }
    if (v == null || v === "") {
      if (f.required) fail("请先完成：" + f.label);
      answers[f.id] = null;
      pending = true;
      continue;
    }
    const n = points(v, f.label, f.max),
      u = Math.round(n * 100),
      lo = Math.round(f.min * 100);
    if (u < lo || (u - lo) % Math.round(f.step * 100) !== 0) fail(f.label + " 不符合允许范围或步长");
    answers[f.id] = n;
    sum += u;
    seenMax += max;
  }
  const units = !pending && seenMax ? Math.round((sum * cap) / seenMax) : null;
  return { answers, units, status: units === null ? "pending" : "valid" };
}
