import { Controller, Get, Param, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RegistrationsService } from "./registrations.service";

@Controller("registrations")
export class RegistrationsController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get("my")
  @UseGuards(JwtAuthGuard)
  myRegistrations(@Req() request: RequestWithCurrentUser) {
    return this.registrationsService.listMine(request.currentUser);
  }

  @Get(":id/credential")
  @UseGuards(JwtAuthGuard)
  getCredential(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.registrationsService.getCredentialByRegistrationId(id, request.currentUser);
  }
}

@Controller("orders")
export class RegistrationCredentialOrdersController {
  constructor(private readonly registrationsService: RegistrationsService) {}

  @Get(":orderNo/registration-credential")
  @UseGuards(JwtAuthGuard)
  getCredentialByOrderNo(@Param("orderNo") orderNo: string, @Req() request: RequestWithCurrentUser) {
    return this.registrationsService.getCredentialByOrderNo(orderNo, request.currentUser);
  }
}
