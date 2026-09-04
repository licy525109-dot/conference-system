import "reflect-metadata";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { AdminAccessService } from "./admin-access.service";

describe("AdminAccessService authorization hardening", () => {
  it("seeds built-in access definitions without granting super-admin to every account", async () => {
    let adminRoleWrites = 0;
    const prisma = {
      permission: {
        upsert: async () => ({}),
        findMany: async () => [{ id: "permission-1" }]
      },
      role: {
        upsert: async () => ({ id: "role-super" })
      },
      rolePermission: {
        upsert: async () => ({})
      },
      adminUserRole: {
        upsert: async () => {
          adminRoleWrites += 1;
          return {};
        }
      },
      adminUser: {
        findMany: async () => [{ id: "admin-1" }, { id: "admin-2" }]
      }
    } as unknown as PrismaService;

    await new AdminAccessService(prisma).ensureBuiltInAccess();

    assert.equal(adminRoleWrites, 0);
  });

  it("fails closed when role data cannot be read", async () => {
    const prisma = {
      permission: { upsert: async () => ({}), findMany: async () => [] },
      role: { upsert: async () => ({ id: "role-super" }) },
      rolePermission: { upsert: async () => ({}) },
      adminUserRole: {},
      adminUser: {
        findUnique: async () => {
          throw new Error("database unavailable");
        }
      }
    } as unknown as PrismaService;

    const permissions = await new AdminAccessService(prisma).getAdminPermissions("admin-1");

    assert.deepEqual(permissions, []);
  });

  it("returns only permissions assigned through enabled roles", async () => {
    const prisma = {
      permission: { upsert: async () => ({}), findMany: async () => [] },
      role: { upsert: async () => ({ id: "role-super" }) },
      rolePermission: { upsert: async () => ({}) },
      adminUserRole: {},
      adminUser: {
        findUnique: async () => ({
          roles: [
            {
              role: {
                code: "operator",
                permissions: [
                  { permission: { code: "registration:view" } },
                  { permission: { code: "registration:view" } },
                  { permission: { code: "registration:write" } }
                ]
              }
            }
          ]
        })
      }
    } as unknown as PrismaService;

    const permissions = await new AdminAccessService(prisma).getAdminPermissions("admin-1");

    assert.deepEqual(permissions, ["registration:view", "registration:write"]);
  });
});
