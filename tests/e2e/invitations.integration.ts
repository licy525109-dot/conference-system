import assert from "node:assert/strict";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { test } from "node:test";
import { PrismaClient } from "@prisma/client";
import { readFile, readdir, unlink } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

// Opt-in only: this suite seeds its own records in a disposable local database.
test(
  "real invitation API: permissions, shared publishing, payment attribution and revocation",
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
    const suffix = randomBytes(5).toString("hex");
    const password = randomBytes(24).toString("hex");
    const salt = randomBytes(16).toString("hex");
    const hash = `pbkdf2$sha512$10000$${salt}$${pbkdf2Sync(password, salt, 10000, 64, "sha512").toString("hex")}`;
    const adminIds: string[] = [];
    const conferenceIds: string[] = [];
    let roleId: string | undefined;
    const uploadedAssets: Array<{ id: string; url: string }> = [];
    async function call(
      path: string,
      method = "GET",
      body?: unknown,
      token?: string,
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
      const json = await response.json();
      assert.equal(
        response.status,
        status,
        `${method} ${path}: ${json.message}`,
      );
      return json.data;
    }
    try {
      const admins = [];
      for (const label of ["manager", "staff", "colleague", "outsider"]) {
        const admin = await db.adminUser.create({
          data: {
            username: `invite-${label}-${suffix}`,
            passwordHash: hash,
            displayName: `邀请函测试-${label}`,
          },
        });
        adminIds.push(admin.id);
        admins.push(admin);
      }
      const manager = (
        await call(
          "/admin/auth/login",
          "POST",
          { username: admins[0]!.username, password },
          undefined,
          201,
        )
      ).token;
      const superRole = await db.role.findUniqueOrThrow({
        where: { code: "super_admin" },
      });
      await db.adminUserRole.create({
        data: { adminUserId: admins[0]!.id, roleId: superRole.id },
      });
      const role = await db.role.create({
        data: {
          code: `invite-test-${suffix}`,
          name: "邀请函测试工作人员",
          permissions: {
            create: ["invitation:view", "invitation:write"].map((code) => ({
              permission: { connect: { code } },
            })),
          },
        },
      });
      roleId = role.id;
      for (const admin of admins.slice(1))
        await db.adminUserRole.create({
          data: { adminUserId: admin.id, roleId: role.id },
        });
      const staff = (
        await call(
          "/admin/auth/login",
          "POST",
          { username: admins[1]!.username, password },
          undefined,
          201,
        )
      ).token;
      const colleague = (
        await call(
          "/admin/auth/login",
          "POST",
          { username: admins[2]!.username, password },
          undefined,
          201,
        )
      ).token;
      const outsider = (
        await call(
          "/admin/auth/login",
          "POST",
          { username: admins[3]!.username, password },
          undefined,
          201,
        )
      ).token;
      for (const label of ["main", "other"]) {
        const conf = await db.conference.create({
          data: {
            title: "观潮会集 · 邀请函联调演示",
            slug: `invite-test-${label}-${suffix}`,
            status: "PUBLISHED",
            startsAt: new Date(Date.now() + 86400000),
            endsAt: new Date(Date.now() + 172800000),
            location: "演示会场",
            summary: "这是一份用于验证功能的演示邀请函，不代表正式会议。",
            formDefinition: { create: { title: "演示报名表" } },
          },
        });
        conferenceIds.push(conf.id);
      }
      await call(
        "/admin/invitations/campaigns",
        "GET",
        undefined,
        undefined,
        401,
      );
      const campaign = await call(
        "/admin/invitations/campaigns",
        "POST",
        { conferenceId: conferenceIds[0] },
        manager,
        201,
      );
      const path = `/admin/invitations/campaigns/${campaign.id}`;
      await call(`${path}/assets`, "GET", undefined, staff, 403);
      const photo = await readFile(
        "apps/admin/public/invitation-art/tide-paper.jpg",
      );
      const form = new FormData();
      form.append(
        "file",
        new Blob([photo], { type: "image/jpeg" }),
        "invitation-integration-photo.jpg",
      );
      const uploadResponse = await fetch(`${origin}/api${path}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${manager}` },
        body: form,
      });
      assert.equal(uploadResponse.status, 201);
      const asset = (await uploadResponse.json()).data;
      uploadedAssets.push(asset);
      assert.ok(asset.id);
      assert.match(asset.url, /^\/uploads\/materials\//);
      assert.equal(
        (await db.materialAsset.findUniqueOrThrow({ where: { id: asset.id } }))
          .usage,
        `conference_invitation:${campaign.id}`,
      );
      const library = await call(
        `${path}/assets?kind=image&keyword=invitation-integration-photo`,
        "GET",
        undefined,
        manager,
      );
      assert.ok(
        library.items.some((item: { id: string }) => item.id === asset.id),
      );
      const fontDir = resolve(
        dirname(
          createRequire(resolve("services/api/package.json")).resolve(
            "prisma/package.json",
          ),
        ),
        "build/public/assets",
      );
      const fontName = (await readdir(fontDir)).find((name) =>
        /^inter-latin-400-normal\..+\.woff2$/.test(name),
      );
      assert.ok(
        fontName,
        "The installed Prisma package provides the licensed Inter font fixture",
      );
      const fontPath = resolve(fontDir, fontName);
      const font = await readFile(fontPath);
      const fontForm = new FormData();
      fontForm.append(
        "file",
        new Blob([font], { type: "application/octet-stream" }),
        "integration-font.woff2",
      );
      const fontResponse = await fetch(`${origin}/api${path}/assets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${manager}` },
        body: fontForm,
      });
      assert.equal(fontResponse.status, 201);
      const fontAsset = (await fontResponse.json()).data;
      uploadedAssets.push(fontAsset);
      assert.equal(fontAsset.fileType, "font/woff2");
      await call(
        `${path}/members`,
        "PATCH",
        { adminIds: [admins[1]!.id, admins[2]!.id] },
        manager,
      );
      await call(path, "GET", undefined, outsider, 404);
      assert.equal(
        (await call("/admin/invitations/campaigns", "GET", undefined, outsider))
          .items.length,
        0,
      );
      await call(`${path}/publish`, "POST", { draftRevision: 1 }, staff, 403);
      await call(
        `${path}/members`,
        "PATCH",
        { adminIds: [admins[3]!.id] },
        staff,
        403,
      );
      let detail = await call(path, "GET", undefined, manager);
      const content = {
        ...detail.draft,
        dateLabel: "演示日程",
        coverImageUrl: "/uploads/invitation-demo-cover.png",
        introduction:
          "这是一份功能演示邀请函。欢迎体验每场会议独立视觉、专属称谓与统一更新的会议内容。",
        shareTitle: "{姓名}专属邀请函",
        shareDescription: "邀请函功能演示，不代表正式会议信息。",
        agenda: [
          {
            id: "agenda",
            date: "会议当天",
            time: "09:00",
            title: "开场交流",
            speaker: "",
            location: "主会场",
            imageUrl: asset.url,
          },
        ],
        guests: [
          {
            id: "guest",
            name: "测试嘉宾",
            organization: "测试单位",
            role: "",
            biography: "第一段完整介绍。\n第二段经历。",
            imageUrl: asset.url,
            status: "INVITED",
          },
        ],
        design: {
          ...detail.draft.design,
          font: "custom",
          fontUrl: fontAsset.url,
          replaceAllFonts: true,
        },
        inviteeSort: { key: "name", direction: "desc" },
        navigation: {
          enabled: true,
          sticky: false,
          items: [
            { moduleId: "agenda", label: "活动安排", visible: true },
            { moduleId: "guests", label: "嘉宾", visible: false },
          ],
        },
      };
      detail = await call(
        path,
        "PATCH",
        { content, draftRevision: detail.draftRevision },
        manager,
      );
      await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      const first = await call(
        `${path}/recipients`,
        "POST",
        { name: "演示嘉宾甲", salutation: "老师" },
        staff,
        201,
      );
      const second = await call(
        `${path}/recipients`,
        "POST",
        { name: "演示嘉宾乙", salutation: "先生" },
        colleague,
        201,
      );
      const tokenA = new URL(first.shareUrl).pathname.split("/").pop()!;
      const tokenB = new URL(second.shareUrl).pathname.split("/").pop()!;
      assert.equal(
        (await call(`${path}/recipients`, "GET", undefined, staff)).items
          .length,
        1,
      );
      await call(
        `/admin/invitations/recipients/${second.id}`,
        "PATCH",
        { enabled: false },
        staff,
        403,
      );
      const original = await call(`/invitations/${tokenA}`);
      assert.equal(original.content.agenda[0].imageUrl, asset.url);
      assert.match(original.content.guests[0].biography, /第二段/);
      assert.equal(original.content.design.fontUrl, fontAsset.url);
      assert.equal(original.content.inviteeSort.direction, "desc");
      assert.equal(original.content.navigation.sticky, false);
      assert.equal(original.content.navigation.items[0].label, "活动安排");
      assert.equal(original.content.navigation.items[1].visible, false);
      content.agenda[0].title = "统一更新后的会议议程";
      content.navigation = {
        enabled: false,
        sticky: true,
        items: [{ moduleId: "agenda", label: "最新日程", visible: true }],
      };
      if (process.env.INVITATION_KEEP_PREVIEW !== "1") {
        content.title = "";
        content.dateLabel = "";
        content.location = "";
        content.introduction = "";
        content.cover = {
          mode: "artwork",
          width: 1080,
          height: 1920,
          layers: [
            {
              id: "recipient",
              label: "受邀人",
              text: "{姓名}",
              enabled: true,
              x: 10,
              y: 42,
              width: 36,
              height: 5,
              fontSize: 52,
              font: "serif",
              color: "#765925",
              bold: true,
              italic: false,
              underline: false,
              align: "center",
            },
          ],
        };
        content.effects = {
          entrance: "unfold",
          cover: "fade",
          scroll: "chapters",
          duration: 750,
        };
        content.modules = [
          {
            id: "custom",
            type: "richtext",
            title: "参会须知",
            enabled: true,
            body: [
              {
                tag: "p",
                attrs: { style: "text-align:center;position:fixed" },
                children: [
                  {
                    tag: "strong",
                    attrs: {},
                    children: [{ text: "格式统一更新" }],
                  },
                  { tag: "script", attrs: {}, children: [{ text: "bad" }] },
                ],
              },
            ],
            imageUrl: "",
          },
          {
            id: "agenda",
            type: "agenda",
            title: "日程",
            enabled: true,
            body: [],
            imageUrl: "",
          },
          {
            id: "venue",
            type: "venue",
            title: "已隐藏",
            enabled: false,
            body: [],
            imageUrl: "",
          },
        ];
        content.invitees = Array.from({ length: 500 }, (_, index) => ({
          id: `load-${index}`,
          name: `演示嘉宾${index}`,
          organization: "长机构名称".repeat(20),
        }));
      }
      detail = await call(
        path,
        "PATCH",
        { content, draftRevision: detail.draftRevision },
        manager,
      );
      assert.equal(
        (await call(`/invitations/${tokenA}`)).content.agenda[0].title,
        "开场交流",
      );
      assert.equal(
        (await call(`/invitations/${tokenA}`)).content.navigation.enabled,
        true,
      );
      assert.equal(
        (await call(path, "GET", undefined, manager)).draft.navigation.enabled,
        false,
      );
      assert.equal(
        (await call(path, "GET", undefined, staff)).draft.agenda[0].title,
        "开场交流",
      );
      await call(
        path,
        "PATCH",
        { content, draftRevision: detail.draftRevision - 1 },
        manager,
        409,
      );
      await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      for (const token of [tokenA, tokenB]) {
        const current = await call(`/invitations/${token}`);
        assert.equal(current.content.agenda[0].title, content.agenda[0].title);
        assert.equal(current.content.navigation.enabled, false);
        assert.equal(current.content.navigation.sticky, true);
        assert.equal(current.content.navigation.items[0].label, "最新日程");
        assert.equal(current.revision, original.revision + 1);
        assert.equal(current.createdBy, undefined);
        if (process.env.INVITATION_KEEP_PREVIEW !== "1") {
          assert.equal(current.content.cover.mode, "artwork");
          assert.equal(current.content.cover.layers[0].fontSize, 52);
          assert.deepEqual(
            current.content.modules.map((item: { id: string }) => item.id),
            ["custom", "agenda", "venue"],
          );
          assert.equal(current.content.modules[2].enabled, false);
          assert.match(
            JSON.stringify(current.content.modules[0].body),
            /strong/,
          );
          assert.doesNotMatch(
            JSON.stringify(current.content.modules[0].body),
            /script|position/,
          );
          assert.equal(current.content.effects.scroll, "chapters");
          assert.equal(current.content.title, "");
        }
      }
      const html = await fetch(first.shareUrl);
      assert.equal(html.status, 200);
      assert.match(html.headers.get("cache-control") || "", /no-store/);
      const text = await html.text();
      assert.match(text, /property="og:title"/);
      assert.match(text, /\/invitation-assets\//);
      assert.match(text, /<title>演示嘉宾甲专属邀请函<\/title>/);
      assert.match(
        await (await fetch(second.shareUrl)).text(),
        /<title>演示嘉宾乙专属邀请函<\/title>/,
      );
      const roster = [
        {
          id: "roster-a",
          name: "同名测试嘉宾",
          organization: "甲机构",
          role: "院长",
        },
        {
          id: "roster-b",
          name: "同名测试嘉宾",
          organization: "乙机构",
          role: "主任",
        },
      ];
      detail = await call(
        path,
        "PATCH",
        {
          content: { ...content, invitees: roster },
          draftRevision: detail.draftRevision,
        },
        manager,
      );
      await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      await call(
        `${path}/recipients`,
        "POST",
        { name: "同名测试嘉宾" },
        staff,
        409,
      );
      await call(
        `${path}/recipients`,
        "POST",
        { name: "其他姓名", publicInviteeId: "roster-b" },
        staff,
        400,
      );
      const bound = await call(
        `${path}/recipients`,
        "POST",
        { name: "同名测试嘉宾", publicInviteeId: "roster-b" },
        staff,
        201,
      );
      const boundToken = new URL(bound.shareUrl).pathname.split("/").pop()!;
      assert.equal(
        (await call(`/invitations/${boundToken}`)).recipient.publicInviteeId,
        "roster-b",
      );
      await call(
        `/admin/invitations/recipients/${bound.id}`,
        "PATCH",
        { name: "同名测试嘉宾", salutation: "老师" },
        staff,
      );
      assert.equal(
        (await call(`/invitations/${boundToken}`)).recipient.publicInviteeId,
        "roster-b",
      );
      detail = await call(
        path,
        "PATCH",
        {
          content: { ...content, invitees: [roster[0]] },
          draftRevision: detail.draftRevision,
        },
        manager,
      );
      await call(
        `${path}/publish`,
        "POST",
        { draftRevision: detail.draftRevision },
        manager,
        201,
      );
      assert.equal(
        (await call(`/invitations/${boundToken}`)).recipient.publicInviteeId,
        "roster-b",
        "deleted row must not silently rebind to the remaining namesake",
      );
      const sku = await db.registrationSku.create({
        data: {
          conferenceId: conferenceIds[0]!,
          name: "演示席位",
          priceCent: 100,
          stock: 10,
        },
      });
      const user = await call(
        "/auth/wechat/login",
        "POST",
        { code: `invite-test-${suffix}` },
        undefined,
        201,
      );
      const order = await call(
        "/registration/orders",
        "POST",
        {
          conferenceId: conferenceIds[0],
          skuId: sku.id,
          quantity: 1,
          formData: {},
          invitationToken: tokenA,
        },
        user.token,
        201,
      );
      const stored = await db.order.findUniqueOrThrow({
        where: { orderNo: order.orderNo },
      });
      assert.equal(stored.invitationId, first.id);
      assert.equal(stored.payableAmountCent, 100);
      assert.equal(
        await db.registration.count({ where: { orderId: stored.id } }),
        0,
      );
      await call(
        "/payments/mock/confirm",
        "POST",
        { orderNo: order.orderNo },
        user.token,
        201,
      );
      await call(
        "/payments/mock/confirm",
        "POST",
        { orderNo: order.orderNo },
        user.token,
        201,
      );
      assert.equal(
        await db.registration.count({ where: { orderId: stored.id } }),
        1,
      );
      assert.equal(
        (await call(`${path}/recipients`, "GET", undefined, staff)).items.find(
          (item: { id: string }) => item.id === first.id,
        ).registrationCount,
        1,
      );
      const otherSku = await db.registrationSku.create({
        data: {
          conferenceId: conferenceIds[1]!,
          name: "其他会议席位",
          priceCent: 100,
          stock: 10,
        },
      });
      await call(
        "/registration/orders",
        "POST",
        {
          conferenceId: conferenceIds[1],
          skuId: otherSku.id,
          quantity: 1,
          formData: {},
          invitationToken: tokenA,
        },
        user.token,
        400,
      );
      await call(
        `/admin/invitations/recipients/${first.id}`,
        "PATCH",
        { enabled: false },
        staff,
      );
      await call(`/invitations/${tokenA}`, "GET", undefined, undefined, 410);
      await call(
        "/registration/orders",
        "POST",
        {
          conferenceId: conferenceIds[0],
          skuId: sku.id,
          quantity: 1,
          formData: {},
          invitationToken: tokenA,
        },
        user.token,
        410,
      );
      await call(
        `${path}/members`,
        "PATCH",
        { adminIds: [admins[1]!.id] },
        manager,
      );
      await call(path, "GET", undefined, colleague, 404);
      if (process.env.INVITATION_KEEP_PREVIEW === "1") {
        await call(
          `/admin/invitations/recipients/${first.id}`,
          "PATCH",
          { enabled: true },
          staff,
        );
        console.log(`Local invitation preview: ${first.shareUrl}`);
      }
    } finally {
      if (process.env.INVITATION_KEEP_PREVIEW !== "1") {
        for (const asset of uploadedAssets) {
          await db.materialAsset.deleteMany({ where: { id: asset.id } });
          if (/^\/uploads\/materials\/[a-zA-Z0-9_.-]+$/.test(asset.url))
            await unlink(resolve(`.${asset.url}`)).catch(() => undefined);
        }
        await db.registration.deleteMany({
          where: { conferenceId: { in: conferenceIds } },
        });
        await db.order.deleteMany({
          where: { conferenceId: { in: conferenceIds } },
        });
        await db.conferenceInvitation.deleteMany({
          where: { campaign: { conferenceId: { in: conferenceIds } } },
        });
        await db.invitationCampaign.deleteMany({
          where: { conferenceId: { in: conferenceIds } },
        });
        await db.conference.deleteMany({
          where: { id: { in: conferenceIds } },
        });
        await db.auditLog.deleteMany({
          where: { adminUserId: { in: adminIds } },
        });
        await db.adminUser.deleteMany({ where: { id: { in: adminIds } } });
        if (roleId) await db.role.delete({ where: { id: roleId } });
        await db.user.deleteMany({
          where: { openid: `mock_invite-test-${suffix}` },
        });
      }
      await db.$disconnect();
    }
  },
);
