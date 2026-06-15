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
        location: "上海",
        contentJson: { blocks: [] },
        styleJson: {}
      },
      currentAdmin
    );

    assert.equal((response.data as { title: string }).title, "新会议");
    assert.equal(prisma.conferences.length, 2);
    assert.equal(prisma.auditLogs.some((log) => log.entityType === "Conference" && log.action === AuditAction.CREATE), true);
  });

  it("updates conference status", async () => {
    const prisma = createPrismaMock();
    const service = new AdminManagementService(prisma);

    const response = await service.updateConferenceStatus("conference-1", { status: "PUBLISHED" }, currentAdmin);

    assert.equal((response.data as { status: string }).status, "PUBLISHED");
    assert.equal(prisma.conferences[0]?.status, ConferenceStatus.PUBLISHED);
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

  it("does not expose an order paid mutation on admin controller", () => {
    const controller = new AdminManagementController(new AdminManagementService(createPrismaMock()));
    const controllerShape = controller as unknown as Record<string, unknown>;

    assert.equal(typeof controllerShape.listOrders, "function");
    assert.equal(typeof controllerShape.getOrder, "function");
    assert.equal(controllerShape.updateOrder, undefined);
    assert.equal(controllerShape.markOrderPaid, undefined);
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
      groupRegistrationEnabled: true,
      maxTicketsPerOrder: null,
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
      }
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
          registrationStartsAt: null,
          registrationEndsAt: null,
          checkInEnabled: false,
          groupRegistrationEnabled: Boolean(args.data.groupRegistrationEnabled ?? true),
          maxTicketsPerOrder: typeof args.data.maxTicketsPerOrder === "number" ? args.data.maxTicketsPerOrder : null,
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
          }
        };
        conferences.push(conference);
        return conference;
      },
      findUnique: async (args: { where: { id?: string } }) => conferences.find((conference) => conference.id === args.where.id) ?? null,
      update: async (args: { where: { id: string }; data: { status?: ConferenceStatus; checkInEnabled?: boolean } }) => {
        const conference = conferences.find((item) => item.id === args.where.id);
        if (!conference) {
          throw new Error("missing conference");
        }
        if (args.data.status) {
          conference.status = args.data.status;
        }
        if (typeof args.data.checkInEnabled === "boolean") {
          conference.checkInEnabled = args.data.checkInEnabled;
        }
        if (typeof (args.data as { groupRegistrationEnabled?: boolean }).groupRegistrationEnabled === "boolean") {
          conference.groupRegistrationEnabled = (args.data as { groupRegistrationEnabled: boolean }).groupRegistrationEnabled;
        }
        if ("maxTicketsPerOrder" in args.data) {
          conference.maxTicketsPerOrder = (args.data as { maxTicketsPerOrder?: number | null }).maxTicketsPerOrder ?? null;
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

  return mock as typeof mock & PrismaService;
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
  groupRegistrationEnabled: boolean;
  maxTicketsPerOrder: number | null;
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
}
