import { Body, Controller, Get, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WecomConfigService } from "./services/wecom-config.service";

@Controller("admin/wecom/config")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminWecomConfigController {
  constructor(private readonly service: WecomConfigService) {}

  @Get()
  @RequireAdminPermissions("wecom:view")
  getConfig() {
    return this.service.getConfig();
  }

  @Patch()
  @RequireAdminPermissions("wecom:write")
  updateConfig(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.service.updateConfig(body, request.currentAdmin!);
  }

  @Post("test-token")
  @RequireAdminPermissions("wecom:write")
  testToken(@Req() request: RequestWithCurrentAdmin) {
    return this.service.testAccessToken(request.currentAdmin!);
  }

  @Post("check-permissions")
  @RequireAdminPermissions("wecom:write")
  checkPermissions(@Req() request: RequestWithCurrentAdmin) {
    return this.service.checkCustomerContactPermission(request.currentAdmin!);
  }
}
