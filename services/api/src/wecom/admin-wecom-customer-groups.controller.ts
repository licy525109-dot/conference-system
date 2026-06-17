import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WecomCustomerGroupService } from "./services/wecom-customer-group.service";

@Controller("admin/wecom/customer-groups")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminWecomCustomerGroupsController {
  constructor(private readonly service: WecomCustomerGroupService) {}

  @Get()
  @RequireAdminPermissions("wecom:view")
  list(@Query() query: Record<string, unknown>) {
    return this.service.list(query);
  }

  @Post("sync")
  @RequireAdminPermissions("wecom:write")
  sync(@Req() request: RequestWithCurrentAdmin) {
    return this.service.sync(request.currentAdmin!);
  }

  @Patch(":id/bind-conference")
  @RequireAdminPermissions("wecom:write")
  bindConference(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.service.bindConference(id, body, request.currentAdmin!);
  }
}
