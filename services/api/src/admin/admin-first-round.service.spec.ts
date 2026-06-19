import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminMaterialsService } from "./admin-materials.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { REQUIRED_ADMIN_PERMISSIONS } from "./require-permissions.decorator";
import { CurrentAdmin } from "./current-admin";

const currentAdmin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "系统管理员",
  permissions: ["dashboard:view", "material:view", "material:write"]
};

describe("Admin first-round dashboard", () => {
  it("returns overview metrics from real table-shaped queries", async () => {
    const service = new AdminDashboardService(createDashboardPrismaMock());
    const response = await service.overview();

    assert.equal(response.code, "OK");
    assert.equal(response.data.cards.totalRevenueCent, 20000);
    assert.equal(response.data.cards.paidOrders, 2);
    assert.equal(response.data.cards.pendingCheckInCount, 1);
    assert.equal(response.data.hotConferences[0]?.title, "示例会议");
  });
});

describe("Admin permissions", () => {
  it("rejects requests without required permissions", () => {
    const reflector = new Reflector();
    const guard = new AdminPermissionGuard(reflector);
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRED_ADMIN_PERMISSIONS, ["system:role"], handler);

    assert.throws(
      () => guard.canActivate(createExecutionContext(handler, { currentAdmin })),
      ForbiddenException
    );
  });

  it("allows requests with required permissions", () => {
    const reflector = new Reflector();
    const guard = new AdminPermissionGuard(reflector);
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRED_ADMIN_PERMISSIONS, ["dashboard:view"], handler);

    assert.equal(guard.canActivate(createExecutionContext(handler, { currentAdmin })), true);
  });
});

describe("Admin materials", () => {
  it("creates URL materials and disables them instead of deleting", async () => {
    const prisma = createMaterialsPrismaMock();
    const service = new AdminMaterialsService(prisma);

    const created = await service.createAsset(
      {
        name: "首页 Banner",
        usage: "home_banner",
        url: "https://example.com/banner.png"
      },
      undefined,
      "https://admin.example.com",
      currentAdmin
    );

    assert.equal(created.code, "OK");
    assert.equal(created.data.enabled, true);
    assert.equal(prisma.assets[0]?.url, "https://example.com/banner.png");

    const disabled = await service.disableAsset(created.data.id, currentAdmin);
    assert.equal(disabled.data.enabled, false);
    const deleteLog = prisma.auditLogs.find((log) => log.entityType === "MaterialAsset" && log.action === AuditAction.DELETE);
    assert.ok(deleteLog);
    assert.deepEqual(deleteLog.metadataJson, { usage: "home_banner", references: { productCovers: 0, productImages: 0, total: 0 } });
  });

  it("blocks hard delete when a material is referenced", async () => {
    const prisma = createMaterialsPrismaMock({ referenced: true });
    const service = new AdminMaterialsService(prisma);
    const created = await service.createAsset({ name: "商品封面", usage: "product_cover", url: "https://example.com/product.png" }, undefined, "https://admin.example.com", currentAdmin);

    await assert.rejects(() => service.hardDeleteAsset(created.data.id, currentAdmin), /素材仍被引用/);
    assert.equal(prisma.assets.length, 1);
  });

  it("hard deletes unreferenced material records and tolerates missing local files", async () => {
    const prisma = createMaterialsPrismaMock();
    const service = new AdminMaterialsService(prisma);
    const created = await service.createAsset({ name: "本地素材", usage: "home_banner", url: "https://admin.example.com/uploads/materials/missing.png" }, undefined, "https://admin.example.com", currentAdmin);

    const deleted = await service.hardDeleteAsset(created.data.id, currentAdmin);

    assert.equal(deleted.data.deleted, true);
    assert.equal((deleted.data.file as { missing?: boolean }).missing, true);
    assert.equal(prisma.assets.length, 0);
    assert.equal(prisma.auditLogs.some((log) => log.summary === "Hard delete material asset"), true);
  });
});

