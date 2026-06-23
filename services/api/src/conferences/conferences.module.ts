import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { ConferencesController } from "./conferences.controller";
import { ConferencesService } from "./conferences.service";

@Module({
  imports: [AuthModule],
  controllers: [ConferencesController],
  providers: [ConferencesService, PrismaService]
})
export class ConferencesModule {}
