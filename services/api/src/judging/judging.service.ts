import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type JudgingEvent } from "@prisma/client";
import {
  assigned,
  baseJudgeRole,
  defaultEntryDesign,
  defaultJudgingConfig,
  defaultJudgingControl,
  rehearsalUserId,
  guestScoringPath,
  isJudgeRoleId,
  judgingRoleLabel,
  judgingRoles,
  roleForSession,
  rubricFor,
  stageOf,
  maxPoints,
  taskKey
} from "@conference/shared";
import type {
  Answers,
  AwardField,
  Judge,
  JudgeRole,
  JudgingConfig,
  JudgingControl,
  GuestDesk,
  JudgingSession,
  Rubric,
  ScoreReceipt,
  ScoringView
} from "@conference/shared";
import type { CurrentAdmin } from "../admin/current-admin";
import type { CurrentUser } from "../auth/current-user";
import {
  createGuestEntry,
  guestSeat,
  identifyGuest,
  publicSeat,
  requireGuestEntry,
  type GuestEntry
} from "./guest-entry";
import { PrismaService } from "../prisma.service";
import { awardReport, calculate, scoringTasks, type JudgingSnapshot } from "./results";
import {
  evaluate,
  fail,
  key,
  object,
  points,
  str,
  validateConfig,
  validateLook,
  validateStart
} from "./validation";

type Tx = Prisma.TransactionClient;
const deletedPhase = "DELETED";
const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue;
function config(e: JudgingEvent): JudgingConfig {
  const stored = e.config as unknown as JudgingConfig;
  return {
    ...stored,
    roleOptions: judgingRoles(stored),
    look: { ...stored.look, entry: { ...defaultEntryDesign, ...stored.look.entry } }
  };
}
function freezeSessionForms(c: JudgingConfig, state: JudgingControl, sessionId: string) {
  state.sessionForms[sessionId] ??= {
    rubrics: c.rubrics,
    roleOptions: c.roleOptions,
    sameAudienceForm: c.sameAudienceForm,
    formVersion: c.formVersion
  };
}
function transferLiveRoles(c: JudgingConfig, state: JudgingControl, raw: unknown) {
  const transfers = object(raw ?? {});
  const byId = new Map(c.judges.map((j) => [j.id, j]));
  const changed = new Map<string, JudgeRole>();
  for (const [id, next] of Object.entries(transfers)) {
    const judge = byId.get(id);
    if (!judge || typeof next !== "string" || !isJudgeRoleId(next)) fail("评委或目标类型无效");
    if (baseJudgeRole(next) !== baseJudgeRole(judge.role)) fail("现场只能转入相同计分方式和席位配额的类型");
    if (judge.role !== next) changed.set(id, next);
  }
  if (!changed.size) return c.judges;
  for (const s of c.sessions) {
    const frozen = state.sessionForms[s.id];
    if (!frozen) continue;
    for (const id of changed.keys()) {
      const judge = byId.get(id)!;
      if (assigned(s, judge)) {
        frozen.judgeRoles ??= {};
        frozen.judgeRoles[id] ??= judge.role;
      }
    }
    frozen.roleOptions ??= judgingRoles(c);
  }
  return c.judges.map((j) => ({ ...j, role: changed.get(j.id) ?? j.role }));
}
const control = (e: JudgingEvent) => e.control as unknown as JudgingControl & { guestEntry?: GuestEntry };
export const allowed = (a: CurrentAdmin, p: string) =>
  Boolean(a.permissions?.includes("*") || a.permissions?.includes(p));
function permit(a: CurrentAdmin, p: string) {
  if (!allowed(a, p)) throw new ForbiddenException("当前岗位无此操作权限");
}
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Shanghai" }).format(new Date());
const summary = (e: JudgingEvent) => ({
  id: e.id,
  title: e.title,
  rehearsal: e.rehearsal,
  phase: e.phase,
  revision: e.revision,
  edition: e.edition,
  publishedEdition: e.publishedEdition
});
const listedSchools = (c: JudgingConfig) => [
  ...new Map(c.teachers.map((t) => [t.orgId, { id: t.orgId, name: t.org }])).values()
];
function registrationCompany(data: Prisma.JsonValue) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  return typeof data.company === "string" ? data.company.trim() : "";
}
const teacherOf = (c: JudgingConfig, s: JudgingSession) => c.teachers.find((t) => t.id === s.teacher)!;
const roomName = (c: JudgingConfig, s: JudgingSession) =>
  s.kind === "ted" ? "TED 主会场" : (c.rooms.find((r) => r.id === s.room)?.name ?? s.room);
