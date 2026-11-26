import assert from "node:assert/strict";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
    const uploads = await mkdtemp(resolve(tmpdir(), "judging-design-"));
    process.env.UPLOADS_DIR = uploads;
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
    process.env.PUBLIC_ORIGIN = origin;
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
      const editor = await admin("editor", ["judging:view", "judging:config"]);
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
      let formalEntry = "";
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
        await change("access", { staffIds: [floor.admin.id, editor.admin.id], confirmerId: signer.admin.id });
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
      await t.test("formal event shares one H5 entry for every room and role", async () => {
        assert.equal((await call(path, cfg.token)).entryCode, null);
        await change("entry-open", {}, floor.admin);
        const detail = await call(path, floor.token);
        assert.equal(typeof detail.entryCode, "string");
        assert.equal((await call(path, signer.token)).entryCode, null);
        formalEntry = "/judging/" + id + "/entry/" + detail.entryCode;
        const classroomLink = await call(path + "/sessions/C0/link", floor.token, {});
        const expertLink = await call(path + "/sessions/S0/link", floor.token, {});
        assert.deepEqual(classroomLink, expertLink);
        assert.equal(
          classroomLink.url,
          "https://m.guanchaohuiji.com/#/pages/judging/entry?event=" + id + "&entry=" + detail.entryCode
        );
        const identified = await call(formalEntry + "/identify", undefined, { name: first.name });
        const desk = await call(formalEntry + "/desk", identified.ticket);
        assert.equal(desk.judge.role, "lecturer");
        assert.equal(desk.page.tasks.length, 3);
        assert.equal(desk.page.open, false);
      });
      await t.test(
        "guest entry keeps its published URL and gates after an authorized design change",
        async () => {
          const before = await call(path, cfg.token);
          const { entry, ...legacyLook } = before.config.look;
          const themed = { ...legacyLook, entry: { ...entry, layout: "poster", button: "查看评分表" } };
          await call(path + "/actions", floor.token, { action: "appearance", revision, look: themed }, 403);
          await call(path + "/design-images", floor.token, {}, 403);
          await call(path + "/design-images", cfg.token, {}, 400);
          const other = await admin("otherdesigner", ["judging:view", "judging:config"]);
          await call(path + "/design-images", other.token, {}, 403);
          const form = new FormData();
          form.set(
            "file",
            new Blob([await readFile("apps/user/src/pages/judging/paper-stage.jpg")], { type: "image/jpeg" }),
            "cover.jpg"
          );
          const uploaded = await fetch(origin + "/api" + path + "/design-images", {
            method: "POST",
            headers: { Authorization: "Bearer " + cfg.token },
            body: form
          });
          assert.equal(uploaded.status, 201);
          themed.cover = (await uploaded.json()).data.url;
          assert.match(themed.cover, /^\/uploads\/materials\/.+\.jpg$/);
          assert.ok((await readFile(resolve(uploads, themed.cover.slice("/uploads/".length)))).length > 0);
          await change("appearance", { look: themed });
          assert.equal((await call(formalEntry)).look.entry.button, "查看评分表");
          await change("appearance", { look: legacyLook });
          const saved = await call(path, cfg.token);
          assert.deepEqual(saved.config.look.entry, themed.entry);
          assert.deepEqual(saved.gates, before.gates);
          assert.equal(saved.entryCode, before.entryCode);
          assert.equal(await db.judgingBallot.count({ where: { eventId: id } }), 0);
        }
      );
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
        await assert.rejects(change("period-close", { period: "night" }), /上午场或下午场/);
        await change("period-close", { period: "am" }, floor.admin);
        const morning = await service.results(id, cfg.admin);
        assert.equal(morning.phase, "LIVE");
        assert.equal(morning.periodReviews.am?.status, "reviewing");
        assert.equal(morning.periodTasks.filter((t) => t.sessionId.startsWith("C") && t.receipt).length, 465);
        assert.equal((await call(scorePath, token, payload)).id, firstReceipt);
        await assert.rejects(change("gate", { session: "C0", open: true }), /结束收分/);
        await assert.rejects(change("period-approve", { period: "am" }, floor.admin), /权限/);
        await change("gate", { session: "S0", open: true, scope: "group" });
        await handIn("S0");
        const afternoon = await service.results(id, cfg.admin);
        const afternoonBallot = afternoon.ballots.find((b) => b.sessionKey === "S0")!;
        const stamp = { period: "am", periodVersion: morning.periodReviews.am!.version };
        await assert.rejects(
          change("correction", {
            ...stamp,
            ballotId: afternoonBallot.id,
            answers: { score: 25 },
            reason: "误选"
          }),
          /不属于/
        );
        await change("correction", {
          ...stamp,
          revision: morning.revision,
          ballotId: firstReceipt,
          answers: { score: 39 },
          reason: "核对上午原单"
        });
        await assert.rejects(change("period-approve", stamp), /版本/);
        await change("period-approve", { period: "am" });
        assert.equal((await service.detail(id, cfg.admin)).phase, "LIVE");
        await assert.rejects(
          change("attendance", { session: "C0", judge: first.id, kind: "makeup", reason: "已复核" }),
          /重新复核/
        );
        for (let i = 1; i < 15; i++) await handIn("S" + i);
        await change("gate", { session: "S0", open: false, scope: "group" });
        assert.equal(attempted + 1, 510);
        assert.equal(await db.judgingBallot.count({ where: { eventId: id } }), 510);
        assert.equal(
          (await call(path + "/progress", floor.token)).tasks.filter(
            (x: { status: string }) => x.status === "valid"
          ).length,
          510
        );
        await change("period-close", { period: "pm" }, floor.admin);
        assert.equal((await service.detail(id, cfg.admin)).phase, "REVIEW");
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
        await assert.rejects(
          change("correction", { ballotId: raw.id, answers: { score: 36 }, reason: "已确认" }),
          /重新复核/
        );
        await change("period-reopen", { period: "am", reason: "核对原始记录" });
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
        await assert.rejects(change("send", { reviewedRevision: revision }), /上午场、下午场/);
        await change("period-approve", { period: "am" });
        await assert.rejects(change("send", { reviewedRevision: revision }), /下午场/);
        await change("period-approve", { period: "pm" });
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
      await t.test(
        "an event created without a mode scores and locks two teachers with independently configured classroom rounds",
        async () => {
          await call("/admin/judging", cfg.token, { title: "无效轮数", roomCount: 2, roundsPerRoom: 0 }, 400);
          const created = await call("/admin/judging", cfg.token, {
            title: "两室赛课",
            roomCount: 2,
            roundsPerRoom: 4
          });
          events.push(created.id);
          const path = "/admin/judging/" + created.id;
          const detail = () => call(path, cfg.token);
          const update = async (action: string, body: Record<string, unknown> = {}, token = cfg.token) => {
            const { revision } = await detail();
            return call(path + "/actions", token, { action, revision, reviewedRevision: revision, ...body });
          };
          const event = await detail();
          const cc: JudgingConfig = event.config;
          assert.equal(event.rehearsal, false);
          assert.deepEqual(
            cc.rooms.map((r) => r.rounds),
            [4, 4]
          );
          assert.deepEqual(cc.awardTargets, { merits: null, schools: null });
          cc.rooms[0].rounds = 1;
          cc.teachers = c.teachers.slice(0, 2).map((teacher) => ({ ...teacher, photo: "", poster: "" }));
          cc.judges = c.judges.filter((j) => ["PR1", "PR2", "R1D0", "R2D0", "E0"].includes(j.id));
          cc.sessions = c.sessions
            .filter((s) => cc.teachers.some((t) => t.id === s.teacher))
            .map((s) => (s.id === "C1" ? { ...s, round: 4, period: "pm" as const } : s));
          cc.approvedForms = true;
          const invalid = structuredClone(cc);
          invalid.rooms[1].rounds = 3;
          await call(path + "/preview-config", cfg.token, invalid, 400);
          assert.equal((await call(path + "/preview-config", cfg.token, cc)).readiness, "");
          await update("config", { title: event.title, config: cc });
          await update("access", { staffIds: [signer.admin.id], confirmerId: signer.admin.id });
          await update("entry-open");
          const entry = "/judging/" + created.id + "/entry/" + (await detail()).entryCode;
          await update("start");
          await update("gate", { session: "S0", open: true, scope: "group" });
          const delayed = cc.judges.find((j) => j.id === "PR1")!;
          const { ticket: late } = await call(entry + "/identify", undefined, { name: delayed.name });
          for (const s of cc.sessions) {
            if (s.kind === "class") await update("gate", { session: s.id, open: true });
            for (const judge of cc.judges.filter((j) => assigned(s, j))) {
              if (s.id === "C0" && judge.id === delayed.id) continue;
              const { ticket } = await call(entry + "/identify", undefined, { name: judge.name });
              const { page } = await call(entry + "/desk", ticket);
              assert.equal(page.session.round, s.round);
              await call(entry + "/sessions/" + s.id + "/submit", ticket, {
                formVersion: page.formVersion,
                answers: { score: s.teacher === "T0" ? 28 : 27 }
              });
            }
            if (s.kind === "class") await update("gate", { session: s.id, open: false });
          }
          await update("gate", { session: "S0", open: false, scope: "group" });
          await update("finish");
          const d = await detail(),
            submission = {
              formVersion: (await call(entry + "/desk?session=C0", late)).page.formVersion,
              answers: { score: 28 }
            };
          assert.equal(d.config.sessions.find((s: { id: string }) => s.id === "C1").period, "pm");
          await call(
            path + "/actions",
            cfg.token,
            { action: "period-approve", period: "am", revision: d.revision },
            400
          );
          await call(entry + "/sessions/C0/submit", late, submission, 409);
          assert.equal((await call(entry + "/desk?session=C0", late)).page.session.reviewStatus, "reviewing");
          await update("period-approve", { period: "pm" });
          await update("attendance", {
            session: "C0",
            judge: delayed.id,
            kind: "makeup",
            reason: "核对后补交"
          });
          await call(entry + "/sessions/C0/submit", late, submission);
          await update("period-approve", { period: "am" });
          assert.equal((await detail()).periodReviews.pm.status, "confirmed");
          await update("send");
          await update("confirm", {}, signer.token);
          assert.equal((await detail()).phase, "LOCKED");
          const final = await service.export(created.id, "awards", 1, cfg.admin);
          assert.deepEqual([final.teachers.length, final.merits.length, final.schools.length], [2, 0, 2]);
          await call("/judging/" + created.id + "/published", undefined, undefined, 404);
        }
      );
      await t.test(
        "a single scheduled period can complete, and a previously submitted legacy edition can still be signed",
        async () => {
          const event = await service.create(
            { title: "只排下午场", roomCount: 1, roundsPerRoom: 1 },
            cfg.admin
          );
          events.push(event.id);
          const read = () => service.detail(event.id, cfg.admin);
          const act = async (action: string, body: Record<string, unknown> = {}, actor = cfg.admin) => {
            const { revision } = await read();
            return service.change(event.id, { action, revision, reviewedRevision: revision, ...body }, actor);
          };
          const conf = (await read()).config as JudgingConfig;
          conf.rooms[0].allRoundsOpen = true;
          conf.teachers = [c.teachers[0]];
          conf.sessions = c.sessions.filter((s) => s.teacher === "T0").map((s) => ({ ...s, period: "pm" }));
          conf.judges = c.judges.filter((j) => ["PR1", "R1D0", "E0"].includes(j.id));
          conf.approvedForms = true;
          await act("config", { title: event.title, config: conf });
          await act("access", { staffIds: [signer.admin.id], confirmerId: signer.admin.id });
          await act("start");
          await assert.rejects(act("period-close", { period: "am" }), /没有排场/);
          await act("period-close", { period: "pm" });
          const original = (await read()).periodReviews.pm!;
          await act("period-resume", { period: "pm", reason: "场控误点，尚未开始 TED" });
          assert.equal((await read()).gates.S0, "closed");
          await act("gate", { session: "C0", open: true, scope: "group" });
          await act("gate", { session: "S0", scope: "group", open: true });
          for (const session of conf.sessions)
            for (const judge of conf.judges.filter((j) => assigned(session, j))) {
              const user = asUser(judge);
              const page = await service.mobile(event.id, session.id, user);
              assert.equal(page.open, true);
              await service.submit(
                event.id,
                session.id,
                { formVersion: page.formVersion, answers: { score: 25 } },
                user
              );
            }
          await act("period-close", { period: "pm" });
          await assert.rejects(
            act("period-approve", { period: "pm", periodVersion: original.version }),
            /版本/
          );
          await act("period-approve", { period: "pm" });
          assert.deepEqual(Object.keys((await read()).periodReviews), ["pm"]);
          await act("send");
          // Archived pre-feature events have no period review metadata.
          const saved = await db.judgingEvent.findUniqueOrThrow({ where: { id: event.id } });
          const legacy = { ...saved.control };
          delete legacy.periodReviews;
          await db.judgingEvent.update({ where: { id: event.id }, data: { control: legacy } });
          await act("confirm", {}, signer.admin);
          assert.equal((await read()).phase, "LOCKED");
          assert.deepEqual((await read()).periodReviews, {});
        }
      );
      await t.test(
        "classroom gates, unrestricted TED selection, published guidance and scoped teacher uploads",
        async () => {
          const sample = await call("/admin/judging", cfg.token, {
            title: "开放范围联测",
            roomCount: 2,
            roundsPerRoom: 3
          });
          events.push(sample.id);
          const path = "/admin/judging/" + sample.id;
          const detail = () => call(path, cfg.token);
          const act = async (
            action: string,
            args: Record<string, unknown> = {},
            token = cfg.token,
            status = 201
          ) =>
            call(path + "/actions", token, { action, revision: (await detail()).revision, ...args }, status);
          const cc: JudgingConfig = (await detail()).config;
          cc.rooms[0].allRoundsOpen = true;
          cc.teachers = c.teachers
            .filter((t) => ["T0", "T5", "T10", "T1", "T6"].includes(t.id))
            .map((t) => ({ ...t, photo: "", poster: "" }));
          cc.sessions = c.sessions
            .filter((s) => cc.teachers.some((t) => t.id === s.teacher))
            .map((s) => ({ ...s }));
          cc.sessions.find((s) => s.id === "C10")!.period = "pm";
          cc.sessions.find((s) => s.id === "S10")!.round = 501;
          cc.judges = c.judges.filter((j) => ["PR1", "PR2", "R1D0", "R2D0", "E0"].includes(j.id));
          cc.guidance = { instructions: "请核对选手及教室。", rules: "按本场课堂和演讲规则评分。" };
          cc.approvedForms = true;
          await act("access", { staffIds: [editor.admin.id, floor.admin.id] });
          const photo = new FormData();
          const file = await readFile("apps/user/src/pages/judging/paper-stage.jpg");
          photo.set("file", new Blob([file], { type: "image/jpeg" }), "teacher.jpg");
          const response = await fetch(origin + "/api" + path + "/design-images", {
            method: "POST",
            headers: { Authorization: "Bearer " + editor.token },
            body: photo
          });
          assert.equal(response.status, 201);
          cc.teachers[0].photo = (await response.json()).data.url;
          assert.deepEqual(
            await readFile(resolve(uploads, cc.teachers[0].photo.slice("/uploads/".length))),
            file
          );
          await act("config", { title: sample.title, config: cc }, editor.token);
          await act("entry-open", {}, floor.token);
          const entry = "/judging/" + sample.id + "/entry/" + (await detail()).entryCode;
          assert.deepEqual((await call(entry)).guidance, cc.guidance);
          const ticket = async (id: string) =>
            (await call(entry + "/identify", undefined, { name: cc.judges.find((j) => j.id === id)!.name }))
              .ticket;
          const a = await ticket("R1D0"),
            b = await ticket("R2D0"),
            expert = await ticket("E0");
          const desk = async (t: string, sid: string) => (await call(entry + "/desk?session=" + sid, t)).page;
          await act("start", {}, floor.token);
          for (const sid of ["C0", "C5"]) assert.equal((await desk(a, sid)).open, true);
          assert.equal((await desk(a, "C10")).open, false);
          await act("room-mode", { session: "C10", allRoundsOpen: false }, floor.token);
          await act("gate", { session: "C10", scope: "group", open: true }, floor.token, 400);
          await act("gate", { session: "C10", open: true }, floor.token);
          await act("gate", { session: "C0", open: true }, floor.token, 400);
          assert.equal((await desk(a, "C5")).open, true);
          assert.equal((await desk(b, "C1")).open, false);
          assert.equal((await desk(a, "C0")).teacher.photo, cc.teachers[0].photo);
          assert.equal((await desk(a, "C0")).teacher.poster, "");
          await call(entry + "/desk?session=C1", a, undefined, 403);
          const submit = async (t: string, sid: string, score: number, status = 201) =>
            call(
              entry + "/sessions/" + sid + "/submit",
              t,
              { formVersion: (await desk(t, sid)).formVersion, answers: { score } },
              status
            );
          assert.ok(
            (await desk(expert, "S10")).tasks.every((t: { status: string }) => t.status === "待开放或已截止")
          );
          await act("gate", { session: "S0", open: true }, floor.token, 400);
          await act(
            "attendance",
            { session: "S0", judge: "E0", kind: "makeup", reason: "提前申请" },
            floor.token,
            400
          );
          await submit(expert, "S10", 26, 409);
          for (const sid of ["C10", "C0", "C5"]) await submit(a, sid, 24.5);
          await act("gate", { session: "C1", open: true }, floor.token);
          await act("gate", { session: "C6", open: true }, floor.token, 400);
          await act("room-mode", { session: "C1", allRoundsOpen: true }, editor.token, 403);
          await act("room-mode", { session: "C1", allRoundsOpen: true }, floor.token);
          assert.equal((await desk(b, "C6")).open, true);
          await act("room-mode", { session: "C1", allRoundsOpen: false }, floor.token);
          assert.equal((await desk(b, "C1")).open, true);
          assert.equal((await desk(b, "C6")).open, false);
          await submit(b, "C6", 12, 409);
          const updated = { instructions: "请核对当前选手。", rules: "请按新版场次细则评分。" };
          await act(
            "forms",
            { rubrics: cc.rubrics, sameAudienceForm: true, approvedForms: true, guidance: updated },
            editor.token
          );
          assert.deepEqual((await call(entry)).guidance, updated);
          assert.deepEqual((await desk(a, "C5")).guidance, cc.guidance);
          await act("gate", { session: "S0", scope: "group", open: true }, floor.token);
          assert.deepEqual((await desk(expert, "S10")).guidance, updated);
          assert.equal((await desk(expert, "S10")).session.round, 501);
          assert.ok(
            (await desk(expert, "S10")).tasks.every((t: { status: string }) => t.status === "评分中")
          );
          for (const sid of ["S10", "S0", "S5"]) await submit(expert, sid, 26);
          assert.equal(await db.judgingBallot.count({ where: { eventId: sample.id } }), 6);
          await act("gate", { session: "S1", scope: "group", open: false }, floor.token);
          await submit(expert, "S1", 26, 409);
          assert.ok((await desk(expert, "S0")).receipt);
          await act("gate", { session: "C0", scope: "group", open: false }, floor.token);
          assert.equal((await desk(a, "C10")).open, true);
          await act("gate", { session: "C10", open: false }, floor.token);
          assert.equal((await desk(b, "C1")).open, true);
          await act("gate", { session: "C1", scope: "group", open: false }, floor.token);
          await act("finish", {}, floor.token);
          await act("gate", { session: "S0", scope: "group", open: true }, floor.token, 409);
        }
      );
      await t.test(
        "rehearsal staff may submit exclusively for assigned synthetic seats, with the real gates, receipts and audit",
        async () => {
          let e = await service.create({ title: "浏览器模拟席位测试", rehearsal: true }, cfg.admin);
          events.push(e.id);
          const cc = structuredClone(c);
          cc.rooms = cc.rooms.slice(0, 1);
          cc.teachers = cc.teachers.slice(0, 1);
          cc.sessions = cc.sessions.filter((s) => s.teacher === "T0");
          cc.merits = [];
          const sample = {
            ...c.judges.find((j) => j.id === "R1D0")!,
            userId: req("@conference/shared").rehearsalUserId(e.id, "R1D0")
          };
          cc.judges = [first, sample, c.judges.find((j) => j.id === "E0")!];
          const changeTrial = async (action: string, body: Record<string, unknown> = {}) => {
            e = await service.change(e.id, { action, revision: e.revision, ...body }, cfg.admin);
          };
          await changeTrial("config", { title: "浏览器模拟席位测试", config: cc });
          await changeTrial("start");
          const route = (eventId: string, sid: string, seat: string) =>
            "/admin/judging/" + eventId + "/sessions/" + sid + "/rehearsal/" + seat;
          const target = route(e.id, "C0", sample.id);
          await call(target, undefined, undefined, 401);
          await call(target, namedToken, undefined, 401);
          await call(target, floor.token, undefined, 403);
          await changeTrial("access", { staffIds: [floor.admin.id, outsider.admin.id], confirmerId: null });
          await call(target, outsider.token, undefined, 403);
          await call(route(id, "C0", first.id), cfg.token, undefined, 403);
          await call(route(e.id, "C0", first.id), floor.token, undefined, 403);
          await call(route(e.id, "S0", sample.id), floor.token, undefined, 403);
          const page = await call(target, floor.token);
          assert.equal(page.rehearsalSeat, sample.name);
          assert.equal(page.open, false);
          const body = { answers: { score: 25 }, formVersion: page.formVersion };
          await call(target, floor.token, body, 409);
          await changeTrial("gate", { session: "C0", open: true });
          const tasks = (await call("/admin/judging/" + e.id + "/progress", floor.token)).tasks;
          assert.equal(tasks.filter((x: { canRehearse: boolean }) => x.canRehearse).length, 1);
          await call(target, floor.token, { ...body, formVersion: page.formVersion - 1 }, 409);
          const [one, two] = await Promise.all([
            call(target, floor.token, body),
            call(target, floor.token, body)
          ]);
          assert.deepEqual(one, two);
          assert.deepEqual(Object.keys(one).sort(), ["id", "teacher", "session", "at", "status"].sort());
          const log = await db.judgingAudit.findMany({
            where: { eventId: e.id, action: "rehearsal-submit" }
          });
          assert.equal(log.length, 1);
          assert.equal(log[0].actor, floor.admin.id);
          assert.equal(log[0].detail.ballot, one.id);
          e = await service.detail(e.id, cfg.admin);
          await changeTrial("access", { staffIds: [], confirmerId: null });
          await call(target, floor.token, body, 403);
        }
      );
      await t.test(
        "public H5 matches complete names, separates duplicate seats and counts one ballot per seat",
        async () => {
          const sample = await service.create({ title: "同名评委实操", rehearsal: true }, cfg.admin);
          events.push(sample.id);
          const route = "/admin/judging/" + sample.id;
          const update = async (action: string, rest: Record<string, unknown> = {}) => {
            const detail = await call(route, cfg.token);
            return call(route + "/actions", cfg.token, { action, revision: detail.revision, ...rest });
          };
          const cc = structuredClone(c);
          cc.rooms = cc.rooms.slice(0, 1);
          cc.teachers = cc.teachers.filter((t) => t.id === "T0" || t.id === "T5");
          cc.sessions = cc.sessions.filter((s) => cc.teachers.some((t) => t.id === s.teacher));
          cc.merits = [];
          cc.judges = [
            { ...first, id: "J01", name: "陈晨", org: "青禾", userId: "", phone: "" },
            {
              ...c.judges.find((j) => j.id === "R1D0")!,
              id: "J02",
              name: "林小雨",
              org: "星河",
              userId: "",
              phone: ""
            },
            {
              ...c.judges.find((j) => j.id === "R1D16")!,
              id: "J03",
              name: "林小雨",
              org: "明月",
              userId: "",
              phone: ""
            },
            {
              ...c.judges.find((j) => j.id === "E0")!,
              id: "J04",
              name: "赵宁",
              org: "如初",
              userId: "",
              phone: ""
            }
          ];
          await update("config", { title: "同名评委实操", config: cc });
          const prefix = "/judging/" + sample.id + "/entry/";
          await call(prefix + "unpublished", undefined, undefined, 404);
          await call(route + "/actions", outsider.token, { action: "entry-open", revision: 2 }, 403);
          await update("entry-open");
          const published = await call(route, cfg.token);
          const entry = prefix + published.entryCode;
          assert.deepEqual(Object.keys(await call(entry)).sort(), ["guidance", "look", "rehearsal", "title"]);
          const identify = (name: string, number?: string, code = 201) =>
            call(entry + "/identify", undefined, { name, number }, code);
          await identify("林", undefined, 404);
          await identify(" ", undefined, 400);
          const choices = await identify("  林小雨 ");
          assert.deepEqual(choices, {
            kind: "choose",
            choices: [
              { id: "J02", org: "星河" },
              { id: "J03", org: "明月" }
            ]
          });
          await identify("林小雨", "J04", 400);
          const firstSeat = (await identify("林小雨", "J02")).ticket;
          const secondSeat = (await identify("林小雨", "J03")).ticket;
          const expert = (await identify("赵宁")).ticket;
          assert.notEqual(firstSeat, secondSeat);
          await call(entry + "/desk", undefined, undefined, 401);
          await call(entry + "/desk", cfg.token, undefined, 401);
          await call(route, firstSeat, undefined, 401);
          await call(formalEntry + "/desk", firstSeat, undefined, 401);
          const view = (token: string) => call(entry + "/desk", token);
          assert.equal((await view(expert)).page.role, "expert");
          assert.ok(
            (await view(expert)).page.tasks.every((t: { sessionId: string }) => t.sessionId.startsWith("S"))
          );
          await call(entry + "/desk?session=S0", firstSeat, undefined, 403);
          const originalLecturer = (await identify("陈晨")).ticket;
          cc.judges[0].org = "青禾新校区";
          await update("config", { title: "同名评委实操", config: cc });
          await call(entry + "/desk", originalLecturer, undefined, 401);
          await update("start");
          await update("gate", { session: "C0", open: false });
          await update("gate", { session: "C5", open: true });
          const one = await view(firstSeat),
            two = await view(secondSeat);
          assert.equal(one.page.session.id, "C5");
          assert.equal(one.page.open, true);
          assert.equal(one.judge.role, "experience");
          assert.equal(two.judge.role, "observer");
          const payload = { formVersion: one.page.formVersion, answers: { score: 25 } };
          await call(entry + "/sessions/C0/submit", firstSeat, payload, 409);
          await call(entry + "/sessions/C5/submit", expert, payload, 403);
          await call(entry + "/sessions/C5/submit", firstSeat, { ...payload, formVersion: 0 }, 409);
          for (const answers of [{}, { score: null }, { score: "" }, { score: "  " }, { score: "unseen" }]) {
            await call(entry + "/sessions/C5/submit", firstSeat, { ...payload, answers }, 400);
          }
          assert.equal(await db.judgingBallot.count({ where: { eventId: sample.id } }), 0);
          assert.equal((await view(firstSeat)).page.receipt, null);
          const submit = (ticket: string) => call(entry + "/sessions/C5/submit", ticket, payload);
          const [receipt, again] = await Promise.all([submit(firstSeat), submit(firstSeat)]);
          assert.deepEqual(again, receipt);
          const other = await submit(secondSeat);
          assert.notEqual(other.id, receipt.id);
          assert.deepEqual(
            (await call(entry + "/desk?session=C5", (await identify("林小雨", "J02")).ticket)).page.receipt,
            receipt
          );
          assert.equal(await db.judgingBallot.count({ where: { eventId: sample.id } }), 2);
          assert.equal(
            (await service.results(sample.id, cfg.admin)).rows.find((r: ScoringRow) => r.id === "T5")
              .audience,
            25
          );
          await update("entry-open");
          assert.equal((await call(route, cfg.token)).entryCode, published.entryCode);
          await update("entry-close");
          await call(entry, undefined, undefined, 404);
          await call(entry + "/sessions/C5/submit", firstSeat, payload, 404);
          await update("entry-open");
          const renewed = (await call(route, cfg.token)).entryCode;
          assert.notEqual(renewed, published.entryCode);
          await call(prefix + renewed + "/desk", firstSeat, undefined, 401);
          await call("/judging/" + sample.id + "/published", undefined, undefined, 404);
          const renewedSeat = await call(prefix + renewed + "/identify", undefined, { name: "赵宁" });
          await update("delete");
          await call(prefix + renewed, undefined, undefined, 404);
          await call(prefix + renewed + "/identify", undefined, { name: "赵宁" }, 404);
          await call(prefix + renewed + "/desk", renewedSeat.ticket, undefined, 404);
          await call(prefix + renewed + "/sessions/C5/submit", renewedSeat.ticket, payload, 404);
          assert.equal(await db.judgingBallot.count({ where: { eventId: sample.id } }), 2);
        }
      );
      await t.test(
        "event-specific judge types route the shared H5 and keep opened forms and receipts intact",
        async () => {
          const sample = await service.create({ title: "自定义评委类型联排", rehearsal: true }, cfg.admin);
          events.push(sample.id);
          const route = "/admin/judging/" + sample.id;
          const detail = () => call(route, cfg.token);
          const edit = async (action: string, data: Record<string, unknown> = {}, status = 201) =>
            call(
              route + "/actions",
              cfg.token,
              { action, revision: (await detail()).revision, ...data },
              status
            );
          const cc = structuredClone(c);
          const pro = "lecturer_coach",
            old = "observer_visitors",
            next = "observer_team";
          const ted = "expert_panel";
          cc.roleOptions = cc.roleOptions!.filter((r) => r.id !== "lecturer" && r.id !== "expert");
          cc.roleOptions.push(
            { id: pro, label: "专业导师" },
            { id: old, label: "特邀观察员" },
            { id: ted, label: "演讲评委团" }
          );
          cc.rubrics[pro] = { ...cc.rubrics.lecturer, title: "专业导师表" };
          cc.rubrics[ted] = { ...cc.rubrics.expert, title: "演讲表现评分表" };
          delete (cc.rubrics as Partial<typeof cc.rubrics>).lecturer;
          delete (cc.rubrics as Partial<typeof cc.rubrics>).expert;
          cc.rubrics[old] = { ...cc.rubrics.observer, title: "首轮观察表" };
          for (const judge of cc.judges) if (judge.role === "lecturer") judge.role = pro;
          for (const judge of cc.judges) if (judge.role === "expert") judge.role = ted;
          const guest = cc.judges.find((j) => j.role === "observer" && j.room === "R1")!;
          guest.role = old;
          await edit("config", { title: sample.title, config: cc });
          const saved = (await detail()).config;
          assert.ok(!saved.rubrics.lecturer && saved.rubrics[pro]);
          assert.equal(saved.judges.find((j: Judge) => j.id === guest.id).role, old);
          const legacy = structuredClone(saved);
          delete legacy.roleOptions;
          delete legacy.rubrics[old];
          await edit("config", { title: sample.title, config: legacy });
          assert.equal((await detail()).config.rubrics[old].title, "首轮观察表");
          assert.ok(!(await call(path, cfg.token)).config.rubrics[old]);
          await edit("start");
          await edit("entry-open");
          const entry = "/judging/" + sample.id + "/entry/" + (await detail()).entryCode;
          const tedJudge = cc.judges.find((j) => j.role === ted)!;
          const tedSeat = await call(entry + "/identify", undefined, { name: tedJudge.name });
          await edit("gate", { session: "S0", open: true, scope: "group" });
          const tedDesk = await call(entry + "/desk?session=S0", tedSeat.ticket);
          assert.equal(tedDesk.judge.roleLabel, "演讲评委团");
          assert.equal(tedDesk.page.form.title, "演讲表现评分表");
          assert.ok(
            tedDesk.page.tasks.every((task: { sessionId: string }) => task.sessionId.startsWith("S"))
          );
          await call(entry + "/sessions/S0/submit", tedSeat.ticket, {
            formVersion: tedDesk.page.formVersion,
            answers: { score: 29 }
          });
          const { ticket } = await call(entry + "/identify", undefined, { name: guest.name });
          await edit("gate", { session: "C0", open: true });
          await edit("attendance", { session: "C10", judge: guest.id, kind: "makeup", reason: "单独补交" });
          const desk = (session: string) => call(entry + "/desk?session=" + session, ticket);
          const first = (await desk("C0")).page;
          assert.equal(first.roleLabel, "特邀观察员");
          assert.equal(first.form.title, "首轮观察表");
          const { roleOptions, rubrics } = (await detail()).config as JudgingConfig;
          const updated = {
            roleOptions: [...roleOptions!.filter((r) => r.id !== old), { id: next, label: "教研观察团" }],
            rubrics: { ...rubrics, [next]: { ...rubrics[old], title: "第二轮观察表" } },
            sameAudienceForm: true,
            approvedForms: true
          };
          delete (updated.rubrics as Partial<typeof rubrics>)[old];
          await edit("forms", updated, 400);
          await edit("forms", { ...updated, roleTransfers: { [guest.id]: pro } }, 400);
          await edit("forms", { ...updated, roleTransfers: { [guest.id]: next } });
          const frozen = (await desk("C0")).page;
          assert.equal(frozen.roleLabel, first.roleLabel);
          assert.equal(frozen.formVersion, first.formVersion);
          assert.deepEqual(frozen.form, first.form);
          const makeup = (await desk("C10")).page;
          assert.equal(makeup.open, true);
          assert.equal(makeup.roleLabel, "特邀观察员");
          assert.deepEqual(makeup.form, first.form);
          const handIn = (session: string, version: number, score: number) =>
            call(entry + "/sessions/" + session + "/submit", ticket, {
              formVersion: version,
              answers: { score }
            });
          const receipt = await handIn("C0", first.formVersion, 25);
          await edit("gate", { session: "C0", open: false });
          await edit("gate", { session: "C5", open: true });
          const second = await desk("C5");
          assert.equal(second.judge.roleLabel, "教研观察团");
          assert.equal(second.page.form.title, "第二轮观察表");
          assert.ok(second.page.formVersion > first.formVersion);
          await handIn("C5", second.page.formVersion, 28);
          assert.deepEqual((await desk("C0")).page.receipt, receipt);
          const result = await call(route + "/results", cfg.token);
          assert.deepEqual(
            result.ballots.map((b: { roleLabel: string }) => b.roleLabel),
            ["演讲评委团", "特邀观察员", "教研观察团"]
          );
          assert.equal(result.rows.find((r: ScoringRow) => r.id === "T0").ted, 29);
          assert.equal(result.rows.find((r: ScoringRow) => r.id === "T5").audience, 28);
        }
      );
      await t.test("only a global editor can delete a locked event and its records stay on file", async () => {
        const current = await call(path, cfg.token);
        assert.equal(current.phase, "LOCKED");
        const remove = (token: string | undefined, version: number, status: number) =>
          call(path + "/actions", token, { action: "delete", revision: version }, status);
        const listed = async (token: string): Promise<string[]> =>
          (await call("/admin/judging", token)).map((e: { id: string }) => e.id);
        const before = await listed(cfg.token);
        assert.ok(before.length > 1 && before.includes(id));
        assert.ok((await listed(editor.token)).includes(id));
        await remove(undefined, current.revision, 401);
        await remove(floor.token, current.revision, 403);
        await remove(editor.token, current.revision, 403);
        await remove(cfg.token, current.revision - 1, 409);
        assert.equal((await call("/judging/" + id + "/published")).edition, 2);
        const count = await db.judgingBallot.count({ where: { eventId: id } });
        assert.ok(count > 0);
        await remove(cfg.token, current.revision, 201);
        await remove(cfg.token, current.revision, 404);
        assert.deepEqual(await listed(cfg.token), before.filter((other) => other !== id));
        assert.ok(!(await listed(editor.token)).includes(id));
        await call(path, cfg.token, undefined, 404);
        await call(path + "/results", cfg.token, undefined, 404);
        await call(path + "/export/awards?edition=2", cfg.token, undefined, 404);
        await call("/judging/" + id + "/published", undefined, undefined, 404);
        assert.equal(await db.judgingBallot.count({ where: { eventId: id } }), count);
        assert.equal(await db.judgingEdition.count({ where: { eventId: id } }), 2);
        const logs = await db.judgingAudit.findMany({ where: { eventId: id, action: "delete" } });
        assert.equal(logs.length, 1);
        assert.equal(logs[0].actor, cfg.admin.id);
        assert.equal(logs[0].detail.previousPhase, "LOCKED");
      });
    } finally {
      await db.$transaction([
        db.judgingBallot.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingEdition.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingAudit.deleteMany({ where: { eventId: { in: events } } }),
        db.judgingEvent.deleteMany({ where: { id: { in: events } } })
      ]);
      await db.materialAsset.deleteMany({ where: { createdBy: { in: admins } } });
      await db.auditLog.deleteMany({ where: { adminUserId: { in: admins } } });
      await db.adminUser.deleteMany({ where: { id: { in: admins } } });
      await db.role.deleteMany({ where: { id: { in: roles } } });
      await db.user.deleteMany({ where: { id: { in: users } } });
      await app.close();
      await rm(uploads, { recursive: true, force: true });
    }
  }
);
