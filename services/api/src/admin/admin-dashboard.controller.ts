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

  @Get("conversion")
  @RequireAdminPermissions("dashboard:view")
  conversion(@Query() query: { dateFrom?: string; dateTo?: string; conferenceId?: string }) {
    return this.dashboardService.conversion(query);
  }

  @Get("payment-trend")
  @RequireAdminPermissions("dashboard:view")
  paymentTrend(@Query() query: { dateFrom?: string; dateTo?: string; conferenceId?: string }) {
    return this.dashboardService.paymentTrend(query);
  }

  @Get("order-abnormal-trend")
  @RequireAdminPermissions("dashboard:view")
  orderAbnormalTrend(@Query() query: { dateFrom?: string; dateTo?: string; conferenceId?: string }) {
    return this.dashboardService.orderAbnormalTrend(query);
  }

  @Get("ticket-sales")
  @RequireAdminPermissions("dashboard:view")
  ticketSales(@Query() query: { dateFrom?: string; dateTo?: string; conferenceId?: string }) {
    return this.dashboardService.ticketSales(query);
  }
}
