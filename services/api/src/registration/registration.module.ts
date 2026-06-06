import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";

@Module({
  controllers: [RegistrationController],
  providers: [RegistrationService, PrismaService]
})
export class RegistrationModule {}
