import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { CheckInStatus, OrderStatus, PaymentProvider, PaymentStatus, RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentSuccessService } from "./payment-success.service";
import { WechatPayNotifyVerifier, WechatPayHeaders } from "./wechat-pay.notify-verifier";
import { WechatPayService } from "./wechat-pay.service";
import { WechatPaySigner } from "./wechat-pay.signer";

const now = new Date("2026-06-06T15:20:00.000Z");
const successTime = "2026-06-06T15:21:00.000Z";
const readableTestKeyPath = fileURLToPath(new URL("../../../../package.json", import.meta.url));
const currentUser: CurrentUser = {
  id: "user-1",
  openid: "real-openid-1",
  nickname: "真实用户"
};

describe("WechatPayService prepay", () => {
  it("creates a pending WeChat payment for the current user's pending order using server amount", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const response = await service.prepay({ orderNo: "REG001", payableAmountCent: 1 }, currentUser);

    assert.deepEqual(response, {
      orderNo: "REG001",
      outTradeNo: "WECHAT_REG001",
      timeStamp: "1700000000",
      nonceStr: "nonce-test",
      package: "prepay_id=prepay-test",
      signType: "RSA",
      paySign: "pay-sign-test"
    });
    assert.equal(prisma.payments.length, 1);
    assert.equal(prisma.payments[0]?.provider, PaymentProvider.WECHAT);
    assert.equal(prisma.payments[0]?.status, PaymentStatus.PENDING);
    assert.equal(prisma.payments[0]?.amountCent, 100000);
    assert.equal(service.lastPrepayBody?.amount?.total, 100000);
  });

  it("only prepays the current user's own order", async () => {
    withWechatPayConfig();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.prepay({ orderNo: "REG_OTHER_USER" }, currentUser), NotFoundException);
  });

  it("rejects mock openid for real WeChat prepay", async () => {
    withWechatPayConfig();
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.prepay({ orderNo: "REG_MOCK_OPENID" }, currentUser),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.message, "当前订单未绑定有效微信身份，请重新下单支付。");
        return true;
      }
    );
  });

  it("returns a clear error when real WeChat Pay is disabled", async () => {
    withWechatPayConfig();
    process.env.WECHAT_PAY_MODE = "mock";
    process.env.WECHAT_PAY_ENABLED = "true";
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.prepay({ orderNo: "REG001" }, currentUser), ForbiddenException);
  });

  it("returns a configuration error when required config is missing", async () => {
    withWechatPayConfig();
    delete process.env.WECHAT_PAY_APP_ID;
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.prepay({ orderNo: "REG001" }, currentUser), InternalServerErrorException);
  });
});

describe("WechatPayService notify", () => {
  it("marks order paid, payment success, and registration confirmed", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = createService(prisma);

    const response = await service.handleNotify(createNotifyInput());

    assert.deepEqual(response, { code: "SUCCESS", message: "OK" });
    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.orders[0]?.paidAmountCent, 100000);
    assert.equal(prisma.payments[0]?.status, PaymentStatus.SUCCESS);
    assert.equal(prisma.payments[0]?.transactionId, "wx-transaction-1");
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.registrations[0]?.status, RegistrationStatus.CONFIRMED);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("is idempotent for duplicate success notifications", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = createService(prisma);

    await service.handleNotify(createNotifyInput());
    await service.handleNotify(createNotifyInput());

    assert.equal(prisma.orders[0]?.status, OrderStatus.PAID);
    assert.equal(prisma.registrations.length, 1);
    assert.equal(prisma.skus[0]?.soldCount, 1);
  });

  it("rejects amount mismatch without updating local state", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = createService(prisma, {
      amountTotal: 1
    });

    await assert.rejects(() => service.handleNotify(createNotifyInput()), ConflictException);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PENDING);
    assert.equal(prisma.payments[0]?.status, PaymentStatus.PENDING);
    assert.equal(prisma.registrations.length, 0);
    assert.equal(prisma.skus[0]?.soldCount, 0);
  });

  it("rejects invalid signature without updating local state", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = createService(prisma, {
      signatureValid: false
    });

    await assert.rejects(() => service.handleNotify(createNotifyInput()), UnauthorizedException);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PENDING);
    assert.equal(prisma.payments[0]?.status, PaymentStatus.PENDING);
    assert.equal(prisma.registrations.length, 0);
    assert.equal(prisma.skus[0]?.soldCount, 0);
  });

  it("rejects decrypt failure without updating local state", async () => {
    withWechatPayConfig();
    const prisma = createPrismaMock({ withWechatPayment: true });
    const service = createService(prisma, {
      decryptFails: true
    });

    await assert.rejects(() => service.handleNotify(createNotifyInput()), BadRequestException);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PENDING);
    assert.equal(prisma.payments[0]?.status, PaymentStatus.PENDING);
    assert.equal(prisma.registrations.length, 0);
    assert.equal(prisma.skus[0]?.soldCount, 0);
  });

  it("rejects notifications that do not match a local payment", async () => {
    withWechatPayConfig();
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.handleNotify(createNotifyInput()), NotFoundException);
  });
});

