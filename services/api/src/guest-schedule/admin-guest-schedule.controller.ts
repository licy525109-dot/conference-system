import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";
import { GuestScheduleService } from "./guest-schedule.service";

@Controller("admin/guest-schedules")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminGuestScheduleController {
  constructor(
    private readonly schedules: GuestScheduleService,
    private readonly sync: GuestScheduleSyncService
  ) {}

  @Get()
  @RequireAdminPermissions("guest-schedule:view")
  list(@Query() query: Record<string, unknown>) {
    return this.schedules.listAdmin(query);
  }

  @Get("attendees")
  @RequireAdminPermissions("guest-schedule:view")
  attendees(@Query() query: Record<string, unknown>) {
    return this.schedules.listAttendees(query);
  }

  @Post()
  @RequireAdminPermissions("guest-schedule:write")
  create(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.schedules.create(body, request.currentAdmin!);
  }

  @Patch(":id")
  @RequireAdminPermissions("guest-schedule:write")
  update(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.schedules.update(id, body, request.currentAdmin!);
  }

  @Delete(":id")
  @RequireAdminPermissions("guest-schedule:write")
  archive(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.schedules.archive(id, request.currentAdmin!);
  }

  @Post("publish")
  @RequireAdminPermissions("guest-schedule:publish")
  publish(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.schedules.publish(body, request.currentAdmin!);
  }

  @Get("smart-sheet/config")
  @RequireAdminPermissions("guest-schedule:view")
  config(@Query("conferenceId") conferenceId: string) {
    return this.sync.getConfig(conferenceId);
  }

  @Patch("smart-sheet/config")
  @RequireAdminPermissions("guest-schedule:write")
  saveConfig(
    @Query("conferenceId") conferenceId: string,
    @Body() body: unknown,
    @Req() request: RequestWithCurrentAdmin
  ) {
    return this.sync.saveConfig(conferenceId, body, request.currentAdmin!);
  }

  @Post("smart-sheet/discover")
  @RequireAdminPermissions("guest-schedule:write")
  discover(@Query("conferenceId") conferenceId: string, @Body() body: unknown) {
    return this.sync.discover(conferenceId, body);
  }

  @Post("smart-sheet/webhook-schema")
  @RequireAdminPermissions("guest-schedule:write")
  inspectWebhookSchema(@Query("conferenceId") conferenceId: string, @Body() body: unknown) {
    return this.sync.inspectWebhookSample(conferenceId, body);
  }

  @Post("smart-sheet/check")
  @RequireAdminPermissions("guest-schedule:write")
  check(@Query("conferenceId") conferenceId: string) {
    return this.sync.check(conferenceId);
  }

  @Post("smart-sheet/sync")
  @RequireAdminPermissions("guest-schedule:write")
  syncNow(@Query("conferenceId") conferenceId: string) {
    return this.sync.syncNow(conferenceId);
  }

  @Get("smart-sheet/runs")
  @RequireAdminPermissions("guest-schedule:view")
  runs(@Query("conferenceId") conferenceId: string, @Query() query: Record<string, unknown>) {
    return this.sync.listRuns(conferenceId, query);
  }
}
