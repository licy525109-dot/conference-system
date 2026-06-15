import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { MallController } from "./mall.controller";
import { MallService } from "./mall.service";

@Module({
  controllers: [MallController],
  providers: [MallService, PrismaService]
})
export class MallModule {}
