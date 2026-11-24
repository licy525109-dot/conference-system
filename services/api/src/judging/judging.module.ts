import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { AuthModule } from "../auth/auth.module";
import { JudgingAdminController, JudgingMobileController } from "./judging.controller";
import { JudgingService } from "./judging.service";
@Module({
  imports: [AdminModule, AuthModule],
  controllers: [JudgingAdminController, JudgingMobileController],
  providers: [JudgingService]
})
export class JudgingModule {}
