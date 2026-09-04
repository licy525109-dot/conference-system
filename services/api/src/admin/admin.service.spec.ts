import "reflect-metadata";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import {
  AuditAction,
  CheckInStatus,
  ConferenceStatus,
  FormFieldType,
  OrderStatus,
  PaymentStatus,
  PaymentProvider,
  RegistrationSource,
  RegistrationSkuStatus,
  RegistrationStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminManagementController } from "./admin-management.controller";
import { AdminManagementService } from "./admin-management.service";
import { CurrentAdmin, RequestWithCurrentAdmin } from "./current-admin";

const currentAdmin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "系统管理员"
};

describe("Admin auth", () => {
  it("logs in with username and password without returning passwordHash", async () => {
    withJwtEnv();
    const prisma = createPrismaMock();
    const service = new AdminAuthService(prisma);

    const response = await service.login({
      username: "admin",
      password: "Admin@123456"
    });

    assert.equal(response.code, "OK");
    assert.equal(response.data.admin.username, "admin");
    assert.equal("passwordHash" in response.data.admin, false);
    assert.equal(response.data.token.split(".").length, 3);
    assert.equal(prisma.auditLogs[0]?.action, AuditAction.LOGIN);
  });

  it("rejects wrong password", async () => {
    withJwtEnv();
    const service = new AdminAuthService(createPrismaMock());

    await assert.rejects(
      () =>
        service.login({
          username: "admin",
          password: "wrong"
        }),
      UnauthorizedException
    );
  });

  it("returns 401 for admin API without bearer token", async () => {
    withJwtEnv();
    const guard = new AdminJwtAuthGuard(new AdminAuthService(createPrismaMock()));

    await assert.rejects(() => guard.canActivate(createExecutionContext({ headers: {} })), UnauthorizedException);
  });
});

