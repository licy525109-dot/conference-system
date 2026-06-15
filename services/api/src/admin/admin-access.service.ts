import { pbkdf2Sync, randomBytes } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { ADMIN_PERMISSION_CODES, ADMIN_PERMISSIONS, SUPER_ADMIN_ROLE_CODE } from "./admin-permissions";
import { CurrentAdmin } from "./current-admin";

@Injectable()
export class AdminAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureBuiltInAccess(): Promise<void> {
    const prismaAny = this.prisma as PrismaService & {
      permission?: unknown;
      role?: unknown;
      rolePermission?: unknown;
      adminUserRole?: unknown;
    };
    if (!prismaAny.permission || !prismaAny.role || !prismaAny.rolePermission || !prismaAny.adminUserRole) {
      return;
    }

    for (const permission of ADMIN_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          name: permission.name,
          group: permission.group
        },
        create: permission
      });
    }

    const role = await this.prisma.role.upsert({
      where: { code: SUPER_ADMIN_ROLE_CODE },
      update: {
        name: "超级管理员",
        description: "拥有后台全部权限",
        system: true,
        enabled: true
      },
      create: {
        code: SUPER_ADMIN_ROLE_CODE,
        name: "超级管理员",
        description: "拥有后台全部权限",
        system: true,
        enabled: true
      }
    });

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: [...ADMIN_PERMISSION_CODES] } },
      select: { id: true }
    });
    for (const permission of permissions) {
      await this.prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id
          }
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id
        }
      });
    }

    const admins = await this.prisma.adminUser.findMany({ select: { id: true } });
    for (const admin of admins) {
      await this.prisma.adminUserRole.upsert({
        where: {
          adminUserId_roleId: {
            adminUserId: admin.id,
            roleId: role.id
          }
        },
        update: {},
        create: {
          adminUserId: admin.id,
          roleId: role.id
        }
      });
    }
  }

  async getAdminPermissions(adminUserId: string): Promise<string[]> {
    try {
      await this.ensureBuiltInAccess();
      const admin = await this.prisma.adminUser.findUnique({
        where: { id: adminUserId },
        select: {
          roles: {
            where: {
              role: {
                enabled: true
              }
            },
            select: {
              role: {
                select: {
                  code: true,
                  permissions: {
                    select: {
                      permission: {
                        select: {
                          code: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      });

      if (!admin) {
        return [];
      }

      if (admin.roles.some((item) => item.role.code === SUPER_ADMIN_ROLE_CODE)) {
        return [...ADMIN_PERMISSION_CODES];
      }

      return Array.from(
        new Set(admin.roles.flatMap((item) => item.role.permissions.map((entry) => entry.permission.code)))
      );
    } catch {
      return [...ADMIN_PERMISSION_CODES];
    }
  }

  async listAccounts(): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const items = await this.prisma.adminUser.findMany({
      orderBy: [{ createdAt: "desc" }],
      select: accountSelect
    });
    return ok({ items: items.map(formatAccount) });
  }

  async createAccount(input: unknown, admin: CurrentAdmin): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const body = readObject(input);
    const username = readRequiredString(body, "username");
    const password = readRequiredString(body, "password");
    const displayName = readOptionalString(body, "displayName");
    const enabled = readOptionalBoolean(body, "enabled") ?? true;
    const roleIds = readStringArray(body.roleIds);

    const account = await catchUniqueConstraint(
      this.prisma.adminUser.create({
        data: {
          username,
          passwordHash: hashPassword(password),
          displayName,
          enabled,
          roles: {
            create: roleIds.map((roleId) => ({ roleId }))
          }
        },
        select: accountSelect
      }),
      "用户名已存在"
    );

    await this.writeAudit(admin, AuditAction.CREATE, "AdminUser", account.id, "Create admin account", { username });
    return ok(formatAccount(account));
  }

  async updateAccount(id: string, input: unknown, admin: CurrentAdmin): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const body = readObject(input);
    const roleIds = typeof body.roleIds === "undefined" ? undefined : readStringArray(body.roleIds);
    const data: Prisma.AdminUserUpdateInput = {
      ...(typeof body.displayName !== "undefined" ? { displayName: readNullableString(body.displayName) } : {}),
      ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
      ...(typeof body.password === "string" && body.password.trim().length > 0
        ? { passwordHash: hashPassword(body.password.trim()) }
        : {})
    };

    const account = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.adminUser.findUnique({ where: { id }, select: { id: true, username: true } });
      if (!existing) {
        throw new NotFoundException("Admin account not found");
      }

      if (roleIds) {
        await tx.adminUserRole.deleteMany({ where: { adminUserId: id } });
      }

      return tx.adminUser.update({
        where: { id },
        data: {
          ...data,
          ...(roleIds
            ? {
                roles: {
                  create: roleIds.map((roleId) => ({ roleId }))
                }
              }
            : {})
        },
        select: accountSelect
      });
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "AdminUser", account.id, "Update admin account", {
      username: account.username
    });
    return ok(formatAccount(account));
  }

  async listPermissions(): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const items = await this.prisma.permission.findMany({
      orderBy: [{ group: "asc" }, { code: "asc" }],
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        group: true
      }
    });
    return ok({ items });
  }

  async listRoles(): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const items = await this.prisma.role.findMany({
      orderBy: [{ system: "desc" }, { createdAt: "asc" }],
      select: roleSelect
    });
    return ok({ items: items.map(formatRole) });
  }

  async createRole(input: unknown, admin: CurrentAdmin): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const body = readObject(input);
    const code = readRequiredString(body, "code");
    const name = readRequiredString(body, "name");
    const description = readOptionalString(body, "description");
    const enabled = readOptionalBoolean(body, "enabled") ?? true;
    const permissionIds = readStringArray(body.permissionIds);
    const role = await catchUniqueConstraint(
      this.prisma.role.create({
        data: {
          code,
          name,
          description,
          enabled,
          permissions: {
            create: permissionIds.map((permissionId) => ({ permissionId }))
          }
        },
        select: roleSelect
      }),
      "角色编码已存在"
    );

    await this.writeAudit(admin, AuditAction.CREATE, "Role", role.id, "Create role", { code });
    return ok(formatRole(role));
  }

  async updateRole(id: string, input: unknown, admin: CurrentAdmin): Promise<unknown> {
    await this.ensureBuiltInAccess();
    const body = readObject(input);
    const permissionIds = typeof body.permissionIds === "undefined" ? undefined : readStringArray(body.permissionIds);
    const role = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.role.findUnique({ where: { id }, select: { id: true, system: true, code: true } });
      if (!existing) {
        throw new NotFoundException("Role not found");
      }
      if (existing.system && (typeof body.code !== "undefined" || typeof body.enabled !== "undefined")) {
        throw new BadRequestException("系统角色不允许修改编码或停用");
      }
      if (permissionIds) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
      }
      return catchUniqueConstraint(
        tx.role.update({
          where: { id },
          data: {
            ...(typeof body.code !== "undefined" ? { code: readRequiredString(body, "code") } : {}),
            ...(typeof body.name !== "undefined" ? { name: readRequiredString(body, "name") } : {}),
            ...(typeof body.description !== "undefined" ? { description: readNullableString(body.description) } : {}),
            ...(typeof body.enabled !== "undefined" ? { enabled: readRequiredBoolean(body.enabled, "enabled") } : {}),
            ...(permissionIds
              ? {
                  permissions: {
                    create: permissionIds.map((permissionId) => ({ permissionId }))
                  }
                }
              : {})
          },
          select: roleSelect
        }),
        "角色编码已存在"
      );
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "Role", role.id, "Update role", { code: role.code });
    return ok(formatRole(role));
  }

  private async writeAudit(
    admin: CurrentAdmin,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summary: string,
    metadataJson?: Prisma.InputJsonObject
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadataJson
      }
    });
  }
}

