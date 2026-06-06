import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
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
    return {
      code: "OK",
      message: "ok",
      data: {
        user: request.currentUser
      }
    };
  }
}
