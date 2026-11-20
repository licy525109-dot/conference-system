import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { Controller } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { signJwt } from "../auth/jwt";
import { AdminAccessController } from "../admin/admin-access.controller";
import { AdminAccessService } from "../admin/admin-access.service";
import { AdminAuthService } from "../admin/admin-auth.service";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { AdminInvitationsController } from "./invitations.controller";
import { InvitationsService } from "./invitations.service";
import { invitationCampaignScope } from "./invitation-policy";
import type { CurrentAdmin } from "../admin/current-admin";

const owner: CurrentAdmin = { id: "manager", username: "manager", displayName: null,
  conferenceScopeMode: "ALL", permissions: ["system:account", "invitation:view", "invitation:access"] };

test("account grants include external invitations, preserve omitted fields, revoke explicitly, validate and roll back", async () => {
  const { access, db, grants, audits, state } = fixture();
  const options = await access.invitationOptions();
  assert.deepEqual(options.data.items, [
    { id: "internal", title: "内部会议邀请", conferenceId: "conference-1" },
    { id: "external", title: "外部会议邀请", conferenceId: null },
    { id: "foreign", title: "其他邀请", conferenceId: null }
  ]);
  const created = await access.createAccount({ username: "new-editor", password: randomBytes(20).toString("hex"), roleIds: [],
    invitationCampaignIds: [" internal ", "external", "external"] }, owner) as any;
  assert.equal(created.data.conferenceScopeMode, "ASSIGNED");
  assert.deepEqual(created.data.conferenceIds, []);
  assert.deepEqual(created.data.invitationCampaignIds, ["internal", "external"]);
  assert.equal(JSON.stringify(created.data.invitationCampaigns).includes('draftJson'), false);
  const initial = [...grants.get('editor')!];
  await access.updateAccount('editor', { displayName: "Updated" }, owner);
  assert.deepEqual([...grants.get('editor')!], initial);
  for (const invitationCampaignIds of [null, [""], [1], ["missing"], Array.from({ length: 1001 }, (_, i) => `id-${i}`)]) {
    await assert.rejects(() => access.updateAccount('editor', { invitationCampaignIds }, owner));
    assert.deepEqual([...grants.get('editor')!], initial);
  }
  state.failUpdate = true;
  await assert.rejects(() => access.updateAccount('editor', { invitationCampaignIds: ['foreign'] }, owner));
  assert.deepEqual([...grants.get('editor')!], initial, 'membership deletion must roll back if the account save fails');
  state.failUpdate = false;
  await access.updateAccount('editor', { invitationCampaignIds: [] }, owner);
  assert.equal(grants.get('editor')!.size, 0);
  assert.deepEqual(audits.at(-1).metadataJson.invitationCampaignIds, []);
  assert.equal((await db.adminUser.findUnique({ where: { id: 'editor' } })).conferenceGrants.length, 0);
});

