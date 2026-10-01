import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";

test(
  "real API: official settings secrecy, verification file, standalone campaigns and registration changes",
  {
    skip: !process.env.INVITATION_TEST_DATABASE_URL,
  },
  async () => {
    const databaseUrl = process.env.INVITATION_TEST_DATABASE_URL!;
    const origin =
      process.env.INVITATION_TEST_API_ORIGIN || "http://localhost:3001";
    assert.ok(
      ["localhost", "127.0.0.1"].includes(new URL(databaseUrl).hostname),
    );
    assert.ok(["localhost", "127.0.0.1"].includes(new URL(origin).hostname));
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const suffix = randomBytes(6).toString("hex"),
      password = randomBytes(24).toString("hex"),
      salt = randomBytes(16).toString("hex");
    const passwordHash = `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")}`;
    const appId = "wx" + randomBytes(8).toString("hex"),
      secret = randomBytes(16).toString("hex");
    const admins: string[] = [],
      campaigns: string[] = [],
      conferences: string[] = [];
    let manager = "",
      visitor = "";
    const settingsPath = "/admin/invitations/settings/wechat";
    async function call(
      path: string,
      method = "GET",
      body?: unknown,
      token = manager,
      status = 200,
    ) {
      const response = await fetch(`${origin}/api${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const payload = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${payload.message}`,
      );
      assert.equal(JSON.stringify(payload).includes(secret), false);
      return payload.data;
    }
    try {
      assert.equal(
        await db.invitationWechatConfig.findUnique({
          where: { id: "official" },
        }),
        null,
        "Use an isolated DB without an existing official-account configuration",
      );
      for (const label of ["manager", "visitor"]) {
        const account = await db.adminUser.create({
          data: {
            username: `invitation-settings-${label}-${suffix}`,
            passwordHash,
          },
        });
        admins.push(account.id);
        const login = await call(
          "/admin/auth/login",
          "POST",
          { username: account.username, password },
          "",
          201,
        );
        if (label === "manager") {
          const role = await db.role.findUniqueOrThrow({
            where: { code: "super_admin" },
          });
          await db.adminUserRole.create({
            data: { adminUserId: account.id, roleId: role.id },
          });
          manager = login.token;
        } else visitor = login.token;
      }
      await call(settingsPath, "GET", undefined, "", 401);
      await call(settingsPath, "GET", undefined, visitor, 403);
      await call(settingsPath, "PATCH", {}, visitor, 403);
      await call(`${settingsPath}/test`, "POST", undefined, visitor, 403);
      const state = await call(settingsPath);
      const config = {
        revision: state.revision,
        enabled: false,
        appId,
        appSecret: secret,
        verificationFile: { name: `MP_verify_${suffix}.txt`, content: suffix },
      };
      const saved = await call(settingsPath, "PATCH", config);
      assert.equal(saved.secretConfigured, true);
      const cipher = (
        await db.invitationWechatConfig.findUniqueOrThrow({
          where: { id: "official" },
        })
      ).appSecretEnc;
      assert.ok(cipher?.startsWith("v1:") && !cipher.includes(secret));
      await call(settingsPath, "PATCH", {
        ...config,
        appSecret: "",
        revision: saved.revision,
      });
      assert.equal(
        (
          await db.invitationWechatConfig.findUniqueOrThrow({
            where: { id: "official" },
          })
        ).appSecretEnc,
        cipher,
      );
      await call(settingsPath, "PATCH", config, manager, 409);
      const verification = await fetch(`${origin}/MP_verify_${suffix}.txt`);
      assert.equal(verification.status, 200);
      assert.match(verification.headers.get("content-type")!, /text\/plain/);
      assert.equal(await verification.text(), suffix);
      assert.equal(
        (await fetch(`${origin}/MP_verify_missing.txt`)).status,
        404,
      );
      const before = await db.conference.count();
      const created = await call(
        "/admin/invitations/campaigns",
        "POST",
        {
          source: "external",
          title: `外部邀请验收-${suffix}`,
          registration: {
            mode: "external",
            url: "https://example.com/form?event=1",
            label: "填写参会表",
          },
        },
        manager,
        201,
      );
      campaigns.push(created.id);
      assert.equal(await db.conference.count(), before);
      const path = `/admin/invitations/campaigns/${created.id}`;
      let detail = await call(path);
      assert.equal(detail.conferenceId, null);
      detail = await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      const links: string[] = [];
      for (const name of ["测试嘉宾甲", "测试嘉宾乙"]) {
        const invite = await call(
          `${path}/recipients`,
          "POST",
          { name, salutation: "老师" },
          manager,
          201,
        );
        links.push(new URL(invite.shareUrl).pathname.split("/").pop()!);
      }
      for (const token of links) {
        const doc = await call(`/invitations/${token}`, "GET", undefined, "");
        assert.equal(doc.registrationUrl, "https://example.com/form?event=1");
        assert.equal(doc.miniAppId, "");
        assert.equal(doc.registrationPath, "");
        assert.equal((await fetch(`${origin}/i/${token}`)).status, 200);
        await call(`/invitations/${token}/qrcode`, "GET", undefined, "", 400);
        assert.equal(
          (
            await call(
              `/invitations/${token}/wechat?url=${encodeURIComponent(`${origin}/i/${token}`)}`,
              "GET",
              undefined,
              "",
            )
          ).available,
          false,
        );
      }
      detail.draft.registration.url = "https://example.com/form?event=2";
      detail = await call(path, "PATCH", {
        draftRevision: detail.draftRevision,
        content: detail.draft,
      });
      assert.equal(
        (await call(`/invitations/${links[0]}`)).registrationUrl,
        "https://example.com/form?event=1",
      );
      detail = await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      for (const token of links)
        assert.equal(
          (await call(`/invitations/${token}`)).registrationUrl,
          "https://example.com/form?event=2",
        );
      const conference = await db.conference.create({
        data: {
          title: `小程序报名验收-${suffix}`,
          slug: `invitation-settings-${suffix}`,
          status: "PUBLISHED",
          startsAt: new Date(Date.now() + 86400000),
          endsAt: new Date(Date.now() + 172800000),
          location: "测试会场",
        },
      });
      conferences.push(conference.id);
      detail.draft.registration = {
        mode: "miniapp",
        conferenceId: conference.id,
        url: "",
        label: "报名参会",
      };
      detail = await call(path, "PATCH", {
        draftRevision: detail.draftRevision,
        content: detail.draft,
      });
      detail = await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      const mini = await call(`/invitations/${links[0]}`);
      assert.match(
        mini.registrationPath,
        new RegExp(`conferenceId=${conference.id}&invitationToken=`),
      );
      assert.equal(mini.registrationOpen, true);
      detail.draft.registration.mode = "none";
      detail = await call(path, "PATCH", {
        draftRevision: detail.draftRevision,
        content: detail.draft,
      });
      await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      assert.equal(
        (await call(`/invitations/${links[0]}`)).registrationOpen,
        false,
      );
      const audit = await db.auditLog.findMany({
        where: {
          adminUserId: { in: admins },
          entityType: "invitation_wechat_config",
        },
      });
      assert.equal(audit.length, 2);
      assert.equal(JSON.stringify(audit).includes(secret), false);
    } finally {
      await db.invitationWechatConfig.deleteMany({
        where: { id: "official", appId, revision: { in: [1, 2] } },
      });
      await db.conferenceInvitation.deleteMany({
        where: { campaignId: { in: campaigns } },
      });
      await db.invitationCampaign.deleteMany({
        where: { id: { in: campaigns } },
      });
      await db.conference.deleteMany({ where: { id: { in: conferences } } });
      await db.auditLog.deleteMany({ where: { adminUserId: { in: admins } } });
      await db.adminUserRole.deleteMany({
        where: { adminUserId: { in: admins } },
      });
      await db.adminUser.deleteMany({ where: { id: { in: admins } } });
      await db.$disconnect();
    }
  },
);
