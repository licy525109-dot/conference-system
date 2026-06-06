import { Module } from "@nestjs/common";
import { ConferencesModule } from "./conferences/conferences.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [ConferencesModule],
  controllers: [HealthController]
})
export class AppModule {}
