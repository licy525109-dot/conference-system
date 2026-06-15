import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequireAdminPermissions } from "./require-permissions.decorator";
import { AdminDashboardService } from "./admin-dashboard.service";

@Controller("admin/dashboard")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminDashboardController {
  constructor(private readonly dashboardService: AdminDashboardService) {}

  @Get("overview")
  @RequireAdminPermissions("dashboard:view")
  overview(@Query() query: { dateFrom?: string; dateTo?: string; conferenceId?: string }) {
    return this.dashboardService.overview(query);
  }
}
