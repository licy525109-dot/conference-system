import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { ConferencesModule } from "./conferences/conferences.module";
import { HealthController } from "./health.controller";
import { PaymentsModule } from "./payments/payments.module";
import { RegistrationModule } from "./registration/registration.module";
import { RegistrationsModule } from "./registrations/registrations.module";

@Module({
  imports: [AdminModule, AuthModule, ConferencesModule, PaymentsModule, RegistrationModule, RegistrationsModule],
  controllers: [HealthController]
})
export class AppModule {}