function phase(e: JudgingEvent, ...choices: string[]) {
  if (!choices.includes(e.phase)) throw new ConflictException("当前赛事状态不允许此操作，请刷新");
}
function scope(e: JudgingEvent, a: CurrentAdmin) {
  if (a.conferenceScopeMode !== "ALL" && !e.staffIds.includes(a.id) && e.confirmerId !== a.id)
    throw new ForbiddenException("账号未获本赛事授权");
}
async function getEvent(tx: Tx, id: string, lock = false) {
  if (lock) await tx.$queryRaw`SELECT id FROM judging_events WHERE id = ${id} FOR UPDATE`;
  const e = await tx.judgingEvent.findUnique({ where: { id } });
  if (!e || e.phase === deletedPhase) throw new NotFoundException("赛事不存在");
  return e;
}
const stale = () => new ConflictException("数据版本已更新，请刷新后重新核对");
function sessionOf(c: JudgingConfig, id: unknown) {
  const s = c.sessions.find((x) => x.id === id);
  if (!s) fail("场次不存在");
  return s;
}
type GuestScorer = { entryCode: string; ticket: string };
type Scorer = CurrentUser | { operator: CurrentAdmin; judgeKey: string } | GuestScorer;
const guestBallotOwner = (event: string, judge: string) => "h5:" + event + ":" + judge;
function isRehearsalSeat(e: JudgingEvent, j: Judge) {
  return e.rehearsal && !j.phone && j.userId === rehearsalUserId(e.id, j.id);
}
function scoringSeats(e: JudgingEvent, c: JudgingConfig, principal: Scorer): Judge[] {
  if ("entryCode" in principal) {
    const entry = requireGuestEntry(control(e).guestEntry, principal.entryCode);
    return [guestSeat(entry, c.judges, principal.ticket)];
  }
  if ("operator" in principal) {
    permit(principal.operator, "judging:floor");
    scope(e, principal.operator);
    const judge = c.judges.find((j) => j.id === principal.judgeKey);
    if (!judge || !isRehearsalSeat(e, judge))
      throw new ForbiddenException("仅联排赛事中专门创建的模拟席位可试交");
    return [judge];
  }
  if (!e.rehearsal && (!principal.openid || principal.openid.startsWith("mock_")))
    throw new ForbiddenException("请使用观潮会集微信小程序实名登录");
  return c.judges.filter((j) =>
    j.userId
      ? j.userId === principal.id
      : Boolean(principal.phoneVerifiedAt && principal.phone && principal.phone === j.phone)
  );
}
function findJudge(c: JudgingConfig, s: JudgingSession, parts: Judge[]) {
  const matches = parts.filter((j) => assigned(s, j));
  if (matches.length !== 1) {
    const room = c.rooms.find((r) => r.id === parts.find((j) => j.room)?.room)?.name;
    throw new ForbiddenException(
      room ? "未分配此场次，您的教室为 " + room : "未匹配本场实名名单，请联系场控"
    );
  }
  return matches[0];
}
function isOpen(e: JudgingEvent, s: JudgingSession, j: Judge) {
  const state = control(e),
    exception = state.exceptions[taskKey(s.id, j.id)];
  if (exception?.kind === "absent") return false;
  return (
    (e.phase === "LIVE" && state.gates[s.id] === "open") ||
    (["LIVE", "REVIEW"].includes(e.phase) && exception?.kind === "makeup")
  );
}
function receipt(b: { id: string; createdAt: Date }, c: JudgingConfig, s: JudgingSession): ScoreReceipt {
  return {
    id: b.id,
    teacher: teacherOf(c, s).name,
    session: roomName(c, s) + " · " + (s.kind === "ted" ? "第 " + s.round + " 位" : "第 " + s.round + " 轮"),
    at: b.createdAt.toISOString(),
    status: "received"
  };
}
async function requireNamedAccount(tx: Tx, id: string, rehearsal: boolean) {
  const account = await tx.adminUser.findFirst({
    where: {
      id,
      enabled: true,
      ...(rehearsal
        ? {}
        : {
            mobileBindings: {
              some: { enabled: true, user: { realName: "王红丽", phoneVerifiedAt: { not: null } } }
            }
          })
    },
    select: { id: true }
  });
  if (!account)
    fail(rehearsal ? "请选择启用的后台账号" : "请绑定已关联王红丽老师实名、已验证手机号的后台账号");
}
async function audit(tx: Tx, e: JudgingEvent, a: CurrentAdmin, action: string, detail: unknown) {
  await tx.judgingAudit.create({
    data: { eventId: e.id, edition: e.edition, actor: a.id, action, detail: json(detail) }
  });
}