const accountSelect = {
  id: true,
  username: true,
  displayName: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  roles: {
    select: {
      role: {
        select: {
          id: true,
          code: true,
          name: true
        }
      }
    }
  }
} satisfies Prisma.AdminUserSelect;

const roleSelect = {
  id: true,
  code: true,
  name: true,
  description: true,
  system: true,
  enabled: true,
  createdAt: true,
  updatedAt: true,
  permissions: {
    select: {
      permission: {
        select: {
          id: true,
          code: true,
          name: true,
          group: true
        }
      }
    }
  }
} satisfies Prisma.RoleSelect;

function formatAccount(account: Prisma.AdminUserGetPayload<{ select: typeof accountSelect }>) {
  return {
    ...account,
    roles: account.roles.map((item) => item.role),
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString()
  };
}

function formatRole(role: Prisma.RoleGetPayload<{ select: typeof roleSelect }>) {
  return {
    ...role,
    permissions: role.permissions.map((item) => item.permission),
    createdAt: role.createdAt.toISOString(),
    updatedAt: role.updatedAt.toISOString()
  };
}

function ok<TData>(data: TData) {
  return {
    code: "OK" as const,
    message: "ok",
    data
  };
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const iterations = 120_000;
  const digest = "sha512";
  const hash = pbkdf2Sync(password, salt, iterations, 64, digest).toString("hex");
  return `pbkdf2$${digest}$${iterations}$${salt}$${hash}`;
}

async function catchUniqueConstraint<T>(promise: Promise<T>, message: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRecord(error) && error.code === "P2002") {
      throw new ConflictException(message);
    }
    throw error;
  }
}

function readObject(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }
  return input;
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, field: string): string | null {
  return typeof input[field] === "string" && input[field].trim().length > 0 ? input[field].trim() : null;
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readOptionalBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  return typeof input[field] === "boolean" ? input[field] : undefined;
}

function readRequiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function readStringArray(value: unknown): string[] {
  if (typeof value === "undefined") {
    return [];
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new BadRequestException("Expected a string array");
  }
  return value.map((item) => item.trim());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
