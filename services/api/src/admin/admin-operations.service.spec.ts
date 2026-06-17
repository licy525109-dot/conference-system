import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConflictException } from "@nestjs/common";
import { AuditAction, CheckInStatus, CheckinActionType, OrderStatus, PaymentProvider, RefundStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminOperationsService } from "./admin-operations.service";
import { CurrentAdmin } from "./current-admin";

const currentAdmin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "管理员",
  permissions: ["*"]
};

describe("AdminOperationsService check-in", () => {
  it("verifies, rejects duplicate verification, and revokes check-in", async () => {
    const prisma = createPrismaMock();
    const service = new AdminOperationsService(prisma);

    const verified = await service.verifyCheckin({ credentialCode: "REG001" }, currentAdmin);
    assert.equal(verified.data.checkInStatus, CheckInStatus.CHECKED_IN);
    assert.equal(prisma.checkinLogs[0]?.action, CheckinActionType.VERIFY);

    await assert.rejects(() => service.verifyCheckin({ credentialCode: "REG001" }, currentAdmin), ConflictException);

    const revoked = await service.revokeCheckin("attendee-1", currentAdmin);
    assert.equal(revoked.data.checkInStatus, CheckInStatus.PENDING);
    assert.equal(prisma.checkinLogs[1]?.action, CheckinActionType.REVOKE);

    await assert.rejects(() => service.revokeCheckin("attendee-1", currentAdmin), ConflictException);
  });

  it("rejects check-in when the conference does not require verification", async () => {
    const prisma = createPrismaMock({ checkInEnabled: false });
    const service = new AdminOperationsService(prisma);

    await assert.rejects(() => service.verifyCheckin({ credentialCode: "REG001" }, currentAdmin), ConflictException);
  });
});

describe("AdminOperationsService refunds", () => {
  it("creates an idempotent refund request and approves it once", async () => {
    const prisma = createPrismaMock();
    const service = new AdminOperationsService(prisma);
    const restore = withEnv("REFUND_ENABLED", "true");

    try {
      const created = await service.createRefund({ orderNo: "ORDER001", amountCent: 5000, reason: "用户申请" }, currentAdmin);
      const repeated = await service.createRefund({ orderNo: "ORDER001", amountCent: 5000, reason: "重复点击" }, currentAdmin);
      const createdData = created.data as Record<string, unknown>;
      const repeatedData = repeated.data as Record<string, unknown>;
      assert.equal(createdData.id, repeatedData.id);
      assert.equal(prisma.refunds.length, 1);

      const approved = await service.approveRefund(String(createdData.id), currentAdmin);
      assert.equal(approved.data.status, RefundStatus.APPROVED);
      assert.equal(approved.data.provider, PaymentProvider.WECHAT);

      const approvedAgain = await service.approveRefund(String(createdData.id), currentAdmin);
      assert.equal(approvedAgain.data.status, RefundStatus.APPROVED);
      const auditLogs = prisma.auditLogs as AuditRecord[];
      assert.equal(auditLogs.filter((item) => item.summary === "Approve refund").length, 1);
    } finally {
      restore();
    }
  });

  it("skips refund creation when refund feature is disabled", async () => {
    const service = new AdminOperationsService(createPrismaMock());
    const restore = withEnv("REFUND_ENABLED", "false");

    try {
      const response = await service.createRefund({ orderNo: "ORDER001", amountCent: 5000 }, currentAdmin);
      assert.equal(response.data.skippedReason, "REFUND_ENABLED=false");
    } finally {
      restore();
    }
  });

  it("rejects illegal refund transitions", async () => {
    const prisma = createPrismaMock({
      refunds: [
        refundRecord({
          id: "refund-success",
          status: RefundStatus.SUCCESS
        })
      ]
    });
    const service = new AdminOperationsService(prisma);

    await assert.rejects(() => service.approveRefund("refund-success", currentAdmin), ConflictException);
    await assert.rejects(() => service.rejectRefund("refund-success", { reason: "不通过" }, currentAdmin), ConflictException);
  });
});

