import "reflect-metadata";
import assert from "node:assert/strict";
import test from "node:test";
import { assertAttendeeEditable, GuestIdentityService, hashGuestClaim, identityText } from "./guest-identity.service";
import type { PrismaService } from "../prisma.service";
import { missingRegistrationProfileFields } from "../auth/registration-profile";
import { activityPage } from "../admin/admin-user-activity.service";
import { createCheckinCredentialPayload, parseCheckinCredentialPayload, assertCredentialVersion } from "../checkin/checkin-credential";

test("profile gate requires real name and verified phone, not nickname or avatar", () => {
  assert.deepEqual(missingRegistrationProfileFields({ realName: "嘉宾", phone: "13800138000", phoneVerifiedAt: new Date() }), []);
  assert.ok(missingRegistrationProfileFields({ realName: "嘉宾", phone: "13800138000", phoneVerifiedAt: null }).includes("verifiedPhone"));
  assert.ok(missingRegistrationProfileFields(null).length > 0);
});
test("changed attendance invalidates earlier QR payloads without invalidating version-zero legacy credentials", () => {
  const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = "test-only-credential-key";
  try {
    const old = parseCheckinCredentialPayload(createCheckinCredentialPayload("id", "no"));
    assert.doesNotThrow(() => assertCredentialVersion(old, 0));
    assert.throws(() => assertCredentialVersion(old, 1));
    const current = createCheckinCredentialPayload("id", "no", 1);
    assert.doesNotThrow(() => assertCredentialVersion(parseCheckinCredentialPayload(current), 1));
    assert.throws(() => parseCheckinCredentialPayload(current.replace(/:1$/, ":2")));
  } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});
test("attendee changes reject invalid registration, checked-in tickets and pending refunds", () => {
  const attendee = { checkInStatus: "PENDING", registration: { status: "CONFIRMED", order: { refunds: [] as { status: string }[] } } };
  assert.doesNotThrow(() => assertAttendeeEditable(attendee));
  assert.throws(() => assertAttendeeEditable({ ...attendee, checkInStatus: "CHECKED_IN" }));
  for (const status of ["REQUESTED", "APPROVED", "PROCESSING"]) assert.throws(() => assertAttendeeEditable({ ...attendee, registration: { status: "CONFIRMED", order: { refunds: [{ status }] } } }));
});
test("guest invitation storage is hashed and admin mutation reasons are bounded", () => {
  assert.equal(hashGuestClaim("token").length, 64);
  assert.notEqual(hashGuestClaim("token"), hashGuestClaim("other"));
  assert.throws(() => identityText(" ", "原因"));
  assert.throws(() => identityText("x".repeat(201), "原因"));
});
test("history pagination rejects negative/nonintegral input and caps page size", () => {
  assert.deepEqual(activityPage({ page: -1, pageSize: 10000 }), { page: 1, pageSize: 100, skip: 0 });
  assert.deepEqual(activityPage({ page: 2, pageSize: 10 }), { page: 2, pageSize: 10, skip: 10 });
});

const admin = { id: "admin-test", username: "test", displayName: "Test" };
function identityFixture() {
  const stamp = new Date("2026-09-01T00:00:00Z");
  const attendee = { id: "attendee-1", registrationId: "reg-1", name: "Guest", phone: "13800138000", formDataJson: { name: "Guest" },
    guestProfileId: "shared-profile", updatedAt: stamp, checkInStatus: "PENDING", registration: {
      id: "reg-1", status: "CONFIRMED", attendees: [{ id: "attendee-1" }], conference: {}, order: { refunds: [] as { status: string }[] }
    } };
  const writes: { table: string; args: any }[] = [];
  const record = (table: string, result: any = {}) => async (args: any) => { writes.push({ table, args }); return result; };
  const claim = { id: "claim-1", guestProfileId: "shared-profile", consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 60000),
    guestProfile: { phone: attendee.phone, userId: null, attendees: [attendee] } };
  const user = { id: "user-2", realName: "Verified Guest", phone: attendee.phone, phoneVerifiedAt: stamp };
  const tx = {
    registrationAttendee: { findUnique: async () => attendee, update: record("attendee"), updateMany: record("attendees") },
    registration: { update: record("registration"), updateMany: record("registrations") },
    guestProfile: { upsert: record("profile-upsert", { id: "canonical-profile" }), create: record("profile-create", { id: "new-profile" }) },
    guestClaim: { create: record("claim-create"), findUnique: async () => claim, update: record("claim-consume") },
    guestScheduleAssignment: { updateMany: record("archive-schedule") },
    user: { findUnique: async () => user },
    auditLog: { create: record("audit") },
    order: { findUnique: async () => ({ id: "order-1", userId: "original-payer", businessOwnerUserId: null }), update: record("order") }
  };
  const service = new GuestIdentityService({ ...tx, $transaction: async (fn: (arg: typeof tx) => unknown) => fn(tx) } as unknown as PrismaService);
  return { service, attendee, claim, user, writes };
}