function createDashboardPrismaMock() {
  const now = new Date("2026-06-13T08:00:00.000Z");
  const mock = {
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    order: {
      aggregate: async () => ({ _sum: { paidAmountCent: 20000 } }),
      count: async (args?: { where?: { status?: string } }) => (args?.where?.status === "PENDING" ? 1 : 2),
      findMany: async () => [
        {
          orderNo: "REG001",
          attendeeName: "张三",
          payableAmountCent: 10000,
          paidAmountCent: 10000,
          status: "PAID",
          createdAt: now,
          conference: { title: "示例会议" }
        }
      ]
    },
    registration: {
      count: async () => 3,
      findMany: async () => [
        {
          registrationNo: "RREG001",
          attendeeName: "张三",
          phone: "13800000000",
          paidAmountCent: 10000,
          createdAt: now,
          conference: { title: "示例会议" }
        }
      ]
    },
    registrationAttendee: {
      count: async (args?: { where?: { checkInStatus?: string } }) => (args?.where?.checkInStatus === "PENDING" ? 1 : 2)
    },
    couponRedemption: {
      count: async () => 1
    },
    orderDiscount: {
      aggregate: async () => ({ _sum: { amountCent: 3000 } })
    },
    conference: {
      findMany: async () => [
        {
          id: "conference-1",
          title: "示例会议",
          _count: { orders: 2, registrations: 3 }
        }
      ]
    },
    registrationSku: {
      findMany: async () => [
        {
          id: "sku-1",
          name: "仅参会",
          stock: 10,
          soldCount: 3,
          conference: { title: "示例会议" }
        }
      ]
    },
    payment: {
      count: async () => 2
    }
  };
  return mock as typeof mock & PrismaService;
}

function createMaterialsPrismaMock(options: { referenced?: boolean } = {}) {
  const auditLogs: AuditLogRecord[] = [];
  const assets: MaterialAssetRecord[] = [];
  const mock = {
    auditLogs,
    assets,
    materialCategory: {
      findMany: async () => [],
      create: async () => {
        throw new Error("not used");
      }
    },
    materialAsset: {
      create: async (args: { data: Partial<MaterialAssetRecord> }) => {
        const asset = toAsset({ ...args.data, id: "asset-1", enabled: args.data.enabled ?? true });
        assets.push(asset);
        return asset;
      },
      findUnique: async (args: { where: { id: string } }) => assets.find((asset) => asset.id === args.where.id) ?? null,
      update: async (args: { where: { id: string }; data: Partial<MaterialAssetRecord> }) => {
        const asset = assets.find((item) => item.id === args.where.id);
        if (!asset) throw new Error("missing asset");
        Object.assign(asset, args.data, { updatedAt: new Date("2026-06-13T08:00:00.000Z") });
        return asset;
      },
      findMany: async () => assets,
      count: async () => assets.length,
      delete: async (args: { where: { id: string } }) => {
        const index = assets.findIndex((asset) => asset.id === args.where.id);
        if (index >= 0) assets.splice(index, 1);
        return {};
      }
    },
    product: {
      count: async () => (options.referenced ? 1 : 0),
      findMany: async () => (options.referenced ? [{ id: "product-1", title: "商品" }] : [])
    },
    productImage: {
      count: async () => 0,
      findMany: async () => []
    },
    conference: {
      findMany: async () => []
    },
    pageVersion: {
      findMany: async () => []
    },
    activeThemeConfig: {
      findMany: async () => []
    },
    tabBarItem: {
      findMany: async () => []
    },
    memberBenefit: {
      findMany: async () => []
    },
    wecomCustomerGroup: {
      findMany: async () => []
    },
    auditLog: {
      create: async (args: { data: AuditLogRecord }) => {
        auditLogs.push(args.data);
        return args.data;
      }
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops)
  };
  return mock as typeof mock & PrismaService & { assets: MaterialAssetRecord[]; auditLogs: AuditLogRecord[] };
}

function toAsset(input: Partial<MaterialAssetRecord>): MaterialAssetRecord {
  return {
    id: input.id ?? "asset-1",
    categoryId: input.categoryId ?? null,
    name: input.name ?? "素材",
    usage: input.usage ?? "home_banner",
    fileType: input.fileType ?? "image/png",
    url: input.url ?? "https://example.com/a.png",
    sizeBytes: input.sizeBytes ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    enabled: input.enabled ?? true,
    remark: input.remark ?? null,
    createdBy: input.createdBy ?? null,
    updatedBy: input.updatedBy ?? null,
    createdAt: input.createdAt ?? new Date("2026-06-13T08:00:00.000Z"),
    updatedAt: input.updatedAt ?? new Date("2026-06-13T08:00:00.000Z"),
    category: null
  };
}

function createExecutionContext(handler: () => undefined, request: unknown): ExecutionContext {
  return ({
    getHandler: () => handler,
    getClass: () => AdminPermissionGuard,
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as unknown) as ExecutionContext;
}

interface MaterialAssetRecord {
  id: string;
  categoryId: string | null;
  name: string;
  usage: string;
  fileType: string;
  url: string;
  sizeBytes: number | null;
  width: number | null;
  height: number | null;
  enabled: boolean;
  remark: string | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  category: null;
}

interface AuditLogRecord {
  adminUserId?: string | null;
  action: AuditAction;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  metadataJson?: unknown;
}
