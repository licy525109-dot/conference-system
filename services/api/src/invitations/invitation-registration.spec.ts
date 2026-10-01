import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createInvitationContent,
  invitationRegistrationUrl,
  normalizeInvitationRegistration,
} from "@conference/shared";
import { InvitationsService } from "./invitations.service";
import { resolveOrderInvitation } from "./invitation-policy";
import { PublicInvitationsController } from "./invitations.controller";

const admin = {
  id: "admin",
  username: "operator",
  displayName: null,
  permissions: ["*"],
};
test("external meetings are independent campaigns and do not create system conferences", async () => {
  let stored: Record<string, unknown> = {};
  const service = new InvitationsService({
    $transaction: async (run: (tx: unknown) => unknown) =>
      run({
        invitationCampaign: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            stored = data;
            return { id: "external" };
          },
        },
        auditLog: { create: async () => ({}) },
      }),
  } as never);
  await service.createCampaign(
    {
      source: "external",
      title: "外部论坛",
      dateLabel: "12月18日",
      registration: { mode: "external", url: "https://example.com/form?id=1" },
    },
    admin,
  );
  assert.equal(stored.conferenceId, null);
  const content = stored.draftJson as ReturnType<
    typeof createInvitationContent
  >;
  assert.equal(content.title, "外部论坛");
  assert.equal(content.registration?.mode, "external");
  assert.equal(content.dateLabel, "12月18日");
});
test("external URLs are HTTPS-only and rejected rather than silently discarded", async () => {
  for (const value of [
    "javascript:alert(1)",
    "data:text/html,test",
    "//example.com",
    "https://user:pass@example.com",
    "http://example.com",
  ])
    assert.equal(invitationRegistrationUrl(value), "");
  const service = new InvitationsService({
    invitationCampaign: { findFirst: async () => ({ conferenceId: null }) },
  } as never);
  await assert.rejects(
    service.save(
      "campaign",
      {
        content: {
          registration: { mode: "external", url: "javascript:alert(1)" },
        },
        draftRevision: 1,
      },
      admin,
    ),
    /HTTPS/,
  );
  await assert.rejects(
    service.save(
      "campaign",
      { content: { registration: { mode: "other" } }, draftRevision: 1 },
      admin,
    ),
    /报名方式/,
  );
});
test("existing external links use published registration updates, with no mini program identity or personal query injection", async () => {
  const content = createInvitationContent();
  content.registration = {
    mode: "external",
    url: "https://example.com/form?event=1",
    conferenceId: "",
    label: "填写参会表",
  };
  const campaign = {
    conferenceId: null,
    conference: null,
    publishedJson: content,
    publishedAt: new Date(),
    publishedRevision: 1,
  };
  const service = new InvitationsService({
    conferenceInvitation: {
      findUnique: async () => ({
        enabled: true,
        name: "受邀嘉宾",
        salutation: "老师",
        campaign,
      }),
    },
  } as never);
  for (const char of ["a", "b"]) {
    const result = (await service.publicInvitation(char.repeat(43))).data;
    assert.equal(result.registrationOpen, true);
    assert.equal(result.registrationUrl, "https://example.com/form?event=1");
    assert.equal(result.registrationPath, "");
    assert.equal(result.miniAppId, "");
    assert.equal(result.registrationMessage, "填写参会表");
  }
  content.registration = normalizeInvitationRegistration({ mode: "none" });
  campaign.publishedRevision++;
  const updated = (await service.publicInvitation("a".repeat(43))).data;
  assert.equal(updated.registrationMode, "none");
  assert.equal(updated.registrationOpen, false);
});
test("independent campaigns may route to a selected published mini program conference", async () => {
  const content = createInvitationContent();
  content.registration = normalizeInvitationRegistration({
    mode: "miniapp",
    conferenceId: "selected",
  });
  const service = new InvitationsService({
    conference: {
      findUnique: async () => ({
        status: "PUBLISHED",
        endsAt: new Date("2099-01-01"),
      }),
    },
    conferenceInvitation: {
      findUnique: async () => ({
        enabled: true,
        name: "甲",
        salutation: "",
        campaign: {
          conferenceId: null,
          conference: null,
          publishedJson: content,
          publishedAt: new Date(),
          publishedRevision: 1,
        },
      }),
    },
  } as never);
  const result = (await service.publicInvitation("a".repeat(43))).data;
  assert.equal(result.registrationOpen, true);
  assert.match(
    result.registrationPath,
    /conferenceId=selected&invitationToken=/,
  );
});
test("attribution only accepts the mini program conference in published settings", async () => {
  const content = createInvitationContent();
  content.registration = normalizeInvitationRegistration({
    mode: "miniapp",
    conferenceId: "selected",
  });
  const tx = {
    conferenceInvitation: {
      findUnique: async () => ({
        id: "invite",
        enabled: true,
        campaign: {
          conferenceId: null,
          publishedRevision: 1,
          publishedJson: content,
        },
      }),
    },
  };
  assert.equal(
    await resolveOrderInvitation(tx as never, "a".repeat(43), "selected"),
    "invite",
  );
  await assert.rejects(
    resolveOrderInvitation(tx as never, "a".repeat(43), "other"),
    /不匹配/,
  );
  content.registration = normalizeInvitationRegistration({
    mode: "external",
    url: "https://example.com",
    conferenceId: "selected",
  });
  await assert.rejects(
    resolveOrderInvitation(tx as never, "a".repeat(43), "selected"),
    /不匹配/,
  );
});
test("external registration cannot accidentally request a mini program QR code", async () => {
  const controller = new PublicInvitationsController(
    {
      publicInvitation: async () => ({
        data: {
          registrationMode: "external",
          registrationOpen: true,
          registrationPath: "",
        },
      }),
    } as never,
    {} as never,
  );
  await assert.rejects(controller.code("a".repeat(43), {} as never), /未开放/);
});
