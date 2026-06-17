import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WecomGroupMessageService } from "./services/wecom-group-message.service";

@Controller("admin/wecom")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminWecomGroupMessageController {
  constructor(private readonly service: WecomGroupMessageService) {}

  @Get("group-message-tasks")
  @RequireAdminPermissions("wecom:view")
  listTasks(@Query() query: Record<string, unknown>) {
    return this.service.listTasks(query);
  }

  @Post("group-message-tasks")
  @RequireAdminPermissions("wecom:write")
  createTask(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.service.createTask(body, request.currentAdmin!);
  }

  @Post("group-message-tasks/:id/create-wecom-task")
  @RequireAdminPermissions("wecom:send")
  createWecomTask(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.service.createWecomTask(id, request.currentAdmin!);
  }

  @Post("group-message-tasks/:id/refresh-result")
  @RequireAdminPermissions("wecom:send")
  refreshResult(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.service.refreshResult(id, request.currentAdmin!);
  }

  @Get("group-message-logs")
  @RequireAdminPermissions("wecom:view")
  logs(@Query() query: Record<string, unknown>) {
    return this.service.logs(query);
  }
}
