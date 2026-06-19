import { Body, Controller, Get, Param, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PublicOperationsService } from "./public-operations.service";

@Controller()
export class PublicOperationsController {
  constructor(private readonly operations: PublicOperationsService) {}

  @Post("coupons/claim")
  @UseGuards(JwtAuthGuard)
  claimCoupon(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.operations.claimCoupon(body, request.currentUser);
  }

  @Get("my/coupons")
  @UseGuards(JwtAuthGuard)
  myCoupons(@Req() request: RequestWithCurrentUser) {
    return this.operations.myCoupons(request.currentUser);
  }

  @Get("coupon-campaigns/:id/public")
  couponCampaignPublic(@Param("id") id: string) {
    return this.operations.couponCampaignPublic(id);
  }

  @Post("conferences/:id/ai/ask")
  @UseGuards(JwtAuthGuard)
  askAi(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.operations.askAi(id, body, request.currentUser);
  }

  @Get("conferences/:id/ai/suggestions")
  suggestions(@Param("id") id: string) {
    return this.operations.aiSuggestions(id);
  }

  @Post("invoices")
  @UseGuards(JwtAuthGuard)
  createInvoice(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.operations.createInvoice(body, request.currentUser);
  }

  @Get("my/invoices")
  @UseGuards(JwtAuthGuard)
  myInvoices(@Req() request: RequestWithCurrentUser) {
    return this.operations.myInvoices(request.currentUser);
  }

  @Get("my/invoiceable-orders")
  @UseGuards(JwtAuthGuard)
  myInvoiceableOrders(@Req() request: RequestWithCurrentUser) {
    return this.operations.myInvoiceableOrders(request.currentUser);
  }

  @Get("my/refunds")
  @UseGuards(JwtAuthGuard)
  myRefunds(@Req() request: RequestWithCurrentUser) {
    return this.operations.myRefunds(request.currentUser);
  }

  @Get("my/mall-orders")
  @UseGuards(JwtAuthGuard)
  myMallOrders(@Req() request: RequestWithCurrentUser) {
    return this.operations.myMallOrders(request.currentUser);
  }

  @Get("my/mall-orders/:id")
  @UseGuards(JwtAuthGuard)
  myMallOrder(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.operations.myMallOrder(id, request.currentUser);
  }

  @Post("my/mall-aftersales")
  @UseGuards(JwtAuthGuard)
  createMallAfterSale(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.operations.createMallAfterSale(body, request.currentUser);
  }
}
