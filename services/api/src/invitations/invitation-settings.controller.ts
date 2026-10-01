import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import type { RequestWithCurrentAdmin } from "../admin/current-admin";
import { InvitationSettingsService } from "./invitation-settings.service";
import { InvitationWechatService } from "./invitation-wechat.service";

@Controller("admin/invitations/settings/wechat")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermissions("invitation:view", "invitation:settings")
export class InvitationSettingsController {
  constructor(
    private readonly settings: InvitationSettingsService,
    private readonly wechat: InvitationWechatService,
  ) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  async get() {
    return { code: "OK", message: "ok", data: await this.settings.get() };
  }
  @Patch()
  async save(@Body() body: unknown, @Req() req: RequestWithCurrentAdmin) {
    return {
      code: "OK",
      message: "ok",
      data: await this.settings.save(body, req.currentAdmin!),
    };
  }
  @Post("test")
  async test() {
    return {
      code: "OK",
      message: "ok",
      data: await this.wechat.testConnection(),
    };
  }
}

@Controller()
export class InvitationVerificationController {
  constructor(private readonly settings: InvitationSettingsService) {}
  @Get("MP_verify_:code.txt")
  @Header("Content-Type", "text/plain; charset=utf-8")
  @Header("Cache-Control", "no-store")
  @Header("X-Content-Type-Options", "nosniff")
  verification(@Param("code") code: string) {
    return this.settings.verification(code);
  }
}
