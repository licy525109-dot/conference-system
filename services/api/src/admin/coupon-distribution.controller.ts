import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";
import { CouponDistributionService } from "./coupon-distribution.service";

@Controller("admin/coupon-distributions")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminCouponDistributionController {
  constructor(private readonly service: CouponDistributionService) {}

  @Get()
  @RequireAdminPermissions("coupon:view")
  list(@Query() query: Record<string, unknown>) { return this.service.list(query); }

  @Post()
  @RequireAdminPermissions("coupon:write")
  create(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) { return this.service.create(body, request.currentAdmin!); }

  @Post(":id/link")
  @RequireAdminPermissions("coupon:write")
  link(@Param("id") id: string) { return this.service.link(id); }

  @Post(":id/revoke")
  @RequireAdminPermissions("coupon:write")
  revoke(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) { return this.service.revoke(id, request.currentAdmin!); }
}

@Controller("coupon-distributions")
export class CouponDistributionController {
  constructor(private readonly service: CouponDistributionService) {}

  @Post("preview")
  preview(@Body() body: unknown) { return this.service.preview(body); }

  @Post("claim")
  @UseGuards(JwtAuthGuard)
  claim(@Body() body: unknown, @Req() request: RequestWithCurrentUser) { return this.service.claim(body, request.currentUser); }
}
