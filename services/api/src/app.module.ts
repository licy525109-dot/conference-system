import { Module } from "@nestjs/common";
import { ConferencesModule } from "./conferences/conferences.module";
import { HealthController } from "./health.controller";
import { RegistrationModule } from "./registration/registration.module";

@Module({
  imports: [ConferencesModule, RegistrationModule],
  controllers: [HealthController]
})
export class AppModule {}
