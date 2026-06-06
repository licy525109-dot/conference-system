import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module";
import { ConferencesModule } from "./conferences/conferences.module";
import { HealthController } from "./health.controller";
import { RegistrationModule } from "./registration/registration.module";

@Module({
  imports: [AuthModule, ConferencesModule, RegistrationModule],
  controllers: [HealthController]
})
export class AppModule {}
