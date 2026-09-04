import { Body, Controller, Get, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { resolvePublicOrigin } from "../security/public-origin";

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

  @Post("me/phone/wechat")
  @UseGuards(JwtAuthGuard)
  bindWechatPhone(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.authService.bindWechatPhone(request.currentUser!, body);
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
    return this.authService.saveWechatAvatar(request.currentUser!, file, resolvePublicOrigin(request.headers));
  }
}
