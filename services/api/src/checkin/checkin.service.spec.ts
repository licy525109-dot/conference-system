import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, BadRequestException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { CheckInStatus, CheckinActionType, OrderStatus, RegistrationStatus } from "@prisma/client";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { PrismaService } from "../prisma.service";
import { CheckinController } from "./checkin.controller";
import { createCheckinCredentialPayload } from "./checkin-credential";
import { CheckinService } from "./checkin.service";

const currentUser = { id: "user-1", openid: "openid-1", nickname: "用户" };
const currentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["checkin:write"] };

process.env.JWT_SECRET = "test_checkin_jwt_secret";

describe("CheckinService self check-in", () => {
  it("returns the no-check-in message when check-in is disabled", async () => {
    const service = new CheckinService(createPrismaMock({ checkInEnabled: false }));

    await assert.rejects(
      () => service.selfCheckin(selfPayload(), currentUser),
      (error: unknown) => error instanceof ConflictException && String(error.message).includes("本会议无需签到核销")
    );
  });

  it("rejects check-in before start and after end", async () => {
    await assert.rejects(() => new CheckinService(createPrismaMock({ startsAt: futureDate() })).selfCheckin(selfPayload(), currentUser), ConflictException);
    await assert.rejects(() => new CheckinService(createPrismaMock({ endsAt: pastDate() })).selfCheckin(selfPayload(), currentUser), ConflictException);
  });

  it("rejects phone plus name check-in when bound fields are missing", async () => {
    const service = new CheckinService(createPrismaMock({ bindings: {} }));

    await assert.rejects(() => service.selfCheckin(selfPayload(), currentUser), ConflictException);
  });

  it("completes self check-in with phone and name", async () => {
    const prisma = createPrismaMock();
    const service = new CheckinService(prisma);

    const response = await service.selfCheckin(selfPayload(), currentUser);
    const data = response.data as { status: CheckInStatus };

    assert.equal(data.status, CheckInStatus.CHECKED_IN);
    assert.equal(prisma.attendee.checkInStatus, CheckInStatus.CHECKED_IN);
    assert.equal(prisma.checkinLogs.length, 1);
    assert.equal(prisma.checkinLogs[0]?.action, CheckinActionType.SELF_INPUT);
    assert.equal(prisma.checkinLogs[0]?.method, "SELF_INPUT");
  });

  it("rejects mismatched phone or name", async () => {
    const service = new CheckinService(createPrismaMock());

    await assert.rejects(
      () => service.selfCheckin(selfPayload({ phone: "13900000000" }), currentUser),
      (error: unknown) => error instanceof BadRequestException && String(error.message).includes("手机号或姓名不匹配")
    );
  });

  it("requires paid registration before check-in", async () => {
    const service = new CheckinService(createPrismaMock({ orderStatus: OrderStatus.PENDING }));

    await assert.rejects(() => service.selfCheckin(selfPayload(), currentUser), ConflictException);
  });

  it("does not count duplicate self check-in twice", async () => {
    const prisma = createPrismaMock({ attendeeStatus: CheckInStatus.CHECKED_IN, checkedInAt: new Date("2026-06-19T09:00:00.000Z") });
    const service = new CheckinService(prisma);

    const response = await service.selfCheckin(selfPayload(), currentUser);
    const data = response.data as { message: string };

    assert.equal(data.message, "已签到，无需重复核销");
    assert.equal(prisma.checkinLogs.length, 0);
  });
});

describe("CheckinService QR scan and admin manual check-in", () => {
  it("completes QR scan check-in with an admin token flow", async () => {
    const prisma = createPrismaMock();
    const service = new CheckinService(prisma);

    const response = await service.scanCheckin({ qrPayload: createCheckinCredentialPayload("registration-1", "REG001") }, currentAdmin);
    const data = response.data as { status: CheckInStatus };

    assert.equal(data.status, CheckInStatus.CHECKED_IN);
    assert.equal(prisma.checkinLogs[0]?.action, CheckinActionType.QR_SCAN);
    assert.equal(prisma.checkinLogs[0]?.operatorId, currentAdmin.id);
  });

  it("protects the scan endpoint with admin guards", () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, CheckinController.prototype.scanCheckin) as unknown[];
    assert.ok(guards.includes(AdminJwtAuthGuard));
    assert.ok(guards.includes(AdminPermissionGuard));
  });

  it("writes an audit log for admin emergency check-in", async () => {
    const prisma = createPrismaMock();
    const service = new CheckinService(prisma);

    await service.adminManualCheckin({ credentialCode: "REG001", remark: "现场异常处理" }, currentAdmin);

    assert.equal(prisma.checkinLogs[0]?.action, CheckinActionType.ADMIN_MANUAL);
    assert.equal(prisma.auditLogs[0]?.summary, "Admin emergency check-in");
  });

  it("uses updated registration fields for self check-in and keeps statistics consistent", async () => {
    const prisma = createPrismaMock({ formData: { phone: "13800000000", name: "李四" }, attendeeName: "李四" });
    const service = new CheckinService(prisma);

    await service.selfCheckin(selfPayload({ name: "李四" }), currentUser);
    const stats = await service.statistics({ conferenceId: "conference-1" });
    const data = stats.data as { checkedIn: number; byMethod: Array<{ count: number }>; checkedInList: Array<{ attendeeName: string }>; uncheckedInList: unknown[] };

    assert.equal(data.checkedIn, 1);
    assert.equal(data.byMethod[0]?.count, 1);
    assert.equal(data.checkedInList[0]?.attendeeName, "李四");
    assert.equal(data.uncheckedInList.length, 0);
  });
});

