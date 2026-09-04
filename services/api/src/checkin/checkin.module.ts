import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AdminManagementService } from "../admin/admin-management.service";
import { AuthModule } from "../auth/auth.module";
import { CheckinController } from "./checkin.controller";
import { CheckinService } from "./checkin.service";

@Module({
  imports: [AdminModule, AuthModule],
  controllers: [CheckinController],
  providers: [AdminManagementService, CheckinService],
  exports: [CheckinService]
})
export class CheckinModule {}
