import "reflect-metadata";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { AuditAction, ConferenceStatus, FormFieldType, RegistrationSkuStatus } from "@prisma/client";
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
      update: async (args: { where: { id: string }; data: { status?: ConferenceStatus } }) => {
        const conference = conferences.find((item) => item.id === args.where.id);
        if (!conference) {
          throw new Error("missing conference");
        }
        if (args.data.status) {
          conference.status = args.data.status;
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
    }
  };

  return mock as typeof mock & PrismaService;
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
