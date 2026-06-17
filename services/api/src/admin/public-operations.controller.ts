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
}
