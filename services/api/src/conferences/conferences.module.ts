import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ConferencesController } from "./conferences.controller";
import { ConferencesService } from "./conferences.service";

@Module({
  imports: [AuthModule],
  controllers: [ConferencesController],
  providers: [ConferencesService]
})
export class ConferencesModule {}
