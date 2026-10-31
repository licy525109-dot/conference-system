import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { PaymentMerchantService } from "../payments/payment-merchant.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequireAdminPermissions } from "./require-permissions.decorator";
import { RequestWithCurrentAdmin } from "./current-admin";

@Controller("admin/payment-merchants")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermissions("payment-merchant:manage")
export class AdminPaymentMerchantsController {
  constructor(private readonly service: PaymentMerchantService) {}
  @Get() list() { return this.service.list(); }
  @Post() create(@Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.create(body, req.currentAdmin!); }
  @Patch(":id") update(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.update(id, body, req.currentAdmin!); }
  @Post(":id/revisions") saveRevision(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.saveRevision(id, body, req.currentAdmin!); }
  @Post(":id/revisions/:revisionId/check") check(@Param("id") id: string, @Param("revisionId") revisionId: string, @Req() req: RequestWithCurrentAdmin) { return this.service.checkRevision(id, revisionId, req.currentAdmin!); }
  @Post(":id/revisions/:revisionId/activate") activate(@Param("id") id: string, @Param("revisionId") revisionId: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.activate(id, revisionId, body, req.currentAdmin!); }
  @Get("conferences/:id") conference(@Param("id") id: string) { return this.service.getConference(id); }
  @Patch("conferences/:id") setConference(@Param("id") id: string, @Body() body: unknown, @Req() req: RequestWithCurrentAdmin) { return this.service.setConference(id, body, req.currentAdmin!); }
}
