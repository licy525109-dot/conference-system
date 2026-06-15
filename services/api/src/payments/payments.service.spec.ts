import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  CheckInStatus,
  CouponRedemptionStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  RegistrationStatus
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentsService } from "./payments.service";

const now = new Date("2026-06-06T14:50:00.000Z");
const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_user_1",
  nickname: "测试用户"
};

describe("PaymentsService mock confirm", () => {
  it("confirms a pending order and creates payment and registration", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const response = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        orderNo: "REG001",
        orderStatus: "PAID",
        paymentStatus: "SUCCESS",
        registrationId: "registration-1"
      }
    });
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.orders[0]?.paidAmountCent, 100000);
    assert.equal(prisma.orders[0]?.paidAt?.toISOString(), now.toISOString());
    assert.equal(prisma.payments.length, 1);
    assert.equal(prisma.payments[0]?.outTradeNo, "MOCK_REG001");
    assert.equal(prisma.payments[0]?.status, PaymentStatus.SUCCESS);
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.registrations[0]?.status, RegistrationStatus.CONFIRMED);
    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.registrationAttendees[0]?.checkInStatus, CheckInStatus.NOT_REQUIRED);
    assert.equal(prisma.registrations[0]?.attendeeName, "快照姓名");
    assert.equal(prisma.registrations[0]?.phone, "13900000000");
    assert.deepEqual(prisma.registrations[0]?.formDataJson, {
      name: "快照姓名",
      phone: "13900000000"
    });
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("is idempotent for repeated mock confirm", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const first = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);
    const second = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(first.data.registrationId, second.data.registrationId);
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.payments.length, 1);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("creates a pending check-in attendee when conference check-in is enabled", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({ checkInEnabled: true });
    const service = createService(prisma);

    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(prisma.registrationAttendees.length, 1);
    assert.equal(prisma.registrationAttendees[0]?.checkInStatus, CheckInStatus.PENDING);
  });

  it("marks pending coupon redemptions used without recalculating the paid amount", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({
      couponRedemptions: [
        {
          couponId: "coupon-1",
          orderId: "order-REG001",
          userId: currentUser.id,
          status: CouponRedemptionStatus.PENDING,
          usedAt: null
        }
      ]
    });
    const service = createService(prisma);

    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(prisma.orders[0]?.paidAmountCent, 100000);
    assert.equal(prisma.couponRedemptions[0]?.status, CouponRedemptionStatus.USED);
    assert.equal(prisma.couponRedemptions[0]?.usedAt?.toISOString(), now.toISOString());
  });

  it("does not increment soldCount when registration creation hits an orderId unique conflict", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock({
      initialSoldCount: 1,
      simulateRegistrationCreateConflict: true
    });
    const service = createService(prisma);

    const response = await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    assert.equal(response.data.registrationId, "registration-race");
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("hides orders that do not belong to current user", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_OTHER_USER" }, currentUser), NotFoundException);
  });

  it("returns 404 for missing orders", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "MISSING" }, currentUser), NotFoundException);
  });

  it("rejects cancelled, closed, and refunded orders", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_CANCELLED" }, currentUser), ConflictException);
    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_CLOSED" }, currentUser), ConflictException);
    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_REFUNDED" }, currentUser), ConflictException);
  });

  it("rejects expired orders without closing them", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_EXPIRED" }, currentUser), ConflictException);

    const expiredOrder = prisma.orders.find((order) => order.orderNo === "REG_EXPIRED");
    assert.equal(expiredOrder?.status, OrderStatus.PENDING);
  });

  it("rejects when mock payment mode is disabled", async () => {
    process.env.PAYMENT_MODE = "real";
    process.env.WECHAT_PAY_MOCK = "false";
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG001" }, currentUser), ForbiddenException);
  });

  it("rejects orders missing registration snapshot", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG_NO_SNAPSHOT" }, currentUser), ConflictException);
  });

  it("requires login for mock confirm", async () => {
    withMockPaymentMode();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.confirmMockPayment({ orderNo: "REG001" }, undefined), UnauthorizedException);
  });
});

describe("PaymentsService payment status", () => {
  it("returns payment status with registrationId for current user", async () => {
    withMockPaymentMode();
    const prisma = createPrismaMock();
    const service = createService(prisma);
    await service.confirmMockPayment({ orderNo: "REG001" }, currentUser);

    const response = await service.getPaymentStatus("REG001", currentUser);

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        orderNo: "REG001",
        status: OrderStatus.PAID,
        paidAt: now.toISOString(),
        paymentProvider: PaymentProvider.MOCK,
        paymentStatus: PaymentStatus.SUCCESS,
        registrationId: "registration-1"
      }
    });
  });

  it("hides payment status for other users' orders", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.getPaymentStatus("REG_OTHER_USER", currentUser), NotFoundException);
  });

  it("requires login for payment status", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.getPaymentStatus("REG001", undefined), UnauthorizedException);
  });
});

function withMockPaymentMode(): void {
  process.env.PAYMENT_MODE = "mock";
  process.env.WECHAT_PAY_MOCK = "true";
}

