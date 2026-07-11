import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PrismaService } from "../prisma.service";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [AdminModule],
  controllers: [PlatformController],
  providers: [PlatformService, PrismaService]
})
export class PlatformModule {}
