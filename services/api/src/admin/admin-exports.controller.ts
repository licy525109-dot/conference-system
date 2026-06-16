import { Controller, Get, Header, Query, Req, UseGuards } from "@nestjs/common";
import { AdminExportsService } from "./admin-exports.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/exports")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminExportsController {
  constructor(private readonly exportsService: AdminExportsService) {}

  @Get("registrations.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="registrations.csv"')
  @RequireAdminPermissions("registration:view")
  exportRegistrations(@Query() query: Record<string, unknown>, @Req() request: RequestWithCurrentAdmin) {
    return this.exportsService.exportRegistrationsCsv(query, request.currentAdmin!);
  }

  @Get("orders.csv")
  @Header("content-type", "text/csv; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="orders.csv"')
  @RequireAdminPermissions("order:view")
  exportOrders(@Query() query: Record<string, unknown>, @Req() request: RequestWithCurrentAdmin) {
    return this.exportsService.exportOrdersCsv(query, request.currentAdmin!);
  }
}
