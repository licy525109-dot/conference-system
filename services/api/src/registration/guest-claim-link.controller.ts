import { Body, ConflictException, Controller, Post, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { WechatAuthService } from "../auth/wechat-auth.service";
import { PrismaService } from "../prisma.service";
import { assertAttendeeEditable, hashGuestClaim, identityText } from "./guest-identity.service";

@Controller("admin/guest-identities")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class GuestClaimLinkController {
  constructor(private readonly prisma: PrismaService, private readonly wechat: WechatAuthService) {}

  @Post("claim-link")
  @RequireAdminPermissions("registration:write", "member:write")
  async create(@Body() body: { token?: unknown }) {
    const token = identityText(body?.token, "邀请凭证", 100);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new ConflictException("邀请无效，请重新生成");
    const claim = await this.prisma.guestClaim.findUnique({ where: { tokenHash: hashGuestClaim(token) }, include: {
      guestProfile: { include: { attendees: { include: { registration: { include: { order: { include: { refunds: true } } } } } } } }
    } });
    if (!claim || claim.consumedAt || claim.expiresAt.getTime() <= Date.now() + 60_000 || claim.guestProfile.userId || !claim.guestProfile.attendees.length) {
      throw new ConflictException("邀请已失效或即将到期，请核对后重新生成");
    }
    claim.guestProfile.attendees.forEach(assertAttendeeEditable);
    // Link retries must not recreate an invitation, rebind anyone, or rotate credentials.
    const url = await this.wechat.generateGuestClaimLink(token, claim.expiresAt);
    return { code: "OK", message: "ok", data: { url, expiresAt: claim.expiresAt.toISOString() } };
  }
}
