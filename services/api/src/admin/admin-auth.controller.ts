import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { RequestWithCurrentAdmin } from "./current-admin";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  login(@Body() body: unknown) {
    return this.adminAuthService.login(body);
  }

  @Get("me")
  @UseGuards(AdminJwtAuthGuard)
  me(@Req() request: RequestWithCurrentAdmin) {
    return {
      code: "OK",
      message: "ok",
      data: {
        admin: request.currentAdmin
      }
    };
  }
}
