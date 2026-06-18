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

  @Get("member-levels/options")
  @RequireAdminPermissions("member:view")
  levelOptions() {
    return this.membersService.levelOptions();
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
    return this.membersService.grantMembership(body, request.currentAdmin!);
  }

  @Post("memberships/grant")
  @RequireAdminPermissions("member:write")
  grantMembership(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.grantMembership(body, request.currentAdmin!);
  }

  @Post("memberships/:id/renew")
  @RequireAdminPermissions("member:write")
  renewMembership(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.renewMembership(id, body, request.currentAdmin!);
  }

  @Post("memberships/:id/disable")
  @RequireAdminPermissions("member:write")
  disableMembership(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.disableMembership(id, body, request.currentAdmin!);
  }

  @Patch("memberships/:id/level")
  @RequireAdminPermissions("member:write")
  changeMembershipLevel(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.changeMembershipLevel(id, body, request.currentAdmin!);
  }

  @Get("member-benefits")
  @RequireAdminPermissions("member:view")
  listBenefits(@Query() query: Record<string, unknown>) {
    return this.membersService.listBenefits(query);
  }

  @Post("member-benefits")
  @RequireAdminPermissions("member:benefit")
  createBenefit(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.createBenefit(body, request.currentAdmin!);
  }

  @Get("member-benefits/options")
  @RequireAdminPermissions("member:view")
  benefitOptions(@Query() query: Record<string, unknown>) {
    return this.membersService.benefitOptions(query);
  }

  @Patch("member-benefits/:id")
  @RequireAdminPermissions("member:benefit")
  updateBenefit(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.updateBenefit(id, body, request.currentAdmin!);
  }

  @Get("member-benefit-grants")
  @RequireAdminPermissions("member:view")
  listBenefitGrants(@Query() query: Record<string, unknown>) {
    return this.membersService.listBenefitGrants(query);
  }

  @Post("member-benefit-grants/:id/revoke")
  @RequireAdminPermissions("member:benefit")
  revokeBenefitGrant(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.revokeBenefitGrant(id, body, request.currentAdmin!);
  }

  @Get("member-pricing-rules")
  @RequireAdminPermissions("member:view")
  listPriceRules(@Query() query: Record<string, unknown>) {
    return this.membersService.listPriceRules(query);
  }

  @Post("member-pricing-rules")
  @RequireAdminPermissions("member:pricing")
  createPriceRule(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.createPriceRule(body, request.currentAdmin!);
  }

  @Patch("member-pricing-rules/:id")
  @RequireAdminPermissions("member:pricing")
  updatePriceRule(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.membersService.updatePriceRule(id, body, request.currentAdmin!);
  }
}
