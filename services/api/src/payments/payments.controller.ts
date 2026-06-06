import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaymentsService } from "./payments.service";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post("mock/confirm")
  @UseGuards(JwtAuthGuard)
  confirmMockPayment(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.paymentsService.confirmMockPayment(body, request.currentUser);
  }
}
