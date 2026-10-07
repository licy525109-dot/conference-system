import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Reflector } from "@nestjs/core";
import { InvitationsService } from "./invitations.service";
import { AdminInvitationsController } from "./invitations.controller";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import type { CurrentAdmin } from "../admin/current-admin";
const admin: CurrentAdmin = {
  id: "staff",
  username: "staff",
  displayName: null,
  permissions: ["invitation:view", "invitation:write"],
};
const key = "e".repeat(64);
function fixture() {
  const campaign = {
    id: "campaign",
    publishedRevision: 1,
    publishedJson: {
      invitees: [
        { id: "a", name: "同名", organization: "甲" },
        { id: "b", name: "同名", organization: "乙" },
      ],
    },
  };
  const records: Array<{
    id: string;
    name: string;
    salutation: string;
    token: string;
    campaignId: string;
    createdBy: string;
    publicInviteeId: string | null;
    enabled: boolean;
  }> = [];
  let writes = 0,
    audits = 0,
    locks = 0;
  let authorized = true,
    transactionRevision = 1;
  const db = {
    invitationCampaign: {
      findFirst: async ({ where }: any) => {
        assert.deepEqual(where.members, { some: { adminId: admin.id } });
        return authorized ? campaign : null;
      },
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const before = structuredClone(records);
      try {
        return await run({
          $executeRaw: async (query: TemplateStringsArray, scope: string) => {
            assert.match(query.join(""), /pg_advisory_xact_lock\(hashtext/);
            assert.equal(scope, "invitation-batch:campaign:staff");
            locks++;
          },
          invitationCampaign: {
            findFirst: async () =>
              authorized
                ? { ...campaign, publishedRevision: transactionRevision }
                : null,
          },
          conferenceInvitation: {
            findMany: async ({ where }: any) => {
              assert.equal(where.createdBy, admin.id);
              assert.equal(where.campaignId, campaign.id);
              return records.filter(
                (item) =>
                  item.createdBy === admin.id &&
                  item.campaignId === campaign.id &&
                  (where.token
                    ? where.token.in.includes(item.token)
                    : where.OR.some((condition: any) =>
                        condition.token
                          ? condition.token.in.includes(item.token)
                          : item.enabled &&
                            item.name === condition.name &&
                            item.salutation === condition.salutation &&
                            item.publicInviteeId === condition.publicInviteeId,
                      )),
              );
            },
            createMany: async ({ data }: any) => {
              writes++;
              records.push(
                ...data.map((row: any, i: number) => ({
                  ...row,
                  id: `created-${records.length + i}`,
                  enabled: true,
                })),
              );
            },
          },
          auditLog: {
            create: async ({ data }: any) => {
              assert.doesNotMatch(data.summary, /同名|https:|eeee/);
              audits++;
            },
          },
        });
      } catch (error) {
        records.splice(0, records.length, ...before);
        throw error;
      }
    },
  };
  return {
    service: new InvitationsService(db as never),
    records,
    campaign,
    stats: () => ({ writes, audits, locks }),
    revoke: () => {
      authorized = false;
    },
    changeRevision: () => {
      transactionRevision++;
    },
  };
}
test("batch creation is ordered, scoped, audited and idempotent across retries and imports", async () => {
  const f = fixture();
  const recipients = [
    { name: "新嘉宾", salutation: "老师" },
    { name: "同名", salutation: "先生", publicInviteeId: "b" },
  ];
  const first = (
    await f.service.createBatch(
      "campaign",
      { requestKey: key, recipients },
      admin,
    )
  ).data;
  assert.equal(first.created, 2);
  assert.deepEqual(
    first.items.map((item) => item.name),
    ["新嘉宾", "同名"],
  );
  assert.ok(
    first.items.every((item) =>
      /^https:\/\/guanchaohuiji\.com\/i\/[\w-]{43}$/.test(item.shareUrl),
    ),
  );
  const retry = (
    await f.service.createBatch(
      "campaign",
      { requestKey: key, recipients },
      admin,
    )
  ).data;
  const reimport = (
    await f.service.createBatch(
      "campaign",
      { requestKey: "f".repeat(64), recipients },
      admin,
    )
  ).data;
  assert.equal(retry.created, 0);
  assert.equal(retry.reused, 2);
  assert.deepEqual(
    retry.items.map((item) => item.shareUrl),
    first.items.map((item) => item.shareUrl),
  );
  assert.deepEqual(reimport.items, retry.items);
  assert.deepEqual(f.stats(), { writes: 1, audits: 1, locks: 3 });
});
test("batch validation rejects invalid, duplicate, ambiguous and oversized input before any write", async () => {
  const f = fixture();
  for (const recipients of [
    [],
    Array(201).fill({ name: "嘉宾" }),
    [{ name: "" }],
    [{ name: "甲" }, { name: "甲" }],
    [{ name: "同名" }],
    [{ name: "同名", publicInviteeId: "outside" }],
    [{ name: "甲\u0000" }],
  ])
    await assert.rejects(
      f.service.createBatch("campaign", { requestKey: key, recipients }, admin),
    );
  await assert.rejects(
    f.service.createBatch(
      "campaign",
      { requestKey: "bad", recipients: [{ name: "甲" }] },
      admin,
    ),
    /批次标识/,
  );
  assert.equal(f.stats().writes, 0);
  assert.equal(f.stats().locks, 0);
});
test("batch validates campaign authorization, publication and revision before writing", async () => {
  const input = { requestKey: key, recipients: [{ name: "嘉宾" }] };
  const unauthorized = fixture();
  unauthorized.revoke();
  await assert.rejects(
    unauthorized.service.createBatch("campaign", input, admin),
    /未授权/,
  );
  const unpublished = fixture();
  unpublished.campaign.publishedRevision = 0;
  await assert.rejects(
    unpublished.service.createBatch("campaign", input, admin),
    /请先发布/,
  );
  const changed = fixture();
  changed.changeRevision();
  await assert.rejects(
    changed.service.createBatch("campaign", input, admin),
    /内容已更新/,
  );
  assert.equal(changed.stats().writes, 0);
});
test("batch retry cannot reactivate or overwrite an invitation edited after creation", async () => {
  const f = fixture(),
    input = { requestKey: key, recipients: [{ name: "嘉宾" }] };
  await f.service.createBatch("campaign", input, admin);
  f.records[0].enabled = false;
  await assert.rejects(
    f.service.createBatch("campaign", input, admin),
    /已修改或停用/,
  );
  f.records[0].enabled = true;
  f.records[0].name = "修改后的嘉宾";
  await assert.rejects(
    f.service.createBatch("campaign", input, admin),
    /已修改或停用/,
  );
  assert.equal(f.stats().writes, 1);
});
test("batch never reuses another operator's invitation even with an identical name", async () => {
  const f = fixture();
  f.records.push({
    id: "other",
    campaignId: "campaign",
    createdBy: "other-staff",
    name: "嘉宾",
    salutation: "老师",
    token: "a".repeat(43),
    publicInviteeId: null,
    enabled: true,
  });
  const result = (
    await f.service.createBatch(
      "campaign",
      { requestKey: key, recipients: [{ name: "嘉宾" }] },
      admin,
    )
  ).data;
  assert.equal(result.created, 1);
  assert.notEqual(result.items[0].id, "other");
});
test("batch endpoint requires both authenticated invitation view and write permissions", () => {
  const guard = new AdminPermissionGuard(new Reflector());
  for (const permissions of [[], ["invitation:view"], ["invitation:write"]]) {
    const context = {
      getHandler: () => AdminInvitationsController.prototype.inviteBatch,
      getClass: () => AdminInvitationsController,
      switchToHttp: () => ({
        getRequest: () => ({ currentAdmin: { ...admin, permissions } }),
      }),
    };
    assert.throws(() => guard.canActivate(context as never));
  }
});
