import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import { PrismaService } from "../prisma.service";
import { WecomClientAdapter } from "./adapters/wecom-client.adapter";
import { AdminWecomCallbackEventsController } from "./admin-wecom-callback-events.controller";
import { AdminWecomConfigController } from "./admin-wecom-config.controller";
import { AdminWecomCustomerGroupsController } from "./admin-wecom-customer-groups.controller";
import { AdminWecomGroupMessageController } from "./admin-wecom-group-message.controller";
import { AdminWecomWelcomeTemplateController } from "./admin-wecom-welcome-template.controller";
import { WecomCallbackController } from "./wecom-callback.controller";
import { WecomCallbackService } from "./services/wecom-callback.service";
import { WecomConfigService } from "./services/wecom-config.service";
import { WecomCustomerGroupService } from "./services/wecom-customer-group.service";
import { WecomGroupMessageService } from "./services/wecom-group-message.service";
import { WecomTokenService } from "./services/wecom-token.service";
import { WecomWelcomeTemplateService } from "./services/wecom-welcome-template.service";

@Module({
  imports: [AdminModule],
  controllers: [
    AdminWecomConfigController,
    AdminWecomCustomerGroupsController,
    AdminWecomWelcomeTemplateController,
    AdminWecomGroupMessageController,
    AdminWecomCallbackEventsController,
    WecomCallbackController
  ],
  providers: [
    WecomClientAdapter,
    WecomCallbackService,
    WecomConfigService,
    WecomCustomerGroupService,
    WecomGroupMessageService,
    WecomTokenService,
    WecomWelcomeTemplateService,
    PrismaService
  ]
})
export class WecomModule {}