test("binding changes only selected attendance and rotates credentials, never shared-profile ownership or payer", async () => {
  const f = identityFixture();
  await f.service.updateAttendee(f.attendee.id, { action: "bind", userId: f.user.id, reason: "Verified in person", expectedUpdatedAt: f.attendee.updatedAt.toISOString() }, admin);
  const mutation = f.writes.find(w => w.table === "attendee")!.args;
  assert.deepEqual(mutation, { where: { id: f.attendee.id }, data: { guestProfileId: "canonical-profile" } });
  assert.deepEqual(f.writes.find(w => w.table === "profile-upsert")!.args.update, {});
  assert.equal(f.writes.some(w => w.table === "order"), false);
  assert.deepEqual(f.writes.find(w => w.table === "registration")!.args.data, { credentialVersion: { increment: 1 } });
});
test("stale admin edits and unverified binding fail before writes", async () => {
  const f = identityFixture();
  await assert.rejects(f.service.updateAttendee(f.attendee.id, { action: "bind", userId: f.user.id, reason: "check", expectedUpdatedAt: "old" }, admin));
  assert.equal(f.writes.length, 0);
  f.user.phoneVerifiedAt = null as any;
  await assert.rejects(f.service.updateAttendee(f.attendee.id, { action: "bind", userId: f.user.id, reason: "check", expectedUpdatedAt: f.attendee.updatedAt.toISOString() }, admin));
  assert.equal(f.writes.length, 0);
});
test("replacement archives previous itinerary and updates primary summary but preserves original order", async () => {
  const f = identityFixture();
  await f.service.updateAttendee(f.attendee.id, { action: "replace", name: "New Guest", phone: "13900139000", reason: "Confirmed replacement", expectedUpdatedAt: f.attendee.updatedAt.toISOString() }, admin);
  assert.equal(f.writes.find(w => w.table === "registration")!.args.data.attendeeName, "New Guest");
  assert.equal(f.writes.find(w => w.table === "attendee")!.args.data.company, null);
  assert.equal(f.writes.find(w => w.table === "archive-schedule")!.args.where.attendeeId, f.attendee.id);
  assert.equal(f.writes.some(w => w.table === "order"), false);
  assert.deepEqual(f.writes.find(w => w.table === "audit")!.args.data.metadataJson.previousForm, { name: "Guest" });
});
test("claim verifies phone, expiry, consumption and current refund status before attaching attendance", async () => {
  for (const invalid of ["phone", "expired", "consumed", "refund", "detached"]) {
    const f = identityFixture();
    if (invalid === "phone") f.user.phone = "13900139000";
    if (invalid === "expired") f.claim.expiresAt = new Date(0);
    if (invalid === "consumed") f.claim.consumedAt = new Date();
    if (invalid === "refund") f.attendee.registration.order.refunds = [{ status: "PROCESSING" }];
    if (invalid === "detached") f.claim.guestProfile.attendees = [];
    await assert.rejects(f.service.claim("claim-token", f.user.id));
    assert.equal(f.writes.length, 0, invalid);
  }
  const f = identityFixture();
  await f.service.claim("claim-token", f.user.id);
  assert.deepEqual(f.writes.find(w => w.table === "attendees")!.args, { where: { guestProfileId: "shared-profile" }, data: { guestProfileId: "canonical-profile" } });
  assert.ok(f.writes.find(w => w.table === "claim-consume"));
  assert.equal(f.writes.some(w => w.table === "order"), false);
});
test("business contact reassignment does not transfer the original payment owner", async () => {
  const f = identityFixture();
  await f.service.changeBusinessOwner("order-1", { userId: f.user.id, expectedUserId: null, reason: "Confirmed contact" }, admin);
  assert.deepEqual(f.writes.find(w => w.table === "order")!.args.data, { businessOwnerUserId: f.user.id });
});

test("personal attendance response is scoped by explicit binding and contains only attendee-scoped signed QR", async () => {
  const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = "test-only-credential-key";
  let query: any;
  try {
    const service = new GuestIdentityService({ registrationAttendee: { findMany: async (args: any) => {
      query = args;
      return [{ id: "ticket-2", name: "Guest", checkInStatus: "PENDING", registration: { id: "group-reg", registrationNo: "REG1", status: "CONFIRMED", credentialVersion: 2 } }];
    } } } as unknown as PrismaService);
    const result = await service.mine("verified-user");
    assert.deepEqual(query.where, { guestProfile: { userId: "verified-user" } });
    assert.equal(query.select.registration.select.order, undefined);
    const qr = parseCheckinCredentialPayload(result.data.items[0]!.qrPayload!);
    assert.equal(qr.attendeeId, "ticket-2");
    assert.equal(qr.version, 2);
  } finally { if (previous === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = previous; }
});
