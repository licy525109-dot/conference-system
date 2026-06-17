import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { OptionalJwtAuthGuard } from "./optional-jwt-auth.guard";
import { WechatAuthService } from "./wechat-auth.service";

@Module({
  controllers: [AuthController],
  providers: [AuthService, WechatAuthService, JwtAuthGuard, OptionalJwtAuthGuard, PrismaService],
  exports: [AuthService, JwtAuthGuard, OptionalJwtAuthGuard]
})
export class AuthModule {}
