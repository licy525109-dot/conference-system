import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminAccessService } from "./admin-access.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminAccessController {
  constructor(private readonly accessService: AdminAccessService) {}

  @Get("accounts")
  @RequireAdminPermissions("system:account")
  listAccounts() {
    return this.accessService.listAccounts();
  }

  @Post("accounts")
  @RequireAdminPermissions("system:account")
  createAccount(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.accessService.createAccount(body, request.currentAdmin!);
  }

  @Patch("accounts/:id")
  @RequireAdminPermissions("system:account")
  updateAccount(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.accessService.updateAccount(id, body, request.currentAdmin!);
  }

  @Get("permissions")
  @RequireAdminPermissions("system:role")
  listPermissions() {
    return this.accessService.listPermissions();
  }

  @Get("roles")
  @RequireAdminPermissions("system:role")
  listRoles() {
    return this.accessService.listRoles();
  }

  @Post("roles")
  @RequireAdminPermissions("system:role")
  createRole(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.accessService.createRole(body, request.currentAdmin!);
  }

  @Patch("roles/:id")
  @RequireAdminPermissions("system:role")
  updateRole(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.accessService.updateRole(id, body, request.currentAdmin!);
  }
}
