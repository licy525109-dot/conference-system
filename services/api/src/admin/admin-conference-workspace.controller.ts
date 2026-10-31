import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminConferenceWorkspaceService } from "./admin-conference-workspace.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AllowConferenceScopedAdmin } from "./conference-scope";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/conference-workspace")
@AllowConferenceScopedAdmin()
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminConferenceWorkspaceController {
  constructor(private readonly service: AdminConferenceWorkspaceService) {}
  @Get("conferences") @RequireAdminPermissions("conference:view")
  conferences(@Query() query: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.conferences(query, req.currentAdmin!); }
  @Get("conferences/:id") @RequireAdminPermissions("conference:view")
  conference(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.conference(id, req.currentAdmin!); }
  @Patch("conferences/:id") @RequireAdminPermissions("conference:write")
  updateConference(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.updateConference(id, body, req.currentAdmin!); }
  @Get("conferences/:id/skus") @RequireAdminPermissions("conference:view")
  skus(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.skus(id, req.currentAdmin!); }
  @Post("conferences/:id/skus") @RequireAdminPermissions("conference:write")
  createSku(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.createSku(id, body, req.currentAdmin!); }
  @Patch("skus/:id") @RequireAdminPermissions("conference:write")
  updateSku(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.updateSku(id, body, req.currentAdmin!); }
  @Get("conferences/:id/form-fields") @RequireAdminPermissions("conference:view")
  fields(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.fields(id, req.currentAdmin!); }
  @Post("conferences/:id/form-fields") @RequireAdminPermissions("conference:write")
  createField(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.createField(id, body, req.currentAdmin!); }
  @Patch("form-fields/:id") @RequireAdminPermissions("conference:write")
  updateField(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.updateField(id, body, req.currentAdmin!); }
  @Get("orders") @RequireAdminPermissions("order:view")
  orders(@Query() query: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.orders(query, req.currentAdmin!); }
  @Get("orders/:id") @RequireAdminPermissions("order:view")
  order(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.order(id, req.currentAdmin!); }
  @Get("registrations") @RequireAdminPermissions("registration:view")
  registrations(@Query() query: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.registrations(query, req.currentAdmin!); }
  @Get("registrations/:id") @RequireAdminPermissions("registration:view")
  registration(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.registration(id, req.currentAdmin!); }
  @Patch("registrations/:id/remark") @RequireAdminPermissions("registration:write")
  remark(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.remark(id, body, req.currentAdmin!); }
  @Post("attendees/:id/check-in") @RequireAdminPermissions("checkin:write")
  checkin(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) { return this.service.checkin(id, req.currentAdmin!); }
  @Get("exports/registrations.xls") @RequireAdminPermissions("registration:view", "registration:export")
  @Header("content-type", "application/vnd.ms-excel; charset=utf-8")
  @Header("content-disposition", 'attachment; filename="registrations.xls"')
  export(@Query() query: Record<string, unknown>, @Req() req: RequestWithCurrentAdmin) { return this.service.exportRegistrations(query, req.currentAdmin!); }
}
