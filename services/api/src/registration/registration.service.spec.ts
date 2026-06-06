import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConferenceStatus, FormFieldType, OrderStatus, RegistrationSkuStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { RegistrationService } from "./registration.service";

const now = new Date("2026-06-06T12:00:00.000Z");
const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_dev-user-001",
  nickname: "测试用户"
};

describe("RegistrationService quote", () => {
  it("returns a quote from server-side SKU price", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const response = await service.quote({
      conferenceId: "published-conf",
      skuId: "active-sku",
      quantity: 1
    });

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        conferenceId: "published-conf",
        skuId: "active-sku",
        skuName: "Active SKU",
        quantity: 1,
        originAmountCent: 100000,
        discountAmountCent: 0,
        payableAmountCent: 100000
      }
    });
    assert.equal(prisma.lastConferenceFindFirstArgs?.where.status, ConferenceStatus.PUBLISHED);
    assert.equal(prisma.lastSkuFindFirstArgs?.where.conferenceId, "published-conf");
  });

  it("rejects non-published conferences", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "draft-conf", skuId: "active-sku", quantity: 1 }),
      NotFoundException
    );
  });

  it("rejects inactive SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "inactive-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects SKUs that do not belong to the conference", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "other-conf-sku", quantity: 1 }),
      NotFoundException
    );
  });

  it("rejects out-of-stock SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "sold-out-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects quantity values other than 1", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 2 }),
      BadRequestException
    );
  });

  it("rejects client-supplied amount fields", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () =>
        service.quote({
          conferenceId: "published-conf",
          skuId: "active-sku",
          quantity: 1,
          payableAmountCent: 1
        }),
      BadRequestException
    );
  });

  it("rejects SKUs before saleStartAt", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "future-sale-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects SKUs after saleEndAt", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "ended-sale-sku", quantity: 1 }),
      ConflictException
    );
  });
});

