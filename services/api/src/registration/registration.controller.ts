import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { OptionalJwtAuthGuard } from "../auth/optional-jwt-auth.guard";
import { RegistrationService } from "./registration.service";

@Controller("registration")
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post("quote")
  @UseGuards(OptionalJwtAuthGuard)
  quote(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.registrationService.quote(body, request.currentUser);
  }

  @Post("orders")
  @UseGuards(JwtAuthGuard)
  createOrder(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.registrationService.createOrder(body, request.currentUser);
  }
}