@Injectable()
export class JudgingService {
  constructor(private readonly db: PrismaService) {}
  protected publicationDay() {
    return today();
  }
  async list(a: CurrentAdmin) {
    return this.db.judgingEvent.findMany({
      select: {
        id: true,
        title: true,
        rehearsal: true,
        phase: true,
        revision: true,
        edition: true,
        publishedEdition: true
      },
      where: {
        phase: { not: deletedPhase },
        ...(a.conferenceScopeMode === "ALL"
          ? {}
          : { OR: [{ staffIds: { has: a.id } }, { confirmerId: a.id }] })
      },
      orderBy: { createdAt: "desc" }
    });
  }
  async create(raw: unknown, a: CurrentAdmin) {
    permit(a, "judging:config");
    if (a.conferenceScopeMode !== "ALL") throw new ForbiddenException("新建赛事需要全局授权");
    const b = object(raw);
    if (typeof b.rehearsal !== "boolean") fail("请选择正式赛或联排");
    const e = await this.db.judgingEvent.create({
      data: {
        title: str(b.title, "赛事名称"),
        rehearsal: b.rehearsal,
        config: json(defaultJudgingConfig()),
        control: json(defaultJudgingControl()),
        staffIds: [a.id]
      }
    });
    return summary(e);
  }
  async detail(id: string, a: CurrentAdmin) {
    const e = await getEvent(this.db, id);
    scope(e, a);
    const c = config(e),
      state = control(e),
      manage = allowed(a, "judging:config"),
      floor = allowed(a, "judging:floor");
    return {
      ...summary(e),
      entryCode: floor || manage ? state.guestEntry?.code || null : null,
      confirmerId: e.confirmerId,
      staffIds: allowed(a, "system:account") ? e.staffIds : [],
      config: manage
        ? c
        : {
            ...c,
            merits: [],
            teachers: c.teachers.map((t) => ({ ...t, prior: null, qualifierRank: null })),
            judges:
              floor || allowed(a, "judging:results")
                ? c.judges.map((j) => ({ ...j, phone: "", userId: "" }))
                : []
          },
      gates: state.gates,
      editions: (
        await this.db.judgingEdition.findMany({
          where: { eventId: id },
          select: { edition: true, confirmedAt: true, snapshot: true },
          orderBy: { edition: "desc" }
        })
      ).map((v) => ({
        edition: v.edition,
        confirmedAt: v.confirmedAt,
        fields: (v.snapshot as unknown as JudgingSnapshot).fields
      }))
    };
  }
  async requireDesignEditor(id: string, a: CurrentAdmin) {
    permit(a, "judging:config");
    const e = await getEvent(this.db, id);
    scope(e, a);
    phase(e, "SETUP", "LIVE", "REVIEW");
  }
  async sourceConferences(id: string, a: CurrentAdmin) {
    permit(a, "judging:config");
    permit(a, "registration:export");
    scope(await getEvent(this.db, id), a);
    return this.db.conference.findMany({
      where: a.conferenceScopeMode === "ALL" ? {} : { id: { in: a.conferenceIds ?? [] } },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" }
    });
  }
  async registered(id: string, conferenceId: string, keyword: string, a: CurrentAdmin) {
    permit(a, "judging:config");
    permit(a, "registration:export");
    scope(await getEvent(this.db, id), a);
    if (a.conferenceScopeMode !== "ALL" && !a.conferenceIds?.includes(conferenceId))
      throw new ForbiddenException("无权导入此会议的报名名单");
    const term = str(keyword, "搜索词", 80, false);
    const where = { conferenceId, status: "CONFIRMED" as const };
    const [attendees, singles] = await Promise.all([
      this.db.registrationAttendee.findMany({
        where: { registration: where, ...(term ? { name: { contains: term } } : {}) },
        take: 501,
        select: {
          id: true,
          name: true,
          company: true,
          formDataJson: true,
          phone: true,
          guestProfile: { select: { user: { select: { id: true, phone: true, phoneVerifiedAt: true } } } }
        }
      }),
      this.db.registration.findMany({
        where: { ...where, attendees: { none: {} }, ...(term ? { attendeeName: { contains: term } } : {}) },
        take: 501,
        select: { id: true, attendeeName: true, phone: true, formDataJson: true }
      })
    ]);
    if (attendees.length + singles.length > 500) fail("超过 500 人，请按姓名缩小范围");
    return [
      ...attendees.map((r) => ({
        id: r.id,
        name: r.name,
        org: r.company || registrationCompany(r.formDataJson),
        phone: r.phone,
        userId:
          r.guestProfile?.user?.phoneVerifiedAt && r.guestProfile.user.phone === r.phone
            ? r.guestProfile.user.id
            : ""
      })),
      ...singles.map((r) => ({
        id: r.id,
        name: r.attendeeName,
        org: registrationCompany(r.formDataJson),
        phone: r.phone,
        userId: ""
      }))
    ];
  }
  async accounts(a: CurrentAdmin) {
    permit(a, "system:account");
    return this.db.adminUser.findMany({
      where: { enabled: true },
      select: { id: true, username: true, displayName: true },
      orderBy: { username: "asc" }
    });
  }
  async progress(id: string, a: CurrentAdmin) {
    permit(a, "judging:floor");
    return this.db.$transaction(
      async (tx) => {
        const e = await getEvent(tx, id);
        scope(e, a);
        const state = control(e);
        const c = config(e),
          rehearsalSeats = new Set(c.judges.filter((j) => isRehearsalSeat(e, j)).map((j) => j.id));
        const ballots = await tx.judgingBallot.findMany({
          where: { eventId: id },
          select: { id: true, sessionKey: true, judgeKey: true, status: true }
        });
        return {
          revision: e.revision,
          gates: state.gates,
          phase: e.phase,
          tasks: scoringTasks(c, state, ballots).map((t) => ({
            ...t,
            canRehearse: rehearsalSeats.has(t.judgeId)
          }))
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  async results(id: string, a: CurrentAdmin) {
    permit(a, "judging:results");
    return this.db.$transaction(
      async (tx) => {
        const e = await getEvent(tx, id);
        scope(e, a);
        return this.resultData(tx, e);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead }
    );
  }
  private async resultData(tx: Tx, e: JudgingEvent) {
    const c = config(e),
      state = control(e),
      ballots = await tx.judgingBallot.findMany({ where: { eventId: e.id }, orderBy: { createdAt: "asc" } });
    const rows = calculate(c, state, ballots);
    return {
      revision: e.revision,
      rows,
      merits: c.merits,
      schools: listedSchools(c),
      ballots: ballots.map((b) => ({
        ...b,
        roleLabel: judgingRoleLabel(state.sessionForms[b.sessionKey] ?? c, b.role as JudgeRole),
        correction: state.corrections[b.id] ?? null
      })),
      ties: state.ties,
      log: await tx.judgingAudit.findMany({ where: { eventId: e.id }, orderBy: { createdAt: "desc" } })
    };
  }
  async checkConfig(id: string, raw: unknown, a: CurrentAdmin) {
    permit(a, "judging:config");
    const e = await getEvent(this.db, id);
    scope(e, a);
    const saved = config(e);
    const c = validateConfig(raw, e.rehearsal, saved.look.entry, saved);
    const names = new Set<string>(),
      warnings: string[] = [];
    for (const person of [...c.teachers, ...c.judges]) {
      if (names.has(person.name)) warnings.push("重名请核对编号：" + person.name);
      names.add(person.name);
    }
    let readiness = "";
    try {
      validateStart(c, e.rehearsal);
    } catch (error) {
      readiness = (error as Error).message;
    }
    return {
      teachers: c.teachers.length,
      judges: c.judges.length,
      sessions: c.sessions.length,
      warnings,
      readiness
    };
  }
  async link(id: string, session: string, a: CurrentAdmin) {
    permit(a, "judging:floor");
    const e = await getEvent(this.db, id);
    scope(e, a);
    sessionOf(config(e), session);
    const entry = control(e).guestEntry;
    if (!entry) fail("请先在操作首页发布评分入口");
    const path = guestScoringPath(id, entry.code);
    return { path, url: "https://m.guanchaohuiji.com/#/" + path };
  }
  async change(id: string, raw: unknown, a: CurrentAdmin) {
    const b = object(raw),
      action = str(b.action, "操作", 32);
    const rights: Record<string, string> = {
      delete: "config",
      "entry-open": "floor",
      "entry-close": "floor",
      config: "config",
      forms: "config",
      appearance: "config",
      handover: "config",
      access: "config",
      start: "floor",
      gate: "floor",
      attendance: "floor",
      finish: "floor",
      correction: "adjust",
      adjust: "adjust",
      tie: "adjust",
      send: "adjust",
      confirm: "confirm",
      revise: "adjust",
      publish: "publish"
    };
    if (!Object.hasOwn(rights, action)) fail("未知操作");
    permit(a, "judging:" + rights[action]);
    if (action === "delete" && a.conferenceScopeMode !== "ALL")
      throw new ForbiddenException("删除赛事需要全局授权");
    return this.db.$transaction(
      async (tx) => {
        const e = await getEvent(tx, id, true);
        scope(e, a);
        if (b.revision !== e.revision) throw stale();
        const c = config(e),
          state = control(e),
          data: Prisma.JudgingEventUpdateInput = { revision: { increment: 1 } };
        let evidence: unknown = {};
        if (action === "delete") {
          data.phase = deletedPhase;
          delete state.guestEntry;
          evidence = { previousPhase: e.phase };
        } else if (action === "entry-open") {
          phase(e, "SETUP", "LIVE", "REVIEW");
          state.guestEntry ??= createGuestEntry();
        } else if (action === "entry-close") {
          delete state.guestEntry;
        } else if (action === "config") {
          phase(e, "SETUP");
          const next = validateConfig(b.config, e.rehearsal, c.look.entry, c);
          next.formVersion = c.formVersion + 1;
          data.config = json(next);
          data.title = str(b.title, "赛事名称");
          evidence = { formVersion: next.formVersion };
        } else if (action === "forms") {
          phase(e, "LIVE");
          // Older events could authorize a makeup before the first normal opening.
          for (const [key, exception] of Object.entries(state.exceptions)) {
            if (exception.kind === "makeup") freezeSessionForms(c, state, key.split("/")[0]);
          }
          const next = validateConfig(
            {
              ...c,
              judges: transferLiveRoles(c, state, b.roleTransfers),
              roleOptions: b.roleOptions ?? c.roleOptions,
              rubrics: b.roleOptions === undefined ? { ...c.rubrics, ...object(b.rubrics) } : b.rubrics,
              sameAudienceForm: b.sameAudienceForm,
              approvedForms: b.approvedForms
            },
            e.rehearsal
          );
          if (!e.rehearsal && !next.approvedForms) fail("正式评分表须先确认细则");
          c.rubrics = next.rubrics;
          c.roleOptions = next.roleOptions;
          c.judges = next.judges;
          c.sameAudienceForm = next.sameAudienceForm;
          c.approvedForms = next.approvedForms;
          c.formVersion++;
          data.config = json(c);
          evidence = { formVersion: c.formVersion };
        } else if (action === "handover") {
          phase(e, "LIVE", "REVIEW");
          if (!Array.isArray(b.teachers)) fail("复赛资料无效");
          const before = {
            merits: c.merits,
            teachers: c.teachers.map((t) => ({ id: t.id, prior: t.prior, qualifierRank: t.qualifierRank }))
          };
          const records = new Map(
            b.teachers.map((t: unknown) => {
              const r = object(t);
              return [key(r.id, "教师编号"), r] as const;
            })
          );
          if (records.size !== c.teachers.length || c.teachers.some((t) => !records.has(t.id)))
            fail("复赛资料与选手不匹配");
          const next = validateConfig(
            {
              ...c,
              merits: b.merits,
              teachers: c.teachers.map((t) => ({
                ...t,
                prior: records.get(t.id)!.prior,
                qualifierRank: records.get(t.id)!.qualifierRank
              }))
            },
            e.rehearsal
          );
          c.teachers = next.teachers;
          c.merits = next.merits;
          state.ties = [];
          data.config = json(c);
          evidence = { before, after: { merits: c.merits, teachers: b.teachers } };
        } else if (action === "appearance") {
          phase(e, "SETUP", "LIVE", "REVIEW");
          c.look = validateLook(b.look, c.look.entry);
          data.config = json(c);
        } else if (action === "access") {
          permit(a, "system:account");
          if (a.conferenceScopeMode !== "ALL") throw new ForbiddenException("无赛事授权管理权限");
          phase(e, "SETUP", "LIVE", "REVIEW");
          if (!Array.isArray(b.staffIds) || b.staffIds.length > 300) fail("无效授权名单");
          const ids = [...new Set<string>(b.staffIds.map((v: unknown) => key(v, "后台账号")))];
          if ((await tx.adminUser.count({ where: { id: { in: ids }, enabled: true } })) !== ids.length)
            fail("授权名单中存在无效账号");
          const confirmer = b.confirmerId ? key(b.confirmerId, "确认人") : null;
          if (confirmer) await requireNamedAccount(tx, confirmer, e.rehearsal);
          data.staffIds = ids;
          data.confirmerId = confirmer;
          evidence = { previous: e.confirmerId, confirmer, staffIds: ids };
        } else if (action === "start") {
          phase(e, "SETUP");
          validateStart(c, e.rehearsal);
          data.phase = "LIVE";
        } else if (action === "gate") {
          phase(e, "LIVE");
          const s = sessionOf(c, b.session);
          if (typeof b.open !== "boolean") fail("请选择开关状态");
          if (
            b.open &&
            s.kind === "class" &&
            c.sessions.some(
              (x) => x.kind === "class" && x.room === s.room && x.id !== s.id && state.gates[x.id] === "open"
            )
          )
            fail("请先截止本教室上一场");
          if (
            b.open &&
            s.kind === "ted" &&
            c.sessions.some((x) => x.kind === "ted" && x.id !== s.id && state.gates[x.id] === "open")
          )
            fail("请先截止上一位 TED 选手");
          if (b.open) freezeSessionForms(c, state, s.id);
          state.gates[s.id] = b.open ? "open" : "closed";
          evidence = { session: s.id, open: b.open };
        } else if (action === "attendance") {
          phase(e, "LIVE", "REVIEW");
          const s = sessionOf(c, b.session),
            j = c.judges.find((j) => j.id === b.judge);
          if (!j || !assigned(s, j) || !["absent", "makeup", "present"].includes(b.kind))
            fail("无效的应评任务");
          if (
            await tx.judgingBallot.findUnique({
              where: { eventId_sessionKey_judgeKey: { eventId: id, sessionKey: s.id, judgeKey: j.id } }
            })
          )
            fail("已有原单，请走原单复核流程");
          const k = taskKey(s.id, j.id);
          if (b.kind === "present") {
            state.present[k] = true;
            if (state.exceptions[k]?.kind === "absent") delete state.exceptions[k];
          } else {
            state.exceptions[k] = { kind: b.kind, reason: str(b.reason, "原因", 500) };
            if (b.kind === "makeup") freezeSessionForms(c, state, s.id);
            if (b.kind === "absent") delete state.present[k];
          }
          evidence = { session: s.id, judge: j.id, kind: b.kind, reason: state.exceptions[k]?.reason };
        } else if (action === "finish") {
          phase(e, "LIVE");
          if (c.sessions.some((s) => state.gates[s.id] !== "closed")) fail("请逐场截止所有课堂与 TED 评分");
          for (const k of Object.keys(state.exceptions))
            if (state.exceptions[k].kind === "makeup") delete state.exceptions[k];
          data.phase = "REVIEW";
        } else if (action === "revise") {
          phase(e, "LOCKED");
          data.phase = "REVIEW";
          data.edition = e.edition + 1;
          evidence = { from: e.edition, reason: str(b.reason, "修订原因", 500) };
        } else if (action === "publish") {
          phase(e, "LOCKED");
          if (e.rehearsal || this.publicationDay() < c.publicDay)
            fail("尚未到正式公布日期，联排成绩只供内部使用");
          const snap = await tx.judgingEdition.findUniqueOrThrow({
            where: { eventId_edition: { eventId: id, edition: e.edition } }
          });
          const fields = (snap.snapshot as unknown as JudgingSnapshot).fields;
          if (
            !Array.isArray(b.fields) ||
            !b.fields.includes("name") ||
            b.fields.some((f: AwardField) => !fields.includes(f))
          )
            fail("公布字段超出已确认范围");
          data.publishedEdition = e.edition;
          data.publishedFields = [...new Set<string>(b.fields)];
          evidence = { fields: b.fields };
        } else {
          phase(e, ...(action === "confirm" ? ["SUBMITTED"] : ["REVIEW", "SUBMITTED"]));
          if (action === "confirm") {
            if (e.confirmerId !== a.id) throw new ForbiddenException("仅绑定的本人账号可确认");
            await requireNamedAccount(tx, a.id, e.rehearsal);
          }
          const ballots = await tx.judgingBallot.findMany({ where: { eventId: id } }),
            rows = calculate(c, state, ballots);
          if (action === "correction") {
            const ballot = ballots.find((x) => x.id === b.ballotId);
            if (!ballot) fail("找不到原单");
            const reason = str(b.reason, "更正原因", 500),
              before = state.corrections[ballot.id] ?? {
                units: ballot.units,
                answers: ballot.answers,
                status: ballot.status
              };
            const result =
              b.void === true
                ? { units: null, answers: ballot.answers as Answers, status: "void" }
                : evaluate(ballot.rubric as unknown as Rubric, b.answers);
            const fix = { ...result, reason, actor: a.id, at: new Date().toISOString() };
            state.corrections[ballot.id] = fix;
            if (state.adjustments[ballot.teacherKey]) state.adjustments[ballot.teacherKey].recheck = true;
            state.ties = [];
            data.phase = "REVIEW";
            evidence = { ballot: ballot.id, before, after: fix };
          } else if (action === "adjust") {
            const row = rows.find((r) => r.id === b.teacher);
            if (!row || row.system === null) fail("缺少有效分项，无法直接调整总分");
            const value = points(b.value, "百分制总分"),
              reason = str(b.reason, "调分原因", 500);
            const valueInfo = {
              value,
              before: row.total!,
              actor: a.id,
              reason,
              at: new Date().toISOString(),
              recheck: false
            };
            state.adjustments[row.id] = valueInfo;
            state.ties = [];
            data.phase = "REVIEW";
            evidence = { teacher: row.id, system: row.system, ...valueInfo };
          } else if (action === "tie") {
            const ids = b.ids as unknown[];
            if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length)
              fail("请填写全部同分教师的裁定顺序");
            const group = rows.find(
              (r) => r.tie.length === ids.length && r.tie.every((t) => ids.includes(t))
            );
            if (!group) fail("仅可裁定总分及三项分完全相同的组");
            const tie = { ids: ids as string[], reason: str(b.reason, "复赛裁定依据", 600), actor: a.id };
            state.ties.push(tie);
            data.phase = "REVIEW";
            evidence = tie;
          } else {
            if (b.reviewedRevision !== e.revision) throw stale();
            if (!e.confirmerId) fail("请先绑定最终确认账号");
            if (rows.some((r) => r.rank === null || r.adjustment?.recheck))
              fail("请先处理缺分、全同分或需重新核对的调分");
            const tasks = scoringTasks(c, state, ballots);
            if (tasks.some((t) => ["waiting", "makeup", "pending"].includes(t.status)))
              fail("还有待交、待补或待核原单，请先处理或登记弃评");
            if (
              !e.rehearsal &&
              (c.merits.length !== 19 || new Set(c.teachers.map((t) => t.orgId)).size !== 13)
            )
              fail("请核对 19 名优秀奖和 13 所教学示范校");
            if (action === "send") {
              data.phase = "SUBMITTED";
            } else {
              const snapshot: JudgingSnapshot = {
                rows,
                merits: c.merits,
                schools: listedSchools(c),
                fields: c.publicFields,
                display: c.display
              };
              await tx.judgingEdition.create({
                data: {
                  eventId: id,
                  edition: e.edition,
                  revision: e.revision,
                  confirmedBy: a.id,
                  snapshot: json(snapshot)
                }
              });
              data.phase = "LOCKED";
              evidence = { edition: e.edition, reviewedRevision: e.revision };
            }
          }
        }
        data.control = json(state);
        await audit(tx, e, a, action, evidence);
        return summary(await tx.judgingEvent.update({ where: { id }, data }));
      },
      { timeout: 15000 }
    );
  }
  async entryInfo(id: string, code: string) {
    const e = await getEvent(this.db, id);
    requireGuestEntry(control(e).guestEntry, code);
    return { title: e.title, rehearsal: e.rehearsal, look: config(e).look };
  }
  async identify(id: string, code: string, raw: unknown) {
    const e = await getEvent(this.db, id);
    return identifyGuest(requireGuestEntry(control(e).guestEntry, code), config(e).judges, raw);
  }
  async guestDesk(id: string, code: string, ticket: string, sid?: string): Promise<GuestDesk> {
    const e = await getEvent(this.db, id);
    const c = config(e);
    const seats = scoringSeats(e, c, { entryCode: code, ticket });
    const page = await this.scoreView(e, seats, sid);
    return {
      judge: {
        ...publicSeat(seats[0]),
        role: page?.role ?? seats[0].role,
        roleLabel: page?.roleLabel ?? judgingRoleLabel(c, seats[0].role)
      },
      page
    };
  }
  async mobile(id: string, sid: string, principal: Scorer): Promise<ScoringView> {
    const e = await getEvent(this.db, id);
    const seats = scoringSeats(e, config(e), principal);
    const view = await this.scoreView(e, seats, sid);
    if (!view) fail("场次不存在");
    if ("operator" in principal) view.rehearsalSeat = seats[0].name;
    return view;
  }
  private async scoreView(e: JudgingEvent, mine: Judge[], sid?: string): Promise<ScoringView | null> {
    const c = config(e);
    const state = control(e);
    const ballots = await this.db.judgingBallot.findMany({
      where: { eventId: e.id, judgeKey: { in: mine.map((j) => j.id) } },
      select: { id: true, createdAt: true, sessionKey: true, judgeKey: true }
    });
    const bySeat = new Map(ballots.map((b) => [taskKey(b.sessionKey, b.judgeKey), b]));
    const tasks = c.sessions
      .flatMap((s) =>
        mine
          .filter((j) => assigned(s, j))
          .map((j) => ({
            sessionId: s.id,
            teacher: teacherOf(c, s).name,
            time: s.time,
            room: roomName(c, s),
            round: s.round,
            role: roleForSession(state.sessionForms[s.id], j),
            status: bySeat.has(taskKey(s.id, j.id)) ? "已交" : isOpen(e, s, j) ? "评分中" : "待开放或已截止"
          }))
      )
      .sort((a, b) => a.round - b.round);
    const next =
      tasks.find((t) => t.status === "评分中") ||
      tasks.find((t) => t.status !== "已交") ||
      tasks[tasks.length - 1];
    if (!sid && !next) return null;
    const s = sessionOf(c, sid || next!.sessionId);
    const j = findJudge(c, s, mine),
      teacher = teacherOf(c, s);
    const frozen = state.sessionForms[s.id],
      sessionForm = frozen ?? c,
      role = roleForSession(frozen, j),
      ballot = bySeat.get(taskKey(s.id, j.id));
    return {
      title: e.title,
      rehearsal: e.rehearsal,
      look: c.look,
      teacher: {
        name: teacher.name,
        org: teacher.org,
        photo: teacher.photo,
        poster: teacher.poster,
        topic: s.kind === "ted" ? teacher.speech : teacher.topic
      },
      session: { id: s.id, room: roomName(c, s), round: s.round, time: s.time, kind: s.kind },
      role,
      roleLabel: judgingRoleLabel(sessionForm, role),
      form: rubricFor(sessionForm, role),
      formVersion: sessionForm.formVersion,
      max: maxPoints[stageOf(role)],
      open: isOpen(e, s, j),
      receipt: ballot ? receipt(ballot, c, s) : null,
      tasks
    };
  }
  async submit(id: string, sid: string, raw: unknown, principal: Scorer) {
    const b = object(raw);
    return this.db.$transaction(
      async (tx) => {
        const e = await getEvent(tx, id, true),
          c = config(e),
          s = sessionOf(c, sid),
          j = findJudge(c, s, scoringSeats(e, c, principal));
        const guestOwner = guestBallotOwner(id, j.id);
        const owner =
          "entryCode" in principal ? guestOwner : "operator" in principal ? j.userId : principal.id;
        const existing = await tx.judgingBallot.findUnique({
          where: { eventId_sessionKey_judgeKey: { eventId: id, sessionKey: sid, judgeKey: j.id } }
        });
        if (existing) {
          if (!("entryCode" in principal) && existing.userId !== owner && existing.userId !== guestOwner)
            throw new ForbiddenException("实名任务已由绑定账号领取");
          return receipt(existing, c, s);
        }
        if (!isOpen(e, s, j)) throw new ConflictException("本场尚未开放或已截止");
        const frozen = control(e).sessionForms[s.id],
          sessionForm = frozen ?? c,
          role = roleForSession(frozen, j);
        if (b.formVersion !== sessionForm.formVersion) throw stale();
        const form = rubricFor(sessionForm, role),
          res = evaluate(form, b.answers);
        const record = await tx.judgingBallot.create({
          data: {
            eventId: id,
            sessionKey: sid,
            judgeKey: j.id,
            teacherKey: s.teacher,
            role,
            userId: owner,
            rubric: json({ ...form, version: sessionForm.formVersion }),
            answers: json(res.answers),
            units: res.units,
            status: res.status
          }
        });
        const state = control(e);
        delete state.exceptions[taskKey(sid, j.id)];
        state.ties = [];
        if (state.adjustments[s.teacher]) state.adjustments[s.teacher].recheck = true;
        const data: Prisma.JudgingEventUpdateInput = { revision: { increment: 1 }, control: json(state) };
        if (!j.userId && "id" in principal) {
          j.userId = principal.id;
          data.config = json(c);
        }
        if ("operator" in principal)
          await audit(tx, e, principal.operator, "rehearsal-submit", {
            session: s.id,
            judge: j.id,
            ballot: record.id
          });
        await tx.judgingEvent.update({ where: { id }, data });
        return receipt(record, c, s);
      },
      { maxWait: 10000, timeout: 15000 }
    );
  }
  async export(id: string, kind: string, edition: number, a: CurrentAdmin, requested?: string[]) {
    permit(a, "judging:export");
    return this.db.$transaction(async (tx) => {
      const e = await getEvent(tx, id, true);
      scope(e, a);
      if (kind === "awards") {
        const saved = await tx.judgingEdition.findUnique({
          where: { eventId_edition: { eventId: id, edition } }
        });
        if (!saved) fail("仅可导出已经本人确认的版本");
        const snap = saved.snapshot as unknown as JudgingSnapshot;
        const fields = requested ?? snap.fields;
        if (!fields.includes("name") || fields.some((f) => !snap.fields.includes(f as AwardField)))
          fail("导出字段超出已确认范围");
        await audit(tx, e, a, "export-awards", { edition, fields });
        return awardReport(snap, [...new Set(fields)] as AwardField[]);
      }
      permit(a, "judging:results");
      if (!["ballots", "review"].includes(kind)) fail("导出类型无效");
      const result = await this.resultData(tx, e);
      await audit(tx, e, a, "export-" + kind, { revision: e.revision });
      const c = config(e);
      if (kind === "ballots")
        return result.ballots.map((b) => ({
          ...b,
          judgeName: c.judges.find((j) => j.id === b.judgeKey)?.name,
          teacherName: c.teachers.find((t) => t.id === b.teacherKey)?.name
        }));
      return { edition: e.edition, phase: e.phase, rows: result.rows };
    });
  }
  async published(id: string) {
    const e = await getEvent(this.db, id);
    if (e.rehearsal || !e.publishedEdition || this.publicationDay() < config(e).publicDay)
      throw new NotFoundException("成绩尚未公布");
    const s = await this.db.judgingEdition.findUniqueOrThrow({
      where: { eventId_edition: { eventId: id, edition: e.publishedEdition } }
    });
    return {
      title: e.title,
      edition: s.edition,
      ...awardReport(s.snapshot as unknown as JudgingSnapshot, e.publishedFields as AwardField[])
    };
  }
}
