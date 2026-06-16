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

  @Get("registrations.xls")
  @Header("content-type", "application/vnd.ms-excel; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="registrations.xls"')
  @RequireAdminPermissions("registration:view")
  exportRegistrations(@Query() query: Record<string, unknown>, @Req() request: RequestWithCurrentAdmin) {
    return this.exportsService.exportRegistrationsExcel(query, request.currentAdmin!);
  }

  @Get("orders.xls")
  @Header("content-type", "application/vnd.ms-excel; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="orders.xls"')
  @RequireAdminPermissions("order:view")
  exportOrders(@Query() query: Record<string, unknown>, @Req() request: RequestWithCurrentAdmin) {
    return this.exportsService.exportOrdersExcel(query, request.currentAdmin!);
  }
}