function selfPayload(overrides: Record<string, string> = {}) {
  return {
    conferenceId: "conference-1",
    registrationId: "registration-1",
    method: "SELF_PHONE_NAME",
    values: {
      phone: "13800000000",
      name: "张三",
      ...overrides
    }
  };
}

function createPrismaMock(options: {
  checkInEnabled?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
  methods?: string[];
  bindings?: Record<string, unknown>;
  orderStatus?: OrderStatus;
  attendeeStatus?: CheckInStatus;
  checkedInAt?: Date | null;
  formData?: Record<string, unknown>;
  attendeeName?: string;
} = {}) {
  const conference = {
    id: "conference-1",
    checkInEnabled: options.checkInEnabled ?? true,
    checkInStartsAt: options.startsAt ?? pastDate(),
    checkInEndsAt: options.endsAt ?? futureDate(),
    checkInMethods: options.methods ?? ["QR_SCAN", "SELF_PHONE_NAME", "ADMIN_MANUAL"],
    checkInFieldBindings: options.bindings ?? { phoneFieldKey: "phone", nameFieldKey: "name", customFieldKeys: [] },
    formDefinition: {
      fields: [
        { id: "field-phone", label: "手机号", fieldKey: "phone", type: "PHONE", required: true },
        { id: "field-name", label: "姓名", fieldKey: "name", type: "TEXT", required: true }
      ]
    }
  };
  const attendee = {
    id: "attendee-1",
    registrationId: "registration-1",
    skuId: "sku-1",
    name: options.attendeeName ?? "张三",
    phone: "13800000000",
    company: null,
    title: null,
    formDataJson: options.formData ?? { phone: "13800000000", name: options.attendeeName ?? "张三" },
    checkInStatus: options.attendeeStatus ?? CheckInStatus.PENDING,
    checkedInAt: options.checkedInAt ?? null,
    checkedInBy: null,
    createdAt: new Date("2026-06-19T08:00:00.000Z"),
    updatedAt: new Date("2026-06-19T08:00:00.000Z"),
    sku: { name: "标准票" }
  };
  const registration = {
    id: "registration-1",
    registrationNo: "REG001",
    userId: "user-1",
    conferenceId: "conference-1",
    skuId: "sku-1",
    attendeeName: options.attendeeName ?? "张三",
    phone: "13800000000",
    formDataJson: options.formData ?? { phone: "13800000000", name: options.attendeeName ?? "张三" },
    paidAmountCent: 1,
    status: RegistrationStatus.CONFIRMED,
    confirmedAt: new Date("2026-06-19T08:00:00.000Z"),
    createdAt: new Date("2026-06-19T08:00:00.000Z"),
    updatedAt: new Date("2026-06-19T08:00:00.000Z"),
    order: { status: options.orderStatus ?? OrderStatus.PAID, paidAt: new Date("2026-06-19T08:00:00.000Z") },
    conference: { title: "大会" },
    attendees: [attendee]
  };
  const checkinLogs: CheckinLogRecord[] = [];
  const auditLogs: AuditLogRecord[] = [];
  const mock: any = {
    attendee,
    checkinLogs,
    auditLogs,
    conference: {
      findUnique: async ({ where }: { where: { id: string } }) => (where.id === conference.id ? conference : null)
    },
    registration: {
      findFirst: async () => registration,
      count: async () => 1
    },
    registrationAttendee: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === attendee.id ? { ...attendee, registration } : null,
      update: async ({ data }: { data: Partial<typeof attendee> }) => {
        Object.assign(attendee, data);
        return { ...attendee };
      },
      findMany: async () => [{ ...attendee, sku: { name: "标准票" }, registration }]
    },
    checkinLog: {
      create: async ({ data }: { data: Omit<CheckinLogRecord, "id" | "createdAt"> }) => {
        const row = { id: `log-${checkinLogs.length + 1}`, createdAt: new Date("2026-06-19T09:00:00.000Z"), ...data };
        checkinLogs.push(row);
        return row;
      },
      findMany: async () => checkinLogs,
      count: async () => checkinLogs.length
    },
    auditLog: {
      create: async ({ data }: { data: AuditLogRecord }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async <T>(operation: ((tx: typeof mock) => Promise<T>) | Promise<T>[]) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(mock)
  };
  return mock as typeof mock & PrismaService;
}

function pastDate() {
  return new Date(Date.now() - 60_000);
}

function futureDate() {
  return new Date(Date.now() + 60_000);
}

interface CheckinLogRecord {
  id: string;
  attendeeId: string;
  registrationId: string;
  action: CheckinActionType;
  method: string | null;
  result: string | null;
  beforeStatus: CheckInStatus | null;
  afterStatus: CheckInStatus;
  operatorId?: string | null;
  operatorUserId?: string | null;
  matchedFields?: unknown;
  remark?: string | null;
  createdAt: Date;
}

interface AuditLogRecord {
  adminUserId: string;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadataJson?: unknown;
}