test("real HTTP guards enforce action permissions and campaign membership for internal/external invitations, including revocation with the same token", async context => {
  const { access, service, db, grants, state } = fixture();
  const previousSecret = process.env.JWT_SECRET;
  const secret = randomBytes(32).toString('hex');
  process.env.JWT_SECRET = secret;
  context.after(() => { if (previousSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previousSecret; });
  const auth = new AdminAuthService(db as never, { getAdminPermissions: async (id: string) => state.permissions[id] ?? [] } as never);
  @Controller('admin/invitations')
  class Invitations extends AdminInvitationsController { constructor() { super(service, {} as never, {} as never); } }
  @Controller('admin')
  class Accounts extends AdminAccessController { constructor() { super(access); } }
  const module = await Test.createTestingModule({ controllers: [Invitations, Accounts] })
    .overrideGuard(AdminJwtAuthGuard).useValue(new AdminJwtAuthGuard(auth))
    .overrideGuard(AdminPermissionGuard).useValue(new AdminPermissionGuard(new Reflector())).compile();
  const app = module.createNestApplication({ logger: false });
  await app.listen(0, '127.0.0.1');
  context.after(() => app.close());
  const origin = await app.getUrl();
  const now = Math.floor(Date.now() / 1000);
  const tokens = Object.fromEntries(['editor', 'viewer', 'manager'].map(id => [id, signJwt({ sub: id, openid: null, type: 'admin', iat: now, exp: now + 60 }, secret)]));
  const request = (path: string, id = 'editor', method = 'GET', body?: unknown) => fetch(`${origin}/admin/${path}`, {
    method, headers: { ...(id ? { Authorization: `Bearer ${tokens[id]}` } : {}), 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  assert.equal((await request('accounts/invitation-options', '')).status, 401);
  assert.equal((await request('accounts/invitation-options')).status, 403);
  assert.equal((await request('accounts/invitation-options', 'manager')).status, 200);
  const actor = await auth.getCurrentAdminFromToken(tokens.editor);
  assert.deepEqual(actor.conferenceIds, []);
  assert.equal(actor.permissions?.includes('invitation:access'), false);
  assert.equal(actor.permissions?.includes('invitation:settings'), false);
  const listed = await (await request('invitations/campaigns')).json();
  assert.deepEqual(listed.data.items.map((item: any) => item.id), ['internal', 'external']);
  for (const id of ['internal', 'external']) assert.equal((await request(`invitations/campaigns/${id}`)).status, 200);
  for (const id of ['internal', 'external']) {
    const response = await request(`invitations/campaigns/${id}`, 'editor', 'PATCH', { draftRevision: 1,
      content: { title: `Edited ${id}`, coverImageUrl: '/uploads/test-cover.png', registration: { mode: 'none' } } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).data.draftRevision, 2);
    const published = await request(`invitations/campaigns/${id}/publish`, 'editor', 'POST', { draftRevision: 2 });
    assert.equal(published.status, 201);
    assert.equal((await published.json()).data.published.title, `Edited ${id}`);
  }
  for (const [suffix, method, body] of [
    ['', 'GET'], ['', 'PATCH', { draftRevision: 1, content: {} }], ['/publish', 'POST', { draftRevision: 1 }],
    ['/recipients', 'GET'], ['/recipients', 'POST', { name: 'Fixture' }], ['/recipients/batch', 'POST', { recipients: [] }],
    ['/assets', 'GET'], ['/image', 'POST'], ['/assets', 'POST']
  ] as const) {
    assert.equal((await request(`invitations/campaigns/foreign${suffix}`, 'editor', method, body)).status, 404, `${method} ${suffix}`);
  }
  for (const path of ['invitations/options', 'invitations/campaigns/internal/members']) assert.equal((await request(path)).status, 403);
  assert.equal((await request('invitations/campaigns', 'editor', 'POST', { source: 'external' })).status, 403);
  assert.equal((await request('invitations/campaigns/external', 'viewer')).status, 200);
  assert.equal((await request('invitations/campaigns/external', 'viewer', 'PATCH', {})).status, 403);
  assert.equal((await request('invitations/campaigns/external/publish', 'viewer', 'POST', {})).status, 403);
  assert.equal((await request('accounts/editor', 'manager', 'PATCH', { invitationCampaignIds: ['internal'] })).status, 200);
  assert.equal((await request('invitations/campaigns/external')).status, 404, 'old token must not retain revoked campaign access');
  assert.equal((await request('invitations/campaigns/internal')).status, 200);
  // Existing per-invitation authorization and new account allocation share one source of truth.
  await service.setMembers('internal', { adminIds: ['viewer'] }, owner);
  assert.equal(grants.get('editor')!.has('internal'), false);
  assert.equal((await request('invitations/campaigns/internal')).status, 404);
  const accounts = await (await request('accounts', 'manager')).json();
  assert.deepEqual(accounts.data.items.find((item: any) => item.id === 'editor').invitationCampaignIds, []);
  state.enabled = false;
  assert.equal((await request('invitations/campaigns')).status, 401);
});

test("assigned scope cannot bypass campaign grants even with wildcard or global invitation permissions", () => {
  for (const permissions of [['*'], ['invitation:access']]) {
    assert.deepEqual(invitationCampaignScope({ ...owner, conferenceScopeMode: 'ASSIGNED', permissions }), { members: { some: { adminId: owner.id } } });
  }
  assert.deepEqual(invitationCampaignScope(owner), {});
});

function fixture() {
  const campaigns = ['internal', 'external', 'foreign'].map((id, i) => ({ id, conferenceId: i === 0 ? 'conference-1' : null,
    conference: i === 0 ? { title: '内部会议' } : null, draftJson: { title: ['内部会议邀请', '外部会议邀请', '其他邀请'][i], registration: { mode: 'none' } },
    publishedJson: { title: 'Published', registration: { mode: 'none' } }, draftRevision: 1, publishedRevision: 1, publishedDraftRevision: 1 }));
  const grants = new Map<string, Set<string>>([['editor', new Set(['internal', 'external'])], ['viewer', new Set(['external'])], ['manager', new Set()]]);
  const audits: any[] = [];
  const state = { failUpdate: false, enabled: true, permissions: {
    editor: ['invitation:view', 'invitation:content', 'invitation:publish', 'invitation:write', 'invitation:all', 'invitation:access', 'invitation:settings'],
    viewer: ['invitation:view'], manager: owner.permissions!
  } as Record<string, string[]> };
  const account = (id: string) => ({ id, username: id, displayName: null, enabled: state.enabled, roles: [],
    conferenceScopeMode: id === 'manager' ? 'ALL' : 'ASSIGNED', conferenceGrants: [],
    invitationCampaigns: [...(grants.get(id) ?? [])].map(id => ({ campaign: campaigns.find(item => item.id === id)! })),
    createdAt: new Date(), updatedAt: new Date() });
  const matches = (campaign: any, where: any) => (!where?.id || campaign.id === where.id) && (!where?.members || grants.get(where.members.some.adminId)?.has(campaign.id));
  const db: any = {
    invitationCampaign: {
      count: async ({ where }: any) => campaigns.filter(item => where.id.in.includes(item.id)).length,
      findMany: async ({ where }: any) => campaigns.filter(item => matches(item, where)),
      findFirst: async ({ where }: any) => { const found = campaigns.find(item => matches(item, where)); return found ? structuredClone(found) : null; },
      updateMany: async ({ where, data }: any) => {
        const found = campaigns.find(item => item.id === where.id && item.draftRevision === where.draftRevision);
        if (!found) return { count: 0 };
        for (const [key, value] of Object.entries(data)) (found as any)[key] = value && typeof value === 'object' && 'increment' in value ? (found as any)[key] + value.increment : value;
        return { count: 1 };
      }
    },
    adminUser: {
      findMany: async () => [...grants.keys()].map(account),
      findUnique: async ({ where }: any) => grants.has(where.id) ? account(where.id) : null,
      count: async ({ where }: any) => where.id.in.filter((id: string) => grants.has(id)).length,
      create: async ({ data }: any) => { grants.set(data.username, new Set(data.invitationCampaigns.create.map((item: any) => item.campaignId))); return account(data.username); },
      update: async ({ where, data }: any) => {
        if (state.failUpdate) throw new Error('Synthetic save failure');
        if (data.invitationCampaigns) grants.set(where.id, new Set(data.invitationCampaigns.create.map((item: any) => item.campaignId)));
        return account(where.id);
      }
    },
    invitationCampaignMember: {
      deleteMany: async ({ where }: any) => {
        if (where.adminId) grants.set(where.adminId, new Set());
        else for (const set of grants.values()) set.delete(where.campaignId);
      },
      createMany: async ({ data }: any) => { for (const item of data) grants.get(item.adminId)!.add(item.campaignId); }
    },
    auditLog: { create: async ({ data }: any) => { audits.push(data); return data; } },
    $transaction: async (fn: any) => {
      const previous = structuredClone(grants);
      try { return await fn(db); }
      catch (error) { grants.clear(); for (const [key, value] of previous) grants.set(key, value); throw error; }
    }
  };
  return { access: new AdminAccessService(db), service: new InvitationsService(db), db, grants, audits, state };
}
