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

@Module({
  imports: [AdminModule],
  controllers: [
    AdminInvitationsController,
    PublicInvitationsController,
    InvitationPageController,
  ],
  providers: [InvitationsService, InvitationWechatService, InvitationAssetsService],
})
export class InvitationsModule {}