function createService(prisma: PrismaService): PaymentsService {
  class TestPaymentsService extends PaymentsService {
    protected override getCurrentTime(): Date {
      return now;
    }
  }

  return new TestPaymentsService(prisma);
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const orders: OrderRecord[] = [
    createOrder("REG001", currentUser.id, OrderStatus.PENDING),
    createOrder("REG_OTHER_USER", "user-2", OrderStatus.PENDING),
    createOrder("REG_CANCELLED", currentUser.id, OrderStatus.CANCELLED),
    createOrder("REG_CLOSED", currentUser.id, OrderStatus.CLOSED),
    createOrder("REG_REFUNDED", currentUser.id, OrderStatus.REFUNDED),
    createOrder("REG_EXPIRED", currentUser.id, OrderStatus.PENDING, {
      expiredAt: new Date("2026-06-06T14:00:00.000Z")
    }),
    createOrder("REG_NO_SNAPSHOT", currentUser.id, OrderStatus.PENDING, {
      registrationSnapshotJson: null
    })
  ];
  const payments: PaymentRecord[] = [];
  const registrations: RegistrationRecord[] = [];
  const registrationAttendees: RegistrationAttendeeRecord[] = [];
  const couponRedemptions: CouponRedemptionRecord[] = [...(options.couponRedemptions ?? [])];
  const skus: SkuRecord[] = [{ id: "sku-1", soldCount: options.initialSoldCount ?? 0 }];

  const mock: PrismaMockShape = {
    orders,
    payments,
    registrations,
    registrationAttendees,
    couponRedemptions,
    skus,
    order: {
      findFirst: async (args: OrderFindFirstArgs) => {
        const order = findOwnedOrder(orders, args.where.orderNo, args.where.userId);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments, options.checkInEnabled ?? false) : null;
      },
      findUnique: async (args: OrderFindUniqueArgs) => {
        const order = orders.find((item) => item.orderNo === args.where.orderNo);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments, options.checkInEnabled ?? false) : null;
      },
      update: async (args: OrderUpdateArgs) => {
        const order = orders.find((item) => item.id === args.where.id);
        assert.ok(order);
        Object.assign(order, args.data);
      }
    },
    payment: {
      upsert: async (args: PaymentUpsertArgs) => {
        const payment = payments.find((item) => item.outTradeNo === args.where.outTradeNo);
        if (payment) {
          Object.assign(payment, args.update);
          return payment;
        }

        const created = {
          id: `payment-${payments.length + 1}`,
          ...args.create
        };
        payments.push(created);
        return created;
      }
    },
    registration: {
      findUnique: async (args: RegistrationFindUniqueArgs) => {
        const registration = registrations.find((item) => item.orderId === args.where.orderId);
        return registration ? { id: registration.id } : null;
      },
      create: async (args: RegistrationCreateArgs) => {
        if (options.simulateRegistrationCreateConflict) {
          registrations.push({
            id: "registration-race",
            ...args.data
          });
          throw { code: "P2002" };
        }

        if (registrations.some((item) => item.orderId === args.data.orderId)) {
          throw { code: "P2002" };
        }

        const created = {
          id: `registration-${registrations.length + 1}`,
          ...args.data
        };
        registrations.push(created);
        return { id: created.id };
      }
    },
    registrationAttendee: {
      create: async (args: RegistrationAttendeeCreateArgs) => {
        registrationAttendees.push({
          id: `registration-attendee-${registrationAttendees.length + 1}`,
          ...args.data
        });
      }
    },
    registrationSku: {
      update: async (args: SkuUpdateArgs) => {
        const sku = skus.find((item) => item.id === args.where.id);
        assert.ok(sku);
        sku.soldCount += args.data.soldCount.increment;
      }
    },
    couponRedemption: {
      updateMany: async (args: CouponRedemptionUpdateManyArgs) => {
        for (const redemption of couponRedemptions) {
          if (redemption.orderId === args.where.orderId && redemption.status === args.where.status) {
            redemption.status = args.data.status;
            redemption.usedAt = args.data.usedAt;
          }
        }
      }
    },
    $transaction: async <TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>) => operation(mock)
  };

  return mock as PrismaMockShape & PrismaService;
}

function createOrder(orderNo: string, userId: string, status: OrderStatus, overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: `order-${orderNo}`,
    orderNo,
    userId,
    conferenceId: "conf-1",
    skuId: "sku-1",
    payableAmountCent: 100000,
    paidAmountCent: null,
    status,
    expiredAt: new Date("2026-06-06T15:00:00.000Z"),
    paidAt: null,
    registrationSnapshotJson: {
      conferenceId: "conf-1",
      skuId: "sku-1",
      skuName: "住宿+参会",
      attendeeName: "快照姓名",
      phone: "13900000000",
      formData: {
        name: "快照姓名",
        phone: "13900000000"
      }
    },
    ...overrides
  };
}

