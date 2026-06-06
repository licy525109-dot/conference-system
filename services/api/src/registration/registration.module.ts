import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { RegistrationController } from "./registration.controller";
import { RegistrationService } from "./registration.service";

@Module({
  imports: [AuthModule],
  controllers: [RegistrationController],
  providers: [RegistrationService, PrismaService]
})
export class RegistrationModule {}
