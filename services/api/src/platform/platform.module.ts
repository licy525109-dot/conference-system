import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AdminModule],
  controllers: [PlatformController],
  providers: [PlatformService]
})
export class PlatformModule {}
