import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminNotificationsService } from "./admin-notifications.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";
import { UserNotificationsService } from "./user-notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(
    private readonly notificationsService: AdminNotificationsService,
    private readonly userNotificationsService: UserNotificationsService
  ) {}

  @Post("subscribe")
  @UseGuards(JwtAuthGuard)
  subscribe(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.notificationsService.subscribe(body, request.currentUser!);
  }

  @Get("subscription-config")
  @UseGuards(JwtAuthGuard)
  subscriptionConfig(@Query() query: Record<string, unknown>) {
    return this.notificationsService.getSubscriptionConfig(query);
  }

  @Get("my")
  @UseGuards(JwtAuthGuard)
  my(@Query() query: Record<string, unknown>, @Req() request: RequestWithCurrentUser) {
    return this.userNotificationsService.list(request.currentUser!, query);
  }

  @Get("unread-count")
  @UseGuards(JwtAuthGuard)
  unreadCount(@Req() request: RequestWithCurrentUser) {
    return this.userNotificationsService.unreadCount(request.currentUser!);
  }

  @Patch("read-all")
  @UseGuards(JwtAuthGuard)
  markAllRead(@Req() request: RequestWithCurrentUser) {
    return this.userNotificationsService.markAllRead(request.currentUser!);
  }

  @Patch(":id/read")
  @UseGuards(JwtAuthGuard)
  markRead(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.userNotificationsService.markRead(id, request.currentUser!);
  }

  @Delete(":id")
  @UseGuards(JwtAuthGuard)
  dismiss(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.userNotificationsService.dismiss(id, request.currentUser!);
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

  @Post("notification-templates/:id/preview")
  @RequireAdminPermissions("notification:view")
  previewTemplate(@Param("id") id: string, @Body() body: unknown) {
    return this.notificationsService.previewTemplate(id, body);
  }

  @Post("notification-templates/:id/test-send")
  @RequireAdminPermissions("notification:send")
  testSendTemplate(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.testSendTemplate(id, body, request.currentAdmin!);
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

  @Post("notification-tasks/:id/retry")
  @RequireAdminPermissions("notification:send")
  retry(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.retryTask(id, request.currentAdmin!);
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
  @RequireAdminPermissions("sms:view")
  smsConfig() {
    return this.notificationsService.getChannelConfig("SMS");
  }

  @Patch("sms-config")
  @RequireAdminPermissions("sms:write")
  updateSmsConfig(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.notificationsService.updateChannelConfig("SMS", body, request.currentAdmin!);
  }
}
