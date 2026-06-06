import { pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { AuditAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { signJwt, verifyJwt } from "../auth/jwt";
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
  constructor(private readonly prisma: PrismaService) {}

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

    const admin: CurrentAdmin = {
      id: adminUser.id,
      username: adminUser.username,
      displayName: adminUser.displayName
    };

    return ok({
      token: this.signAdminToken(admin),
      admin
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

    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName
    };
  }

  private signAdminToken(admin: CurrentAdmin): string {
    return signJwt(
      {
        sub: admin.id,
        openid: null,
        type: "admin",
        username: admin.username,
        iat: Math.floor(Date.now() / 1000)
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