describe("RegistrationService create order", () => {
  it("rejects unauthenticated order creation", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(() => service.createOrder(validOrderInput(), undefined), UnauthorizedException);
  });

  it("creates a pending order and order item without creating payment or registration", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma, ["REG202606060001"]);
    const soldCountBefore = getSku("active-sku").soldCount;

    const response = await service.createOrder(validOrderInput(), currentUser);

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        orderNo: "REG202606060001",
        status: "PENDING",
        conferenceId: "published-conf",
        skuId: "active-sku",
        skuName: "Active SKU",
        quantity: 1,
        originAmountCent: 100000,
        discountAmountCent: 0,
        payableAmountCent: 100000,
        expiredAt: "2026-06-06T12:15:00.000Z"
      }
    });
    assert.equal(prisma.orders.length, 1);
    assert.equal(prisma.orderItems.length, 1);
    assert.equal(prisma.orders[0]?.status, OrderStatus.PENDING);
    assert.equal(prisma.orders[0]?.userId, currentUser.id);
    assert.equal(prisma.orders[0]?.originAmountCent, 100000);
    assert.equal(prisma.orders[0]?.payableAmountCent, 100000);
    assert.equal(prisma.orders[0]?.attendeeName, "张三");
    assert.equal(prisma.orders[0]?.phone, "13800000000");
    assert.deepEqual(prisma.orders[0]?.registrationSnapshotJson, {
      conferenceId: "published-conf",
      skuId: "active-sku",
      skuName: "Active SKU",
      attendeeName: "张三",
      phone: "13800000000",
      formData: {
        name: "张三",
        phone: "13800000000",
        company: "某某公司",
        position: "总经理"
      }
    });
    assert.equal(prisma.orderItems[0]?.unitPriceCent, 100000);
    assert.equal(prisma.orderItems[0]?.totalAmountCent, 100000);
    assert.equal(prisma.registrations.length, 0);
    assert.equal(prisma.payments.length, 0);
    assert.equal(getSku("active-sku").soldCount, soldCountBefore);
  });

  it("re-reads SKU price when creating an order", async () => {
    const prisma = createPrismaMock({
      skuOverrides: {
        "active-sku": {
          priceCent: 123456
        }
      }
    });
    const service = createService(prisma, ["REG202606060002"]);

    const response = await service.createOrder(validOrderInput(), currentUser);

    assert.equal(response.data.originAmountCent, 123456);
    assert.equal(response.data.payableAmountCent, 123456);
    assert.equal(prisma.orderItems[0]?.unitPriceCent, 123456);
  });

  it("rejects client-supplied payableAmountCent", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), payableAmountCent: 1 }, currentUser),
      BadRequestException
    );
  });

  it("rejects non-published conferences", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), conferenceId: "draft-conf" }, currentUser),
      NotFoundException
    );
  });

  it("rejects inactive SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), skuId: "inactive-sku" }, currentUser),
      ConflictException
    );
  });

  it("rejects SKUs that do not belong to the conference", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), skuId: "other-conf-sku" }, currentUser),
      NotFoundException
    );
  });

  it("rejects out-of-stock SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), skuId: "sold-out-sku" }, currentUser),
      ConflictException
    );
  });

  it("rejects quantity values other than 1", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.createOrder({ ...validOrderInput(), quantity: 2 }, currentUser),
      BadRequestException
    );
  });

  it("rejects missing required form fields", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput();
    delete (input.formData as Partial<typeof input.formData>).name;

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("rejects invalid phone values", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput({
      phone: "123"
    });

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("rejects invalid email values", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput({
      email: "invalid-email"
    });

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("rejects SELECT values outside optionsJson", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput({
      ticketType: "not-allowed"
    });

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("rejects RADIO values outside optionsJson", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput({
      meal: "not-allowed"
    });

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("rejects unknown formData fields", async () => {
    const service = createService(createPrismaMock());
    const input = validOrderInput({
      unexpected: "nope"
    });

    await assert.rejects(() => service.createOrder(input, currentUser), BadRequestException);
  });

  it("retries when generated orderNo conflicts", async () => {
    const prisma = createPrismaMock({
      conflictingOrderNos: ["REG202606060001"]
    });
    const service = createService(prisma, ["REG202606060001", "REG202606060002"]);

    const response = await service.createOrder(validOrderInput(), currentUser);

    assert.equal(response.data.orderNo, "REG202606060002");
    assert.equal(prisma.orders.length, 1);
  });
});

function createService(prisma: PrismaService, orderNos: string[] = ["REG202606060001"]): RegistrationService {
  class TestRegistrationService extends RegistrationService {
    private orderNoIndex = 0;

    protected override getCurrentTime(): Date {
      return now;
    }

    protected override generateOrderNo(): string {
      return orderNos[this.orderNoIndex++] ?? `REG20260606FALLBACK${this.orderNoIndex}`;
    }
  }

  return new TestRegistrationService(prisma);
}

function validOrderInput(formDataOverrides: Record<string, unknown> = {}) {
  return {
    conferenceId: "published-conf",
    skuId: "active-sku",
    quantity: 1,
    formData: {
      name: "张三",
      phone: "13800000000",
      company: "某某公司",
      position: "总经理",
      ...formDataOverrides
    }
  };
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const localSkus = skus.map((sku) => ({
    ...sku,
    ...(options.skuOverrides?.[sku.id] ?? {})
  }));
  const conflictingOrderNos = new Set(options.conflictingOrderNos ?? []);
  const orders: OrderRecord[] = [];
  const orderItems: OrderItemRecord[] = [];
  const registrations: unknown[] = [];
  const payments: unknown[] = [];

  const mock: PrismaMockShape = {
    orders,
    orderItems,
    registrations,
    payments,
    lastConferenceFindFirstArgs: undefined as ConferenceFindFirstArgs | undefined,
    lastSkuFindFirstArgs: undefined as SkuFindFirstArgs | undefined,
    conference: {
      findFirst: async (args: ConferenceFindFirstArgs) => {
        mock.lastConferenceFindFirstArgs = args;
        const conference = conferences.find(
          (item) => item.id === args.where.id && item.status === args.where.status
        );

        return conference ? { id: conference.id } : null;
      }
    },
    registrationSku: {
      findFirst: async (args: SkuFindFirstArgs) => {
        mock.lastSkuFindFirstArgs = args;
        const sku = localSkus.find(
          (item) => item.id === args.where.id && item.conferenceId === args.where.conferenceId
        );

        if (!sku) {
          return null;
        }

        const { conferenceId, ...response } = sku;
        return response;
      }
    },
    formDefinition: {
      findFirst: async (args: FormDefinitionFindFirstArgs) => {
        const formDefinition = formDefinitions.find(
          (item) =>
            item.conferenceId === args.where.conferenceId &&
            item.conferenceStatus === args.where.conference.status
        );

        if (!formDefinition) {
          return null;
        }

        return {
          fields: formDefinition.fields
            .filter((field) => field.enabled === args.select.fields.where.enabled)
            .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime())
            .map(({ enabled, sortOrder, createdAt, ...field }) => field)
        };
      }
    },
    order: {
      create: async (args: OrderCreateArgs) => {
        const orderNo = args.data.orderNo;
        if (conflictingOrderNos.has(orderNo) || orders.some((order) => order.orderNo === orderNo)) {
          conflictingOrderNos.delete(orderNo);
          throw { code: "P2002" };
        }

        const order = {
          id: `order-${orders.length + 1}`,
          ...args.data
        };
        orders.push(order);
        return {
          id: order.id,
          orderNo: order.orderNo,
          expiredAt: order.expiredAt
        };
      }
    },
    orderItem: {
      create: async (args: OrderItemCreateArgs) => {
        orderItems.push({
          id: `order-item-${orderItems.length + 1}`,
          ...args.data
        });
      }
    },
    registration: {
      create: async () => {
        registrations.push({});
        throw new Error("Registration should not be created while creating a pending order");
      }
    },
    payment: {
      create: async () => {
        payments.push({});
        throw new Error("Payment should not be created while creating a pending order");
      }
    },
    $transaction: async <TResult>(operation: (tx: typeof mock) => Promise<TResult>) => operation(mock)
  };

  return mock as typeof mock & PrismaService;
}

const conferences = [
  {
    id: "published-conf",
    status: ConferenceStatus.PUBLISHED
  },
  {
    id: "draft-conf",
    status: ConferenceStatus.DRAFT
  }
];

const skus = [
  {
    id: "active-sku",
    conferenceId: "published-conf",
    name: "Active SKU",
    priceCent: 100000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "inactive-sku",
    conferenceId: "published-conf",
    name: "Inactive SKU",
    priceCent: 100000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.INACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "other-conf-sku",
    conferenceId: "other-conf",
    name: "Other Conference SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "sold-out-sku",
    conferenceId: "published-conf",
    name: "Sold Out SKU",
    priceCent: 70000,
    stock: 10,
    soldCount: 10,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "future-sale-sku",
    conferenceId: "published-conf",
    name: "Future Sale SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: new Date("2026-06-07T00:00:00.000Z"),
    saleEndAt: null
  },
  {
    id: "ended-sale-sku",
    conferenceId: "published-conf",
    name: "Ended Sale SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: new Date("2026-06-05T23:59:59.000Z")
  }
];

const formDefinitions = [
  {
    conferenceId: "published-conf",
    conferenceStatus: ConferenceStatus.PUBLISHED,
    fields: [
      {
        label: "姓名",
        fieldKey: "name",
        type: FormFieldType.TEXT,
        required: true,
        optionsJson: null,
        enabled: true,
        sortOrder: 1,
        createdAt: new Date("2026-05-01T00:00:00.000Z")
      },
      {
        label: "手机号",
        fieldKey: "phone",
        type: FormFieldType.PHONE,
        required: true,
        optionsJson: null,
        enabled: true,
        sortOrder: 2,
        createdAt: new Date("2026-05-02T00:00:00.000Z")
      },
      {
        label: "公司",
        fieldKey: "company",
        type: FormFieldType.TEXT,
        required: false,
        optionsJson: null,
        enabled: true,
        sortOrder: 3,
        createdAt: new Date("2026-05-03T00:00:00.000Z")
      },
      {
        label: "职位",
        fieldKey: "position",
        type: FormFieldType.TEXT,
        required: false,
        optionsJson: null,
        enabled: true,
        sortOrder: 4,
        createdAt: new Date("2026-05-04T00:00:00.000Z")
      },
      {
        label: "邮箱",
        fieldKey: "email",
        type: FormFieldType.EMAIL,
        required: false,
        optionsJson: null,
        enabled: true,
        sortOrder: 5,
        createdAt: new Date("2026-05-05T00:00:00.000Z")
      },
      {
        label: "票种",
        fieldKey: "ticketType",
        type: FormFieldType.SELECT,
        required: false,
        optionsJson: [{ label: "VIP", value: "vip" }],
        enabled: true,
        sortOrder: 6,
        createdAt: new Date("2026-05-06T00:00:00.000Z")
      },
      {
        label: "餐食",
        fieldKey: "meal",
        type: FormFieldType.RADIO,
        required: false,
        optionsJson: ["standard", "vegetarian"],
        enabled: true,
        sortOrder: 7,
        createdAt: new Date("2026-05-07T00:00:00.000Z")
      },
      {
        label: "隐藏字段",
        fieldKey: "hidden",
        type: FormFieldType.TEXT,
        required: false,
        optionsJson: null,
        enabled: false,
        sortOrder: 8,
        createdAt: new Date("2026-05-08T00:00:00.000Z")
      }
    ]
  }
];

function getSku(id: string) {
  const sku = skus.find((item) => item.id === id);
  assert.ok(sku);
  return sku;
}

interface PrismaMockOptions {
  conflictingOrderNos?: string[];
  skuOverrides?: Record<string, Partial<(typeof skus)[number]>>;
}

interface PrismaMockShape {
  orders: OrderRecord[];
  orderItems: OrderItemRecord[];
  registrations: unknown[];
  payments: unknown[];
  lastConferenceFindFirstArgs: ConferenceFindFirstArgs | undefined;
  lastSkuFindFirstArgs: SkuFindFirstArgs | undefined;
  conference: {
    findFirst(args: ConferenceFindFirstArgs): Promise<{ id: string } | null>;
  };
  registrationSku: {
    findFirst(args: SkuFindFirstArgs): Promise<Omit<(typeof skus)[number], "conferenceId"> | null>;
  };
  formDefinition: {
    findFirst(args: FormDefinitionFindFirstArgs): Promise<{ fields: FormFieldRecord[] } | null>;
  };
  order: {
    create(args: OrderCreateArgs): Promise<{ id: string; orderNo: string; expiredAt: Date }>;
  };
  orderItem: {
    create(args: OrderItemCreateArgs): Promise<void>;
  };
  registration: {
    create(): Promise<never>;
  };
  payment: {
    create(): Promise<never>;
  };
  $transaction<TResult>(operation: (tx: PrismaMockShape) => Promise<TResult>): Promise<TResult>;
}

interface ConferenceFindFirstArgs {
  where: {
    id: string;
    status: ConferenceStatus;
  };
}

interface SkuFindFirstArgs {
  where: {
    id: string;
    conferenceId: string;
  };
}

interface FormDefinitionFindFirstArgs {
  where: {
    conferenceId: string;
    conference: {
      status: ConferenceStatus;
    };
  };
  select: {
    fields: {
      where: {
        enabled: boolean;
      };
    };
  };
}

interface FormFieldRecord {
  label: string;
  fieldKey: string;
  type: FormFieldType;
  required: boolean;
  optionsJson: unknown;
}

interface OrderCreateArgs {
  data: OrderRecordData;
}

interface OrderItemCreateArgs {
  data: Omit<OrderItemRecord, "id">;
}

interface OrderRecord extends OrderRecordData {
  id: string;
}

interface OrderRecordData {
  orderNo: string;
  userId: string;
  conferenceId: string;
  skuId: string;
  originAmountCent: number;
  payableAmountCent: number;
  status: OrderStatus;
  submittedFormJson: Record<string, unknown>;
  registrationSnapshotJson: Record<string, unknown>;
  attendeeName: string;
  phone: string;
  expiredAt: Date;
}

interface OrderItemRecord {
  id: string;
  orderId: string;
  skuId: string;
  skuName: string;
  unitPriceCent: number;
  quantity: number;
  totalAmountCent: number;
}
