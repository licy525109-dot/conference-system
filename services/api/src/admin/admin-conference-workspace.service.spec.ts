import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminConferenceWorkspaceService } from "./admin-conference-workspace.service";
import { AdminExportsService } from "./admin-exports.service";
import { AdminManagementService } from "./admin-management.service";
import { CurrentAdmin } from "./current-admin";

const owned = "conference-owned";
const foreign = "conference-foreign";
const admin: CurrentAdmin = {
  id: "scoped-admin", username: "operator", displayName: null,
  permissions: ["*"], conferenceScopeMode: "ASSIGNED", conferenceIds: [owned]
};
const conferenceBody = { title: "Updated conference" };
const skuBody = { name: "Admission", priceCent: 12500, stock: 10 };
const fieldBody = { fieldKey: "name", label: "Name", type: "TEXT", required: true };
const remarkBody = { adminRemark: "Confirmed attendance" };

type Operation = {
  name: string;
  invoke: (service: AdminConferenceWorkspaceService, id: string, actor: CurrentAdmin) => unknown;
  delegate: string;
  args: (id: string, actor: CurrentAdmin) => unknown[];
};
const operations: Operation[] = [
  { name: "conference details", invoke: (s, id, a) => s.conference(id, a), delegate: "getConference", args: id => [id] },
  { name: "conference update", invoke: (s, id, a) => s.updateConference(id, conferenceBody, a), delegate: "updateConference", args: (id, a) => [id, conferenceBody, a] },
  { name: "SKU list", invoke: (s, id, a) => s.skus(id, a), delegate: "listSkus", args: id => [id] },
  { name: "SKU creation", invoke: (s, id, a) => s.createSku(id, skuBody, a), delegate: "createSku", args: (id, a) => [id, skuBody, a] },
  { name: "SKU mutation", invoke: (s, id, a) => s.updateSku(`sku-${id}`, skuBody, a), delegate: "updateSku", args: (id, a) => [`sku-${id}`, skuBody, a] },
  { name: "form field list", invoke: (s, id, a) => s.fields(id, a), delegate: "listFormFields", args: id => [id] },
  { name: "form field creation", invoke: (s, id, a) => s.createField(id, fieldBody, a), delegate: "createFormField", args: (id, a) => [id, fieldBody, a] },
  { name: "form field mutation", invoke: (s, id, a) => s.updateField(`field-${id}`, fieldBody, a), delegate: "updateFormField", args: (id, a) => [`field-${id}`, fieldBody, a] },
  { name: "order list", invoke: (s, id, a) => s.orders({ conferenceId: id }, a), delegate: "listOrders", args: id => [{ conferenceId: id }] },
  { name: "order details", invoke: (s, id, a) => s.order(`ORDER-${id}`, a), delegate: "getOrder", args: id => [`ORDER-${id}`] },
  { name: "registration list", invoke: (s, id, a) => s.registrations({ conferenceId: id }, a), delegate: "listRegistrations", args: id => [{ conferenceId: id }] },
  { name: "registration details", invoke: (s, id, a) => s.registration(`registration-${id}`, a), delegate: "getRegistrationDetail", args: id => [`registration-${id}`] },
  { name: "registration remark mutation", invoke: (s, id, a) => s.remark(`registration-${id}`, remarkBody, a), delegate: "updateRegistrationRemark", args: (id, a) => [`registration-${id}`, remarkBody, a] },
  { name: "attendee check-in mutation", invoke: (s, id, a) => s.checkin(`attendee-${id}`, a), delegate: "checkInRegistrationAttendee", args: (id, a) => [`attendee-${id}`, a] },
  { name: "registration export", invoke: (s, id, a) => s.exportRegistrations({ conferenceId: id }, a), delegate: "exportRegistrationsExcel", args: (id, a) => [{ conferenceId: id }, a] }
];

