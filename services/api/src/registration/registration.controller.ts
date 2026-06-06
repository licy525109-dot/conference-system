import { Body, Controller, Post } from "@nestjs/common";
import { RegistrationService } from "./registration.service";

@Controller("registration")
export class RegistrationController {
  constructor(private readonly registrationService: RegistrationService) {}

  @Post("quote")
  quote(@Body() body: unknown) {
    return this.registrationService.quote(body);
  }
}
