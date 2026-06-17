import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WecomWelcomeTemplateService } from "./services/wecom-welcome-template.service";

@Controller("admin/wecom/welcome-templates")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminWecomWelcomeTemplateController {
  constructor(private readonly service: WecomWelcomeTemplateService) {}

  @Get()
  @RequireAdminPermissions("wecom:view")
  list() {
    return this.service.list();
  }

  @Post()
  @RequireAdminPermissions("wecom:write")
  create(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.service.create(body, request.currentAdmin!);
  }

  @Patch(":id")
  @RequireAdminPermissions("wecom:write")
  update(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.service.update(id, body, request.currentAdmin!);
  }

  @Delete(":id")
  @RequireAdminPermissions("wecom:write")
  delete(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.service.delete(id, request.currentAdmin!);
  }
}
