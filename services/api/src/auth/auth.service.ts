import { BadRequestException, Injectable, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { PrismaService } from "../prisma.service";
import { CurrentUser } from "./current-user";
import { signJwt, verifyJwt } from "./jwt";
import { WechatAuthService, WechatSession } from "./wechat-auth.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface LoginResponse {
  token: string;
  user: CurrentUser;
}

export interface UploadedAvatarFile {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size: number;
}

const MAX_WECHAT_NICKNAME_LENGTH = 32;
const MAX_AVATAR_SIZE_BYTES = 2 * 1024 * 1024;
const ALLOWED_AVATAR_MIME_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);
const UPLOADS_ROOT = join(process.cwd(), "uploads");
const WECHAT_AVATAR_UPLOAD_DIR = join(UPLOADS_ROOT, "wechat-avatars");

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatAuthService: WechatAuthService = new WechatAuthService()
  ) {}

  async wechatLogin(input: unknown): Promise<ApiResponse<LoginResponse>> {
    if (!isRecord(input)) {
      throw new BadRequestException("Request body must be a JSON object");
    }

    const code = readRequiredString(input, "code");
    const nickname = readOptionalString(input, "nickname");

    const loginMode = this.getWechatLoginMode();
    if (loginMode === "mock") {
      return this.loginWithWechatSession(
        {
          openid: `mock_${code}`,
          sessionKey: "",
          unionid: null
        },
        nickname
      );
    }

    if (loginMode === "real") {
      const session = await this.wechatAuthService.code2Session(code);
      return this.loginWithWechatSession(session, nickname);
    }

    throw new BadRequestException("WECHAT_LOGIN_MODE must be mock or real");
  }

  private async loginWithWechatSession(
    session: WechatSession,
    nickname: string | null
  ): Promise<ApiResponse<LoginResponse>> {
    const user = await this.prisma.user.upsert({
      where: { openid: session.openid },
      update: {
        ...(nickname !== null ? { nickname } : {}),
        ...(session.unionid ? { unionid: session.unionid } : {}),
        lastActiveAt: new Date()
      },
      create: {
        openid: session.openid,
        unionid: session.unionid,
        nickname,
        lastActiveAt: new Date()
      },
      select: userProfileSelect
    });
    const formattedUser = formatUserProfile(user);

    return ok({
      token: this.signUserToken(formattedUser),
      user: formattedUser
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
        nickname: true,
        wechatNickname: true,
        wechatAvatarUrl: true,
        createdAt: true,
        lastActiveAt: true
      }
    });

    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return formatUserProfile(user);
  }

  async getMe(currentUser: CurrentUser): Promise<ApiResponse<{ user: CurrentUser }>> {
    const user = await this.prisma.user.update({
      where: { id: currentUser.id },
      data: { lastActiveAt: new Date() },
      select: userProfileSelect
    });

    if (!user) {
      throw new UnauthorizedException("Invalid bearer token");
    }

    return ok({ user: formatUserProfile(user) });
  }

  async updateWechatProfile(
    currentUser: CurrentUser,
    input: unknown
  ): Promise<ApiResponse<{ user: CurrentUser }>> {
    const body = readObject(input);
    const wechatNickname = readOptionalNullableString(body, "wechatNickname");
    const wechatAvatarUrl = readOptionalNullableString(body, "wechatAvatarUrl");

    if (typeof wechatNickname !== "undefined" && wechatNickname !== null && wechatNickname.length > MAX_WECHAT_NICKNAME_LENGTH) {
      throw new BadRequestException(`wechatNickname must be ${MAX_WECHAT_NICKNAME_LENGTH} characters or fewer`);
    }

    if (typeof wechatAvatarUrl !== "undefined" && wechatAvatarUrl !== null && !isValidAvatarUrl(wechatAvatarUrl)) {
      throw new BadRequestException("wechatAvatarUrl must be a valid http(s) URL");
    }

    const user = await this.prisma.user.update({
      where: { id: currentUser.id },
      data: {
        ...(typeof wechatNickname !== "undefined" ? { wechatNickname } : {}),
        ...(typeof wechatAvatarUrl !== "undefined" ? { wechatAvatarUrl } : {}),
        profileUpdatedAt: new Date()
      },
      select: userProfileSelect
    });

    return ok({ user: formatUserProfile(user) });
  }

  async saveWechatAvatar(
    currentUser: CurrentUser,
    file: UploadedAvatarFile | undefined,
    publicOrigin: string
  ): Promise<ApiResponse<{ avatarUrl: string; user: CurrentUser }>> {
    if (!file) {
      throw new BadRequestException("avatar file is required");
    }

    const extension = readAllowedAvatarExtension(file);
    mkdirSync(WECHAT_AVATAR_UPLOAD_DIR, { recursive: true });

    const fileName = `${currentUser.id}-${Date.now()}-${randomBytes(8).toString("hex")}${extension}`;
    const filePath = join(WECHAT_AVATAR_UPLOAD_DIR, fileName);
    writeFileSync(filePath, file.buffer, { flag: "wx" });

    const avatarUrl = `${publicOrigin.replace(/\/$/, "")}/uploads/wechat-avatars/${fileName}`;
    const user = await this.prisma.user.update({
      where: { id: currentUser.id },
      data: {
        wechatAvatarUrl: avatarUrl,
        profileUpdatedAt: new Date()
      },
      select: userProfileSelect
    });

    return ok({ avatarUrl, user: formatUserProfile(user) });
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

const userProfileSelect = {
  id: true,
  openid: true,
  nickname: true,
  wechatNickname: true,
  wechatAvatarUrl: true,
  createdAt: true,
  lastActiveAt: true
} as const;

function formatUserProfile(user: {
  id: string;
  openid: string | null;
  nickname: string | null;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
  createdAt: Date;
  lastActiveAt: Date | null;
}): CurrentUser {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
    registeredAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null
  };
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}

function readObject(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  return input;
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

function readOptionalNullableString(input: Record<string, unknown>, field: string): string | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }

  const value = input[field];
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidAvatarUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || (process.env.NODE_ENV !== "production" && url.protocol === "http:");
  } catch {
    return false;
  }
}

function readAllowedAvatarExtension(file: UploadedAvatarFile): string {
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new BadRequestException("avatar file must be 2MB or smaller");
  }

  const detectedExtension = detectImageExtension(file.buffer);
  if (!detectedExtension) {
    throw new BadRequestException("avatar file content must match jpg, jpeg, png, or webp");
  }

  const mimeExtension = ALLOWED_AVATAR_MIME_TYPES.get(file.mimetype ?? "");
  if (file.mimetype && file.mimetype !== "application/octet-stream" && mimeExtension !== detectedExtension) {
    throw new BadRequestException("avatar file mimetype must match jpg, jpeg, png, or webp");
  }

  const originalExtension = extname(file.originalname ?? "").toLowerCase();
  if (originalExtension && ![".jpg", ".jpeg", ".png", ".webp"].includes(originalExtension)) {
    throw new BadRequestException("avatar file must be jpg, jpeg, png, or webp");
  }

  return detectedExtension;
}

function detectImageExtension(buffer: Buffer): string | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return ".jpg";
  }

  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return ".png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return ".webp";
  }

  return null;
}
