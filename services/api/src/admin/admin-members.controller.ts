import { Body, Controller, Get, Patch, Post, Param, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminMembersService } from "./admin-members.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminMembersController {
  constructor(private readonly membersService: AdminMembersService) {}

  @Get("users")
  @RequireAdminPermissions("member:view")
  listUsers(@Query() query: Record<string, unknown>) {
    return this.membersService.listUsers(query);
  }

  @Get("member-levels")
  @RequireAdminPermissions("member:view")
  listLevels() {
    return this.membersService.listLevels();
  }

  @Post("member-levels")
  @RequireAdminPermissions("member:write")
  createLevel(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.createLevel(body, request.currentAdmin!);
  }

  @Patch("member-levels/:id")
  @RequireAdminPermissions("member:write")
  updateLevel(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.updateLevel(id, body, request.currentAdmin!);
  }

  @Get("memberships")
  @RequireAdminPermissions("member:view")
  listMemberships(@Query() query: Record<string, unknown>) {
    return this.membersService.listMemberships(query);
  }

  @Post("memberships")
  @RequireAdminPermissions("member:write")
  assignMembership(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.assignMembership(body, request.currentAdmin!);
  }

  @Get("member-benefits")
  @RequireAdminPermissions("member:view")
  listBenefits(@Query() query: Record<string, unknown>) {
    return this.membersService.listBenefits(query);
  }

  @Post("member-benefits")
  @RequireAdminPermissions("member:write")
  createBenefit(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.createBenefit(body, request.currentAdmin!);
  }

  @Get("member-pricing-rules")
  @RequireAdminPermissions("member:view")
  listPriceRules(@Query() query: Record<string, unknown>) {
    return this.membersService.listPriceRules(query);
  }

  @Post("member-pricing-rules")
  @RequireAdminPermissions("member:write")
  createPriceRule(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.createPriceRule(body, request.currentAdmin!);
  }
}