describe("AdminConferenceWorkspaceService scope isolation", () => {
  it("restricts conference rows and total count to grants even with forged scope/query fields", async () => {
    const { service, calls, reads } = fixture();
    const result = await service.conferences({
      page: "1", pageSize: "10", keyword: "  EVENT  ", conferenceId: foreign,
      conferenceIds: [foreign], conferenceScopeMode: "ALL", where: {}, OR: [{ id: foreign }]
    }, admin);
    assert.deepEqual(result.data.items.map(item => item.id), [owned]);
    assert.equal(result.data.total, 1);
    assert.equal(result.data.page, 1);
    assert.equal(result.data.pageSize, 10);
    const where = { id: { in: [owned] }, title: { contains: "EVENT", mode: "insensitive" } };
    assert.deepEqual(reads[0]!.args.where, where);
    assert.deepEqual(reads[1]!.args.where, where);
    assert.deepEqual(reads[0]!.args.orderBy, { startsAt: "desc" });
    assert.deepEqual(reads[0]!.args.select, {
      id: true, title: true, startsAt: true, endsAt: true, status: true, location: true
    });
    assert.deepEqual(calls, []);
  });

  for (const actor of [
    { ...admin, conferenceIds: [] },
    { ...admin, conferenceIds: undefined },
    { ...admin, conferenceScopeMode: undefined, conferenceIds: undefined }
  ]) {
    it(`returns no conferences when grants are ${JSON.stringify(actor.conferenceIds)} and mode is ${actor.conferenceScopeMode}`, async () => {
      const { service, reads } = fixture();
      const result = await service.conferences({}, actor);
      assert.deepEqual(result.data, { items: [], total: 0, page: 1, pageSize: 20 });
      assert.deepEqual(reads.map(read => read.args.where), [{ id: { in: [] } }, { id: { in: [] } }]);
    });
  }

  it("retains unrestricted listing for explicit ALL scope and paginates without changing total", async () => {
    const { service, reads } = fixture();
    const result = await service.conferences({ page: 2, pageSize: 1 }, { ...admin, conferenceScopeMode: "ALL", conferenceIds: [] });
    assert.deepEqual(result.data.items.map(item => item.id), [owned]);
    assert.equal(result.data.total, 2);
    assert.deepEqual(reads[0]!.args.where, {});
    assert.equal(reads[0]!.args.skip, 1);
    assert.equal(reads[0]!.args.take, 1);
  });

  it("validates list pagination before reading any conference records", async () => {
    for (const query of [{ page: 0 }, { page: 1.5 }, { page: 100001 }, { pageSize: 101 }, { pageSize: -1 }]) {
      const { service, reads } = fixture();
      await assert.rejects(() => service.conferences(query, admin), BadRequestException);
      assert.deepEqual(reads, []);
    }
  });

  for (const operation of operations) {
    it(`denies foreign ${operation.name} before calling management or exports`, async () => {
      const { service, calls } = fixture();
      await assert.rejects(async () => operation.invoke(service, foreign, admin), ForbiddenException);
      assert.deepEqual(calls, []);
    });

    it(`denies ${operation.name} when an administrator has no conference grants`, async () => {
      const { service, calls } = fixture();
      await assert.rejects(async () => operation.invoke(service, owned, { ...admin, conferenceIds: [] }), ForbiddenException);
      assert.deepEqual(calls, []);
    });

    it(`delegates authorized ${operation.name} with the verified target and current administrator`, async () => {
      const { service, calls, response } = fixture();
      const result = await operation.invoke(service, owned, admin) as typeof response;
      assert.equal(result.code, response.code);
      assert.equal(result.message, response.message);
      if (!["listOrders", "getOrder", "listRegistrations", "getRegistrationDetail", "updateRegistrationRemark", "checkInRegistrationAttendee"].includes(operation.delegate)) {
        assert.equal(result, response);
      } else {
        assert.equal(Object.hasOwn(result.data, "delegated"), false);
      }
      assert.deepEqual(calls, [{ method: operation.delegate, args: operation.args(owned, admin) }]);
    });
  }

  for (const method of ["orders", "registrations", "exportRegistrations"] as const) {
    it(`requires an explicit scalar conferenceId for ${method}`, async () => {
      for (const conferenceId of [undefined, null, "", [], [owned], { in: [owned] }, 42]) {
        const { service, calls } = fixture();
        await assert.rejects(async () => service[method]({ conferenceId }, admin), BadRequestException);
        assert.deepEqual(calls, []);
      }
    });

    it(`strips unsupported query fields before delegating ${method}`, async () => {
      const { service, calls } = fixture();
      const allowed = {
        conferenceId: owned, page: 1, pageSize: 10, keyword: "Guest", status: "CONFIRMED",
        paymentStatus: "SUCCESS", skuId: `sku-${owned}`, checkInStatus: "PENDING"
      };
      await service[method]({ ...allowed, includeAll: true, where: {}, deleted: true, userId: "other-user", conferenceIds: [foreign] }, admin);
      assert.deepEqual(calls[0]!.args, method === "exportRegistrations" ? [allowed, admin] : [allowed]);
    });
  }

  for (const [name, invoke] of [
    ["SKU", (s: AdminConferenceWorkspaceService) => s.updateSku("missing", skuBody, admin)],
    ["form field", (s: AdminConferenceWorkspaceService) => s.updateField("missing", fieldBody, admin)],
    ["order", (s: AdminConferenceWorkspaceService) => s.order("missing", admin)],
    ["registration", (s: AdminConferenceWorkspaceService) => s.registration("missing", admin)],
    ["remark", (s: AdminConferenceWorkspaceService) => s.remark("missing", remarkBody, admin)],
    ["attendee", (s: AdminConferenceWorkspaceService) => s.checkin("missing", admin)]
  ] as const) {
    it(`rejects a missing or unowned ${name} without delegating`, async () => {
      for (const missingAsOrphan of [false, true]) {
        const { service, calls } = fixture(missingAsOrphan);
        await assert.rejects(() => invoke(service), NotFoundException);
        assert.deepEqual(calls, []);
      }
    });
  }

  it("passes the management API's conference dates and content field names unchanged", async () => {
    const { service, calls } = fixture();
    const body = {
      title: "Conference", slug: "conference", subtitle: "Updated summary", coverImage: "https://example.test/cover.png",
      location: "Venue", startAt: "2026-12-10T09:00:00Z", endAt: "2026-12-11T18:00:00Z",
      registrationStartsAt: "2026-11-01T09:00:00Z", registrationEndsAt: "2026-12-09T18:00:00Z",
      groupRegistrationEnabled: true, maxTicketsPerOrder: 4, showRegistrationCount: true, showRemainingSeats: false
    };
    await service.updateConference(owned, body, admin);
    assert.deepEqual(calls, [{ method: "updateConference", args: [owned, body, admin] }]);
  });

  it("rejects financial, ownership, and unknown conference fields without partial writes", async () => {
    for (const extra of [
      { paymentMerchantId: "merchant-foreign" }, { paymentMerchantRevisionId: "revision-foreign" },
      { ownerId: "other-admin" }, { conferenceIds: [foreign] }, { status: "PUBLISHED" },
      { contentJson: { paymentMerchantId: "merchant-foreign" } }, { unexpected: true }
    ]) {
      const { service, calls } = fixture();
      assert.throws(() => service.updateConference(owned, { title: "Allowed", ...extra }, admin), BadRequestException);
      assert.deepEqual(calls, []);
    }
  });

  it("cannot move owned SKUs or form fields to another conference through mutation bodies", async () => {
    for (const invoke of [
      (s: AdminConferenceWorkspaceService) => s.createSku(owned, { ...skuBody, conferenceId: foreign }, admin),
      (s: AdminConferenceWorkspaceService) => s.updateSku(`sku-${owned}`, { ...skuBody, conferenceId: foreign }, admin),
      (s: AdminConferenceWorkspaceService) => s.createField(owned, { ...fieldBody, formDefinitionId: "foreign-form" }, admin),
      (s: AdminConferenceWorkspaceService) => s.updateField(`field-${owned}`, { ...fieldBody, formDefinitionId: "foreign-form" }, admin),
      (s: AdminConferenceWorkspaceService) => s.remark(`registration-${owned}`, { ...remarkBody, status: "CONFIRMED" }, admin)
    ]) {
      const { service, calls } = fixture();
      await assert.rejects(async () => invoke(service), BadRequestException);
      assert.deepEqual(calls, []);
    }
  });
});

