import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AuthModule } from "./auth/auth.module";
import { CartModule } from "./cart/cart.module";
import { CheckinModule } from "./checkin/checkin.module";
import { CmsModule } from "./cms/cms.module";
import { ConferencesModule } from "./conferences/conferences.module";
import { GuestScheduleModule } from "./guest-schedule/guest-schedule.module";
import { HealthController } from "./health.controller";
import { MallModule } from "./mall/mall.module";
import { MemberModule } from "./member/member.module";
import { OrderLifecycleModule } from "./order-lifecycle/order-lifecycle.module";
import { PaymentsModule } from "./payments/payments.module";
import { PlatformModule } from "./platform/platform.module";
import { PrismaModule } from "./prisma.module";
import { RegistrationModule } from "./registration/registration.module";
import { RegistrationsModule } from "./registrations/registrations.module";
import { WecomModule } from "./wecom/wecom.module";

@Module({
  imports: [PrismaModule, AdminModule, AuthModule, CartModule, CheckinModule, CmsModule, ConferencesModule, GuestScheduleModule, MallModule, MemberModule, OrderLifecycleModule, PaymentsModule, PlatformModule, RegistrationModule, RegistrationsModule, WecomModule],
  controllers: [HealthController]
})
export class AppModule {}
