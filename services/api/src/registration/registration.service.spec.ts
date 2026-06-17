import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from "@nestjs/common";
import {
  ConferenceStatus,
  CouponRedemptionStatus,
  CouponType,
  DiscountType,
  FormFieldType,
  OrderStatus,
  RegistrationSkuStatus
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { RegistrationService } from "./registration.service";

const now = new Date("2026-06-06T12:00:00.000Z");
const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_dev-user-001",
  nickname: "测试用户"
};
const realCurrentUser: CurrentUser = {
  id: "user-real-1",
  openid: "real-openid-001",
  nickname: "真实用户"
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

  it("quotes quantity values greater than 1 from server-side SKU price", async () => {
    const service = createService(createPrismaMock());

    const response = await service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 2 });

    assert.equal(response.data.quantity, 2);
    assert.equal(response.data.originAmountCent, 200000);
    assert.equal(response.data.payableAmountCent, 200000);
  });

  it("applies active member fixed pricing when quote has a user token", async () => {
    const service = createService(
      createPrismaMock({
        userMemberships: [userMembership()],
        membershipPriceRules: [membershipPriceRule({ fixedPriceCent: 60000 })]
      })
    );

    const response = await service.quote(
      {
        conferenceId: "published-conf",
        items: [{ skuId: "active-sku", quantity: 1 }]
      },
      currentUser
    );

    assert.equal(response.data.originAmountCent, 100000);
    assert.equal(response.data.discountAmountCent, 40000);
    assert.equal(response.data.payableAmountCent, 60000);
    assert.equal(response.data.memberPricing?.levelName, "金牌会员");
    assert.equal(response.data.items?.[0]?.memberUnitPriceCent, 60000);
    assert.equal(response.data.discounts?.[0]?.type, DiscountType.MEMBER_PRICE);
  });

  it("quotes multiple SKU items", async () => {
    const service = createService(createPrismaMock());

    const response = await service.quote({
      conferenceId: "published-conf",
      items: [
        { skuId: "active-sku", quantity: 2 },
        { skuId: "active-sku-b", quantity: 1 }
      ]
    });

    assert.equal(response.data.originAmountCent, 270000);
    assert.equal(response.data.payableAmountCent, 270000);
    assert.equal(response.data.items?.length, 2);
  });

  it("applies the best full-reduction promotion by quantity", async () => {
    const service = createService(
      createPrismaMock({
        promotionRules: [
          promotionRule({
            id: "promo-qty",
            name: "满 2 张减 300",
            minQuantity: 2,
            discountAmountCent: 30000
          })
        ]
      })
    );

    const response = await service.quote({
      conferenceId: "published-conf",
      items: [{ skuId: "active-sku", quantity: 2 }]
    });

    assert.equal(response.data.originAmountCent, 200000);
    assert.equal(response.data.discountAmountCent, 30000);
    assert.equal(response.data.payableAmountCent, 170000);
    assert.equal(response.data.discounts?.[0]?.title, "满 2 张减 300");
  });

  it("counts only allowed SKU items for SKU-scoped promotions", async () => {
    const service = createService(
      createPrismaMock({
        promotionRules: [
          promotionRule({
            id: "promo-scoped",
            name: "B 票满 2 张减 100",
            allowedSkuIds: ["active-sku-b"],
            minQuantity: 2,
            discountAmountCent: 10000
          })
        ]
      })
    );

    const response = await service.quote({
      conferenceId: "published-conf",
      items: [
        { skuId: "active-sku", quantity: 2 },
        { skuId: "active-sku-b", quantity: 1 }
      ]
    });

    assert.equal(response.data.discountAmountCent, 0);
    assert.equal(response.data.payableAmountCent, 270000);
  });

  it("rejects invalid, disabled, not-started, expired, and limited coupons", async () => {
    const service = createService(
      createPrismaMock({
        coupons: [
          coupon({ id: "coupon-disabled", code: "DISABLED", enabled: false }),
          coupon({ id: "coupon-future", code: "FUTURE", startAt: new Date("2026-06-07T00:00:00.000Z") }),
          coupon({ id: "coupon-expired", code: "EXPIRED", endAt: new Date("2026-06-05T00:00:00.000Z") }),
          coupon({ id: "coupon-limited", code: "LIMITED", totalLimit: 1 })
        ],
        couponRedemptions: [
          {
            couponId: "coupon-limited",
            userId: "other-user",
            status: CouponRedemptionStatus.USED
          }
        ]
      })
    );

    await assert.rejects(() => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 1, couponCode: "NOPE" }), BadRequestException);
    await assert.rejects(() => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 1, couponCode: "DISABLED" }), BadRequestException);
    await assert.rejects(() => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 1, couponCode: "FUTURE" }), BadRequestException);
    await assert.rejects(() => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 1, couponCode: "EXPIRED" }), BadRequestException);
    await assert.rejects(() => service.createOrder({ ...validOrderInput(), couponCode: "LIMITED" }, currentUser), BadRequestException);
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

  it("rejects mock openid users from creating orders when real WeChat mode is enabled", async () => {
    const originalLoginMode = process.env.WECHAT_LOGIN_MODE;
    const originalPayMode = process.env.WECHAT_PAY_MODE;
    process.env.WECHAT_LOGIN_MODE = "real";
    process.env.WECHAT_PAY_MODE = "mock";
    const prisma = createPrismaMock();
    const service = createService(prisma);

    try {
      await assert.rejects(
        () => service.createOrder(validOrderInput(), currentUser),
        (error: unknown) => {
          assert.ok(error instanceof ForbiddenException);
          assert.equal(error.message, "登录状态已过期，请重新进入小程序后下单。");
          return true;
        }
      );
      assert.equal(prisma.orders.length, 0);
    } finally {
      restoreEnv("WECHAT_LOGIN_MODE", originalLoginMode);
      restoreEnv("WECHAT_PAY_MODE", originalPayMode);
    }
  });

  it("allows real openid users to create orders when real WeChat mode is enabled", async () => {
    const originalLoginMode = process.env.WECHAT_LOGIN_MODE;
    process.env.WECHAT_LOGIN_MODE = "real";
    const prisma = createPrismaMock();
    const service = createService(prisma, ["REG202606060REAL"]);

    try {
      const response = await service.createOrder(validOrderInput(), realCurrentUser);

      assert.equal(response.data.orderNo, "REG202606060REAL");
      assert.equal(prisma.orders[0]?.userId, realCurrentUser.id);
    } finally {
      restoreEnv("WECHAT_LOGIN_MODE", originalLoginMode);
    }
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
	      },
	      pricing: {
	        originAmountCent: 100000,
	        memberBaseAmountCent: 100000,
	        discountAmountCent: 0,
	        payableAmountCent: 100000,
	        discounts: []
	      },
	      memberPricing: null
	    });
    assert.equal(prisma.orderItems[0]?.unitPriceCent, 100000);
    assert.equal(prisma.orderItems[0]?.totalAmountCent, 100000);
    assert.equal(prisma.registrations.length, 0);
    assert.equal(prisma.payments.length, 0);
    assert.equal(getSku("active-sku").soldCount, soldCountBefore);
  });

  it("creates an order when the configured form does not include phone", async () => {
    const prisma = createPrismaMock({ formFieldKeys: ["name"] });
    const service = createService(prisma, ["REG2026060600NOHONE"]);

    const response = await service.createOrder(
      {
        conferenceId: "published-conf",
        skuId: "active-sku",
        quantity: 1,
        formData: {
          name: "李四"
        }
      },
      currentUser
    );

    assert.equal(response.data.orderNo, "REG2026060600NOHONE");
    assert.equal(prisma.orders[0]?.attendeeName, "李四");
    assert.equal(prisma.orders[0]?.phone, "");
	    assert.deepEqual(prisma.orders[0]?.registrationSnapshotJson, {
	      conferenceId: "published-conf",
	      skuId: "active-sku",
	      skuName: "Active SKU",
	      attendeeName: "李四",
	      phone: "",
	      formData: {
	        name: "李四"
	      },
	      pricing: {
	        originAmountCent: 100000,
	        memberBaseAmountCent: 100000,
	        discountAmountCent: 0,
	        payableAmountCent: 100000,
	        discounts: []
	      },
	      memberPricing: null
	    });
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

  it("creates a multi-ticket order with attendee snapshots", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma, ["REG202606060MULTI"]);

    const response = await service.createOrder(
      {
        conferenceId: "published-conf",
        items: [
          { skuId: "active-sku", quantity: 2 },
          { skuId: "active-sku-b", quantity: 1 }
        ],
        attendees: [
          { skuId: "active-sku", name: "张三", phone: "13800000000", company: "公司A", position: "经理" },
          { skuId: "active-sku", name: "李四", phone: "13800000001", company: "公司A", position: "主管" },
          { skuId: "active-sku-b", name: "王五", phone: "13800000002", company: "公司B", position: "总监" }
        ]
      },
      currentUser
    );

    assert.equal(response.data.quantity, 3);
    assert.equal(response.data.payableAmountCent, 270000);
    assert.equal(prisma.orderItems.length, 2);
    assert.equal(prisma.orderItems[0]?.quantity, 2);
    assert.equal(prisma.orderItems[1]?.quantity, 1);
    assert.equal((prisma.orders[0]?.registrationSnapshotJson as { attendees?: unknown[] }).attendees?.length, 3);
  });

  it("uses the better coupon when coupon and promotion are not stackable and writes discount snapshots", async () => {
    const prisma = createPrismaMock({
      promotionRules: [
        promotionRule({
          id: "promo-small",
          name: "满减 100",
          discountAmountCent: 10000,
          stackableWithCoupon: false
        })
      ],
      coupons: [
        coupon({
          id: "coupon-better",
          code: "BETTER",
          discountAmountCent: 20000,
          stackableWithPromotion: false
        })
      ]
    });
    const service = createService(prisma, ["REG202606060DISC"]);

    const response = await service.createOrder({ ...validOrderInput(), couponCode: "BETTER" }, currentUser);

    assert.equal(response.data.discountAmountCent, 20000);
    assert.equal(response.data.payableAmountCent, 80000);
    assert.equal(prisma.orderDiscounts.length, 1);
    assert.equal(prisma.orderDiscounts[0]?.type, DiscountType.COUPON);
    assert.equal(prisma.orderDiscounts[0]?.amountCent, 20000);
    assert.deepEqual((prisma.orderDiscounts[0]?.snapshotJson as { code?: string }).code, "BETTER");
    assert.equal(prisma.couponRedemptions[0]?.status, CouponRedemptionStatus.PENDING);
  });

  it("stacks member pricing before coupons and keeps order items at original SKU price", async () => {
    const prisma = createPrismaMock({
      userMemberships: [userMembership()],
      membershipPriceRules: [membershipPriceRule({ fixedPriceCent: 90000 })],
      coupons: [coupon({ id: "coupon-member", code: "MEMBER20", discountAmountCent: 20000 })]
    });
    const service = createService(prisma, ["REG202606060MEMBER"]);

    const response = await service.createOrder({ ...validOrderInput(), couponCode: "MEMBER20" }, currentUser);

    assert.equal(response.data.originAmountCent, 100000);
    assert.equal(response.data.discountAmountCent, 30000);
    assert.equal(response.data.payableAmountCent, 70000);
    assert.equal(response.data.memberPricing?.discountAmountCent, 10000);
    assert.equal(prisma.orderItems[0]?.unitPriceCent, 100000);
    assert.equal(prisma.orderItems[0]?.totalAmountCent, 100000);
    assert.equal(prisma.orderDiscounts.length, 2);
    assert.equal(prisma.orderDiscounts[0]?.type, DiscountType.MEMBER_PRICE);
    assert.equal(prisma.orderDiscounts[1]?.type, DiscountType.COUPON);
    assert.equal(prisma.couponRedemptions[0]?.status, CouponRedemptionStatus.PENDING);
    const snapshot = prisma.orders[0]?.registrationSnapshotJson as {
      pricing?: { memberBaseAmountCent?: number; payableAmountCent?: number };
      memberPricing?: { levelCode?: string; discountAmountCent?: number };
    };
    assert.equal(snapshot.pricing?.memberBaseAmountCent, 90000);
    assert.equal(snapshot.pricing?.payableAmountCent, 70000);
    assert.equal(snapshot.memberPricing?.levelCode, "gold");
    assert.equal(snapshot.memberPricing?.discountAmountCent, 10000);
  });

  it("stacks coupon and promotion only when both sides allow stacking", async () => {
    const service = createService(
      createPrismaMock({
        promotionRules: [
          promotionRule({
            id: "promo-stack",
            name: "满减 100",
            discountAmountCent: 10000,
            stackableWithCoupon: true
          })
        ],
        coupons: [
          coupon({
            id: "coupon-stack",
            code: "STACK",
            discountAmountCent: 15000,
            stackableWithPromotion: true
          })
        ]
      })
    );

    const response = await service.quote({
      conferenceId: "published-conf",
      items: [{ skuId: "active-sku", quantity: 1 }],
      couponCode: "STACK"
    });

    assert.equal(response.data.discountAmountCent, 25000);
    assert.equal(response.data.payableAmountCent, 75000);
    assert.equal(response.data.discounts?.length, 2);
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

  it("rejects orders when attendee count does not match quantity", async () => {
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

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function createPrismaMock(options: PrismaMockOptions = {}) {
  const localSkus = skus.map((sku) => ({
    ...sku,
    ...(options.skuOverrides?.[sku.id] ?? {})
  }));
  const conflictingOrderNos = new Set(options.conflictingOrderNos ?? []);
  const orders: OrderRecord[] = [];
  const orderItems: OrderItemRecord[] = [];
  const orderDiscounts: OrderDiscountRecord[] = [];
	  const couponRedemptions: CouponRedemptionRecord[] = [...(options.couponRedemptions ?? [])];
	  const registrations: unknown[] = [];
	  const payments: unknown[] = [];

  const configuredFormDefinitions = applyFormFieldKeyFilter(formDefinitions, options.formFieldKeys);
  const mock: PrismaMockShape = {
    orders,
    orderItems,
    orderDiscounts,
    couponRedemptions,
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

        return conference
          ? {
              id: conference.id,
              groupRegistrationEnabled: true,
              maxTicketsPerOrder: null
            }
          : null;
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
        const formDefinition = configuredFormDefinitions.find(
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
    orderDiscount: {
      create: async (args: OrderDiscountCreateArgs) => {
        orderDiscounts.push({
          id: `order-discount-${orderDiscounts.length + 1}`,
          ...args.data
        });
      }
    },
    promotionRule: {
      findMany: async () => options.promotionRules ?? []
    },
    coupon: {
      findUnique: async (args: CouponFindUniqueArgs) => {
        const code = String(args.where.code).trim().toUpperCase();
        return (options.coupons ?? []).find((item) => item.code === code) ?? null;
      }
    },
	    couponRedemption: {
      count: async (args: CouponRedemptionCountArgs) =>
        couponRedemptions.filter((item) => {
          if (item.couponId !== args.where.couponId) {
            return false;
          }
          if (args.where.userId && item.userId !== args.where.userId) {
            return false;
          }
          const statusFilter = args.where.status;
          return statusFilter.in.includes(item.status);
        }).length,
      create: async (args: CouponRedemptionCreateArgs) => {
        couponRedemptions.push({
          couponId: args.data.couponId,
          userId: args.data.userId,
          orderId: args.data.orderId,
          status: CouponRedemptionStatus.PENDING
	        });
	      }
	    },
	    userMembership: {
	      findMany: async (args: UserMembershipFindManyArgs) =>
	        (options.userMemberships ?? []).filter((item) => item.userId === args.where.userId && item.status === args.where.status)
	    },
	    membershipPriceRule: {
	      findMany: async (args: MembershipPriceRuleFindManyArgs) =>
	        (options.membershipPriceRules ?? []).filter((item) => item.levelId === args.where.levelId && item.enabled === args.where.enabled)
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
    id: "active-sku-b",
    conferenceId: "published-conf",
    name: "Active SKU B",
    priceCent: 70000,
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

function promotionRule(overrides: Partial<PromotionRuleRecord> = {}): PromotionRuleRecord {
  return {
    id: "promotion-1",
    name: "满减",
    discountAmountCent: 10000,
    minAmountCent: null,
    minQuantity: null,
    allowedSkuIds: null,
    startAt: null,
    endAt: null,
    stackableWithCoupon: false,
    ...overrides
  };
}

function coupon(overrides: Partial<CouponRecord> = {}): CouponRecord {
  return {
    id: "coupon-1",
    name: "测试优惠券",
    type: CouponType.AMOUNT,
    discountAmountCent: 10000,
    discountPercent: null,
    maxDiscountCent: null,
    minAmountCent: null,
    minQuantity: null,
    totalLimit: null,
    perUserLimit: null,
    enabled: true,
    startAt: null,
    endAt: null,
    stackableWithPromotion: false,
    conferenceId: null,
    allowedSkuIds: null,
    ...overrides,
    code: (overrides.code ?? "COUPON").toUpperCase()
  };
}

function memberLevel(overrides: Partial<MemberLevelRecord> = {}): MemberLevelRecord {
  return {
    id: "level-gold",
    code: "gold",
    name: "金牌会员",
    rank: 10,
    enabled: true,
    ...overrides
  };
}

function userMembership(overrides: Partial<UserMembershipRecord> = {}): UserMembershipRecord {
  const level = overrides.level ?? memberLevel();
  return {
    id: "membership-1",
    userId: currentUser.id,
    levelId: level.id,
    status: "ACTIVE",
    startsAt: new Date("2026-01-01T00:00:00.000Z"),
    endsAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    level,
    ...overrides
  };
}

function membershipPriceRule(overrides: Partial<MembershipPriceRuleRecord> = {}): MembershipPriceRuleRecord {
  return {
    id: "member-price-rule-1",
    levelId: "level-gold",
    conferenceId: null,
    skuId: null,
    discountPercent: null,
    discountCent: null,
    fixedPriceCent: null,
    enabled: true,
    startAt: null,
    endAt: null,
    ...overrides
  };
}

function getSku(id: string) {
  const sku = skus.find((item) => item.id === id);
  assert.ok(sku);
  return sku;
}

interface PrismaMockOptions {
  conflictingOrderNos?: string[];
  formFieldKeys?: string[];
  skuOverrides?: Record<string, Partial<(typeof skus)[number]>>;
	  promotionRules?: PromotionRuleRecord[];
	  coupons?: CouponRecord[];
	  couponRedemptions?: CouponRedemptionRecord[];
	  userMemberships?: UserMembershipRecord[];
	  membershipPriceRules?: MembershipPriceRuleRecord[];
	}

interface PrismaMockShape {
  orders: OrderRecord[];
  orderItems: OrderItemRecord[];
  orderDiscounts: OrderDiscountRecord[];
  couponRedemptions: CouponRedemptionRecord[];
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
  orderDiscount: {
    create(args: OrderDiscountCreateArgs): Promise<void>;
  };
  promotionRule: {
    findMany(): Promise<PromotionRuleRecord[]>;
  };
  coupon: {
    findUnique(args: CouponFindUniqueArgs): Promise<CouponRecord | null>;
  };
	  couponRedemption: {
	    count(args: CouponRedemptionCountArgs): Promise<number>;
	    create(args: CouponRedemptionCreateArgs): Promise<void>;
	  };
	  userMembership: {
	    findMany(args: UserMembershipFindManyArgs): Promise<UserMembershipRecord[]>;
	  };
	  membershipPriceRule: {
	    findMany(args: MembershipPriceRuleFindManyArgs): Promise<MembershipPriceRuleRecord[]>;
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

interface OrderDiscountCreateArgs {
  data: Omit<OrderDiscountRecord, "id">;
}

interface CouponFindUniqueArgs {
  where: {
    code: string;
  };
}

interface CouponRedemptionCountArgs {
  where: {
    couponId: string;
    userId?: string;
    status: {
      in: CouponRedemptionStatus[];
    };
  };
}

interface CouponRedemptionCreateArgs {
  data: {
    couponId: string;
    userId: string;
    orderId: string;
  };
}

interface UserMembershipFindManyArgs {
  where: {
    userId: string;
    status: string;
  };
}

interface MembershipPriceRuleFindManyArgs {
  where: {
    levelId: string;
    enabled: boolean;
  };
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
  discountAmountCent: number;
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

interface OrderDiscountRecord {
  id: string;
  orderId: string;
  type: DiscountType;
  title: string;
  amountCent: number;
  couponId?: string;
  promotionRuleId?: string;
  snapshotJson?: unknown;
}

interface CouponRedemptionRecord {
  couponId: string;
  userId: string | null;
  orderId?: string;
  status: CouponRedemptionStatus;
}

interface MemberLevelRecord {
  id: string;
  code: string;
  name: string;
  rank: number;
  enabled: boolean;
}

interface UserMembershipRecord {
  id: string;
  userId: string;
  levelId: string;
  status: string;
  startsAt: Date;
  endsAt: Date | null;
  createdAt: Date;
  level: MemberLevelRecord;
}

interface MembershipPriceRuleRecord {
  id: string;
  levelId: string;
  conferenceId: string | null;
  skuId: string | null;
  discountPercent: number | null;
  discountCent: number | null;
  fixedPriceCent: number | null;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
}

interface PromotionRuleRecord {
  id: string;
  name: string;
  discountAmountCent: number;
  minAmountCent: number | null;
  minQuantity: number | null;
  allowedSkuIds: unknown;
  startAt: Date | null;
  endAt: Date | null;
  stackableWithCoupon: boolean;
}

interface CouponRecord {
  id: string;
  code: string;
  name: string;
  type: CouponType;
  discountAmountCent: number | null;
  discountPercent: number | null;
  maxDiscountCent: number | null;
  minAmountCent: number | null;
  minQuantity: number | null;
  totalLimit: number | null;
  perUserLimit: number | null;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
  stackableWithPromotion: boolean;
  conferenceId: string | null;
  allowedSkuIds: unknown;
}

function applyFormFieldKeyFilter(
  definitions: typeof formDefinitions,
  fieldKeys: string[] | undefined
): typeof formDefinitions {
  if (!fieldKeys) {
    return definitions;
  }

  const allowed = new Set(fieldKeys);
  return definitions.map((definition) => ({
    ...definition,
    fields: definition.fields.filter((field) => allowed.has(field.fieldKey))
  }));
}
