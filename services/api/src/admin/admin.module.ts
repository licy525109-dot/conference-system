import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AdminAccessController } from "./admin-access.controller";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminCmsController } from "./admin-cms.controller";
import { AdminCmsService } from "./admin-cms.service";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminFinanceController } from "./admin-finance.controller";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminManagementController } from "./admin-management.controller";
import { AdminManagementService } from "./admin-management.service";
import { AdminMallController } from "./admin-mall.controller";
import { AdminMallService } from "./admin-mall.service";
import { AdminMembersController } from "./admin-members.controller";
import { AdminMembersService } from "./admin-members.service";
import { AdminMaterialsController } from "./admin-materials.controller";
import { AdminMaterialsService } from "./admin-materials.service";
import { AdminPermissionGuard } from "./admin-permission.guard";

@Module({
  controllers: [
    AdminAuthController,
    AdminManagementController,
    AdminDashboardController,
    AdminAccessController,
    AdminMaterialsController,
    AdminCmsController,
    AdminMembersController,
    AdminFinanceController,
    AdminMallController
  ],
  providers: [
    AdminAccessService,
    AdminAuthService,
    AdminCmsService,
    AdminJwtAuthGuard,
    AdminPermissionGuard,
    AdminManagementService,
    AdminDashboardService,
    AdminMaterialsService,
    AdminMembersService,
    AdminFinanceService,
    AdminMallService,
    PrismaService
  ],
  exports: [AdminAuthService]
})
export class AdminModule {}
