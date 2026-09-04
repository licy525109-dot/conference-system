import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RegistrationCredentialOrdersController, RegistrationsController } from "./registrations.controller";
import { RegistrationsService } from "./registrations.service";

@Module({
  imports: [AuthModule],
  controllers: [RegistrationsController, RegistrationCredentialOrdersController],
  providers: [RegistrationsService]
})
export class RegistrationsModule {}
