import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RequestWithCurrentUser } from "../auth/current-user";
import { GuestIdentityService } from "./guest-identity.service";

@Controller("admin/guest-identities")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminGuestIdentityController {
  constructor(private readonly service: GuestIdentityService) {}
  @Get("registrations/:id")
  @RequireAdminPermissions("registration:view", "member:view")
  details(@Param("id") id: string) { return this.service.details(id); }
  @Patch("attendees/:id")
  @RequireAdminPermissions("registration:write", "member:write")
  update(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.updateAttendee(id, body, req.currentAdmin!); }
  @Patch("orders/:id/business-owner")
  @RequireAdminPermissions("registration:write", "member:write")
  owner(@Param("id") id: string, @Body() body: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.changeBusinessOwner(id, body, req.currentAdmin!); }
}

@Controller("guest-identities")
@UseGuards(JwtAuthGuard)
export class GuestIdentityController {
  constructor(private readonly service: GuestIdentityService) {}
  @Get("profiles")
  profiles(@Req() req: RequestWithCurrentUser) { return this.service.reusableProfiles(req.currentUser!.id); }
  @Get("mine")
  mine(@Req() req: RequestWithCurrentUser) { return this.service.mine(req.currentUser!.id); }
  @Post("claim")
  claim(@Body() body: { token: string }, @Req() req: RequestWithCurrentUser) { return this.service.claim(body?.token, req.currentUser!.id); }
}
