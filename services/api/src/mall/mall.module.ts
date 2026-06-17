import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { MallController } from "./mall.controller";
import { MallService } from "./mall.service";

@Module({
  imports: [AuthModule],
  controllers: [MallController],
  providers: [MallService, PrismaService]
})
export class MallModule {}
