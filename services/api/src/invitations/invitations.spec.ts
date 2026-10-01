import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import {
  normalizeInvitationContent,
  createInvitationContent,
} from "@conference/shared";
import { InvitationsService } from "./invitations.service";
import { escapeInvitationHtml } from "./invitation-page.controller";
import {
  assertInvitationOwner,
  invitationCampaignScope,
  invitationOrigin,
  readInvitationToken,
  resolveOrderInvitation,
} from "./invitation-policy";
import {
  invitationSigningUrl,
  signInvitationTicket,
} from "./invitation-wechat.service";
import { AdminInvitationsController } from "./invitations.controller";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import type { CurrentAdmin } from "../admin/current-admin";

const admin: CurrentAdmin = {
  id: "admin",
  username: "operator",
  displayName: null,
  permissions: ["invitation:view", "invitation:write"],
};
const token = "a".repeat(43);
test("public roster save rejects excess rows and duplicated IDs before any database write", async () => {
  const service = new InvitationsService({
    invitationCampaign: { findFirst: async () => ({ id: "campaign" }) },
  } as never);
  await assert.rejects(
    service.save(
      "campaign",
      {
        draftRevision: 1,
        content: {
          invitees: Array.from({ length: 501 }, (_, index) => ({
            id: `${index}`,
            name: "嘉宾",
          })),
        },
      },
      admin,
    ),
    /500/,
  );
  await assert.rejects(
    service.save(
      "campaign",
      {
        draftRevision: 1,
        content: {
          invitees: [
            { id: "a", name: "甲" },
            { id: "a", name: "乙" },
          ],
        },
      },
      admin,
    ),
    /标识重复/,
  );
});
test("publishing rejects an unnamed public roster row", async () => {
  const service = new InvitationsService({
    invitationCampaign: {
      findFirst: async () => ({
        id: "campaign",
        draftJson: { invitees: [{ id: "a", name: "" }] },
      }),
    },
  } as never);
  await assert.rejects(
    service.publish("campaign", { draftRevision: 1 }, admin),
    /未填写姓名/,
  );
});
test("finished artwork can publish without duplicated title, date, venue or body fields", async () => {
  let published: unknown;
  const campaign = {
    id: "campaign",
    draftRevision: 1,
    publishedRevision: 0,
    draftJson: {
      coverImageUrl: "/uploads/poster.png",
      cover: { mode: "artwork", layers: [] },
      modules: [],
    },
  };
  const service = new InvitationsService({
    invitationCampaign: { findFirst: async () => campaign },
    $transaction: async (run: (tx: unknown) => Promise<void>) =>
      run({
        invitationCampaign: {
          updateMany: async ({
            data,
          }: {
            data: { publishedJson: unknown };
          }) => {
            published = data.publishedJson;
            return { count: 1 };
          },
        },
        auditLog: { create: async () => ({}) },
      }),
  } as never);
  service.campaign = async () =>
    ({ code: "OK", message: "ok", data: {} }) as never;
  await service.publish("campaign", { draftRevision: 1 }, admin);
  assert.equal(
    (published as { cover: { mode: string } }).cover.mode,
    "artwork",
  );
});
test("oversized module and layer collections fail before a database write", async () => {
  const service = new InvitationsService({
    invitationCampaign: { findFirst: async () => ({ id: "campaign" }) },
  } as never);
  await assert.rejects(
    service.save(
      "campaign",
      { draftRevision: 1, content: { modules: Array(25).fill({}) } },
      admin,
    ),
    /24/,
  );
  await assert.rejects(
    service.save(
      "campaign",
      { draftRevision: 1, content: { cover: { layers: Array(13).fill({}) } } },
      admin,
    ),
    /12/,
  );
});
test("personalized titles remain escaped in server-rendered HTML", () => {
  assert.equal(
    escapeInvitationHtml("张<老师>\"&'专属邀请函"),
    "张&lt;老师&gt;&quot;&amp;&#39;专属邀请函",
  );
});
test("invitation image upload rejects a forged image MIME type", async () => {
  const controller = new AdminInvitationsController(
    { campaign: async () => ({}) } as never,
    {} as never,
    {} as never,
  );
  await assert.rejects(
    controller.image(
      "campaign",
      {
        buffer: Buffer.from("<script>bad</script>"),
        size: 20,
        mimetype: "image/png",
        originalname: "cover.png",
      },
      { currentAdmin: admin },
    ),
    /格式不一致/,
  );
});
test("invitation permissions require conference membership and ownership independently", () => {
  assert.deepEqual(invitationCampaignScope(admin), {
    members: { some: { adminId: "admin" } },
  });
  assert.throws(() => assertInvitationOwner(admin, "other"), /无权/);
  assert.doesNotThrow(() =>
    assertInvitationOwner(
      { ...admin, permissions: ["invitation:all"] },
      "other",
    ),
  );
  assert.notDeepEqual(
    invitationCampaignScope({ ...admin, permissions: ["invitation:all"] }),
    {},
  );
  assert.deepEqual(
    invitationCampaignScope({ ...admin, permissions: ["invitation:access"] }),
    {},
  );
});
test("controller publish and authorization endpoints reject a staff writer", () => {
  const guard = new AdminPermissionGuard(new Reflector());
  for (const method of [
    "publish",
    "setMembers",
    "save",
    "options",
    "create",
  ] as const) {
    const context = {
      getHandler: () => AdminInvitationsController.prototype[method],
      getClass: () => AdminInvitationsController,
      switchToHttp: () => ({ getRequest: () => ({ currentAdmin: admin }) }),
    };
    assert.throws(() => guard.canActivate(context as never), /无权/);
  }
});
test("invitation-only staff cannot read unpublished meeting content", async () => {
  const service = new InvitationsService({
    invitationCampaign: {
      findFirst: async () => ({
        id: "campaign",
        conferenceId: "meeting",
        draftJson: { title: "尚未公布的嘉宾安排" },
        publishedJson: { title: "公开会议" },
        draftRevision: 2,
        publishedRevision: 1,
        publishedDraftRevision: 1,
      }),
    },
  } as never);
  assert.equal(
    (await service.campaign("campaign", admin)).data.draft.title,
    "公开会议",
  );
  assert.equal(
    (
      await service.campaign("campaign", {
        ...admin,
        permissions: ["invitation:content"],
      })
    ).data.draft.title,
    "尚未公布的嘉宾安排",
  );
});
test("content is plain text, rejects executable image URLs, and keeps guest states explicit", () => {
  const content = normalizeInvitationContent({
    ...createInvitationContent(),
    coverImageUrl: "javascript:alert(1)",
    logoUrl: "//attacker.test/x",
    primaryColor: "red;position:fixed",
    guests: [
      { name: "张老师", status: "anything", imageUrl: "data:text/html,hi" },
    ],
    introduction: "<script>alert(1)</script>",
  });
  assert.equal(content.coverImageUrl, "");
  assert.equal(content.logoUrl, "");
  assert.equal(content.guests[0]?.status, "INVITED");
  assert.equal(content.primaryColor, "#214c40");
  assert.equal(content.introduction, "<script>alert(1)</script>");
});
test("brand origin and WeChat signatures cannot be reused for another invitation", () => {
  const old = process.env.INVITATION_PUBLIC_ORIGIN;
  try {
    process.env.INVITATION_PUBLIC_ORIGIN = "https://guanchaohuiji.com";
    assert.equal(
      invitationSigningUrl(
        `https://guanchaohuiji.com/i/${token}?from=singlemessage#agenda`,
        token,
      ),
      `https://guanchaohuiji.com/i/${token}?from=singlemessage`,
    );
    for (const url of [
      `https://attacker.test/i/${token}`,
      `https://guanchaohuiji.com/i/${"b".repeat(43)}`,
      `https://guanchaohuiji.com.evil.test/i/${token}`,
    ])
      assert.throws(() => invitationSigningUrl(url, token));
    process.env.INVITATION_PUBLIC_ORIGIN =
      "https://guanchaohuiji.com.evil.test";
    assert.throws(() => invitationOrigin());
    assert.match(
      signInvitationTicket(
        "fixture-ticket",
        "nonce",
        100,
        "https://guanchaohuiji.com",
      ),
      /^[a-f0-9]{40}$/,
    );
  } finally {
    if (old === undefined) delete process.env.INVITATION_PUBLIC_ORIGIN;
    else process.env.INVITATION_PUBLIC_ORIGIN = old;
  }
});
test("order invitation validation is optional but invalid, disabled and cross-conference tokens fail closed", async () => {
  assert.equal(readInvitationToken(undefined), undefined);
  assert.throws(() => readInvitationToken("forged"));
  assert.equal(
    await resolveOrderInvitation({} as never, undefined, "meeting"),
    undefined,
  );
  const tx = {
    conferenceInvitation: {
      findUnique: async () => ({
        id: "invite",
        enabled: true,
        campaign: { conferenceId: "meeting", publishedRevision: 1 },
      }),
    },
  };
  assert.equal(
    await resolveOrderInvitation(tx as never, token, "meeting"),
    "invite",
  );
  await assert.rejects(
    resolveOrderInvitation(tx as never, token, "other"),
    /不匹配/,
  );
  tx.conferenceInvitation.findUnique = async () => ({
    id: "invite",
    enabled: false,
    campaign: { conferenceId: "meeting", publishedRevision: 1 },
  });
  await assert.rejects(
    resolveOrderInvitation(tx as never, token, "meeting"),
    /停用/,
  );
});
test("previous links read a shared published revision, never draft or private operational data", async () => {
  const published = {
    ...createInvitationContent(),
    title: "已发布会议",
    agenda: [
      {
        id: "a",
        date: "第一天",
        time: "09:00",
        title: "旧议程",
        speaker: "",
        location: "",
      },
    ],
  };
  const campaign = {
    conferenceId: "meeting",
    publishedJson: published,
    draftJson: { ...published, title: "内部未发布草稿" },
    publishedRevision: 1,
    publishedAt: new Date(),
    conference: {
      status: "PUBLISHED",
      endsAt: new Date("2099-01-01"),
      registrationStartsAt: null,
      registrationEndsAt: null,
    },
  };
  const db = {
    conferenceInvitation: {
      findUnique: async ({ where }: { where: { token: string } }) => ({
        enabled: true,
        name: where.token === token ? "甲" : "乙",
        salutation: "老师",
        createdBy: "private-admin",
        note: "private-note",
        campaign,
      }),
    },
  };
  const service = new InvitationsService(db as never);
  const first = await service.publicInvitation(token);
  assert.equal(first.data.content.title, "已发布会议");
  assert.equal(JSON.stringify(first).includes("private-admin"), false);
  campaign.publishedJson = {
    ...published,
    agenda: [{ ...published.agenda[0]!, title: "最新议程" }],
  };
  campaign.publishedRevision = 2;
  for (const link of [token, "b".repeat(43)]) {
    const response = await service.publicInvitation(link);
    assert.equal(response.data.content.agenda[0]?.title, "最新议程");
    assert.equal(response.data.revision, 2);
  }
  campaign.conference.status = "ARCHIVED";
  await assert.rejects(service.publicInvitation(token), /暂不可用/);
});
test("concurrent draft saves return conflict instead of overwriting newer work", async () => {
  const tx = {
    invitationCampaign: { updateMany: async () => ({ count: 0 }) },
    auditLog: {
      create: async () => {
        throw new Error("must not audit failed write");
      },
    },
  };
  const db = {
    invitationCampaign: { findFirst: async () => ({ id: "campaign" }) },
    $transaction: async (callback: (value: unknown) => unknown) => callback(tx),
  };
  const service = new InvitationsService(db as never);
  await assert.rejects(
    service.save(
      "campaign",
      { draftRevision: 1, content: createInvitationContent() },
      admin,
    ),
    /其他工作人员/,
  );
});