describe("Admin management", () => {
  it("creates a conference", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.createConference(
      {
        title: "新会议",
        startAt: "2026-08-01T09:00:00.000Z",
        endAt: "2026-08-01T18:00:00.000Z",
        registrationStartsAt: "2026-07-01T00:00:00.000Z",
        registrationEndsAt: "2026-07-31T16:00:00.000Z",
        location: "上海",
        contentJson: { blocks: [] },
        styleJson: {}
      },
      currentAdmin
    );

    assert.equal((response.data as { title: string }).title, "新会议");
    assert.equal((response.data as { registrationStartsAt: string }).registrationStartsAt, "2026-07-01T00:00:00.000Z");
    assert.equal((response.data as { registrationEndsAt: string }).registrationEndsAt, "2026-07-31T16:00:00.000Z");
    assert.equal(prisma.conferences.length, 2);
    assert.equal(prisma.auditLogs.some((log) => log.entityType === "Conference" && log.action === AuditAction.CREATE), true);
  });

  it("rejects ambiguous or reversed conference registration windows", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () => service.updateConference("conference-1", { registrationStartsAt: "2026-07-01T00:00:00.000Z" }, currentAdmin),
      BadRequestException
    );
    await assert.rejects(
      () => service.updateConference("conference-1", {
        registrationStartsAt: "2026-08-01T00:00:00.000Z",
        registrationEndsAt: "2026-07-01T00:00:00.000Z"
      }, currentAdmin),
      BadRequestException
    );
  });

  it("updates conference status", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.updateConferenceStatus("conference-1", { status: "PUBLISHED" }, currentAdmin);

    assert.equal((response.data as { status: string }).status, "PUBLISHED");
    assert.equal(prisma.conferences[0]?.status, ConferenceStatus.PUBLISHED);
  });

  it("updates conference detail capacity visibility", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.updateConference(
      "conference-1",
      { showRegistrationCount: true, showRemainingSeats: true },
      currentAdmin
    );

    const visibility = response.data as { showRegistrationCount: boolean; showRemainingSeats: boolean };
    assert.equal(visibility.showRegistrationCount, true);
    assert.equal(visibility.showRemainingSeats, true);
    assert.equal(prisma.conferences[0]?.showRegistrationCount, true);
    assert.equal(prisma.conferences[0]?.showRemainingSeats, true);
  });

  it("rejects non-integer or negative SKU price", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () =>
        service.createSku(
          "conference-1",
          {
            name: "坏价格",
            priceCent: 12.5,
            stock: 1
          },
          currentAdmin
        ),
      BadRequestException
    );

    await assert.rejects(
      () =>
        service.createSku(
          "conference-1",
          {
            name: "负价格",
            priceCent: -1,
            stock: 1
          },
          currentAdmin
        ),
      BadRequestException
    );
  });

  it("rejects negative SKU stock", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () =>
        service.createSku(
          "conference-1",
          {
            name: "负库存",
            priceCent: 1000,
            stock: -1
          },
          currentAdmin
        ),
      BadRequestException
    );
  });

  it("rejects duplicate fieldKey in one conference form", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () =>
        service.createFormField(
          "conference-1",
          {
            label: "姓名",
            fieldKey: "name",
            type: "TEXT",
            optionsJson: []
          },
          currentAdmin
        ),
      ConflictException
    );
  });

  it("validates option values by form field type", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () =>
        service.createFormField(
          "conference-1",
          {
            label: "手机号",
            fieldKey: "phone",
            type: "PHONE",
            optionsJson: ["A"]
          },
          currentAdmin
        ),
      BadRequestException
    );

    await assert.rejects(
      () =>
        service.createFormField(
          "conference-1",
          {
            label: "身份",
            fieldKey: "role",
            type: "SELECT",
            optionsJson: []
          },
          currentAdmin
        ),
      BadRequestException
    );
  });

  it("does not expose an order paid mutation on admin controller", () => {
    const controller = new AdminManagementController(new AdminManagementService(createPrismaMock()));
    const controllerShape = controller as unknown as Record<string, unknown>;

    assert.equal(typeof controllerShape.listOrders, "function");
    assert.equal(typeof controllerShape.getOrder, "function");
    assert.equal(controllerShape.updateOrder, undefined);
    assert.equal(controllerShape.markOrderPaid, undefined);
  });

  it("closes only pending orders without registrations or success payments", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.closeOrder("REG_PENDING", currentAdmin);

    assert.equal((response.data as { closed: number }).closed, 1);
    assert.equal(prisma.orders.find((order) => order.orderNo === "REG_PENDING")?.status, OrderStatus.CLOSED);
    assert.equal(prisma.auditLogs.some((log) => log.entityType === "Order" && log.action === AuditAction.UPDATE), true);
  });

  it("rejects closing paid orders", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () => service.closeOrder("REG_PAID", currentAdmin),
      ConflictException
    );
  });

  it("bulk closes only pending orders and writes audit logs", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.closeOrdersByFilter({}, currentAdmin);
    const data = response.data as { matched: number; closed: number; skipped: number; failed: number };

    assert.equal(data.matched, 2);
    assert.equal(data.closed, 1);
    assert.equal(data.skipped, 1);
    assert.equal(data.failed, 0);
    assert.equal(prisma.orders.find((order) => order.orderNo === "REG_PENDING")?.status, OrderStatus.CLOSED);
    assert.equal(prisma.orders.find((order) => order.orderNo === "REG_PAID")?.status, OrderStatus.PAID);
    assert.equal(prisma.auditLogs.some((log) => log.summary === "Bulk close pending orders by filter"), true);
  });

  it("updates registration remark without changing payment state", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.updateRegistrationRemark("registration-1", { adminRemark: "已电话确认" }, currentAdmin);
    const data = response.data as { adminRemark: string; order: { status: string; paidAmountCent: number | null } };

    assert.equal(data.adminRemark, "已电话确认");
    assert.equal(data.order.status, "PAID");
    assert.equal(data.order.paidAmountCent, 70000);
    assert.equal(prisma.auditLogs.some((log) => log.entityType === "Registration" && log.action === AuditAction.UPDATE), true);
  });

  it("updates conference check-in config", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.updateConferenceCheckInConfig("conference-1", { checkInEnabled: true }, currentAdmin);

    assert.equal((response.data as { checkInEnabled: boolean }).checkInEnabled, true);
    assert.equal(prisma.conferences[0]?.checkInEnabled, true);
  });

  it("rejects promotion rules whose endAt is before startAt", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () =>
        service.createPromotionRule(
          {
            name: "错误日期满减",
            minAmountCent: 200000,
            minQuantity: 2,
            discountAmountCent: 199990,
            startAt: "2026-06-13T17:40:01.000Z",
            endAt: "2026-06-13T00:00:00.000Z",
            enabled: true
          },
          currentAdmin
        ),
      BadRequestException
    );
  });

  it("requires every full-reduction rule to target a conference", async () => {
    const service = new AdminManagementService(createPrismaMock());

    await assert.rejects(
      () => service.createPromotionRule({ name: "无归属满减", discountAmountCent: 1000 }, currentAdmin),
      (error: unknown) => {
        assert.ok(error instanceof BadRequestException);
        assert.match(error.message, /必须选择具体会议|conferenceId/);
        return true;
      }
    );
  });

  it("deletes only an empty conference and records the cleanup", async () => {
    const calls: string[] = [];
    const tx = {
      coupon: {
        updateMany: async (args: { data: { enabled: boolean; deletedAt: Date } }) => {
          calls.push("coupons");
          assert.equal(args.data.enabled, false);
          assert.ok(args.data.deletedAt instanceof Date);
          return { count: 1 };
        }
      },
      promotionRule: {
        updateMany: async (args: { data: { enabled: boolean } }) => {
          calls.push("promotions");
          assert.equal(args.data.enabled, false);
          return { count: 1 };
        }
      },
      conference: {
        delete: async () => {
          calls.push("conference");
          return { id: "conference-empty" };
        }
      },
      auditLog: {
        create: async () => {
          calls.push("audit");
          return { id: "audit-1" };
        }
      }
    };
    const prisma = {
      conference: {
        findUnique: async () => ({
          id: "conference-empty",
          title: "空白测试会议",
          _count: { orders: 0, registrations: 0 }
        })
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    const response = await service.deleteConference("conference-empty", currentAdmin);

    assert.deepEqual(response.data, { id: "conference-empty", deleted: true });
    assert.deepEqual(calls, ["coupons", "promotions", "conference", "audit"]);
  });

  it("refuses to delete a conference with historical orders", async () => {
    const prisma = {
      conference: {
        findUnique: async () => ({
          id: "conference-used",
          title: "已有订单会议",
          _count: { orders: 1, registrations: 0 }
        })
      }
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    await assert.rejects(
      () => service.deleteConference("conference-used", currentAdmin),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.match(error.message, /已有订单或报名记录/);
        return true;
      }
    );
  });

  it("soft deletes a coupon so historical redemption data remains available", async () => {
    let updateData: { enabled: boolean; deletedAt: Date } | undefined;
    const audits: unknown[] = [];
    const prisma = {
      coupon: {
        findUnique: async () => ({ id: "coupon-1", code: "INVITE100", deletedAt: null }),
        update: async (args: { data: { enabled: boolean; deletedAt: Date } }) => {
          updateData = args.data;
          return { id: "coupon-1" };
        }
      },
      auditLog: {
        create: async (args: unknown) => {
          audits.push(args);
          return { id: "audit-coupon" };
        }
      }
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    const response = await service.deleteCoupon("coupon-1", currentAdmin);

    assert.equal((response.data as { deleted: boolean }).deleted, true);
    assert.equal(updateData?.enabled, false);
    assert.ok(updateData?.deletedAt instanceof Date);
    assert.equal(audits.length, 1);
  });

  it("creates a complimentary registration without creating a payment record", async () => {
    const stockUpdates: unknown[] = [];
    let createdOrder: Record<string, unknown> | undefined;
    let createdRegistration: Record<string, unknown> | undefined;
    const createdAt = new Date("2026-09-03T08:00:00.000Z");
    const tx = {
      registrationSku: {
        updateMany: async (args: unknown) => {
          stockUpdates.push(args);
          return { count: 1 };
        }
      },
      order: {
        create: async (args: { data: Record<string, unknown> }) => {
          createdOrder = args.data;
          return { id: "order-complimentary" };
        }
      },
      registration: {
        create: async (args: { data: Record<string, unknown> }) => {
          createdRegistration = args.data;
          return {
            id: "registration-complimentary",
            registrationNo: String(args.data.registrationNo),
            conferenceId: "conference-1",
            skuId: "sku-1",
            attendeeName: "免支付嘉宾",
            phone: "13800000000",
            paidAmountCent: 0,
            status: RegistrationStatus.CONFIRMED,
            source: RegistrationSource.ADMIN_COMPLIMENTARY,
            confirmedAt: createdAt,
            adminRemark: "主办方邀请",
            remarkUpdatedAt: null,
            remarkUpdatedBy: null,
            createdAt,
            formDataJson: { attendeeName: "免支付嘉宾", phone: "13800000000" },
            user: null,
            conference: { title: "示例会议" },
            sku: { name: "嘉宾票" },
            attendees: [{
              id: "attendee-complimentary",
              skuId: "sku-1",
              name: "免支付嘉宾",
              phone: "13800000000",
              company: null,
              title: null,
              formDataJson: null,
              checkInStatus: CheckInStatus.NOT_REQUIRED,
              checkedInAt: null,
              checkedInBy: null,
              adminRemark: "主办方邀请",
              createdAt,
              sku: { name: "嘉宾票" }
            }],
            order: {
              id: "order-complimentary",
              orderNo: "ADMIN_COMP",
              status: OrderStatus.PAID,
              originAmountCent: 88000,
              discountAmountCent: 88000,
              payableAmountCent: 0,
              paidAmountCent: 0,
              submittedFormJson: {},
              registrationSnapshotJson: {},
              createdAt,
              paidAt: createdAt,
              items: [],
              discounts: [],
              payments: []
            }
          };
        }
      },
      auditLog: {
        create: async () => ({ id: "audit-complimentary" })
      }
    };
    const prisma = {
      conference: {
        findUnique: async () => ({ id: "conference-1", title: "示例会议", checkInEnabled: false })
      },
      registrationSku: {
        findFirst: async () => ({ id: "sku-1", name: "嘉宾票", priceCent: 88000, stock: 10, lockedStock: 0, soldCount: 1 })
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    const response = await service.createComplimentaryRegistration({
      conferenceId: "conference-1",
      skuId: "sku-1",
      attendeeName: "免支付嘉宾",
      phone: "13800000000",
      adminRemark: "主办方邀请"
    }, currentAdmin);

    assert.equal(stockUpdates.length, 1);
    assert.equal(createdOrder?.payableAmountCent, 0);
    assert.equal(createdOrder?.paidAmountCent, 0);
    assert.equal(createdOrder?.status, OrderStatus.PAID);
    assert.equal(createdRegistration?.source, RegistrationSource.ADMIN_COMPLIMENTARY);
    assert.deepEqual((response.data as { order: { payments: unknown[] } }).order.payments, []);
  });

  it("never deletes a registration backed by a successful WeChat payment", async () => {
    const prisma = {
      registration: {
        findUnique: async () => ({
          id: "registration-wechat",
          registrationNo: "RREG-WECHAT",
          source: RegistrationSource.PAYMENT,
          orderId: "order-wechat",
          attendees: [{ skuId: "sku-1" }],
          order: { payments: [{ provider: PaymentProvider.WECHAT, status: PaymentStatus.SUCCESS }] }
        })
      }
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    await assert.rejects(
      () => service.deleteRegistration("registration-wechat", currentAdmin),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.match(error.message, /真实微信支付报名/);
        return true;
      }
    );
  });

  it("previews and deletes only clearly identified Mock conference data", async () => {
    const registrations = [
      {
        id: "registration-mock",
        registrationNo: "RREG-MOCK",
        attendeeName: "Mock 嘉宾",
        source: RegistrationSource.PAYMENT,
        orderId: "order-mock",
        attendees: [{ skuId: "sku-1" }],
        order: { orderNo: "ORDER-MOCK", payments: [{ provider: PaymentProvider.MOCK, status: PaymentStatus.SUCCESS }], refunds: [] }
      },
      {
        id: "registration-complimentary",
        registrationNo: "RREG-COMP",
        attendeeName: "邀请嘉宾",
        source: RegistrationSource.ADMIN_COMPLIMENTARY,
        orderId: "order-comp",
        attendees: [{ skuId: "sku-1" }],
        order: { orderNo: "ORDER-COMP", payments: [], refunds: [] }
      },
      {
        id: "registration-wechat",
        registrationNo: "RREG-WECHAT",
        attendeeName: "真实支付嘉宾",
        source: RegistrationSource.PAYMENT,
        orderId: "order-wechat",
        attendees: [{ skuId: "sku-1" }],
        order: { orderNo: "ORDER-WECHAT", payments: [{ provider: PaymentProvider.WECHAT, status: PaymentStatus.SUCCESS }], refunds: [] }
      }
    ];
    const orders = [
      ...registrations.map((item) => ({
        id: item.orderId,
        orderNo: item.order.orderNo,
        status: OrderStatus.PAID,
        registration: { id: item.id },
        payments: item.order.payments,
        refunds: item.order.refunds
      })),
      { id: "order-empty", orderNo: "ORDER-EMPTY", status: OrderStatus.PENDING, registration: null, payments: [], refunds: [] },
      { id: "order-paid-without-payment", orderNo: "ORDER-PAID-ANOMALY", status: OrderStatus.PAID, registration: null, payments: [], refunds: [] },
      { id: "order-wechat-pending", orderNo: "ORDER-WECHAT-PENDING", status: OrderStatus.PENDING, registration: null, payments: [{ provider: PaymentProvider.WECHAT, status: PaymentStatus.PENDING }], refunds: [] }
    ];
    const deletedRegistrationIds: string[] = [];
    const deletedOrderIds: string[] = [];
    let deletedRefundWhere: Record<string, unknown> | undefined;
    let restoredStock = 0;
    const tx = {
      conference: { findUnique: async () => ({ id: "conference-1", title: "示例会议" }) },
      registration: {
        findMany: async () => registrations,
        deleteMany: async ({ where }: any) => {
          deletedRegistrationIds.push(...where.id.in);
          return { count: where.id.in.length };
        }
      },
      order: {
        findMany: async () => orders,
        deleteMany: async ({ where }: any) => {
          deletedOrderIds.push(...where.id.in);
          return { count: where.id.in.length };
        }
      },
      registrationSku: {
        updateMany: async ({ data }: any) => {
          restoredStock += data.soldCount.decrement;
          return { count: 1 };
        }
      },
      refund: {
        deleteMany: async ({ where }: any) => {
          deletedRefundWhere = where;
          return { count: 0 };
        }
      },
      invoiceApplication: { deleteMany: async () => ({ count: 0 }) },
      auditLog: { create: async () => ({ id: "audit-cleanup" }) }
    };
    const prisma = {
      ...tx,
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    const preview = await service.previewConferenceTestDataCleanup("conference-1");
    const result = await service.cleanupConferenceTestData("conference-1", { confirmation: "示例会议" }, currentAdmin);

    assert.equal((preview.data as any).mockRegistrations.count, 1);
    assert.equal((preview.data as any).standaloneMockOrders.count, 1);
    assert.equal((preview.data as any).protectedRecords.count, 4);
    assert.deepEqual(deletedRegistrationIds, ["registration-mock"]);
    assert.deepEqual(deletedOrderIds.sort(), ["order-empty", "order-mock"]);
    assert.deepEqual((deletedRefundWhere as any)?.OR, [
      { provider: null },
      { provider: { not: PaymentProvider.WECHAT } }
    ]);
    assert.equal(restoredStock, 1);
    assert.equal((result.data as any).deletedRegistrations, 1);
    assert.equal((result.data as any).deletedOrders, 2);
  });

  it("deletes an eligible complimentary registration and restores SKU inventory", async () => {
    const calls: string[] = [];
    let stockUpdate: { data: { soldCount: { decrement: number } } } | undefined;
    const tx = {
      registration: {
        delete: async () => {
          calls.push("registration");
          return { id: "registration-complimentary" };
        }
      },
      registrationSku: {
        updateMany: async (args: { data: { soldCount: { decrement: number } } }) => {
          calls.push("stock");
          stockUpdate = args;
          return { count: 1 };
        }
      },
      order: {
        delete: async () => {
          calls.push("order");
          return { id: "order-complimentary" };
        }
      },
      auditLog: {
        create: async () => {
          calls.push("audit");
          return { id: "audit-registration" };
        }
      }
    };
    const prisma = {
      registration: {
        findUnique: async () => ({
          id: "registration-complimentary",
          registrationNo: "RADMIN_COMP",
          source: RegistrationSource.ADMIN_COMPLIMENTARY,
          orderId: "order-complimentary",
          attendees: [{ skuId: "sku-1" }, { skuId: "sku-1" }],
          order: { payments: [] }
        })
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    const response = await service.deleteRegistration("registration-complimentary", currentAdmin);

    assert.equal((response.data as { deleted: boolean }).deleted, true);
    assert.equal(stockUpdate?.data.soldCount.decrement, 2);
    assert.deepEqual(calls, ["registration", "stock", "order", "audit"]);
  });

  it("aborts complimentary registration deletion when inventory cannot be restored", async () => {
    const calls: string[] = [];
    const tx = {
      registration: {
        delete: async () => {
          calls.push("registration");
          return { id: "registration-complimentary" };
        }
      },
      registrationSku: {
        updateMany: async () => {
          calls.push("stock");
          return { count: 0 };
        }
      },
      order: {
        delete: async () => {
          calls.push("order");
          return { id: "order-complimentary" };
        }
      },
      auditLog: {
        create: async () => {
          calls.push("audit");
          return { id: "audit-registration" };
        }
      }
    };
    const prisma = {
      registration: {
        findUnique: async () => ({
          id: "registration-complimentary",
          registrationNo: "RADMIN_COMP",
          source: RegistrationSource.ADMIN_COMPLIMENTARY,
          orderId: "order-complimentary",
          attendees: [{ skuId: "sku-1" }],
          order: { payments: [] }
        })
      },
      $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)
    } as unknown as PrismaService;
    const service = new AdminManagementService(prisma);

    await assert.rejects(
      () => service.deleteRegistration("registration-complimentary", currentAdmin),
      /票种库存计数异常/
    );
    assert.deepEqual(calls, ["registration", "stock"]);
  });

  it("checks in a pending attendee and rejects duplicate check-in", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.checkInRegistrationAttendee("attendee-1", currentAdmin);

    assert.equal((response.data as { checkInStatus: string }).checkInStatus, CheckInStatus.CHECKED_IN);
    await assert.rejects(
      () => service.checkInRegistrationAttendee("attendee-1", currentAdmin),
      (error: unknown) => {
        assert.ok(error instanceof ConflictException);
        assert.equal(error.message, "该参会人已核销");
        return true;
      }
    );
  });
});

function withJwtEnv(): void {
  process.env.JWT_SECRET = "test_admin_jwt_secret";
}

function createPrismaMock() {
  const auditLogs: AuditLogRecord[] = [];
  const conferences: ConferenceRecord[] = [
    {
      id: "conference-1",
      title: "示例会议",
      slug: "example",
      coverImageUrl: null,
      summary: null,
      location: "上海",
      startsAt: new Date("2026-08-01T09:00:00.000Z"),
      endsAt: new Date("2026-08-01T18:00:00.000Z"),
      registrationStartsAt: null,
      registrationEndsAt: null,
      checkInEnabled: false,
      checkInStartsAt: null,
      checkInEndsAt: null,
      checkInMethods: null,
      checkInFieldBindings: null,
      groupRegistrationEnabled: true,
      maxTicketsPerOrder: null,
      showRegistrationCount: false,
      showRemainingSeats: false,
      status: ConferenceStatus.DRAFT,
      sortOrder: 0,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z"),
      page: {
        contentJson: {},
        styleJson: null
      },
      _count: {
        skus: 1,
        orders: 0,
        registrations: 0
      },
      formDefinition: { fields: [] }
    }
  ];
  const skus = [
    {
      id: "sku-1",
      conferenceId: "conference-1",
      name: "仅参会",
      description: null,
      priceCent: 70000,
      stock: 10,
      lockedStock: 0,
      soldCount: 0,
      status: RegistrationSkuStatus.ACTIVE,
      saleStartAt: null,
      saleEndAt: null,
      sortOrder: 0,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      updatedAt: new Date("2026-06-06T00:00:00.000Z")
    }
  ];
  const formDefinitions = [{ id: "form-1", conferenceId: "conference-1" }];
  const formFields = [{ id: "field-1", formDefinitionId: "form-1", fieldKey: "name" }];
  const registration = createRegistrationRead();
  const orders = [
    {
      id: "order-pending",
      orderNo: "REG_PENDING",
      status: OrderStatus.PENDING,
      payableAmountCent: 70000,
      paidAmountCent: null,
      expiredAt: null,
      inventoryReservedAt: null,
      paidAt: null,
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      items: [],
      registration: null,
      payments: [{ id: "payment-pending", status: PaymentStatus.PENDING, amountCent: 70000, failedReason: null, createdAt: new Date("2026-06-06T00:01:00.000Z"), paidAt: null }]
    },
    {
      id: "order-paid",
      orderNo: "REG_PAID",
      status: OrderStatus.PAID,
      payableAmountCent: 70000,
      paidAmountCent: 70000,
      expiredAt: null,
      inventoryReservedAt: null,
      paidAt: new Date("2026-06-06T02:00:00.000Z"),
      createdAt: new Date("2026-06-06T00:00:00.000Z"),
      items: [],
      registration: { id: registration.id, registrationNo: registration.registrationNo, status: registration.status },
      payments: [{ id: "payment-success", status: PaymentStatus.SUCCESS, amountCent: 70000, failedReason: null, createdAt: new Date("2026-06-06T00:01:00.000Z"), paidAt: new Date("2026-06-06T02:00:00.000Z") }]
    }
  ];
  const attendees = [
    {
      id: "attendee-1",
      registrationId: registration.id,
      skuId: "sku-1",
      name: "张三",
      phone: "13800000000",
      company: "某公司",
      title: "经理",
      formDataJson: registration.formDataJson,
      checkInStatus: CheckInStatus.PENDING,
      checkedInAt: null as Date | null,
      checkedInBy: null as string | null,
      adminRemark: null as string | null,
      createdAt: new Date("2026-06-06T01:00:00.000Z"),
      sku: { name: "仅参会" }
    }
  ];
  let nextConference = 2;

  const mock = {
    auditLogs,
    conferences,
    orders,
    $transaction: async (input: any) => (Array.isArray(input) ? Promise.all(input) : input(mock)),
    adminUser: {
      findUnique: async (args: { where: { username?: string; id?: string } }) => {
        if (args.where.username && args.where.username !== "admin") {
          return null;
        }
        if (args.where.id && args.where.id !== currentAdmin.id) {
          return null;
        }
        return {
          ...currentAdmin,
          enabled: true,
          passwordHash: hashPassword("Admin@123456")
        };
      }
    },
    auditLog: {
      create: async (args: { data: AuditLogRecord }) => {
        auditLogs.push(args.data);
        return args.data;
      }
    },
    conference: {
      create: async (args: { data: Record<string, unknown> }) => {
        const conference: ConferenceRecord = {
          id: `conference-${nextConference++}`,
          title: String(args.data.title),
          slug: String(args.data.slug),
          coverImageUrl: typeof args.data.coverImageUrl === "string" ? args.data.coverImageUrl : null,
          summary: typeof args.data.summary === "string" ? args.data.summary : null,
          location: typeof args.data.location === "string" ? args.data.location : null,
          startsAt: args.data.startsAt as Date,
          endsAt: args.data.endsAt as Date,
          registrationStartsAt: args.data.registrationStartsAt instanceof Date ? args.data.registrationStartsAt : null,
          registrationEndsAt: args.data.registrationEndsAt instanceof Date ? args.data.registrationEndsAt : null,
          checkInEnabled: false,
          checkInStartsAt: null,
          checkInEndsAt: null,
          checkInMethods: null,
          checkInFieldBindings: null,
          groupRegistrationEnabled: Boolean(args.data.groupRegistrationEnabled ?? true),
          maxTicketsPerOrder: typeof args.data.maxTicketsPerOrder === "number" ? args.data.maxTicketsPerOrder : null,
          showRegistrationCount: Boolean(args.data.showRegistrationCount ?? false),
          showRemainingSeats: Boolean(args.data.showRemainingSeats ?? false),
          status: (args.data.status as ConferenceStatus) ?? ConferenceStatus.DRAFT,
          sortOrder: Number(args.data.sortOrder ?? 0),
          createdAt: new Date("2026-06-06T00:00:00.000Z"),
          updatedAt: new Date("2026-06-06T00:00:00.000Z"),
          page: {
            contentJson: {},
            styleJson: null
          },
          _count: {
            skus: 0,
            orders: 0,
            registrations: 0
          },
          formDefinition: { fields: [] }
        };
        conferences.push(conference);
        return conference;
      },
      findUnique: async (args: { where: { id?: string } }) => conferences.find((conference) => conference.id === args.where.id) ?? null,
      update: async (args: { where: { id: string }; data: { status?: ConferenceStatus; registrationStartsAt?: Date | null; registrationEndsAt?: Date | null; checkInEnabled?: boolean; checkInStartsAt?: Date | null; checkInEndsAt?: Date | null; checkInMethods?: unknown; checkInFieldBindings?: unknown } }) => {
        const conference = conferences.find((item) => item.id === args.where.id);
        if (!conference) {
          throw new Error("missing conference");
        }
        if (args.data.status) {
          conference.status = args.data.status;
        }
        if ("registrationStartsAt" in args.data) conference.registrationStartsAt = args.data.registrationStartsAt ?? null;
        if ("registrationEndsAt" in args.data) conference.registrationEndsAt = args.data.registrationEndsAt ?? null;
        if (typeof args.data.checkInEnabled === "boolean") {
          conference.checkInEnabled = args.data.checkInEnabled;
        }
        if ("checkInStartsAt" in args.data) conference.checkInStartsAt = args.data.checkInStartsAt ?? null;
        if ("checkInEndsAt" in args.data) conference.checkInEndsAt = args.data.checkInEndsAt ?? null;
        if ("checkInMethods" in args.data) conference.checkInMethods = args.data.checkInMethods ?? null;
        if ("checkInFieldBindings" in args.data) conference.checkInFieldBindings = args.data.checkInFieldBindings ?? null;
        if (typeof (args.data as { groupRegistrationEnabled?: boolean }).groupRegistrationEnabled === "boolean") {
          conference.groupRegistrationEnabled = (args.data as { groupRegistrationEnabled: boolean }).groupRegistrationEnabled;
        }
        if ("maxTicketsPerOrder" in args.data) {
          conference.maxTicketsPerOrder = (args.data as { maxTicketsPerOrder?: number | null }).maxTicketsPerOrder ?? null;
        }
        if (typeof (args.data as { showRegistrationCount?: boolean }).showRegistrationCount === "boolean") {
          conference.showRegistrationCount = (args.data as { showRegistrationCount: boolean }).showRegistrationCount;
        }
        if (typeof (args.data as { showRemainingSeats?: boolean }).showRemainingSeats === "boolean") {
          conference.showRemainingSeats = (args.data as { showRemainingSeats: boolean }).showRemainingSeats;
        }
        return conference;
      }
    },
    registrationSku: {
      count: async () => skus.filter((sku) => sku.status === RegistrationSkuStatus.ACTIVE).length,
      create: async (args: { data: Record<string, unknown> }) => ({
        id: "sku-new",
        conferenceId: args.data.conferenceId,
        name: args.data.name,
        description: args.data.description,
        priceCent: args.data.priceCent,
        stock: args.data.stock,
        lockedStock: 0,
        soldCount: 0,
        status: args.data.status ?? RegistrationSkuStatus.ACTIVE,
        saleStartAt: null,
        saleEndAt: null,
        sortOrder: 0,
        createdAt: new Date("2026-06-06T00:00:00.000Z"),
        updatedAt: new Date("2026-06-06T00:00:00.000Z")
      })
    },
    formDefinition: {
      upsert: async () => formDefinitions[0]
    },
    formField: {
      create: async (args: { data: { fieldKey: string } }) => {
        if (formFields.some((field) => field.fieldKey === args.data.fieldKey)) {
          throw { code: "P2002" };
        }
        return {
          id: "field-new",
          formDefinitionId: "form-1",
          label: "新字段",
          fieldKey: args.data.fieldKey,
          type: FormFieldType.TEXT,
          required: false,
          placeholder: null,
          optionsJson: [],
          validationJson: null,
          sortOrder: 0,
          enabled: true,
          createdAt: new Date("2026-06-06T00:00:00.000Z"),
          updatedAt: new Date("2026-06-06T00:00:00.000Z")
        };
      }
    },
    registration: {
      update: async (args: { where: { id: string }; data: { adminRemark: string | null; remarkUpdatedAt: Date; remarkUpdatedBy: string } }) => {
        if (args.where.id !== registration.id) {
          throw new Error("missing registration");
        }

        Object.assign(registration, args.data);
        return registration;
      }
    },
    order: {
      findUnique: async (args: { where: { orderNo?: string } }) => orders.find((order) => order.orderNo === args.where.orderNo) ?? null,
      findMany: async () => orders,
      update: async (args: { where: { id: string }; data: { status?: OrderStatus } }) => {
        const order = orders.find((item) => item.id === args.where.id);
        if (!order) throw new Error("missing order");
        Object.assign(order, args.data);
        return order;
      },
      updateMany: async (args: { where: { id: string | { in: string[] }; status?: OrderStatus }; data: { status?: OrderStatus } }) => {
        const orderIds = typeof args.where.id === "string" ? [args.where.id] : args.where.id.in;
        const matched = orders.filter((order) => orderIds.includes(order.id) && (!args.where.status || order.status === args.where.status));
        matched.forEach((order) => Object.assign(order, args.data));
        return { count: matched.length };
      }
    },
    payment: {
      updateMany: async (args: { where: { orderId?: string | { in: string[] }; status?: PaymentStatus }; data: { status?: PaymentStatus; failedReason?: string } }) => {
        const orderIds = typeof args.where.orderId === "string" ? [args.where.orderId] : args.where.orderId?.in ?? [];
        const matched = orders.flatMap((order) => order.payments.map((payment) => ({ order, payment }))).filter(({ order, payment }) => orderIds.includes(order.id) && (!args.where.status || payment.status === args.where.status));
        matched.forEach(({ payment }) => Object.assign(payment, args.data));
        return { count: matched.length };
      }
    },
    couponRedemption: {
      updateMany: async () => ({ count: 0 })
    },
    registrationAttendee: {
      findUnique: async (args: { where: { id: string } }) => {
        const attendee = attendees.find((item) => item.id === args.where.id);
        if (!attendee) {
          return null;
        }

        return {
          id: attendee.id,
          checkInStatus: attendee.checkInStatus,
          registration: {
            id: registration.id,
            registrationNo: registration.registrationNo,
            status: registration.status,
            order: {
              status: registration.order.status
            }
          }
        };
      },
      update: async (args: { where: { id: string }; data: { checkInStatus: CheckInStatus; checkedInAt: Date; checkedInBy: string } }) => {
        const attendee = attendees.find((item) => item.id === args.where.id);
        if (!attendee) {
          throw new Error("missing attendee");
        }

        Object.assign(attendee, args.data);
        return attendee;
      }
    }
  };

  return mock as typeof mock & PrismaService & { orders: typeof orders };
}

function createRegistrationRead() {
  const paidAt = new Date("2026-06-06T02:00:00.000Z");
  return {
    id: "registration-1",
    registrationNo: "RREG001",
    conferenceId: "conference-1",
    skuId: "sku-1",
    attendeeName: "张三",
    phone: "13800000000",
    paidAmountCent: 70000,
    status: RegistrationStatus.CONFIRMED,
    confirmedAt: paidAt,
    adminRemark: null as string | null,
    remarkUpdatedAt: null as Date | null,
    remarkUpdatedBy: null as string | null,
    createdAt: new Date("2026-06-06T01:00:00.000Z"),
    formDataJson: {
      name: "张三",
      phone: "13800000000"
    },
    user: {
      id: "user-1",
      openid: "openid-1",
      wechatNickname: "微信用户",
      wechatAvatarUrl: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lastActiveAt: null
    },
    conference: { title: "示例会议" },
    sku: { name: "仅参会" },
    order: {
      orderNo: "REG001",
      status: OrderStatus.PAID,
      payableAmountCent: 70000,
      paidAmountCent: 70000,
      paidAt,
      payments: []
    },
    attendees: []
  };
}

function createExecutionContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const iterations = 120_000;
  const digest = "sha512";
  const hash = pbkdf2Sync(password, salt, iterations, 64, digest).toString("hex");
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

interface AuditLogRecord {
  adminUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadataJson?: unknown;
}

interface ConferenceRecord {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  summary: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  registrationStartsAt: Date | null;
  registrationEndsAt: Date | null;
  checkInEnabled: boolean;
  checkInStartsAt: Date | null;
  checkInEndsAt: Date | null;
  checkInMethods: unknown;
  checkInFieldBindings: unknown;
  groupRegistrationEnabled: boolean;
  maxTicketsPerOrder: number | null;
  showRegistrationCount: boolean;
  showRemainingSeats: boolean;
  status: ConferenceStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  page: {
    contentJson: unknown;
    styleJson: unknown;
  };
  _count: {
    skus: number;
    orders: number;
    registrations: number;
  };
  formDefinition?: {
    fields: unknown[];
  };
}
