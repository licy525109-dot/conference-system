import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CurrentUser } from "./current-user";
import { signJwt, verifyJwt } from "./jwt";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async wechatLogin(input: unknown): Promise<ApiResponse<LoginResponse>> {
    if (!isRecord(input)) {
      throw new BadRequestException("Request body must be a JSON object");
    }

    const code = readRequiredString(input, "code");
    const nickname = readOptionalString(input, "nickname");

    if (this.getWechatLoginMode() !== "mock") {
      throw new BadRequestException("Only mock WeChat login is available in this environment");
    }

    const openid = `mock_${code}`;
    const user = await this.prisma.user.upsert({
      where: { openid },
      update: {
        nickname
      },
      create: {
        openid,
        nickname
      },
      select: {
        id: true,
        openid: true,
        nickname: true
      }
    });

    return ok({
      token: this.signUserToken(user),
      user
    });
  }

  async getCurrentUserFromToken(token: string): Promise<CurrentUser> {
    const payload = verifyJwt(token, this.getJwtSecret());
    if (!payload) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    if (payload.type && payload.type !== "user") {
      throw new UnauthorizedException("Invalid bearer token");
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        openid: true,
        nickname: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return user;
  }

  private signUserToken(user: CurrentUser): string {
    return signJwt(
      {
        sub: user.id,
        openid: user.openid,
        type: "user",
        iat: Math.floor(Date.now() / 1000)
      },
      this.getJwtSecret()
    );
  }

  private getWechatLoginMode(): string {
    return process.env.WECHAT_LOGIN_MODE ?? "mock";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value;
}

function readOptionalString(input: Record<string, unknown>, field: string): string | null {
  const value = input[field];
  if (typeof value === "undefined" || value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }

  return value;
}
