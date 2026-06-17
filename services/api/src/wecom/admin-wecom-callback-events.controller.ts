import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WecomCallbackService } from "./services/wecom-callback.service";

@Controller("admin/wecom/callback-events")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminWecomCallbackEventsController {
  constructor(private readonly service: WecomCallbackService) {}

  @Get()
  @RequireAdminPermissions("wecom:view")
  list(@Query() query: Record<string, unknown>) {
    return this.service.listEvents(query);
  }
}
