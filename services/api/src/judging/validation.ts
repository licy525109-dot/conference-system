import { BadRequestException } from "@nestjs/common";
import {
  awardFieldOptions,
  baseJudgeRole,
  coverFits,
  coverPositions,
  defaultEntryDesign,
  entryLayouts,
  entryTypefaces,
  isJudgeRoleId,
  judgingRoles,
  maxPoints,
  stageOf,
  stages
} from "@conference/shared";
import type {
  Answers,
  JudgeRole,
  JudgingConfig,
  JudgingEntryDesign,
  JudgingLook,
  JudgingRoleOption,
  Rubric
} from "@conference/shared";

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
function designOption<T extends string>(v: unknown, choices: readonly T[], label: string): T {
  const choice = choices.find((item) => item === v);
  if (!choice) fail(label + "选项无效");
  return choice;
}
export function validateLook(
  v: unknown,
  previousEntry: JudgingEntryDesign = defaultEntryDesign
): JudgingLook {
  const o = object(v),
    color = (n: string) => {
      const s = str(o[n], n, 7);
      if (!/^#[a-f0-9]{6}$/i.test(s)) fail("颜色须使用六位色值");
      return s;
    };
  const entry = {
    ...defaultEntryDesign,
    ...previousEntry,
    ...(o.entry === undefined ? {} : object(o.entry))
  };
  return {
    entry: {
      layout: designOption(entry.layout, entryLayouts, "入口版式"),
      typeface: designOption(entry.typeface, entryTypefaces, "标题字形"),
      position: designOption(entry.position, coverPositions, "封面取景"),
      fit: designOption(entry.fit, coverFits, "封面显示"),
      intro: str(entry.intro, "入口说明", 180, false),
      nameLabel: str(entry.nameLabel, "姓名栏标题", 32),
      placeholder: str(entry.placeholder, "姓名输入提示", 60),
      button: str(entry.button, "进入按钮", 25)
    },
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
export function legacyAwardTargets(rehearsal: boolean) {
  return rehearsal ? { merits: null, schools: null } : { merits: 19, schools: 13 };
}
export function validateConfig(
  value: unknown,
  rehearsal: boolean,
  previousEntry?: JudgingEntryDesign,
  saved?: Pick<JudgingConfig, "roleOptions" | "rubrics" | "rooms" | "awardTargets">
): JudgingConfig {
  const c = object(value),
    submittedForms = object(c.rubrics),
    forms = c.roleOptions === undefined && saved ? { ...saved.rubrics, ...submittedForms } : submittedForms,
    minimum = object(c.minimum);
  const options = c.roleOptions === undefined ? judgingRoles(saved ?? {}) : c.roleOptions;
  const roleOptions = rows<JudgingRoleOption>(options, "评委类型", 1500, (r) => {
    const id = key(r.id, "类型编号");
    if (!isJudgeRoleId(id)) fail("评委类型的计分方式无效");
    return { id, label: str(r.label, "类型名称", 50) };
  });
  if (new Set(roleOptions.map((r) => r.label)).size !== roleOptions.length) fail("评委类型名称重复");
  const activeRoles = new Set<string>(roleOptions.map((r) => r.id));
  const rooms = rows(c.rooms, "教室", 50, (r) => {
    const id = key(r.id, "教室编号");
    const rounds = r.rounds === undefined ? saved?.rooms.find((room) => room.id === id)?.rounds : r.rounds;
    return {
      id,
      name: str(r.name, "教室名"),
      ...(rounds !== undefined && { rounds: num(rounds, "课堂轮数", 1, 250, true) }),
      experience: num(r.experience, "体验配额", 0, 500, true),
      observer: num(r.observer, "观察配额", 0, 500, true)
    };
  });
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
  const roomsById = new Map(rooms.map((r) => [r.id, r])),
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
    if (r.kind === "class") {
      const classroom = roomsById.get(room);
      if (!classroom) fail("教室不存在");
      if (classroom.rounds !== undefined && round > classroom.rounds)
        fail(
          classroom.name +
            "设置了 " +
            classroom.rounds +
            " 轮，已有场次排在第 " +
            round +
            " 轮，请调整轮数或重新排场"
        );
    }
    const slot = [r.kind, room, round].join("/"),
      assigned = [r.kind, teacher].join("/");
    if (slots.has(slot) || teacherSlots.has(assigned)) fail("同一时段教室或教师重复排场");
    slots.add(slot);
    teacherSlots.add(assigned);
    if (room) {
      const topic = room + "/" + teachers.find((t) => t.id === teacher)!.topic.trim();
      if (topics.has(topic)) fail("同一教室内各轮的课题应互异");
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
    if (!activeRoles.has(r.role)) fail("请先为 " + (r.name || r.id) + " 分配有效的评委类型");
    const userId = str(r.userId, "用户编号", 100, false),
      phone = str(r.phone, "实名手机号", 24, false),
      role = r.role as JudgeRole;
    if (phone && !/^1\d{10}$/.test(phone)) fail("手机号格式有误");
    for (const identity of [userId && "u:" + userId, phone && "p:" + phone].filter(Boolean)) {
      const bucket = (stageOf(role) === "ted" ? "ted/" : "class/") + identity;
      if (identities.has(bucket)) fail("同一实名身份在同一环节重复分配");
      identities.add(bucket);
    }
    const room = stageOf(role) === "ted" ? "" : key(r.room, "教室编号");
    if (room && !roomsById.has(room)) fail("分配教室不存在");
    return {
      id: key(r.id, "评委编号"),
      name: str(r.name, "姓名", 50),
      org: str(r.org, "机构名称", 120, false),
      role,
      room,
      userId,
      phone
    };
  });
  const merits = rows(c.merits, "优秀奖名单", 500, (r) => ({
    id: key(r.id, "教师编号"),
    name: str(r.name, "姓名", 50),
    org: str(r.org, "机构")
  }));
  if (merits.some((m) => teacherIds.has(m.id))) fail("优秀奖名单与总决赛教师编号重复");
  const targets =
    c.awardTargets === undefined
      ? (saved?.awardTargets ?? legacyAwardTargets(rehearsal))
      : object(c.awardTargets);
  const awardTargets = {
    merits: targets.merits === null ? null : num(targets.merits, "优秀奖核对人数", 0, 500, true),
    schools: targets.schools === null ? null : num(targets.schools, "示范校核对数量", 0, 150, true)
  };
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
    look: validateLook(c.look, previousEntry),
    rooms,
    teachers,
    sessions,
    judges,
    merits,
    awardTargets,
    roleOptions,
    rubrics: Object.fromEntries(
      roleOptions.map(({ id }) => [id, validateRubric(forms[id], id)])
    ) as JudgingConfig["rubrics"],
    sameAudienceForm:
      bool(c.sameAudienceForm, "观察席共用表") &&
      activeRoles.has("experience") &&
      activeRoles.has("observer"),
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
  if (!rehearsal && !c.approvedForms) fail("请在「评分表与规则」核对并确认本场评分细则");
  for (const t of c.teachers)
    if (c.sessions.filter((s) => s.teacher === t.id).length !== 2) fail(t.name + " 缺少课堂或 TED 场次");
  for (const r of c.rooms) {
    if (!c.sessions.some((s) => s.kind === "class" && s.room === r.id)) continue;
    const js = c.judges.filter((j) => j.room === r.id);
    if (js.filter((j) => stageOf(j.role) === "professional").length !== 1)
      fail(r.name + " 需分配一位按专业分计分的讲师");
    if (
      js.filter((j) => baseJudgeRole(j.role) === "experience").length > r.experience ||
      js.filter((j) => baseJudgeRole(j.role) === "observer").length > r.observer
    )
      fail(r.name + " 已分配人数超过配额");
    if (js.filter((j) => stageOf(j.role) === "audience").length < c.minimum.audience)
      fail(r.name + " 大众名单人数低于最低有效份数");
    if (c.minimum.professional > 1) fail(r.name + " 仅分配一位专业分评委，专业最低有效份数应为 1");
  }
  if (c.judges.filter((j) => stageOf(j.role) === "ted").length < c.minimum.ted)
    fail("TED 分评委人数低于最低有效份数，请补齐采用 TED 计分的评委");
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
