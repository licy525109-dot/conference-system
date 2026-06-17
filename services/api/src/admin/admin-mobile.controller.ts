import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { AdminAuthService } from "./admin-auth.service";

@Controller("admin/mobile")
@UseGuards(JwtAuthGuard)
export class AdminMobileController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login-and-bind")
  loginAndBind(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.adminAuthService.loginAndBindMobile(body, request.currentUser!);
  }

  @Post("session")
  createSession(@Req() request: RequestWithCurrentUser) {
    return this.adminAuthService.createMobileSession(request.currentUser!);
  }
}
