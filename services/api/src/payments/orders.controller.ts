import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaymentsService } from "./payments.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get(":orderNo/payment-status")
  @UseGuards(JwtAuthGuard)
  getPaymentStatus(@Param("orderNo") orderNo: string, @Req() request: RequestWithCurrentUser) {
    return this.paymentsService.getPaymentStatus(orderNo, request.currentUser);
  }
}