function withWechatPayConfig(): void {
  process.env.WECHAT_PAY_MODE = "real";
  process.env.WECHAT_PAY_ENABLED = "true";
  process.env.WECHAT_PAY_APP_ID = "wx-real-app";
  process.env.WECHAT_PAY_MCH_ID = "1900000001";
  process.env.WECHAT_PAY_MCH_SERIAL_NO = "merchant-serial";
  process.env.WECHAT_PAY_API_V3_KEY = "12345678901234567890123456789012";
  process.env.WECHAT_PAY_PRIVATE_KEY_PATH = readableTestKeyPath;
  process.env.WECHAT_PAY_NOTIFY_URL = "https://example.com/api/payments/wechat/notify";
  process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH = readableTestKeyPath;
}

function createService(prisma: PrismaMockShape & PrismaService, options: NotifyOptions = {}) {
  const paymentSuccessService = new PaymentSuccessService(prisma);
  const signer = new FakeWechatPaySigner();
  const notifyVerifier = new FakeWechatPayNotifyVerifier(options);

  class TestWechatPayService extends WechatPayService {
    lastPrepayBody: Record<string, any> | null = null;

    protected override getCurrentTime(): Date {
      return now;
    }

    protected override async createJsapiPrepay(input: { body: Record<string, any> }): Promise<string> {
      this.lastPrepayBody = input.body;
      return "prepay-test";
    }
  }

  return new TestWechatPayService(prisma, paymentSuccessService, signer, notifyVerifier);
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const orders: OrderRecord[] = [
    createOrder("REG001", currentUser.id, "real-openid-1"),
    createOrder("REG_OTHER_USER", "user-2", "real-openid-2"),
    createOrder("REG_MOCK_OPENID", currentUser.id, "mock_user_1")
  ];
  const payments: PaymentRecord[] = options.withWechatPayment
    ? [
        {
          id: "payment-1",
          orderId: "order-REG001",
          provider: PaymentProvider.WECHAT,
          status: PaymentStatus.PENDING,
          outTradeNo: "WECHAT_REG001",
          amountCent: 100000,
          paidAt: null
        }
      ]
    : [];
  const registrations: RegistrationRecord[] = [];
  const registrationAttendees: RegistrationAttendeeRecord[] = [];
  const skus: SkuRecord[] = [{ id: "sku-1", soldCount: 0 }];

  const mock: PrismaMockShape = {
    orders,
    payments,
    registrations,
    registrationAttendees,
    skus,
    order: {
      findFirst: async (args) => {
        const order = orders.find((item) => item.orderNo === args.where.orderNo && item.userId === args.where.userId);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments) : null;
      },
      findUnique: async (args) => {
        const order = orders.find((item) => item.orderNo === args.where.orderNo);
        return order ? toOrderRead(order, registrations, registrationAttendees, payments) : null;
      },
      update: async (args) => {
        const order = orders.find((item) => item.id === args.where.id);
        assert.ok(order);
        Object.assign(order, args.data);
      }
    },
    payment: {
      findUnique: async (args) => {
        const payment = payments.find((item) => item.outTradeNo === args.where.outTradeNo);
        if (!payment) {
          return null;
        }
        const order = orders.find((item) => item.id === payment.orderId);
        assert.ok(order);
        return {
          outTradeNo: payment.outTradeNo,
          order: {
            orderNo: order.orderNo,
            payableAmountCent: order.payableAmountCent
          }
        };
      },
      upsert: async (args) => {
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
      findUnique: async (args) => {
        const registration = registrations.find((item) => item.orderId === args.where.orderId);
        return registration ? { id: registration.id } : null;
      },
      create: async (args) => {
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
      create: async (args) => {
        registrationAttendees.push({
          id: `registration-attendee-${registrationAttendees.length + 1}`,
          ...args.data
        });
      }
    },
    registrationSku: {
      update: async (args) => {
        const sku = skus.find((item) => item.id === args.where.id);
        assert.ok(sku);
        sku.soldCount += args.data.soldCount.increment;
      }
    },
    $transaction: async (operation) => operation(mock)
  };

  return mock as PrismaMockShape & PrismaService;
}

function createOrder(orderNo: string, userId: string, openid: string): OrderRecord {
  return {
    id: `order-${orderNo}`,
    orderNo,
    userId,
    openid,
    conferenceId: "conf-1",
    conferenceTitle: "测试会议",
    skuId: "sku-1",
    payableAmountCent: 100000,
    paidAmountCent: null,
    status: OrderStatus.PENDING,
    expiredAt: new Date("2026-06-06T16:00:00.000Z"),
    paidAt: null,
    registrationSnapshotJson: {
      conferenceId: "conf-1",
      skuId: "sku-1",
      attendeeName: "快照姓名",
      phone: "13900000000",
      formData: {
        name: "快照姓名",
        phone: "13900000000"
      }
    }
  };
}

function toOrderRead(
  order: OrderRecord,
  registrations: RegistrationRecord[],
  registrationAttendees: RegistrationAttendeeRecord[],
  payments: PaymentRecord[]
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
      title: order.conferenceTitle,
      checkInEnabled: false
    },
    user: {
      openid: order.openid
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

function createNotifyInput() {
  return {
    body: {
      id: "notify-1",
      event_type: "TRANSACTION.SUCCESS",
      resource_type: "encrypt-resource",
      resource: {
        algorithm: "AEAD_AES_256_GCM",
        ciphertext: "ciphertext",
        nonce: "nonce"
      }
    },
    rawBody: Buffer.from("{}", "utf8"),
    headers: {
      timestamp: "1700000000",
      nonce: "nonce",
      signature: "signature",
      serial: "serial"
    }
  };
}

class FakeWechatPaySigner extends WechatPaySigner {
  override createRequestPaymentParams() {
    return {
      timeStamp: "1700000000",
      nonceStr: "nonce-test",
      package: "prepay_id=prepay-test",
      signType: "RSA" as const,
      paySign: "pay-sign-test"
    };
  }
}

class FakeWechatPayNotifyVerifier extends WechatPayNotifyVerifier {
  constructor(private readonly options: NotifyOptions) {
    super();
  }

  override verifySignature(_input: { headers: WechatPayHeaders; rawBody: Buffer }): void {
    if (this.options.signatureValid === false) {
      throw new UnauthorizedException("Invalid WeChat Pay notify signature");
    }
  }

  override decryptResource(): Record<string, unknown> {
    if (this.options.decryptFails) {
      throw new BadRequestException("WeChat Pay resource decrypt failed");
    }

    return {
      out_trade_no: "WECHAT_REG001",
      transaction_id: "wx-transaction-1",
      trade_state: "SUCCESS",
      amount: {
        total: this.options.amountTotal ?? 100000
      },
      success_time: successTime
    };
  }
}

interface NotifyOptions {
  amountTotal?: number;
  decryptFails?: boolean;
  signatureValid?: boolean;
}

interface PrismaMockOptions {
  withWechatPayment?: boolean;
}

interface PrismaMockShape {
  orders: OrderRecord[];
  payments: PaymentRecord[];
  registrations: RegistrationRecord[];
  registrationAttendees: RegistrationAttendeeRecord[];
  skus: SkuRecord[];
  order: {
    findFirst(args: OrderFindFirstArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    findUnique(args: OrderFindUniqueArgs): Promise<ReturnType<typeof toOrderRead> | null>;
    update(args: OrderUpdateArgs): Promise<void>;
  };
  payment: {
    findUnique(args: PaymentFindUniqueArgs): Promise<PaymentFindUniqueResult | null>;
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
  $transaction<TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>): Promise<TResult>;
}

interface OrderRecord {
  id: string;
  orderNo: string;
  userId: string;
  openid: string;
  conferenceId: string;
  conferenceTitle: string;
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
  transactionId?: string | null;
  failedReason?: string | null;
  notifyRawId?: string | null;
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

interface PaymentFindUniqueArgs {
  where: {
    outTradeNo: string;
  };
}

interface PaymentFindUniqueResult {
  outTradeNo: string;
  order: {
    orderNo: string;
    payableAmountCent: number;
  };
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
