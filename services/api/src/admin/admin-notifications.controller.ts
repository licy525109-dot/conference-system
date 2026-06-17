import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminNotificationsService } from "./admin-notifications.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notificationsService: AdminNotificationsService) {}

  @Post("subscribe")
  @UseGuards(JwtAuthGuard)
  subscribe(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.notificationsService.subscribe(body, request.currentUser!);
  }
}

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: AdminNotificationsService) {}

  @Get("notification-templates")
  @RequireAdminPermissions("notification:view")
  listTemplates(@Query() query: Record<string, unknown>) {
    return this.notificationsService.listTemplates(query);
  }

  @Post("notification-templates")
  @RequireAdminPermissions("notification:write")
  createTemplate(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.createTemplate(body, request.currentAdmin!);
  }

  @Patch("notification-templates/:id")
  @RequireAdminPermissions("notification:write")
  updateTemplate(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.updateTemplate(id, body, request.currentAdmin!);
  }

  @Get("notification-tasks")
  @RequireAdminPermissions("notification:view")
  listTasks(@Query() query: Record<string, unknown>) {
    return this.notificationsService.listTasks(query);
  }

  @Post("notification-tasks")
  @RequireAdminPermissions("notification:write")
  createTask(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.createTask(body, request.currentAdmin!);
  }

  @Post("notification-tasks/:id/send-now")
  @RequireAdminPermissions("notification:send")
  sendNow(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.sendNow(id, request.currentAdmin!);
  }

  @Get("notification-logs")
  @RequireAdminPermissions("notification:view")
  listLogs(@Query() query: Record<string, unknown>) {
    return this.notificationsService.listLogs(query);
  }

  @Get("wechat-subscribe-config")
  @RequireAdminPermissions("notification:view")
  wechatSubscribeConfig() {
    return this.notificationsService.getChannelConfig("WECHAT_SUBSCRIBE");
  }

  @Patch("wechat-subscribe-config")
  @RequireAdminPermissions("notification:write")
  updateWechatSubscribeConfig(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.updateChannelConfig("WECHAT_SUBSCRIBE", body, request.currentAdmin!);
  }

  @Get("sms-config")
  @RequireAdminPermissions("notification:view")
  smsConfig() {
    return this.notificationsService.getChannelConfig("SMS");
  }

  @Patch("sms-config")
  @RequireAdminPermissions("notification:write")
  updateSmsConfig(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.updateChannelConfig("SMS", body, request.currentAdmin!);
  }
}
