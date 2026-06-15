import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminManagementService } from "./admin-management.service";
import { RequestWithCurrentAdmin } from "./current-admin";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard)
export class AdminManagementController {
  constructor(private readonly adminManagementService: AdminManagementService) {}

  @Get("conferences")
  listConferences(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listConferences(query);
  }

  @Post("conferences")
  createConference(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createConference(body, request.currentAdmin!);
  }

  @Get("conferences/:id")
  getConference(@Param("id") id: string) {
    return this.adminManagementService.getConference(id);
  }

  @Patch("conferences/:id")
  updateConference(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConference(id, body, request.currentAdmin!);
  }

  @Patch("conferences/:id/status")
  updateConferenceStatus(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConferenceStatus(id, body, request.currentAdmin!);
  }

  @Patch("conferences/:id/check-in-config")
  updateConferenceCheckInConfig(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateConferenceCheckInConfig(id, body, request.currentAdmin!);
  }

  @Get("conferences/:conferenceId/skus")
  listSkus(@Param("conferenceId") conferenceId: string) {
    return this.adminManagementService.listSkus(conferenceId);
  }

  @Post("conferences/:conferenceId/skus")
  createSku(@Param("conferenceId") conferenceId: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createSku(conferenceId, body, request.currentAdmin!);
  }

  @Patch("skus/:id")
  updateSku(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateSku(id, body, request.currentAdmin!);
  }

  @Get("conferences/:conferenceId/form-fields")
  listFormFields(@Param("conferenceId") conferenceId: string) {
    return this.adminManagementService.listFormFields(conferenceId);
  }

  @Post("conferences/:conferenceId/form-fields")
  createFormField(@Param("conferenceId") conferenceId: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createFormField(conferenceId, body, request.currentAdmin!);
  }

  @Patch("form-fields/:id")
  updateFormField(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateFormField(id, body, request.currentAdmin!);
  }

  @Delete("form-fields/:id")
  disableFormField(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.disableFormField(id, request.currentAdmin!);
  }

  @Get("orders")
  listOrders(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listOrders(query);
  }

  @Get("orders/:orderNo")
  getOrder(@Param("orderNo") orderNo: string) {
    return this.adminManagementService.getOrder(orderNo);
  }

  @Get("registrations")
  listRegistrations(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listRegistrations(query);
  }

  @Get("registrations/:id")
  getRegistration(@Param("id") id: string) {
    return this.adminManagementService.getRegistration(id);
  }

  @Patch("registrations/:id/remark")
  updateRegistrationRemark(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateRegistrationRemark(id, body, request.currentAdmin!);
  }

  @Post("registration-attendees/:id/check-in")
  checkInRegistrationAttendee(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.checkInRegistrationAttendee(id, request.currentAdmin!);
  }

  @Get("coupons")
  listCoupons(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listCoupons(query);
  }

  @Post("coupons")
  createCoupon(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createCoupon(body, request.currentAdmin!);
  }

  @Patch("coupons/:id")
  updateCoupon(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updateCoupon(id, body, request.currentAdmin!);
  }

  @Get("promotion-rules")
  listPromotionRules(@Query() query: Record<string, unknown>) {
    return this.adminManagementService.listPromotionRules(query);
  }

  @Post("promotion-rules")
  createPromotionRule(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.createPromotionRule(body, request.currentAdmin!);
  }

  @Patch("promotion-rules/:id")
  updatePromotionRule(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.adminManagementService.updatePromotionRule(id, body, request.currentAdmin!);
  }
}
