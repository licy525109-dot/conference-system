import "reflect-metadata";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { PrismaService } from "../prisma.service";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuthService } from "./admin-auth.service";
import { SCOPED_ADMIN_PERMISSIONS } from "./conference-scope";
import { CurrentAdmin } from "./current-admin";
import { signJwt } from "../auth/jwt";

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

  it("seeds the operator defaults only on first creation and excludes export", async () => {
    const { access, operator, operatorCreates } = roleFixture();
    await access.ensureBuiltInAccess();
    assert.deepEqual([...operator().permissionIds].sort(), SCOPED_ADMIN_PERMISSIONS.filter(code => code !== "registration:export").sort());
    await access.ensureBuiltInAccess();
    await access.getAdminPermissions("scoped-admin");
    assert.equal(operatorCreates(), 1);
  });

  it("preserves role permission revocation across repeated real token hydration", async () => {
    const { access, prisma, operator, operatorCreates } = roleFixture();
    await access.ensureBuiltInAccess();
    await access.updateRole(operator().id, { permissionIds: ["conference:view"] }, roleEditor);
    assert.deepEqual(await access.getAdminPermissions("scoped-admin"), ["conference:view"]);
    const previous = process.env.JWT_SECRET;
    const secret = randomBytes(32).toString("hex");
    process.env.JWT_SECRET = secret;
    try {
      const now = Math.floor(Date.now() / 1000);
      const token = signJwt({ sub: "scoped-admin", openid: null, type: "admin", iat: now, exp: now + 60 }, secret);
      for (let attempt = 0; attempt < 3; attempt++) {
        const current = await new AdminAuthService(prisma, access).getCurrentAdminFromToken(token);
        assert.deepEqual(current.permissions, ["conference:view"]);
        assert.equal(current.conferenceScopeMode, "ASSIGNED");
        assert.deepEqual(current.conferenceIds, ["conference-owned"]);
      }
    } finally {
      if (previous === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previous;
    }
    assert.equal(operatorCreates(), 1);
    assert.deepEqual([...operator().permissionIds], ["conference:view"]);
  });

  it("preserves an explicitly empty permission set without regranting writes", async () => {
    const { access, operator } = roleFixture();
    await access.ensureBuiltInAccess();
    await access.updateRole(operator().id, { permissionIds: [] }, roleEditor);
    assert.deepEqual(await access.getAdminPermissions("scoped-admin"), []);
    assert.deepEqual([...operator().permissionIds], []);
  });

  it("preserves explicit export grants and operator metadata across initialization", async () => {
    const { access, operator } = roleFixture();
    await access.ensureBuiltInAccess();
    await access.updateRole(operator().id, { name: "Custom operator", permissionIds: ["registration:view", "registration:export"] }, roleEditor);
    await access.ensureBuiltInAccess();
    assert.equal(operator().name, "Custom operator");
    assert.deepEqual((await access.getAdminPermissions("scoped-admin")).sort(), ["registration:export", "registration:view"]);
    operator().enabled = false;
    assert.deepEqual(await access.getAdminPermissions("scoped-admin"), []);
    assert.equal(operator().enabled, false);
  });
});

const roleEditor: CurrentAdmin = { id: "main-admin", username: "main", displayName: null,
  permissions: ["*"], conferenceScopeMode: "ALL", conferenceIds: [] };
type StoredRole = { id: string; code: string; name: string; description: string | null;
  system: boolean; enabled: boolean; createdAt: Date; updatedAt: Date; permissionIds: Set<string> };
type RolePatch = Partial<Omit<StoredRole, "permissionIds">> & { permissions?: { create: Array<{ permissionId: string }> } };

function roleFixture() {
  const roles = new Map<string, StoredRole>();
  const permissions = new Map<string, { id: string; code: string; name: string; group: string }>();
  let createdOperators = 0;
  const apply = (role: StoredRole, patch: RolePatch) => {
    const { permissions: nested, ...fields } = patch;
    Object.assign(role, fields);
    for (const item of nested?.create ?? []) role.permissionIds.add(item.permissionId);
    return role;
  };
  const formatted = (role: StoredRole) => ({ ...role,
    permissions: [...role.permissionIds].map(id => ({ permission: permissions.get(id)! })) });
  const byId = (id: string) => [...roles.values()].find(role => role.id === id)!;
  const db = {
    permission: {
      upsert: async ({ create }: { create: { code: string; name: string; group: string } }) => {
        const permission = { ...create, id: create.code };
        permissions.set(create.code, permission);
        return permission;
      },
      findMany: async ({ where }: { where: { code: { in: string[] } } }) => where.code.in.map(code => permissions.get(code)!)
    },
    role: {
      upsert: async ({ where, create, update }: { where: { code: string }; create: RolePatch; update: RolePatch }) => {
        let role = roles.get(where.code);
        if (!role) {
          role = apply({ id: `role-${where.code}`, code: where.code, name: "", description: null,
            enabled: true, system: true, createdAt: new Date(), updatedAt: new Date(), permissionIds: new Set() }, create);
          roles.set(where.code, role);
          if (where.code === "CONFERENCE_OPERATOR") createdOperators++;
        } else apply(role, update);
        return formatted(role);
      },
      findUnique: async ({ where }: { where: { id: string } }) => formatted(byId(where.id)),
      update: async ({ where, data }: { where: { id: string }; data: RolePatch }) => formatted(apply(byId(where.id), data))
    },
    rolePermission: {
      upsert: async ({ create }: { create: { roleId: string; permissionId: string } }) => {
        byId(create.roleId).permissionIds.add(create.permissionId);
        return {};
      },
      deleteMany: async ({ where }: { where: { roleId: string } }) => { byId(where.roleId).permissionIds.clear(); return {}; }
    },
    adminUser: { findUnique: async () => ({ id: "scoped-admin", username: "operator", displayName: null, enabled: true,
      conferenceScopeMode: "ASSIGNED", conferenceGrants: [{ conferenceId: "conference-owned" }],
      roles: [...roles.values()].filter(role => role.code === "CONFERENCE_OPERATOR" && role.enabled).map(role => ({ role: formatted(role) })) }) },
    auditLog: { create: async () => ({}) },
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db)
  };
  const prisma = db as unknown as PrismaService;
  return { prisma, access: new AdminAccessService(prisma), operator: () => roles.get("CONFERENCE_OPERATOR")!, operatorCreates: () => createdOperators };
}
