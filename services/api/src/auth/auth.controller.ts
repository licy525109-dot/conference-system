import { Body, Controller, Get, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";
import { JwtAuthGuard } from "./jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("wechat/login")
  wechatLogin(@Body() body: unknown) {
    return this.authService.wechatLogin(body);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@Req() request: RequestWithCurrentUser) {
    return this.authService.getMe(request.currentUser!);
  }

  @Patch("me/profile")
  @UseGuards(JwtAuthGuard)
  updateWechatProfile(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.authService.updateWechatProfile(request.currentUser!, body);
  }

  @Post("me/avatar")
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 2 * 1024 * 1024 }
    })
  )
  uploadWechatAvatar(
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string; size: number } | undefined,
    @Req() request: RequestWithCurrentUser & { headers?: Record<string, string | string[] | undefined> }
  ) {
    return this.authService.saveWechatAvatar(request.currentUser!, file, getPublicOrigin(request));
  }
}

function getPublicOrigin(request: { headers?: Record<string, string | string[] | undefined> }): string {
  const forwardedProto = readFirstHeader(request.headers?.["x-forwarded-proto"]);
  const forwardedHost = readFirstHeader(request.headers?.["x-forwarded-host"]);
  const host = forwardedHost || readFirstHeader(request.headers?.host) || "localhost:3000";
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}
