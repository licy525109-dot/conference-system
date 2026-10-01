import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module";
import {
  AdminInvitationsController,
  PublicInvitationsController,
} from "./invitations.controller";
import { InvitationPageController } from "./invitation-page.controller";
import { InvitationsService } from "./invitations.service";
import { InvitationWechatService } from "./invitation-wechat.service";
import { InvitationAssetsService } from "./invitation-assets.service";
import { InvitationSettingsService } from "./invitation-settings.service";
import {
  InvitationSettingsController,
  InvitationVerificationController,
} from "./invitation-settings.controller";

@Module({
  imports: [AdminModule],
  controllers: [
    AdminInvitationsController,
    PublicInvitationsController,
    InvitationPageController,
    InvitationSettingsController,
    InvitationVerificationController,
  ],
  providers: [
    InvitationsService,
    InvitationWechatService,
    InvitationAssetsService,
    InvitationSettingsService,
  ],
})
export class InvitationsModule {}
