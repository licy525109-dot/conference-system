import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { CheckInStatus, OrderStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { createCheckinCredentialPayload, parseCheckinCredentialPayload } from "./checkin-credential";
import { CheckinService } from "./checkin.service";

process.env.JWT_SECRET = "checkin_scope_test_only_secret";
const admin = { id: "admin-test", username: "test", displayName: "Test", permissions: ["checkin:write"] };
const staff = { id: "staff-test", openid: "staff-test", nickname: "Staff" };
const owner = { id: "owner-test", openid: "owner-test", nickname: "Owner" };
const routes = ["scan", "staff", "manual"] as const;
type Route = typeof routes[number];

function scopedQr(attendeeId = "attendee-a", version = 0) {
  return createCheckinCredentialPayload("registration-test", "REG-TEST", version, attendeeId);
}

function checkin(service: CheckinService, route: Route, qrPayload = scopedQr()) {
  if (route === "staff") return service.staffScanCheckin({ qrPayload }, staff);
  if (route === "manual") return service.adminManualCheckin({ credentialCode: qrPayload }, admin);
  return service.scanCheckin({ qrPayload }, admin);
}

describe("attendee-scoped check-in credentials", () => {
  it("signs the attendee and version and rejects changes or removed scope", () => {
    const qr = scopedQr("attendee-a", 2);
    assert.deepEqual(parseCheckinCredentialPayload(qr), {
      registrationId: "registration-test", registrationNo: "REG-TEST", version: 2, attendeeId: "attendee-a"
    });
    assert.throws(() => parseCheckinCredentialPayload(qr.replace(/attendee-a$/, "attendee-b")), BadRequestException);
    assert.throws(() => parseCheckinCredentialPayload(qr.replace(":2:attendee-a", ":3:attendee-a")), BadRequestException);
    assert.throws(() => parseCheckinCredentialPayload(qr.replace(":attendee-a", "")), BadRequestException);
    assert.throws(() => parseCheckinCredentialPayload(scopedQr().replace(":0:attendee-a", "")), BadRequestException);
  });

  for (const route of routes) {
    it(`${route}: checks only scoped attendee B, not first pending attendee A`, async () => {
      const db = createDatabase();
      const response = await checkin(db.service, route, scopedQr("attendee-b"));
      assert.equal((response.data as { attendeeId: string }).attendeeId, "attendee-b");
      assert.equal((response.data as { attendeeName: string }).attendeeName, "Guest B");
      assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
      assert.equal(db.state.attendees[1]!.checkInStatus, CheckInStatus.CHECKED_IN);
      assert.equal(db.state.logs.length, 1);
      assert.equal(db.state.logs[0]!.attendeeId, "attendee-b");
    });

    it(`${route}: replay of A's QR never advances to pending B`, async () => {
      const db = createDatabase();
      await checkin(db.service, route);
      const second = await checkin(db.service, route);
      assert.equal((second.data as { message: string }).message, "已签到，无需重复核销");
      assert.equal((second.data as { attendeeId: string }).attendeeId, "attendee-a");
      assert.equal(db.state.attendees[1]!.checkInStatus, CheckInStatus.PENDING);
      assert.equal(db.state.logs.length, 1);
      assert.equal(db.state.audits.length, route === "manual" ? 1 : 0);
    });

    it(`${route}: rejects a signed attendee not belonging to the registration`, async () => {
      const db = createDatabase();
      await assert.rejects(() => checkin(db.service, route, scopedQr("foreign-attendee")), NotFoundException);
      assert.equal(db.state.logs.length, 0);
    });

    it(`${route}: rejects a credential invalidated before the request`, async () => {
      const db = createDatabase();
      db.change(state => { state.registration.credentialVersion = 1; });
      await assert.rejects(() => checkin(db.service, route), BadRequestException);
      assert.equal(db.state.logs.length, 0);
    });
  }

  it("manual: rejects A's credential combined with B's explicit attendeeId", async () => {
    const db = createDatabase();
    await assert.rejects(() => db.service.adminManualCheckin({ attendeeId: "attendee-b", credentialCode: scopedQr() }, admin), BadRequestException);
    assert.equal(db.state.logs.length, 0);
    assert.equal(db.state.audits.length, 0);
  });

  it("manual: accepts a matching explicit ID but cannot use a registration code for another registration", async () => {
    const db = createDatabase();
    await assert.rejects(() => db.service.adminManualCheckin({ attendeeId: "foreign-attendee", credentialCode: "REG-TEST" }, admin), NotFoundException);
    await db.service.adminManualCheckin({ attendeeId: "attendee-b", credentialCode: scopedQr("attendee-b") }, admin);
    assert.equal(db.state.logs[0]!.attendeeId, "attendee-b");
  });

  it("staff: denies a user without conference check-in authorization", async () => {
    const db = createDatabase();
    db.hooks.staffAllowed = false;
    await assert.rejects(() => checkin(db.service, "staff"), ConflictException);
    assert.equal(db.state.logs.length, 0);
  });

  it("preserves legacy registration-wide QR and manual registration-code behavior", async () => {
    const db = createDatabase();
    await db.service.scanCheckin({ qrPayload: createCheckinCredentialPayload("registration-test", "REG-TEST") }, admin);
    await db.service.adminManualCheckin({ credentialCode: "REG-TEST" }, admin);
    assert.deepEqual(db.state.logs.map(log => log.attendeeId), ["attendee-a", "attendee-b"]);
  });
});

describe("check-in optimistic concurrency and transaction rollback", () => {
  for (const route of routes) {
    it(`${route}: rechecks the credential version inside the transaction`, async () => {
      const db = createDatabase();
      db.hooks.beforeTransaction = () => db.change(state => { state.registration.credentialVersion += 1; });
      await assert.rejects(() => checkin(db.service, route), BadRequestException);
      assert.equal(db.state.logs.length, 0);
      assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
    });

    it(`${route}: rechecks attendee updatedAt even without a credential version change`, async () => {
      const db = createDatabase();
      db.hooks.beforeTransaction = () => db.change(state => {
        state.attendees[0]!.updatedAt = new Date("2026-09-21T10:00:01Z");
        state.attendees[0]!.name = "Replacement";
      });
      await assert.rejects(() => checkin(db.service, route), ConflictException);
      assert.equal(db.state.logs.length, 0);
      assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
    });
  }

  it("manual attendeeId and self input also reject replacement after their initial read", async () => {
    for (const source of ["manual", "self"] as const) {
      const db = createDatabase();
      db.hooks.beforeTransaction = () => db.change(state => { state.registration.credentialVersion += 1; });
      await assert.rejects(() => source === "manual"
        ? db.service.adminManualCheckin({ attendeeId: "attendee-a" }, admin)
        : db.service.selfCheckin({ conferenceId: "conference-test", registrationId: "registration-test",
          values: { name: "Guest A", phone: "13800000000" } }, owner), BadRequestException);
      assert.equal(db.state.logs.length, 0);
    }
  });

  it("rejects a changed guest binding even if updatedAt has the same millisecond", async () => {
    const db = createDatabase();
    db.hooks.beforeTransaction = () => db.change(state => { state.attendees[0]!.guestProfileId = "new-guest"; });
    await assert.rejects(() => checkin(db.service, "scan"), ConflictException);
    assert.equal(db.state.logs.length, 0);
  });

  it("checks current paid/confirmed/cancelled status, not only the initial read", async () => {
    const invalidations: Array<(state: DatabaseState) => void> = [
      state => { state.registration.status = RegistrationStatus.CANCELLED; },
      state => { state.registration.order.status = OrderStatus.CLOSED; },
      state => { state.attendees[0]!.checkInStatus = CheckInStatus.CANCELLED; }
    ];
    for (const invalidate of invalidations) {
      const db = createDatabase();
      db.hooks.beforeTransaction = () => db.change(invalidate);
      await assert.rejects(() => checkin(db.service, "scan"), ConflictException);
      assert.equal(db.state.logs.length, 0);
    }
  });

  it("CAS includes version, attendee identity, updatedAt, paid status and pending state", async () => {
    const db = createDatabase();
    await checkin(db.service, "scan");
    assert.deepEqual(db.casPredicates[0], {
      id: "attendee-a", registrationId: "registration-test", updatedAt: new Date("2026-09-21T10:00:00Z"),
      checkInStatus: CheckInStatus.PENDING, guestProfileId: "guest-a",
      registration: { credentialVersion: 0, status: RegistrationStatus.CONFIRMED, order: { status: OrderStatus.PAID } }
    });
    assert.ok(db.isolationLevels.every(level => level === Prisma.TransactionIsolationLevel.Serializable));
  });

  it("CAS failure retries with fresh reads and never writes a success log", async () => {
    const db = createDatabase();
    db.hooks.forceCasMiss = true;
    await assert.rejects(() => checkin(db.service, "scan"), ConflictException);
    assert.equal(db.transactionCount, 3);
    assert.equal(db.state.logs.length, 0);
    assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
  });

  it("replacement committed after CAS rolls back the old scan and its log before retry", async () => {
    const db = createDatabase();
    db.hooks.beforeCommit = () => db.change(state => {
      state.registration.credentialVersion += 1;
      state.attendees[0]!.guestProfileId = "replacement-guest";
      state.attendees[0]!.updatedAt = new Date("2026-09-21T10:00:01Z");
    });
    await assert.rejects(() => checkin(db.service, "manual"), BadRequestException);
    assert.equal(db.transactionCount, 2);
    assert.equal(db.state.logs.length, 0);
    assert.equal(db.state.audits.length, 0);
    assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
    assert.equal(db.state.attendees[0]!.guestProfileId, "replacement-guest");
  });

  it("bounds persistent serialization failures at three attempts without committed logs", async () => {
    const db = createDatabase();
    db.hooks.forceSerializationConflict = true;
    await assert.rejects(() => checkin(db.service, "manual"), ConflictException);
    assert.equal(db.transactionCount, 3);
    assert.equal(db.state.logs.length, 0);
    assert.equal(db.state.audits.length, 0);
    assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
  });

  it("concurrent admin/staff/manual scans converge with one check-in and one log", async () => {
    const db = createDatabase();
    const results = await Promise.all(routes.map(route => checkin(db.service, route)));
    assert.ok(results.every(result => (result.data as { status: string }).status === CheckInStatus.CHECKED_IN));
    assert.equal(results.filter(result => (result.data as { message: string }).message === "已签到，无需重复核销").length, 2);
    assert.equal(db.state.logs.length, 1);
    assert.equal(db.state.attendees[1]!.checkInStatus, CheckInStatus.PENDING);
    assert.ok(db.transactionCount > 3, "at least one serialization conflict was retried");
  });

  it("concurrent manual scans write one atomic audit log, including retries", async () => {
    const db = createDatabase();
    await Promise.all([checkin(db.service, "manual"), checkin(db.service, "manual")]);
    assert.equal(db.state.logs.length, 1);
    assert.equal(db.state.audits.length, 1);
    assert.equal(db.state.audits[0]!.entityId, db.state.logs[0]!.id);
  });

  it("audit failure rolls back check-in and check-in log", async () => {
    const db = createDatabase();
    db.hooks.failAudit = true;
    await assert.rejects(() => checkin(db.service, "manual"), /audit unavailable/);
    assert.equal(db.state.logs.length, 0);
    assert.equal(db.state.attendees[0]!.checkInStatus, CheckInStatus.PENDING);
    assert.equal(db.transactionCount, 1);
  });
});

function fixture() {
  const createdAt = new Date("2026-09-21T10:00:00Z");
  return {
    registration: {
      id: "registration-test", registrationNo: "REG-TEST", credentialVersion: 0,
      userId: owner.id, conferenceId: "conference-test", status: RegistrationStatus.CONFIRMED as RegistrationStatus,
      attendeeName: "Guest A", phone: "13800000000", formDataJson: {},
      order: { status: OrderStatus.PAID as OrderStatus }
    },
    attendees: ["a", "b"].map((suffix, index) => ({
      id: `attendee-${suffix}`, registrationId: "registration-test", guestProfileId: `guest-${suffix}`,
      name: `Guest ${suffix.toUpperCase()}`, phone: `1380000000${index}`, company: null, title: null,
      formDataJson: {}, skuId: "sku-test", sku: { name: "Test" },
      checkInStatus: CheckInStatus.PENDING as CheckInStatus,
      checkedInAt: null as Date | null, checkedInBy: null as string | null, createdAt, updatedAt: createdAt
    })),
    logs: [] as Array<Record<string, unknown>>,
    audits: [] as Array<Record<string, unknown>>
  };
}
type DatabaseState = ReturnType<typeof fixture>;

// Isolated optimistic transactions model commit conflicts/rollback, not a live PostgreSQL integration test.
function createDatabase() {
  let state = fixture();
  let revision = 0;
  let transactionCount = 0;
  const casPredicates: unknown[] = [];
  const isolationLevels: string[] = [];
  const hooks: {
    beforeTransaction?: () => void;
    beforeCommit?: () => void;
    forceCasMiss?: boolean;
    failAudit?: boolean;
    forceSerializationConflict?: boolean;
    staffAllowed?: boolean;
  } = {};
  const registration = (source: DatabaseState) => structuredClone({ ...source.registration, attendees: source.attendees });
  function delegates(source: () => DatabaseState, wrote: () => void = () => {}) {
    return {
      conference: { findUnique: async () => ({
        id: "conference-test", checkInEnabled: true, checkInStartsAt: null, checkInEndsAt: null,
        checkInMethods: ["QR_SCAN", "SELF_PHONE_NAME", "ADMIN_MANUAL"],
        checkInFieldBindings: { phoneFieldKey: "phone", nameFieldKey: "name" },
        formDefinition: { fields: [{ id: "name", fieldKey: "name", label: "Name", type: "TEXT" },
          { id: "phone", fieldKey: "phone", label: "Phone", type: "PHONE" }] }
      }) },
      checkinStaffAssignment: { findFirst: async () => hooks.staffAllowed === false ? null : { id: "staff-assignment" } },
      registration: { findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const row = registration(source());
        return Object.entries(where).every(([key, value]) => row[key as keyof typeof row] === value) ? row : null;
      } },
      registrationAttendee: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const row = source().attendees.find(attendee => attendee.id === where.id);
          return row ? structuredClone({ ...row, registration: registration(source()) }) : null;
        },
        updateMany: async ({ where, data }: { where: Prisma.RegistrationAttendeeWhereInput; data: Record<string, unknown> }) => {
          casPredicates.push(structuredClone(where));
          const snapshot = source();
          const row = snapshot.attendees.find(attendee => attendee.id === where.id);
          const expectedRegistration = where.registration as { credentialVersion: number; status: string; order: { status: string } };
          if (hooks.forceCasMiss || !row || row.registrationId !== where.registrationId
            || row.updatedAt.getTime() !== (where.updatedAt as Date).getTime()
            || row.checkInStatus !== where.checkInStatus || row.guestProfileId !== where.guestProfileId
            || snapshot.registration.credentialVersion !== expectedRegistration.credentialVersion
            || snapshot.registration.status !== expectedRegistration.status
            || snapshot.registration.order.status !== expectedRegistration.order.status) return { count: 0 };
          Object.assign(row, data, { updatedAt: new Date() });
          wrote();
          return { count: 1 };
        }
      },
      checkinLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        const row = { ...data, id: `log-${source().logs.length + 1}` };
        source().logs.push(row);
        wrote();
        return row;
      } },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => {
        if (hooks.failAudit) throw new Error("audit unavailable");
        source().audits.push(structuredClone(data));
        wrote();
        return data;
      } }
    };
  }
  const prisma = {
    ...delegates(() => state),
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>, options: { isolationLevel: string }) => {
      transactionCount += 1;
      isolationLevels.push(options.isolationLevel);
      const before = hooks.beforeTransaction;
      delete hooks.beforeTransaction;
      before?.();
      const startRevision = revision;
      const snapshot = structuredClone(state);
      let wrote = false;
      const result = await callback(delegates(() => snapshot, () => { wrote = true; }));
      const beforeCommit = hooks.beforeCommit;
      delete hooks.beforeCommit;
      beforeCommit?.();
      if (wrote && (hooks.forceSerializationConflict || revision !== startRevision)) throw new Prisma.PrismaClientKnownRequestError("serialization conflict", {
        code: "P2034", clientVersion: "test"
      });
      if (wrote) { state = snapshot; revision += 1; }
      return result;
    }
  };
  return {
    service: new CheckinService(prisma as unknown as PrismaService), hooks, casPredicates, isolationLevels,
    get state() { return state; },
    get transactionCount() { return transactionCount; },
    change(mutate: (value: DatabaseState) => void) { mutate(state); revision += 1; }
  };
}
