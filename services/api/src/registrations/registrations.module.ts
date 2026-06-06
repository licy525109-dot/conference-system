import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { RegistrationsController } from "./registrations.controller";
import { RegistrationsService } from "./registrations.service";

@Module({
  imports: [AuthModule],
  controllers: [RegistrationsController],
  providers: [RegistrationsService, PrismaService]
})
export class RegistrationsModule {}
