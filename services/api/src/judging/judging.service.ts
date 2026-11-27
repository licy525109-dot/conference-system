import { createHash } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type JudgingEvent } from "@prisma/client";
import {
  assigned,
  baseJudgeRole,
  classroomRounds,
  earliestJudgingPublicDay,
  defaultEntryDesign,
  defaultJudgingGuidance,
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
  qualifyingUnits,
  needsScoreReview,
  periodNames,
  periodStatus,
  scheduledPeriods,
  unreviewedPeriods,
  sessionPeriod,
  taskKey
} from "@conference/shared";
import type {
  Answers,
  AwardField,
  Judge,
  JudgeRole,
  JudgingConfig,
  JudgingControl,
  JudgingCopyOptions,
  JudgingPeriod,
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
  legacyAwardTargets,
  num,
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
function config(
  e: JudgingEvent
): JudgingConfig & { awardTargets: NonNullable<JudgingConfig["awardTargets"]> } {
  const stored = e.config as unknown as JudgingConfig;
  return {
    ...stored,
    scoringPlan: stored.scoringPlan ?? "onsite",
    guidance: stored.guidance ?? { ...defaultJudgingGuidance },
    awardTargets: stored.awardTargets ?? legacyAwardTargets(e.rehearsal),
    roleOptions: judgingRoles(stored),
    look: { ...stored.look, entry: { ...defaultEntryDesign, ...stored.look.entry } }
  };
}
function readCopyOptions(raw: unknown): JudgingCopyOptions {
  const b = object(raw);
  if (typeof b.teachers !== "boolean" || typeof b.judges !== "boolean" || typeof b.handover !== "boolean")
    fail("请选择要复制的资料");
  if (b.handover && !b.teachers) fail("复制赛前成绩与颁奖资料时，请同时选择选手与排场");
  return {
    sourceId: key(b.sourceId, "来源赛事"),
    teachers: b.teachers,
    judges: b.judges,
    handover: b.handover
  };
}
function copiedConfig(source: JudgingEvent, options: JudgingCopyOptions): JudgingConfig {
  const c = config(source);
  return validateConfig(
    {
      ...c,
      rooms: c.rooms.map((r) => ({ ...r, rounds: classroomRounds(r, c.sessions) })),
      teachers: options.teachers
        ? c.teachers.map((t) =>
            options.handover ? t : { ...t, preliminaryScore: null, prior: null, qualifierRank: null }
          )
        : [],
      sessions: options.teachers ? c.sessions : [],
      judges: options.judges
        ? c.judges.map((j) => (j.userId?.startsWith("rehearsal:") ? { ...j, userId: "" } : j))
        : [],
      merits: options.handover ? c.merits : [],
      publicDay: c.publicDay < earliestJudgingPublicDay ? earliestJudgingPublicDay : c.publicDay,
      approvedForms: false
    },
    false
  );
}
function freezeSessionForms(c: JudgingConfig, state: JudgingControl, sessionId: string) {
  state.sessionForms[sessionId] ??= {
    guidance: c.guidance,
    rubrics: c.rubrics,
    roleOptions: c.roleOptions,
    sameAudienceForm: c.sameAudienceForm,
    formVersion: c.formVersion
  };
}
function setScoringGates(c: JudgingConfig, state: JudgingControl, sessions: JudgingSession[], open: boolean) {
  for (const session of sessions) {
    if (open) freezeSessionForms(c, state, session.id);
    state.gates[session.id] = open ? "open" : "closed";
  }
}
function reviewPeriod(value: unknown): JudgingPeriod {
  if (value !== "am" && value !== "pm") fail("请选择上午场或下午场");
  return value;
}
function closePeriod(
  c: JudgingConfig,
  state: JudgingControl,
  period: JudgingPeriod,
  actor: CurrentAdmin,
  version: number
) {
  const sessions = c.sessions.filter((s) => sessionPeriod(s) === period);
  setScoringGates(c, state, sessions, false);
  const ids = new Set(sessions.map((s) => s.id));
  for (const [id, exception] of Object.entries(state.exceptions)) {
    if (exception.kind === "makeup" && ids.has(id.split("/")[0])) delete state.exceptions[id];
  }
  state.periodReviews ??= {};
  state.periodReviews[period] = {
    version,
    status: "reviewing",
    closedAt: new Date().toISOString(),
    closedBy: actor.displayName || actor.username
  };
}
function touchPeriod(state: JudgingControl, s: JudgingSession) {
  const review = state.periodReviews?.[sessionPeriod(s)];
  if (review) review.version++;
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
  const review = state.periodReviews?.[sessionPeriod(s)];
  if (exception?.kind === "absent" || review?.status === "confirmed") return false;
  return (
    (e.phase === "LIVE" && !review && state.gates[s.id] === "open") ||
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
// Older events granted this account access separately from the staff list.
function eventStaffIds(e: JudgingEvent): string[] {
  return e.confirmerId ? [...new Set([...e.staffIds, e.confirmerId])] : e.staffIds;
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
    const b = object(raw);
    if (b.rehearsal !== undefined && typeof b.rehearsal !== "boolean") fail("赛事类型无效");
    const title = str(b.title, "赛事名称");
    const copy = b.copy === undefined ? null : readCopyOptions(b.copy);
    const rehearsal = !copy && b.rehearsal === true;
    const legacy =
      !copy && b.rehearsal !== undefined && b.roomCount === undefined && b.roundsPerRoom === undefined;
    const rooms =
      copy || legacy ? undefined : num(b.roomCount === undefined ? 1 : b.roomCount, "教室数量", 1, 50, true);
    const rounds =
      copy || legacy
        ? undefined
        : num(b.roundsPerRoom === undefined ? 1 : b.roundsPerRoom, "每间教室的课堂轮数", 1, 250, true);
    // A retry of the same form by the same operator must return the event already created.
    let id: string | undefined;
    if (b.requestId !== undefined) {
      const request = key(b.requestId, "创建请求编号");
      const input = JSON.stringify([a.id, request, title, copy, rehearsal, legacy, rooms, rounds]);
      id = "event-" + createHash("sha256").update(input).digest("hex").slice(0, 40);
    }
    return this.db.$transaction(async (tx) => {
      if (id) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        const existing = await tx.judgingEvent.findUnique({ where: { id } });
        if (existing) {
          scope(existing, a);
          if (existing.phase === deletedPhase)
            throw new ConflictException("这场赛事已删除，请重新打开「新建赛事」");
          return summary(existing);
        }
      }
      let initial: JudgingConfig;
      if (copy) {
        const source = await getEvent(tx, copy.sourceId, true);
        scope(source, a);
        initial = copiedConfig(source, copy);
      } else {
        initial = defaultJudgingConfig(rooms, rounds);
        initial.awardTargets = legacy ? legacyAwardTargets(rehearsal) : { merits: null, schools: null };
      }
      const e = await tx.judgingEvent.create({
        data: {
          id,
          title,
          rehearsal,
          config: json(initial),
          control: json(defaultJudgingControl()),
          staffIds: [a.id]
        }
      });
      await audit(tx, e, a, copy ? "copy" : "create", copy ?? {});
      return summary(e);
    });
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
      staffIds: allowed(a, "system:account") ? eventStaffIds(e) : [],
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
      periodReviews: state.periodReviews ?? {},
      roomPeriodModes: state.roomPeriodModes ?? {},
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
          periodReviews: state.periodReviews ?? {},
          roomPeriodModes: state.roomPeriodModes ?? {},
          allRoundRooms: c.rooms.filter((room) => room.allRoundsOpen).map((room) => room.id),
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
      phase: e.phase,
      gates: state.gates,
      periodReviews: state.periodReviews ?? {},
      periodTasks: scoringTasks(c, state, ballots).map(
        ({ session, judgeId, name, roleLabel, status, receipt }) => ({
          sessionId: session.id,
          judgeId,
          name,
          roleLabel,
          status,
          receipt
        })
      ),
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
    if (c.scoringPlan === "withQualifiers") {
      const missing = c.teachers.filter((t) => qualifyingUnits(t) === null);
      if (missing.length) warnings.push("全天成绩待补初、复赛原分：" + missing.map((t) => t.name).join("、"));
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
      "room-mode": "floor",
      "period-close": "floor",
      "period-resume": "floor",
      "period-approve": "adjust",
      "period-reopen": "adjust",
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
    return this.db.$transaction(
      async (tx) => {
        const e = await getEvent(tx, id, true);
        scope(e, a);
        const c = config(e),
          state = control(e),
          data: Prisma.JudgingEventUpdateInput = { revision: { increment: 1 } };
        // Afternoon submissions must not invalidate a review of unchanged morning ballots.
        const period =
          ["period-close", "period-resume", "period-approve", "period-reopen"].includes(action) ||
          (action === "correction" && b.period !== undefined)
            ? reviewPeriod(b.period)
            : undefined;
        const record = period ? state.periodReviews?.[period] : undefined;
        const scopedRevision = period && action !== "period-close" && b.periodVersion !== undefined;
        if (scopedRevision ? !record || record.version !== b.periodVersion : b.revision !== e.revision)
          throw stale();
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
              guidance: b.guidance === undefined ? c.guidance : b.guidance,
              roleOptions: b.roleOptions ?? c.roleOptions,
              rubrics: b.roleOptions === undefined ? { ...c.rubrics, ...object(b.rubrics) } : b.rubrics,
              sameAudienceForm: b.sameAudienceForm,
              approvedForms: b.approvedForms
            },
            e.rehearsal
          );
          if (!e.rehearsal && !next.approvedForms) fail("正式评分表须先确认细则");
          c.rubrics = next.rubrics;
          c.guidance = next.guidance;
          for (const frozen of Object.values(state.sessionForms)) frozen.guidance ??= c.guidance;
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
            teachers: c.teachers.map((t) => ({
              id: t.id,
              preliminaryScore: t.preliminaryScore,
              prior: t.prior,
              qualifierRank: t.qualifierRank
            }))
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
                preliminaryScore: Object.hasOwn(records.get(t.id)!, "preliminaryScore")
                  ? records.get(t.id)!.preliminaryScore
                  : t.preliminaryScore,
                prior: records.get(t.id)!.prior,
                qualifierRank: records.get(t.id)!.qualifierRank
              }))
            },
            e.rehearsal
          );
          if (c.scoringPlan === "withQualifiers") {
            const previously = new Map(c.teachers.map((t) => [t.id, qualifyingUnits(t)]));
            for (const t of next.teachers) {
              const adjustment = state.adjustments[t.id];
              if (adjustment && qualifyingUnits(t) !== previously.get(t.id)) adjustment.recheck = true;
            }
          }
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
          const maxStaff = 301; // 300 staff plus the separate grant on older events.
          if (!Array.isArray(b.staffIds) || b.staffIds.length > maxStaff) fail("无效授权名单");
          // Accept the separate grant from older admin clients as ordinary event membership.
          const members = b.confirmerId ? [...b.staffIds, b.confirmerId] : b.staffIds;
          const ids = [...new Set<string>(members.map((v: unknown) => key(v, "后台账号")))];
          if (ids.length > maxStaff) fail("无效授权名单");
          if ((await tx.adminUser.count({ where: { id: { in: ids }, enabled: true } })) !== ids.length)
            fail("授权名单中存在无效账号");
          data.staffIds = ids;
          data.confirmerId = null;
          evidence = { previousStaffIds: eventStaffIds(e), staffIds: ids };
        } else if (action === "start") {
          phase(e, "SETUP");
          validateStart(c, e.rehearsal);
          const rooms = new Set(c.rooms.filter((room) => room.allRoundsOpen).map((room) => room.id));
          const first = scheduledPeriods(c.sessions)[0];
          setScoringGates(
            c,
            state,
            c.sessions.filter((s) => s.kind === "class" && rooms.has(s.room) && sessionPeriod(s) === first),
            true
          );
          data.phase = "LIVE";
        } else if (action === "period-close" && period) {
          phase(e, "LIVE");
          const periods = scheduledPeriods(c.sessions);
          if (!periods.includes(period) || record) fail("该场没有排场或已结束收分");
          closePeriod(c, state, period, a, e.revision + 1);
          if (periods.every((p) => state.periodReviews?.[p])) data.phase = "REVIEW";
          evidence = { period };
        } else if (action === "period-resume" && period) {
          phase(e, "LIVE", "REVIEW");
          if (!state.periodReviews || record?.status !== "reviewing") fail("仅待复核的场别可恢复收分");
          evidence = { period, reason: str(b.reason, "恢复收分原因", 500) };
          // A historical full-day review may predate per-period records. Keep its other periods closed.
          if (e.phase === "REVIEW")
            for (const p of scheduledPeriods(c.sessions)) {
              if (p !== period && !state.periodReviews[p])
                state.periodReviews[p] = { status: "reviewing", version: e.revision + 1 };
            }
          delete state.periodReviews[period];
          data.phase = "LIVE";
        } else if (action === "period-approve" && period) {
          phase(e, "LIVE", "REVIEW");
          if (!scheduledPeriods(c.sessions).includes(period) || periodStatus(e.phase, record) !== "reviewing")
            fail("请先结束该场评分，再进行复核");
          const sessions = c.sessions.filter((s) => sessionPeriod(s) === period);
          const ballots = await tx.judgingBallot.findMany({
            where: { eventId: id, sessionKey: { in: sessions.map((s) => s.id) } },
            select: { id: true, sessionKey: true, judgeKey: true, status: true }
          });
          const tasks = scoringTasks({ ...c, sessions }, state, ballots);
          const pending = tasks.filter((t) => needsScoreReview(t.status)).length;
          if (pending) fail(periodNames[period] + "还有 " + pending + " 项待交、待补或待核，请先处理");
          state.periodReviews ??= {};
          state.periodReviews[period] = {
            ...record,
            status: "confirmed",
            version: (record?.version ?? 0) + 1,
            confirmedAt: new Date().toISOString(),
            confirmedBy: a.displayName || a.username
          };
          evidence = { period, ballots: ballots.length, tasks: tasks.length };
        } else if (action === "period-reopen" && period) {
          phase(e, "LIVE", "REVIEW", "SUBMITTED");
          if (record?.status !== "confirmed") fail("仅已复核场次可以重新复核");
          evidence = { period, reason: str(b.reason, "重新复核原因", 500), previous: { ...record } };
          delete record.confirmedAt;
          delete record.confirmedBy;
          record.status = "reviewing";
          record.version++;
          if (e.phase === "SUBMITTED") data.phase = "REVIEW";
        } else if (action === "room-mode") {
          phase(e, "LIVE");
          const s = sessionOf(c, b.session);
          const room = c.rooms.find((r) => s.kind === "class" && r.id === s.room);
          if (!room || typeof b.allRoundsOpen !== "boolean") fail("请选择教室和评分开放方式");
          if (state.periodReviews?.[sessionPeriod(s)]) fail("该场已结束收分");
          const p = sessionPeriod(s);
          if ((state.roomPeriodModes?.[p]?.[room.id] ?? !!room.allRoundsOpen) !== b.allRoundsOpen) {
            const inRoom = c.sessions.filter((x) => x.kind === "class" && x.room === room.id);
            const sessions = inRoom.filter((x) => sessionPeriod(x) === p);
            if (sessions.length === inRoom.length) {
              room.allRoundsOpen = b.allRoundsOpen;
              data.config = json(c);
            } else {
              state.roomPeriodModes ??= {};
              (state.roomPeriodModes[p] ??= {})[room.id] = b.allRoundsOpen;
            }
            if (b.allRoundsOpen) setScoringGates(c, state, sessions, true);
            else
              setScoringGates(
                c,
                state,
                sessions.filter((x) => x.id !== s.id && state.gates[x.id] === "open"),
                false
              );
          }
          evidence = { period: p, room: room.id, allRoundsOpen: b.allRoundsOpen, session: s.id };
        } else if (action === "gate") {
          phase(e, "LIVE");
          const s = sessionOf(c, b.session);
          if (typeof b.open !== "boolean") fail("请选择开关状态");
          if (b.scope !== undefined && b.scope !== "group") fail("无效的评分开放范围");
          if (state.periodReviews?.[sessionPeriod(s)]) fail("该场已结束收分");
          const group = c.sessions.filter(
            (x) => x.kind === s.kind && x.room === s.room && sessionPeriod(x) === sessionPeriod(s)
          );
          const parallel =
            s.kind === "ted" ||
            (state.roomPeriodModes?.[sessionPeriod(s)]?.[s.room] ??
              c.rooms.some((r) => r.id === s.room && r.allRoundsOpen));
          if (parallel && b.scope !== "group")
            fail(
              s.kind === "ted"
                ? "请在现场收分使用「开放全部 TED」或「截止全部 TED」"
                : "请按本教室全部轮次统一开放或截止"
            );
          if (b.scope === "group" && b.open && !parallel) fail("请先为本教室开启全部轮次评审");
          if (b.open && !parallel && group.some((x) => x.id !== s.id && state.gates[x.id] === "open"))
            fail("请先截止本教室上一场");
          const targets = b.scope === "group" ? group : [s];
          setScoringGates(c, state, targets, b.open);
          evidence = { session: s.id, open: b.open, ...(b.scope && { sessions: targets.map((x) => x.id) }) };
        } else if (action === "attendance") {
          phase(e, "LIVE", "REVIEW");
          const s = sessionOf(c, b.session),
            j = c.judges.find((j) => j.id === b.judge);
          if (!j || !assigned(s, j) || !["absent", "makeup", "present"].includes(b.kind))
            fail("无效的应评任务");
          if (state.periodReviews?.[sessionPeriod(s)]?.status === "confirmed")
            fail("该场已复核，请先重新复核");
          if (b.kind === "makeup" && s.kind === "ted" && !state.sessionForms[s.id])
            fail("请先开放全部 TED，再为个别专家登记补交");
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
          touchPeriod(state, s);
        } else if (action === "finish") {
          phase(e, "LIVE");
          if (c.sessions.some((s) => state.gates[s.id] !== "closed")) fail("请先截止全部课堂与 TED 评分");
          for (const p of scheduledPeriods(c.sessions))
            if (!state.periodReviews?.[p]) closePeriod(c, state, p, a, e.revision + 1);
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
          if (action === "correction") phase(e, "LIVE", "REVIEW", "SUBMITTED");
          else phase(e, "REVIEW", "SUBMITTED");
          const ballots = await tx.judgingBallot.findMany({ where: { eventId: id } }),
            rows = calculate(c, state, ballots);
          if (action === "correction") {
            const ballot = ballots.find((x) => x.id === b.ballotId);
            if (!ballot) fail("找不到原单");
            const session = sessionOf(c, ballot.sessionKey);
            const actual = sessionPeriod(session);
            if (period && period !== actual) fail("该评分单不属于所选场别");
            const review = state.periodReviews?.[actual];
            if (review?.status === "confirmed") fail("该场已复核，请先重新复核");
            if (e.phase === "LIVE" && review?.status !== "reviewing") fail("请先结束该场评分，再更正原单");
            const reason = str(b.reason, "更正原因", 500),
              before = state.corrections[ballot.id] ?? {
                units: ballot.units,
                answers: ballot.answers,
                status: ballot.status
              };
            const result =
              b.void === true
                ? { units: null, answers: ballot.answers as Answers, status: "void" }
                : evaluate(ballot.rubric as unknown as Rubric, b.answers, "correction");
            const fix = { ...result, reason, actor: a.id, at: new Date().toISOString() };
            state.corrections[ballot.id] = fix;
            if (state.adjustments[ballot.teacherKey]) state.adjustments[ballot.teacherKey].recheck = true;
            state.ties = [];
            touchPeriod(state, session);
            if (e.phase === "SUBMITTED") data.phase = "REVIEW";
            evidence = { period: actual, ballot: ballot.id, before, after: fix };
          } else if (action === "adjust") {
            const row = rows.find((r) => r.id === b.teacher);
            if (!row || row.system === null) fail("缺少有效分项，无法直接调整总分");
            const value = points(b.value, "百分制总分", 100, c.scoringPlan === "withQualifiers" ? 4 : 2),
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
            if (rows.some((r) => r.rank === null || r.adjustment?.recheck))
              fail("请先处理缺分、全同分或需重新核对的调分");
            const tasks = scoringTasks(c, state, ballots);
            if (tasks.some((t) => ["waiting", "makeup", "pending"].includes(t.status)))
              fail("还有待交、待补或待核原单，请先处理或登记弃评");
            const missing = unreviewedPeriods(
              c.sessions,
              state.periodReviews,
              action === "confirm" && e.phase === "SUBMITTED" && !state.periodReviews
            );
            if (missing.length) fail("请先完成" + missing.map((p) => periodNames[p]).join("、") + "评分复核");
            const targets = c.awardTargets;
            if (targets.merits !== null && c.merits.length !== targets.merits)
              fail("请核对优秀奖名单，当前 " + c.merits.length + " 人，本场设置为 " + targets.merits + " 人");
            const schools = new Set(c.teachers.map((t) => t.orgId)).size;
            if (targets.schools !== null && schools !== targets.schools)
              fail("请核对教学示范校，当前 " + schools + " 所，本场设置为 " + targets.schools + " 所");
            if (action === "send") {
              data.phase = "SUBMITTED";
            } else {
              const snapshot: JudgingSnapshot = {
                periodReviews: state.periodReviews ?? {},
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
    const c = config(e);
    return { title: e.title, rehearsal: e.rehearsal, look: c.look, guidance: c.guidance };
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
            period: sessionPeriod(s),
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
      ballot = bySeat.get(taskKey(s.id, j.id)),
      form = rubricFor(sessionForm, role);
    return {
      title: e.title,
      rehearsal: e.rehearsal,
      look: c.look,
      guidance: frozen?.guidance ?? c.guidance,
      teacher: {
        name: teacher.name,
        org: teacher.org,
        photo: teacher.photo,
        poster: teacher.poster,
        topic: s.kind === "ted" ? teacher.speech : teacher.topic
      },
      session: {
        id: s.id,
        room: roomName(c, s),
        round: s.round,
        time: s.time,
        kind: s.kind,
        period: sessionPeriod(s),
        reviewStatus: state.periodReviews?.[sessionPeriod(s)]?.status
      },
      role,
      roleLabel: judgingRoleLabel(sessionForm, role),
      form,
      formVersion: sessionForm.formVersion,
      max: form.fields.reduce((sum, f) => sum + Math.round(f.max * 100), 0) / 100,
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
        touchPeriod(state, s);
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
        if (!saved) fail("仅可导出已确认并锁定的成绩版本");
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
