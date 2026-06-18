import { Body, Controller, Get, Patch, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { AdminManagementService } from "../admin/admin-management.service";
import { CheckinService } from "./checkin.service";

@Controller()
export class CheckinController {
  constructor(
    private readonly checkin: CheckinService,
    private readonly adminManagement: AdminManagementService
  ) {}

  @Get("checkin/config")
  @UseGuards(JwtAuthGuard)
  getConfig(@Query("conferenceId") conferenceId: string) {
    return this.checkin.getPublicConfig(conferenceId);
  }

  @Get("checkin/my-status")
  @UseGuards(JwtAuthGuard)
  getMyStatus(@Query("registrationId") registrationId: string, @Req() request: RequestWithCurrentUser) {
    return this.checkin.getMyStatus(registrationId, request.currentUser!);
  }

  @Post("checkin/self")
  @UseGuards(JwtAuthGuard)
  selfCheckin(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.checkin.selfCheckin(body, request.currentUser!);
  }

  @Post("checkin/scan")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("checkin:write")
  scanCheckin(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.checkin.scanCheckin(body, request.currentAdmin!);
  }

  @Get("admin/checkins/records")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("checkin:view")
  adminRecords(@Query() query: Record<string, unknown>) {
    return this.checkin.listRecords(query);
  }

  @Get("admin/checkins/statistics")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("checkin:view")
  adminStatistics(@Query() query: Record<string, unknown>) {
    return this.checkin.statistics(query);
  }

  @Post("admin/checkins/manual")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("checkin:write")
  adminManual(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.checkin.adminManualCheckin(body, request.currentAdmin!);
  }

  @Get("admin/conferences/:id/checkin-config")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("conference:view")
  getAdminConfig(@Param("id") id: string) {
    return this.adminManagement.getConferenceCheckInConfig(id);
  }

  @Patch("admin/conferences/:id/checkin-config")
  @UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
  @RequireAdminPermissions("conference:write")
  updateAdminConfig(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagement.updateConferenceCheckInConfig(id, body, request.currentAdmin!);
  }
}
