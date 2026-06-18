import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminManagementService } from "./admin-management.service";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminManagementController {
  constructor(private readonly adminManagementService: AdminManagementService) {}

  @Get("conferences")
  @RequireAdminPermissions("conference:view")
  listConferences(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listConferences(query);
  }

  @Post("conferences")
  @RequireAdminPermissions("conference:write")
  createConference(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createConference(body, request.currentAdmin!);
  }

  @Get("conferences/:id")
  @RequireAdminPermissions("conference:view")
  getConference(@Param("id") id: string) {
    return this.adminManagementService.getConference(id);
  }

  @Patch("conferences/:id")
  @RequireAdminPermissions("conference:write")
  updateConference(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConference(id, body, request.currentAdmin!);
  }

  @Patch("conferences/:id/status")
  @RequireAdminPermissions("conference:write")
  updateConferenceStatus(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConferenceStatus(id, body, request.currentAdmin!);
  }

  @Patch("conferences/:id/check-in-config")
  @RequireAdminPermissions("conference:write")
  updateConferenceCheckInConfig(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConferenceCheckInConfig(id, body, request.currentAdmin!);
  }

  @Get("conferences/:id/check-in-config")
  @RequireAdminPermissions("conference:view")
  getConferenceCheckInConfig(@Param("id") id: string) {
    return this.adminManagementService.getConferenceCheckInConfig(id);
  }

  @Get("conferences/:conferenceId/skus")
  @RequireAdminPermissions("conference:view")
  listSkus(@Param("conferenceId") conferenceId: string) {
    return this.adminManagementService.listSkus(conferenceId);
  }

  @Post("conferences/:conferenceId/skus")
  @RequireAdminPermissions("conference:write")
  createSku(@Param("conferenceId") conferenceId: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createSku(conferenceId, body, request.currentAdmin!);
  }

  @Patch("skus/:id")
  @RequireAdminPermissions("conference:write")
  updateSku(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateSku(id, body, request.currentAdmin!);
  }

  @Get("conferences/:conferenceId/form-fields")
  @RequireAdminPermissions("conference:view")
  listFormFields(@Param("conferenceId") conferenceId: string) {
    return this.adminManagementService.listFormFields(conferenceId);
  }

  @Post("conferences/:conferenceId/form-fields")
  @RequireAdminPermissions("conference:write")
  createFormField(@Param("conferenceId") conferenceId: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createFormField(conferenceId, body, request.currentAdmin!);
  }

  @Patch("form-fields/:id")
  @RequireAdminPermissions("conference:write")
  updateFormField(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateFormField(id, body, request.currentAdmin!);
  }

  @Delete("form-fields/:id")
  @RequireAdminPermissions("conference:write")
  disableFormField(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.disableFormField(id, request.currentAdmin!);
  }

  @Get("orders")
  @RequireAdminPermissions("order:view")
  listOrders(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listOrders(query);
  }

  @Get("orders/:orderNo")
  @RequireAdminPermissions("order:view")
  getOrder(@Param("orderNo") orderNo: string) {
    return this.adminManagementService.getOrder(orderNo);
  }

  @Delete("orders/:orderNo")
  @RequireAdminPermissions("order:delete")
  deleteOrder(@Param("orderNo") orderNo: string, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.deleteOrder(orderNo, request.currentAdmin!);
  }

  @Post("orders/delete-by-filter")
  @RequireAdminPermissions("order:delete")
  deleteOrdersByFilter(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.deleteOrdersByFilter(body, request.currentAdmin!);
  }

  @Get("registrations")
  @RequireAdminPermissions("registration:view")
  listRegistrations(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listRegistrations(query);
  }

  @Get("registrations/:id/detail")
  @RequireAdminPermissions("registration:view")
  getRegistrationDetail(@Param("id") id: string) {
    return this.adminManagementService.getRegistrationDetail(id);
  }

  @Get("registrations/:id/audit-logs")
  @RequireAdminPermissions("registration:view")
  getRegistrationAuditLogs(@Param("id") id: string) {
    return this.adminManagementService.getRegistrationAuditLogs(id);
  }

  @Get("registrations/:id")
  @RequireAdminPermissions("registration:view")
  getRegistration(@Param("id") id: string) {
    return this.adminManagementService.getRegistration(id);
  }

  @Patch("registrations/:id/remark")
  @RequireAdminPermissions("registration:write")
  updateRegistrationRemark(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateRegistrationRemark(id, body, request.currentAdmin!);
  }

  @Patch("registrations/:id/form-values")
  @RequireAdminPermissions("registration:write")
  updateRegistrationFormValues(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateRegistrationFormValues(id, body, request.currentAdmin!);
  }

  @Post("registration-attendees/:id/check-in")
  @RequireAdminPermissions("registration:write")
  checkInRegistrationAttendee(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.checkInRegistrationAttendee(id, request.currentAdmin!);
  }

  @Get("coupons")
  @RequireAdminPermissions("coupon:view")
  listCoupons(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listCoupons(query);
  }

  @Post("coupons")
  @RequireAdminPermissions("coupon:write")
  createCoupon(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createCoupon(body, request.currentAdmin!);
  }

  @Patch("coupons/:id")
  @RequireAdminPermissions("coupon:write")
  updateCoupon(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateCoupon(id, body, request.currentAdmin!);
  }

  @Get("promotion-rules")
  @RequireAdminPermissions("promotion:view")
  listPromotionRules(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listPromotionRules(query);
  }

  @Post("promotion-rules")
  @RequireAdminPermissions("promotion:write")
  createPromotionRule(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createPromotionRule(body, request.currentAdmin!);
  }

  @Patch("promotion-rules/:id")
  @RequireAdminPermissions("promotion:write")
  updatePromotionRule(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updatePromotionRule(id, body, request.currentAdmin!);
  }
}
