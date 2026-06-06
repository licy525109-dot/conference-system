import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { ConferencesController } from "./conferences.controller";
import { ConferencesService } from "./conferences.service";

@Module({
  controllers: [ConferencesController],
  providers: [ConferencesService, PrismaService]
})
export class ConferencesModule {}
