import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { CmsController } from "./cms.controller";
import { CmsService } from "./cms.service";

@Module({
  controllers: [CmsController],
  providers: [CmsService, PrismaService]
})
export class CmsModule {}