function createPrismaMock(options: { checkInEnabled?: boolean; refunds?: RefundRecord[] } = {}) {
  const attendee: AttendeeRecord = {
    id: "attendee-1",
    registrationId: "registration-1",
    skuId: "sku-1",
    name: "张三",
    phone: "13800000000",
    checkInStatus: CheckInStatus.PENDING,
    checkedInAt: null,
    checkedInBy: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z")
  };
  const registration = {
    id: "registration-1",
    registrationNo: "REG001",
    conferenceId: "conference-1",
    conference: { id: "conference-1", checkInEnabled: options.checkInEnabled ?? true },
    attendees: [attendee]
  };
  const order = {
    id: "order-1",
    orderNo: "ORDER001",
    userId: "user-1",
    status: OrderStatus.PAID,
    paidAmountCent: 10000,
    payableAmountCent: 10000
  };
  const refunds: RefundRecord[] = [...(options.refunds ?? [])];
  const auditLogs: AuditRecord[] = [];
  const checkinLogs: CheckinLogRecord[] = [];
  const mock: any = {
    refunds,
    auditLogs,
    checkinLogs,
    registration: {
      findUnique: async ({ where }: { where: { registrationNo: string } }) =>
        where.registrationNo === registration.registrationNo ? registration : null
    },
    registrationAttendee: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        where.id === attendee.id ? { ...attendee, registration: { ...registration, conference: registration.conference } } : null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<AttendeeRecord> }) => {
        if (where.id !== attendee.id) throw new Error("attendee not found");
        Object.assign(attendee, data, { updatedAt: new Date("2026-06-02T00:00:00.000Z") });
        return { ...attendee };
      },
      count: async () => 1
    },
    checkinLog: {
      create: async ({ data }: { data: Omit<CheckinLogRecord, "id" | "createdAt"> }) => {
        checkinLogs.push({ id: `checkin-log-${checkinLogs.length + 1}`, createdAt: new Date("2026-06-02T00:00:00.000Z"), ...data });
      },
      findMany: async () => checkinLogs,
      count: async () => checkinLogs.length
    },
    order: {
      findUnique: async ({ where }: { where: { orderNo: string } }) => (where.orderNo === order.orderNo ? order : null)
    },
    refund: {
      findFirst: async ({ where }: { where: { orderNo: string; status: { in: RefundStatus[] } } }) =>
        refunds.find((item) => item.orderNo === where.orderNo && where.status.in.includes(item.status)) ?? null,
      create: async ({ data }: { data: Omit<RefundRecord, "id" | "createdAt" | "updatedAt" | "requestedAt"> }) => {
        const refund = refundRecord({ id: `refund-${refunds.length + 1}`, ...data });
        refunds.push(refund);
        return refund;
      },
      findUnique: async ({ where }: { where: { id: string } }) => refunds.find((item) => item.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Partial<RefundRecord> }) => {
        const refund = refunds.find((item) => item.id === where.id);
        if (!refund) throw new Error("refund not found");
        Object.assign(refund, data, { updatedAt: new Date("2026-06-02T00:00:00.000Z") });
        return refund;
      },
      findMany: async () => refunds,
      count: async () => refunds.length
    },
    auditLog: {
      create: async ({ data }: { data: AuditRecord }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async <T>(operation: ((tx: typeof mock) => Promise<T>) | Promise<T>[]) =>
      Array.isArray(operation) ? Promise.all(operation) : operation(mock)
  };
  return mock as typeof mock & PrismaService;
}

function refundRecord(overrides: Partial<RefundRecord> = {}): RefundRecord {
  return {
    id: "refund-1",
    refundNo: "RF001",
    orderNo: "ORDER001",
    orderId: "order-1",
    userId: "user-1",
    amountCent: 5000,
    status: RefundStatus.REQUESTED,
    reason: null,
    rejectReason: null,
    provider: null,
    providerRefundId: null,
    requestedAt: new Date("2026-06-01T00:00:00.000Z"),
    approvedAt: null,
    processedAt: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    updatedAt: new Date("2026-06-01T00:00:00.000Z"),
    ...overrides
  };
}

function withEnv(name: string, value: string) {
  const original = process.env[name];
  process.env[name] = value;
  return () => {
    if (typeof original === "undefined") delete process.env[name];
    else process.env[name] = original;
  };
}

interface AttendeeRecord {
  id: string;
  registrationId: string;
  skuId: string;
  name: string;
  phone: string;
  checkInStatus: CheckInStatus;
  checkedInAt: Date | null;
  checkedInBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface CheckinLogRecord {
  id: string;
  attendeeId: string;
  registrationId: string;
  action: CheckinActionType;
  beforeStatus: CheckInStatus | null;
  afterStatus: CheckInStatus;
  operatorId: string | null;
  remark?: string;
  createdAt: Date;
}

interface RefundRecord {
  id: string;
  refundNo: string;
  orderNo: string;
  orderId: string | null;
  userId: string | null;
  amountCent: number;
  status: RefundStatus;
  reason: string | null;
  rejectReason: string | null;
  provider: PaymentProvider | null;
  providerRefundId: string | null;
  requestedAt: Date;
  approvedAt: Date | null;
  processedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface AuditRecord {
  adminUserId: string | null;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadataJson?: unknown;
}
