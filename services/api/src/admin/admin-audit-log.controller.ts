import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAuditLogService } from "./admin-audit-log.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/audit-logs")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminAuditLogController {
  constructor(private readonly auditLogService: AdminAuditLogService) {}

  @Get()
  @RequireAdminPermissions("system:audit")
  list(@Query() query: Record<string, unknown>) {
    return this.auditLogService.list(query);
  }
}
