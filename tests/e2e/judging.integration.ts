import assert from "node:assert/strict";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { test } from "node:test";
import type { CurrentAdmin } from "../../services/api/src/admin/current-admin";
import type { Judge, JudgingConfig, ScoringRow } from "../../packages/shared/src/judging";

test(
  "绘本舞蹈全规模联排：真实 PostgreSQL、HTTP 身份、510 份原单与独立锁定版本",
  { skip: !process.env.JUDGING_TEST_DATABASE_URL, timeout: 180000 },
  async (t) => {
    const url = new URL(process.env.JUDGING_TEST_DATABASE_URL!);
    assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
    assert.equal(url.pathname, "/judging_test");
    process.env.DATABASE_URL = url.toString();
    process.env.JWT_SECRET = randomBytes(48).toString("hex");
    process.env.NODE_ENV = "test";
    const req = createRequire(resolve("services/api/package.json"));
    const { NestFactory } = req("@nestjs/core"),
      { AppModule } = req("./dist/app.module.js"),
      { JudgingService } = req("./dist/judging/judging.service.js"),
      { PrismaService } = req("./dist/prisma.service.js"),
      { AdminAccessService } = req("./dist/admin/admin-access.service.js"),
      { defaultJudgingConfig, assigned } = req("@conference/shared");
    const app = await NestFactory.create(AppModule, { logger: false });
    app.setGlobalPrefix("api");
    app.use(req("express").json({ limit: "2mb" }));
    await app.listen(0, "127.0.0.1");
    const db = app.get(PrismaService),
      service = app.get(JudgingService),
      origin = await app.getUrl();
    const salt = randomBytes(16).toString("hex"),
      pwd = randomBytes(32).toString("hex"),
      suffix = randomBytes(7).toString("hex");
    const passwordHash = [
      "pbkdf2",
      "sha512",
      "10000",
      salt,
      pbkdf2Sync(pwd, salt, 10000, 64, "sha512").toString("hex")
    ].join("$");
    const admins: string[] = [],
      users: string[] = [],
      roles: string[] = [],
      events: string[] = [];
    async function call(
      path: string,
      token?: string,
      body?: unknown,
      status = body === undefined ? 200 : 201
    ) {
      const res = await fetch(origin + "/api" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const p = await res.json();
      assert.equal(res.status, status, path + " " + p.message);
      return p.data;
    }
    async function admin(label: string, permissions: string[], all = false) {
      const role = await db.role.create({
        data: {
          code: label + suffix,
          name: "联排岗位",
          permissions: { create: permissions.map((code) => ({ permission: { connect: { code } } })) }
        }
      });
      roles.push(role.id);
      const account = await db.adminUser.create({
        data: {
          username: label + suffix,
          passwordHash,
          conferenceScopeMode: all ? "ALL" : "ASSIGNED",
          roles: { create: { roleId: role.id } }
        }
      });
      admins.push(account.id);
      return await call("/admin/auth/login", undefined, { username: account.username, password: pwd });
    }
    try {
      await app.get(AdminAccessService).ensureBuiltInAccess();
      const cfg = await admin(
        "ops",
        [
          "judging:view",
          "judging:config",
          "judging:floor",
          "judging:results",
          "judging:adjust",
          "judging:publish",
          "judging:export",
          "system:account"
        ],
        true
      );
      const signer = await admin("signer", ["judging:view", "judging:confirm", "judging:results"]);
      const floor = await admin("floor", ["judging:view", "judging:floor"]);
      const outsider = await admin("other", ["judging:view", "judging:results"]);
      const named = await db.user.create({
        data: {
          openid: "verified-" + suffix,
          realName: "王红丽",
          phone: "13900000001",
          phoneVerifiedAt: new Date()
        }
      });
      users.push(named.id);
      const createUserToken = (u: { id: string; openid: string }) =>
        req("./dist/auth/jwt.js").signJwt(
          { type: "user", sub: u.id, openid: u.openid, iat: Math.floor(Date.now() / 1000) },
          process.env.JWT_SECRET
        );
      const namedToken = createUserToken(named);
      const c: JudgingConfig = defaultJudgingConfig();
      for (let i = 0; i < 15; i++) {
        const id = "T" + i,
          orgId = "O" + (i % 13),
          room = c.rooms[i % 5].id;
        c.teachers.push({
          id,
          name: "联排教师" + i,
          orgId,
          org: "联排机构" + (i % 13),
          photo: "/uploads/trial.jpg",
          poster: "",
          topic: "课程" + i,
          speech: "演讲" + i,
          prior: 90 - i,
          qualifierRank: 15 - i
        });
        c.sessions.push(
          { id: "C" + i, kind: "class", teacher: id, room, round: 1 + Math.floor(i / 5), time: "09:00" },
          { id: "S" + i, kind: "ted", teacher: id, room: "", round: i + 1, time: "14:00" }
        );
      }
      function addJudge(id: string, role: Judge["role"], room: string) {
        c.judges.push({ id, userId: suffix + id, role, room, name: "联排" + id, phone: "" });
      }
      for (const r of c.rooms) {
        addJudge("P" + r.id, "lecturer", r.id);
        for (let i = 0; i < 30; i++) addJudge(r.id + "D" + i, i < 16 ? "experience" : "observer", r.id);
      }
      for (let i = 0; i < 3; i++) addJudge("E" + i, "expert", "");
      const first = c.judges[0];
      const identity = await db.user.create({ data: { id: first.userId, openid: "wx-" + suffix } });
      users.push(identity.id);
      c.approvedForms = true;
      c.merits = Array.from({ length: 19 }, (_, i) => ({
        id: "M" + i,
        name: "优秀教师" + i,
        org: "优秀机构" + i
      }));
      const asUser = (j: Judge) => ({
        id: j.userId,
        openid: j.id === first.id ? identity.openid : "wx-" + j.userId,
        nickname: j.name
      });
      const initial = await call("/admin/judging", cfg.token, {
        title: "正式赛合成数据验收",
        rehearsal: false
      });
      const id = initial.id;
      events.push(id);
      let revision = initial.revision;
      const path = "/admin/judging/" + id;
      async function change(action: string, data: Record<string, unknown> = {}, a: CurrentAdmin = cfg.admin) {
        const e = await service.change(id, { action, ...data, revision }, a);
        revision = e.revision;
        return e;
      }
      const score = (j: Judge, i: number) => {
        if (j.role === "lecturer") return i < 4 ? [39, 38, 37, 37][i] : 36 - (i - 4);
        if (j.role === "expert") return i === 3 ? [24, 30, 30][Number(j.id.slice(1))] : i === 0 ? 29 : 28;
        return i === 3 ? (j.role === "experience" ? 28 : 25) : i <= 1 ? 29 : i === 2 ? 27 : 26;
      };
      let attempted = 0,
        firstReceipt = "";
      async function handIn(sid: string) {
        const slot = c.sessions.find((s) => s.id === sid)!,
          i = Number(slot.teacher.slice(1)),
          jobs = c.judges.filter((j) => assigned(slot, j));
        const version = (await service.mobile(id, sid, asUser(jobs[0]))).formVersion;
        for (let n = 0; n < jobs.length; n += 8) {
          await Promise.all(
            jobs.slice(n, n + 8).map(async (j) => {
              if (sid === "C0" && j.id === first.id) return;
              await service.submit(
                id,
                sid,
                { formVersion: version, answers: { score: score(j, i) } },
                asUser(j)
              );
              attempted++;
            })
          );
        }
        revision = (await service.detail(id, cfg.admin)).revision;
      }
      await t.test("assigned accounts, real binding and user-only entry", async () => {
        await call(path + "/results", undefined, undefined, 401);
        await call(path + "/results", createUserToken(identity), undefined, 401);
        await call(path + "/results", outsider.token, undefined, 403);
        await change("config", { title: "正式赛合成数据验收", config: c });
        await assert.rejects(
          change("access", { staffIds: [floor.admin.id], confirmerId: signer.admin.id }),
          /实名/
        );
        await call("/admin/mobile/login-and-bind", namedToken, {
          username: signer.admin.username,
          password: pwd
        });
        await change("access", { staffIds: [floor.admin.id], confirmerId: signer.admin.id });
        await call(path + "/results", signer.token);
        await call(path + "/results", floor.token, undefined, 403);
        await call("/judging/" + id + "/published", undefined, undefined, 404);
        await change("start");
        await assert.rejects(
          service.submit(id, "C0", { answers: { score: 39 } }, asUser(first)),
          /开放|截止/
        );
        await assert.rejects(service.mobile(id, "C1", asUser(first)), /教室/);
        await assert.rejects(
          service.mobile(id, "C0", { id: "unassigned", openid: "wx", nickname: null }),
          /未匹配/
        );
        await assert.rejects(
          service.mobile(id, "C0", { ...asUser(first), openid: "mock_trial" }),
          /微信小程序/
        );
      });
      await t.test("five independent rooms, frozen forms and idempotent HTTP receipt", async () => {
        for (let i = 0; i < 5; i++) await change("gate", { session: "C" + i, open: true });
        await assert.rejects(change("gate", { session: "C5", open: true }), /上一场/);
        const old = (await service.mobile(id, "C0", asUser(first))).formVersion;
        const rubrics = structuredClone(c.rubrics);
        rubrics.lecturer.title = "第二版专业表";
        await change("forms", { rubrics, sameAudienceForm: true, approvedForms: true });
        assert.equal((await service.mobile(id, "C0", asUser(first))).formVersion, old);
        await call("/judging/" + id + "/sessions/C0", undefined, undefined, 401);
        const scorePath = "/judging/" + id + "/sessions/C0/submit";
        const payload = { answers: { score: 39 }, formVersion: old },
          token = createUserToken(identity);
        const [one, two] = await Promise.all([
          call(scorePath, token, payload),
          call(scorePath, token, payload)
        ]);
        assert.deepEqual(one, two);
        firstReceipt = one.id;
        assert.deepEqual(Object.keys(one).sort(), ["id", "teacher", "session", "at", "status"].sort());
        const page = await call("/judging/" + id + "/sessions/C0", token);
        assert.deepEqual(page.receipt, one);
        assert.ok(!("results" in page));
        for (let i = 0; i < 15; i++) {
          const sid = "C" + i;
          if (i >= 5) await change("gate", { session: sid, open: true });
          await handIn(sid);
          await change("gate", { session: sid, open: false });
        }
        assert.equal((await service.mobile(id, "C5", asUser(first))).formVersion, old + 1);
        for (let i = 0; i < 15; i++) {
          const sid = "S" + i;
          await change("gate", { session: sid, open: true });
          if (i === 0) await assert.rejects(change("gate", { session: "S1", open: true }), /上一位/);
          await handIn(sid);
          await change("gate", { session: sid, open: false });
        }
        assert.equal(attempted + 1, 510);
        assert.equal(await db.judgingBallot.count({ where: { eventId: id } }), 510);
        assert.equal(
          (await call(path + "/progress", floor.token)).tasks.filter(
            (x: { status: string }) => x.status === "valid"
          ).length,
          510
        );
        await change("finish");
      });
      const row = (rows: ScoringRow[], i: number) => rows.find((x) => x.id === "T" + i)!;
      await t.test("weighted sample, direct adjustment, unchanged originals and prize boundary", async () => {
        let result = await service.results(id, cfg.admin),
          a = row(result.rows, 3);
        assert.deepEqual(
          [a.professional, a.audience, a.ted, a.morning, a.system, a.rank],
          [37, 26.6, 28, 63.6, 91.6, 4]
        );
        assert.deepEqual(a.counts, { professional: 1, audience: 30, ted: 3 });
        assert.equal(row(result.rows, 2).total, 92);
        await assert.rejects(
          change("adjust", { teacher: "T3", value: 92.1, reason: "复核" }, floor.admin),
          /权限/
        );
        await change("adjust", { teacher: "T3", value: 92.1, reason: "组委会复核" });
        result = await service.results(id, cfg.admin);
        a = row(result.rows, 3);
        assert.deepEqual(
          [a.system, a.total, a.initialRank, a.rank, a.originalAwards[0], a.awards[0]],
          [91.6, 92.1, 4, 3, "二等奖", "一等奖"]
        );
        assert.deepEqual([row(result.rows, 2).rank, row(result.rows, 2).awards[0]], [4, "二等奖"]);
        const raw = result.ballots.find(
          (b: { teacherKey: string; role: string }) => b.teacherKey === "T3" && b.role === "lecturer"
        );
        await change("correction", { ballotId: raw.id, answers: { score: 36 }, reason: "原单更正联排" });
        assert.equal((await db.judgingBallot.findUniqueOrThrow({ where: { id: raw.id } })).units, 3700);
        a = row((await service.results(id, cfg.admin)).rows, 3);
        assert.equal(a.system, 90.6);
        assert.equal(a.adjustment?.recheck, true);
        await assert.rejects(change("send", { reviewedRevision: revision }), /重新核对/);
        await change("correction", { ballotId: raw.id, answers: { score: 37 }, reason: "复原联排样例" });
        await change("adjust", { teacher: "T3", value: 92.1, reason: "更正单已复核" });
        const concurrent = await Promise.allSettled([
          change("adjust", { teacher: "T3", value: 92.1, reason: "并行甲" }),
          change("adjust", { teacher: "T3", value: 92.1, reason: "并行乙" })
        ]);
        assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
        assert.match(String(concurrent.find((r) => r.status === "rejected")?.reason), /版本/);
      });
      await t.test("signature, embargo, deliberate publication, archived export and revision", async () => {
        // The app clock is the only substituted collaborator. Database, guards and controllers are real.
        service.publicationDay = () => "2026-12-15";
        await assert.rejects(service.export(id, "awards", 1, cfg.admin), /本人确认/);
        await change("send", { reviewedRevision: revision });
        await assert.rejects(change("confirm", { reviewedRevision: revision }, cfg.admin), /权限/);
        await assert.rejects(change("confirm", { reviewedRevision: revision - 1 }, signer.admin), /版本/);
        await change("confirm", { reviewedRevision: revision }, signer.admin);
        const final = await service.export(id, "awards", 1, cfg.admin);
        assert.deepEqual([final.teachers.length, final.merits.length, final.schools.length], [15, 19, 13]);
        for (const [prize, count] of [
          ["一等奖", 3],
          ["二等奖", 5],
          ["三等奖", 7],
          ["十佳教师", 10]
        ] as const)
          assert.equal(
            final.teachers.filter((r: { award: string }) => r.award.includes(prize)).length,
            count
          );
        await assert.rejects(change("publish", { fields: ["name", "award"] }), /公布日期/);
        await call("/judging/" + id + "/published", undefined, undefined, 404);
        service.publicationDay = () => "2026-12-16";
        await call("/judging/" + id + "/published", undefined, undefined, 404);
        await assert.rejects(change("publish", { fields: ["name", "total"] }), /字段/);
        await change("publish", { fields: ["name", "award"] });
        const publicLink = "/judging/" + id + "/published";
        const cropped = await service.export(id, "awards", 1, cfg.admin, ["name", "award"]);
        assert.deepEqual(Object.keys(cropped.teachers[0]).sort(), ["award", "name"]);
        await assert.rejects(service.export(id, "awards", 1, cfg.admin, ["name", "total"]), /字段/);
        const pub = await call(publicLink);
        assert.deepEqual(Object.keys(pub.teachers[0]).sort(), ["award", "name"]);
        await assert.rejects(change("adjust", { teacher: "T3", value: 90, reason: "旧版" }), /状态/);
        await change("revise", { reason: "联排修订" });
        await change("adjust", { teacher: "T3", value: 90, reason: "修订核对" });
        assert.equal((await call(publicLink)).edition, 1);
        assert.deepEqual(await service.export(id, "awards", 1, cfg.admin), final);
        await assert.rejects(service.export(id, "awards", 2, cfg.admin), /本人确认/);
        await change("send", { reviewedRevision: revision });
        await change("confirm", { reviewedRevision: revision }, signer.admin);
        const v2 = await service.export(id, "awards", 2, cfg.admin);
        assert.notDeepEqual(final.teachers, v2.teachers);
        assert.equal((await call(publicLink)).edition, 1);
        await change("publish", { fields: ["name", "award"] });
        assert.equal((await call(publicLink)).edition, 2);
        const report = await service.export(id, "ballots", 2, cfg.admin);
        assert.ok(report.some((b: { id: string }) => b.id === firstReceipt));
      });
      await t.test("attendance, phone binding, authorized late entry and legitimate zero", async () => {
        let event = await service.create({ title: "单室缺评补交", rehearsal: true }, cfg.admin);
        events.push(event.id);
        const cc = structuredClone(c);
        cc.rooms = cc.rooms.slice(0, 1);
        cc.teachers = cc.teachers.slice(0, 1);
        cc.sessions = cc.sessions.filter((s) => s.teacher === "T0");
        cc.merits = [];
        cc.judges = [
          first,
          c.judges.find((j) => j.id === "R1D0")!,
          { ...c.judges.find((j) => j.id === "R1D16")!, userId: "", phone: "13900000002" },
          c.judges.find((j) => j.id === "E0")!
        ];
        const [lecturer, absentee, guest] = cc.judges;
        const phoneUser = {
          id: "verified-" + suffix,
          openid: "wx-other",
          nickname: "联排",
          phone: guest.phone,
          phoneVerifiedAt: "2026-11-24"
        };
        async function update(action: string, data: Record<string, unknown> = {}) {
          event = await service.change(event.id, { action, revision: event.revision, ...data }, cfg.admin);
        }
        await update("config", { title: "单室缺评补交", config: cc });
        await update("start");
        await update("gate", { session: "C0", open: true });
        await assert.rejects(service.mobile(event.id, "C0", { ...phoneUser, phoneVerifiedAt: null }), /实名/);
        await update("attendance", { session: "C0", judge: guest.id, kind: "present" });
        await update("attendance", { session: "C0", judge: absentee.id, kind: "absent", reason: "未到" });
        await update("gate", { session: "C0", open: false });
        await update("attendance", {
          session: "C0",
          judge: guest.id,
          kind: "makeup",
          reason: "现场恢复网络"
        });
        const page = await service.mobile(event.id, "C0", phoneUser);
        await service.submit(
          event.id,
          "C0",
          { formVersion: page.formVersion, answers: { score: 0 } },
          phoneUser
        );
        assert.equal((await service.results(event.id, cfg.admin)).rows[0].audience, 0);
        assert.equal((await service.results(event.id, cfg.admin)).rows[0].rank, null);
        const status = (await service.progress(event.id, cfg.admin)).tasks.filter(
          (r: { session: { id: string } }) => r.session.id === "C0"
        );
        assert.equal(status.find((r: { judgeId: string }) => r.judgeId === guest.id).present, true);
        assert.equal(status.find((r: { judgeId: string }) => r.judgeId === absentee.id).status, "absent");
        assert.equal(status.find((r: { judgeId: string }) => r.judgeId === lecturer.id).status, "waiting");
        await assert.rejects(
          service.mobile(event.id, "C0", { ...phoneUser, id: "different-user" }),
          /未匹配/
        );
        await assert.rejects(service.published(event.id), /尚未公布/);
      });
    } finally {
      await db.$transaction([
        db.judgingBallot.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingEdition.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingAudit.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingEvent.deleteMany({ where: { id: { in: events } } })
      ]);
      await db.auditLog.deleteMany({ where: { adminUserId: { in: admins } } });
      await db.adminUser.deleteMany({ where: { id: { in: admins } } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await app.close();
    }
  }
);
