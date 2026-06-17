import { Controller, Get, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/finance")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminFinanceController {
  constructor(private readonly financeService: AdminFinanceService) {}

  @Get("overview")
  @RequireAdminPermissions("finance:view")
  overview() {
    return this.financeService.overview();
  }

  @Get("payments")
  @RequireAdminPermissions("finance:view")
  payments(@Query() query: Record<string, unknown>) {
    return this.financeService.listPayments(query);
  }

  @Get("reconciliation-batches")
  @RequireAdminPermissions("finance:view")
  batches() {
    return this.financeService.listBatches();
  }

  @Post("reconciliation-batches")
  @RequireAdminPermissions("finance:write")
  createBatch(@Req() request: RequestWithCurrentAdmin) {
    return this.financeService.createBatch(request.currentAdmin!);
  }

  @Get("differences")
  @RequireAdminPermissions("finance:view")
  differences() {
    return this.financeService.listDifferences();
  }
}

@Controller("admin/payments")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminPaymentsController {
  constructor(private readonly financeService: AdminFinanceService) {}

  @Get()
  @RequireAdminPermissions("finance:view")
  payments(@Query() query: Record<string, unknown>) {
    return this.financeService.listPayments(query);
  }
}
