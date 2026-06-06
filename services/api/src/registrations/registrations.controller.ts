import { Controller, Get, Req, UseGuards } from "@nestjs/common";
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
}
