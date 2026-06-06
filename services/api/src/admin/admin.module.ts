import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminManagementController } from "./admin-management.controller";
import { AdminManagementService } from "./admin-management.service";

@Module({
  controllers: [AdminAuthController, AdminManagementController],
  providers: [AdminAuthService, AdminJwtAuthGuard, AdminManagementService, PrismaService],
  exports: [AdminAuthService]
})
export class AdminModule {}
