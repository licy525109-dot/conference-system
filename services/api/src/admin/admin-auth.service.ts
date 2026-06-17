import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentUser } from "../auth/current-user";
import { signJwt, verifyJwt } from "../auth/jwt";
import { AdminAccessService } from "./admin-access.service";
import { CurrentAdmin } from "./current-admin";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface AdminLoginResponse {
  token: string;
  admin: CurrentAdmin;
}

@Injectable()
export class AdminAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessService?: AdminAccessService
  ) {}

  async login(input: unknown): Promise<ApiResponse<AdminLoginResponse>> {
    if (!isRecord(input)) {
      throw new BadRequestException("Request body must be a JSON object");
    }

    const username = readRequiredString(input, "username");
    const password = readRequiredString(input, "password");
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
        enabled: true
      }
    });

    if (!adminUser || !adminUser.enabled || !verifyPassword(password, adminUser.passwordHash)) {
      throw new UnauthorizedException("Invalid username or password");
    }

    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminUser.id,
        action: AuditAction.LOGIN,
        entityType: "AdminUser",
        entityId: adminUser.id,
        summary: "Admin login"
      }
    });

    await this.access().ensureBuiltInAccess();
    const admin: CurrentAdmin = {
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      permissions: await this.access().getAdminPermissions(adminUser.id)
    };

    return ok({
      token: this.signAdminToken(admin),
      admin
    });
  }

  async loginAndBindMobile(input: unknown, currentUser: CurrentUser): Promise<ApiResponse<AdminLoginResponse & { binding: MobileAdminBinding }>> {
    if (!isRecord(input)) {
      throw new BadRequestException("Request body must be a JSON object");
    }

    const username = readRequiredString(input, "username");
    const password = readRequiredString(input, "password");
    const adminUser = await this.prisma.adminUser.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        displayName: true,
        passwordHash: true,
        enabled: true
      }
    });

    if (!adminUser || !adminUser.enabled || !verifyPassword(password, adminUser.passwordHash)) {
      throw new UnauthorizedException("Invalid username or password");
    }

    if (!currentUser.openid) {
      throw new BadRequestException("当前微信用户缺少 openid，无法绑定管理员手机入口");
    }

    const existingOpenidBinding = await this.prisma.adminWechatBinding.findUnique({
      where: { openid: currentUser.openid },
      select: { id: true, adminUserId: true }
    });
    if (existingOpenidBinding && existingOpenidBinding.adminUserId !== adminUser.id) {
      throw new ConflictException("当前微信已绑定其他管理员账号");
    }

    await this.access().ensureBuiltInAccess();
    const binding = await this.prisma.adminWechatBinding.upsert({
      where: {
        adminUserId_userId: {
          adminUserId: adminUser.id,
          userId: currentUser.id
        }
      },
      update: {
        openid: currentUser.openid,
        enabled: true,
        lastSessionAt: new Date()
      },
      create: {
        adminUserId: adminUser.id,
        userId: currentUser.id,
        openid: currentUser.openid,
        enabled: true,
        lastSessionAt: new Date()
      },
      select: mobileBindingSelect
    });

    await this.prisma.auditLog.create({
      data: {
        adminUserId: adminUser.id,
        action: AuditAction.LOGIN,
        entityType: "AdminWechatBinding",
        entityId: binding.id,
        summary: "Admin mobile login and bind",
        metadataJson: {
          userId: currentUser.id
        }
      }
    });

    const admin = await this.buildCurrentAdmin(adminUser);
    return ok({
      token: this.signAdminToken(admin, 2 * 60 * 60),
      admin,
      binding: formatMobileBinding(binding)
    });
  }

  async createMobileSession(currentUser: CurrentUser): Promise<ApiResponse<AdminLoginResponse & { binding: MobileAdminBinding }>> {
    if (!currentUser.openid) {
      throw new UnauthorizedException("当前微信用户未绑定管理员账号");
    }

    const binding = await this.prisma.adminWechatBinding.findFirst({
      where: {
        userId: currentUser.id,
        openid: currentUser.openid,
        enabled: true,
        adminUser: {
          enabled: true
        }
      },
      select: {
        ...mobileBindingSelect,
        adminUser: {
          select: {
            id: true,
            username: true,
            displayName: true,
            enabled: true
          }
        }
      }
    });

    if (!binding?.adminUser) {
      throw new UnauthorizedException("当前微信用户未绑定管理员账号");
    }

    await this.prisma.adminWechatBinding.update({
      where: { id: binding.id },
      data: { lastSessionAt: new Date() }
    });

    const admin = await this.buildCurrentAdmin(binding.adminUser);
    return ok({
      token: this.signAdminToken(admin, 2 * 60 * 60),
      admin,
      binding: formatMobileBinding(binding)
    });
  }

  async getCurrentAdminFromToken(token: string): Promise<CurrentAdmin> {
    const payload = verifyJwt(token, this.getJwtSecret());
    if (!payload || payload.type !== "admin") {
      throw new UnauthorizedException("Invalid admin bearer token");
    }

    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        displayName: true,
        enabled: true
      }
    });

    if (!admin || !admin.enabled) {
      throw new UnauthorizedException("Invalid admin bearer token");
    }

    return this.buildCurrentAdmin(admin);
  }

  private access(): AdminAccessService {
    return this.accessService ?? new AdminAccessService(this.prisma);
  }

  private async buildCurrentAdmin(adminUser: { id: string; username: string; displayName: string | null }): Promise<CurrentAdmin> {
    return {
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName,
      permissions: await this.access().getAdminPermissions(adminUser.id)
    };
  }

  private signAdminToken(admin: CurrentAdmin, expiresInSeconds?: number): string {
    const now = Math.floor(Date.now() / 1000);
    return signJwt(
      {
        sub: admin.id,
        openid: null,
        type: "admin",
        username: admin.username,
        iat: now,
        ...(expiresInSeconds ? { exp: now + expiresInSeconds } : {})
      },
      this.getJwtSecret()
    );
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new InternalServerErrorException("JWT_SECRET is not configured");
    }

    return secret;
  }
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}

export interface MobileAdminBinding {
  id: string;
  adminUserId: string;
  userId: string;
  openid: string | null;
  enabled: boolean;
  boundAt: string;
  lastSessionAt: string | null;
}

const mobileBindingSelect = {
  id: true,
  adminUserId: true,
  userId: true,
  openid: true,
  enabled: true,
  boundAt: true,
  lastSessionAt: true
} as const;

function formatMobileBinding(binding: {
  id: string;
  adminUserId: string;
  userId: string;
  openid: string | null;
  enabled: boolean;
  boundAt: Date;
  lastSessionAt: Date | null;
}): MobileAdminBinding {
  return {
    id: binding.id,
    adminUserId: binding.adminUserId,
    userId: binding.userId,
    openid: binding.openid,
    enabled: binding.enabled,
    boundAt: binding.boundAt.toISOString(),
    lastSessionAt: binding.lastSessionAt?.toISOString() ?? null
  };
}

export function verifyPassword(password: string, passwordHash: string): boolean {
  const [scheme, digest, iterationsText, salt, hash] = passwordHash.split("$");
  if (scheme !== "pbkdf2" || !digest || !iterationsText || !salt || !hash) {
    return false;
  }

  const iterations = Number.parseInt(iterationsText, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    return false;
  }

  const candidate = pbkdf2Sync(password, salt, iterations, 64, digest).toString("hex");
  const left = Buffer.from(candidate);
  const right = Buffer.from(hash);
  return left.length === right.length && timingSafeEqual(left, right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value.trim();
}
