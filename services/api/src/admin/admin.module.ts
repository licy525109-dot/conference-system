import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { AdminAccessController } from "./admin-access.controller";
import { AdminAccessService } from "./admin-access.service";
import { AdminAuditLogController } from "./admin-audit-log.controller";
import { AdminAuditLogService } from "./admin-audit-log.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminAuthService } from "./admin-auth.service";
import { AdminCmsController } from "./admin-cms.controller";
import { AdminCmsService } from "./admin-cms.service";
import { AdminDashboardController } from "./admin-dashboard.controller";
import { AdminDashboardService } from "./admin-dashboard.service";
import { AdminExportsController } from "./admin-exports.controller";
import { AdminExportsService } from "./admin-exports.service";
import { AdminFinanceController, AdminPaymentsController } from "./admin-finance.controller";
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
import { AdminMobileController } from "./admin-mobile.controller";
import { AdminNotificationsController, NotificationsController } from "./admin-notifications.controller";
import { AdminNotificationsService } from "./admin-notifications.service";
import { AdminOperationsController } from "./admin-operations.controller";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminPaymentExceptionsController } from "./admin-payment-exceptions.controller";
import { AdminPaymentExceptionsService } from "./admin-payment-exceptions.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { PublicOperationsController } from "./public-operations.controller";
import { PublicOperationsService } from "./public-operations.service";

@Module({
  imports: [AuthModule],
  controllers: [
    AdminAuthController,
    AdminMobileController,
    NotificationsController,
    AdminNotificationsController,
    AdminOperationsController,
    PublicOperationsController,
    AdminManagementController,
    AdminDashboardController,
    AdminAccessController,
    AdminMaterialsController,
    AdminCmsController,
    AdminMembersController,
    AdminFinanceController,
    AdminPaymentsController,
    AdminMallController,
    AdminExportsController,
    AdminPaymentExceptionsController,
    AdminAuditLogController
  ],
  providers: [
    AdminAccessService,
    AdminAuditLogService,
    AdminAuthService,
    AdminCmsService,
    AdminExportsService,
    AdminJwtAuthGuard,
    AdminPermissionGuard,
    AdminManagementService,
    AdminDashboardService,
    AdminMaterialsService,
    AdminMembersService,
    AdminFinanceService,
    AdminMallService,
    AdminNotificationsService,
    AdminOperationsService,
    PublicOperationsService,
    AdminPaymentExceptionsService,
    PrismaService
  ],
  exports: [AdminAuthService, AdminJwtAuthGuard, AdminPermissionGuard]
})
export class AdminModule {}
