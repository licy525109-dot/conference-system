import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequestWithCurrentAdmin } from "../admin/current-admin";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { PlatformService } from "./platform.service";

@Controller("admin/platform")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get("overview")
  @RequireAdminPermissions("platform:view")
  getOverview() {
    return this.platformService.getOverview();
  }

  @Get("tenants")
  @RequireAdminPermissions("platform:view")
  listTenants() {
    return this.platformService.listTenants();
  }

  @Post("tenants")
  @RequireAdminPermissions("platform:write")
  createTenant(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.createTenant(body, request.currentAdmin!);
  }

  @Patch("tenants/:id")
  @RequireAdminPermissions("platform:write")
  updateTenant(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.updateTenant(id, body, request.currentAdmin!);
  }

  @Get("plans")
  @RequireAdminPermissions("platform:view")
  listPlans() {
    return this.platformService.listPlans();
  }

  @Post("plans")
  @RequireAdminPermissions("platform:write")
  upsertPlan(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.upsertPlan(body, request.currentAdmin!);
  }

  @Post("subscriptions")
  @RequireAdminPermissions("platform:write")
  createSubscription(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.createSubscription(body, request.currentAdmin!);
  }

  @Post("api-keys")
  @RequireAdminPermissions("platform:write")
  createApiKey(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.createApiKey(body, request.currentAdmin!);
  }

  @Patch("api-keys/:id/revoke")
  @RequireAdminPermissions("platform:write")
  revokeApiKey(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.revokeApiKey(id, request.currentAdmin!);
  }

  @Post("webhooks")
  @RequireAdminPermissions("platform:write")
  createWebhook(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.createWebhook(body, request.currentAdmin!);
  }

  @Patch("webhooks/:id")
  @RequireAdminPermissions("platform:write")
  updateWebhook(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.updateWebhook(id, body, request.currentAdmin!);
  }

  @Post("usage-events")
  @RequireAdminPermissions("platform:write")
  recordUsage(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.recordUsage(body, request.currentAdmin!);
  }

  @Post("feature-flags")
  @RequireAdminPermissions("platform:write")
  upsertFeatureFlag(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.upsertFeatureFlag(body, request.currentAdmin!);
  }

  @Post("plugins")
  @RequireAdminPermissions("platform:write")
  upsertPlugin(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.upsertPlugin(body, request.currentAdmin!);
  }

  @Get("plugins")
  @RequireAdminPermissions("platform:view")
  listPlugins() {
    return this.platformService.listPlugins();
  }

  @Post("plugin-installs")
  @RequireAdminPermissions("platform:write")
  installPlugin(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.platformService.installPlugin(body, request.currentAdmin!);
  }
}
