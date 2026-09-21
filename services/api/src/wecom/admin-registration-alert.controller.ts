import { Body, Controller, Get, Put, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { AdminRegistrationAlertService } from "./services/admin-registration-alert.service";
@Controller("admin/paid-alerts")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminRegistrationAlertController {
  constructor(private readonly service: AdminRegistrationAlertService) {}
  @Get()
  @RequireAdminPermissions("notification:view", "system:account", "registration:view")
  get() { return this.service.configuration(); }
  @Put()
  @RequireAdminPermissions("notification:write", "system:account", "wecom:send", "registration:view")
  put(@Body() body: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.configure(body, req.currentAdmin!); }
}