type Read = { method: string; args: Record<string, unknown> };
type Call = { method: string; args: unknown[] };
type ListArgs = {
  where: { id?: { in: string[] }; title?: { contains: string; mode: string } };
  orderBy: { startsAt: string }; skip: number; take: number;
  select: Record<string, boolean>;
};

function fixture(missingAsOrphan = false) {
  const calls: Call[] = [];
  const reads: Read[] = [];
  const response = { code: "OK", message: "ok", data: { delegated: true } };
  const delegateNames = [...new Set(operations.map(operation => operation.delegate))];
  const delegates = Object.fromEntries(delegateNames.map(method => [method, async (...args: unknown[]) => {
    calls.push({ method, args });
    return response;
  }]));
  const rows = [owned, foreign].map((id, index) => ({
    id, title: `Event ${id}`, startsAt: new Date(Date.UTC(2026, 11, 10 + index)),
    endsAt: new Date(Date.UTC(2026, 11, 12 + index)), status: "PUBLISHED", location: "Venue"
  }));
  const match = (where: ListArgs["where"]) => rows.filter(row =>
    (!where.id || where.id.in.includes(row.id)) &&
    (!where.title || row.title.toLowerCase().includes(where.title.contains.toLowerCase())));
  const lookup = (prefix: string, id: string) => {
    const row = rows.find(item => `${prefix}-${item.id}` === id);
    return row ? { conferenceId: row.id } : missingAsOrphan ? { conferenceId: null } : null;
  };
  const prisma = {
    conference: {
      async findMany(args: ListArgs) {
        reads.push({ method: "conference.findMany", args });
        return match(args.where).sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())
          .slice(args.skip, args.skip + args.take);
      },
      async count(args: { where: ListArgs["where"] }) {
        reads.push({ method: "conference.count", args });
        return match(args.where).length;
      }
    },
    registrationSku: { async findUnique(args: { where: { id: string } }) {
      reads.push({ method: "registrationSku.findUnique", args });
      return lookup("sku", args.where.id);
    } },
    formField: { async findUnique(args: { where: { id: string } }) {
      reads.push({ method: "formField.findUnique", args });
      const formDefinition = lookup("field", args.where.id);
      return formDefinition ? { formDefinition } : null;
    } },
    order: { async findUnique(args: { where: { orderNo: string } }) {
      reads.push({ method: "order.findUnique", args });
      return lookup("ORDER", args.where.orderNo);
    } },
    registration: { async findUnique(args: { where: { id: string } }) {
      reads.push({ method: "registration.findUnique", args });
      return lookup("registration", args.where.id);
    } },
    registrationAttendee: { async findUnique(args: { where: { id: string } }) {
      reads.push({ method: "registrationAttendee.findUnique", args });
      const registration = lookup("attendee", args.where.id);
      return registration ? { registration } : null;
    } },
    async $transaction(operations: Promise<unknown>[]) { return Promise.all(operations); }
  };
  const service = new AdminConferenceWorkspaceService(prisma as unknown as PrismaService,
    delegates as unknown as AdminManagementService, delegates as unknown as AdminExportsService);
  return { service, calls, reads, response };
}