function findOwnedOrder(orders: OrderRecord[], orderNo: string, userId: string): OrderRecord | undefined {
  return orders.find((order) => order.orderNo === orderNo && order.userId === userId);
}

function toOrderRead(
  order: OrderRecord,
  registrations: RegistrationRecord[],
  registrationAttendees: RegistrationAttendeeRecord[],
  payments: PaymentRecord[] = [],
  checkInEnabled = false
) {
  const registration = registrations.find((item) => item.orderId === order.id);
  return {
    id: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    conferenceId: order.conferenceId,
    skuId: order.skuId,
    payableAmountCent: order.payableAmountCent,
    status: order.status,
    expiredAt: order.expiredAt,
    registrationSnapshotJson: order.registrationSnapshotJson,
    paidAt: order.paidAt,
    conference: {
      checkInEnabled
    },
    payments: payments.filter((payment) => payment.orderId === order.id).map((payment) => ({ provider: payment.provider, status: payment.status })),
    registration: registration
      ? {
          id: registration.id,
          skuId: registration.skuId,
          attendeeName: registration.attendeeName,
          phone: registration.phone,
          formDataJson: registration.formDataJson,
          attendees: registrationAttendees
            .filter((attendee) => attendee.registrationId === registration.id)
            .map((attendee) => ({ id: attendee.id }))
        }
      : null
  };
}

interface PrismaMockOptions {
  initialSoldCount?: number;
  simulateRegistrationCreateConflict?: boolean;
  checkInEnabled?: boolean;
  couponRedemptions?: CouponRedemptionRecord[];
}

interface PrismaMockShape {
  orders: OrderRecord[];
  payments: PaymentRecord[];
  registrations: RegistrationRecord[];
  registrationAttendees: RegistrationAttendeeRecord[];
  couponRedemptions: CouponRedemptionRecord[];
  skus: SkuRecord[];
  order: {
    findFirst(args: OrderFindFirstArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    findUnique(args: OrderFindUniqueArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    update(args: OrderUpdateArgs): Promise<void>;
  };
  payment: {
    upsert(args: PaymentUpsertArgs): Promise<PaymentRecord>;
  };
  registration: {
    findUnique(args: RegistrationFindUniqueArgs): Promise<{ id: string } | null>;
    create(args: RegistrationCreateArgs): Promise<{ id: string }>;
  };
  registrationAttendee: {
    create(args: RegistrationAttendeeCreateArgs): Promise<void>;
  };
  registrationSku: {
    update(args: SkuUpdateArgs): Promise<void>;
  };
  couponRedemption: {
    updateMany(args: CouponRedemptionUpdateManyArgs): Promise<void>;
  };
  $transaction<TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>): Promise<TResult>;
}

interface OrderRecord {
  id: string;
  orderNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  payableAmountCent: number;
  paidAmountCent: number | null;
  status: OrderStatus;
  expiredAt: Date | null;
  paidAt: Date | null;
  registrationSnapshotJson: unknown;
}

interface PaymentRecord {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  outTradeNo: string;
  amountCent: number;
  paidAt: Date | null;
  failedReason?: string | null;
}

interface RegistrationRecord {
  id: string;
  registrationNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  orderId: string;
  attendeeName: string;
  phone: string;
  formDataJson: unknown;
  paidAmountCent: number;
  status: RegistrationStatus;
  confirmedAt: Date;
}

interface RegistrationAttendeeRecord {
  id: string;
  registrationId: string;
  skuId: string;
  name: string;
  phone: string;
  company?: string;
  title?: string;
  formDataJson: unknown;
  checkInStatus: CheckInStatus;
}

interface SkuRecord {
  id: string;
  soldCount: number;
}

interface CouponRedemptionRecord {
  couponId: string;
  orderId: string;
  userId: string | null;
  status: CouponRedemptionStatus;
  usedAt: Date | null;
}

interface OrderFindFirstArgs {
  where: {
    orderNo: string;
    userId: string;
  };
}

interface OrderFindUniqueArgs {
  where: {
    orderNo: string;
  };
}

interface OrderUpdateArgs {
  where: {
    id: string;
  };
  data: Partial<Pick<OrderRecord, "status" | "paidAmountCent" | "paidAt">>;
}

interface PaymentUpsertArgs {
  where: {
    outTradeNo: string;
  };
  update: Partial<PaymentRecord>;
  create: Omit<PaymentRecord, "id">;
}

interface RegistrationFindUniqueArgs {
  where: {
    orderId: string;
  };
}

interface RegistrationCreateArgs {
  data: Omit<RegistrationRecord, "id">;
}

interface RegistrationAttendeeCreateArgs {
  data: Omit<RegistrationAttendeeRecord, "id">;
}

interface SkuUpdateArgs {
  where: {
    id: string;
  };
  data: {
    soldCount: {
      increment: number;
    };
  };
}

interface CouponRedemptionUpdateManyArgs {
  where: {
    orderId: string;
    status: CouponRedemptionStatus;
  };
  data: {
    status: CouponRedemptionStatus;
    usedAt: Date;
  };
}
