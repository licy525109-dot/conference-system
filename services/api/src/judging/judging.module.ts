import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { JudgingAdminController, JudgingEntryController, JudgingMobileController } from "./judging.controller";
import { JudgingService } from "./judging.service";
@Module({
  imports: [AdminModule, AuthModule],
  controllers: [JudgingAdminController, JudgingEntryController, JudgingMobileController],
  providers: [JudgingService]
})
export class JudgingModule {}
