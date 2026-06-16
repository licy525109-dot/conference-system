import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPaymentExceptionsService } from "./admin-payment-exceptions.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/payment-exceptions")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminPaymentExceptionsController {
  constructor(private readonly paymentExceptionsService: AdminPaymentExceptionsService) {}

  @Get()
  @RequireAdminPermissions("order:view")
  list(@Query() query: Record<string, unknown>) {
    return this.paymentExceptionsService.list(query);
  }

  @Post(":orderNo/review")
  @RequireAdminPermissions("order:view")
  review(@Param("orderNo") orderNo: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.paymentExceptionsService.review(orderNo, body, request.currentAdmin!);
  }
}
