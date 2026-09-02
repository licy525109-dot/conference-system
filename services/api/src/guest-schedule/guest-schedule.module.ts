import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { WecomModule } from "../wecom/wecom.module";
import { AdminGuestScheduleController } from "./admin-guest-schedule.controller";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";
import { GuestScheduleAutomationController } from "./guest-schedule-automation.controller";
import { GuestScheduleController } from "./guest-schedule.controller";
import { GuestScheduleService } from "./guest-schedule.service";

@Module({
  imports: [AdminModule, AuthModule, WecomModule],
  controllers: [AdminGuestScheduleController, GuestScheduleController, GuestScheduleAutomationController],
  providers: [GuestScheduleService, GuestScheduleSyncService, PrismaService]
})
export class GuestScheduleModule {}
