import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RegistrationService } from "./registration.service";

@Controller("registration")
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post("quote")
  quote(@Body() body: unknown) {
    return this.registrationService.quote(body);
  }

  @Post("orders")
  @UseGuards(JwtAuthGuard)
  createOrder(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.registrationService.createOrder(body, request.currentUser);
  }
}
