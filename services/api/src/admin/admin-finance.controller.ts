import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminFinanceService } from "./admin-finance.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/finance")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminFinanceController {
  constructor(private readonly financeService: AdminFinanceService) {}

  @Get("overview")
  @RequireAdminPermissions("finance:view")
  overview() {
    return this.financeService.overview();
  }

  @Get("payments")
  @RequireAdminPermissions("finance:view")
  payments(@Query() query: Record<string, unknown>) {
    return this.financeService.listPayments(query);
  }

  @Get("reconciliation-batches")
  @RequireAdminPermissions("finance:view")
  batches(@Query() query: Record<string, unknown>) {
    return this.financeService.listBatches(query);
  }

  @Post("reconciliation-batches")
  @RequireAdminPermissions("finance:write")
  createBatch(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.createBatch(request.currentAdmin!, body);
  }

  @Get("differences")
  @RequireAdminPermissions("finance:view")
  differences(@Query() query: Record<string, unknown>) {
    return this.financeService.listDifferences(query);
  }

  @Post("differences/:id/mark-reviewed")
  @RequireAdminPermissions("reconciliation:write")
  markDifferenceReviewed(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.markDifferenceReviewed(id, body, request.currentAdmin!);
  }

  @Get("refunds")
  @RequireAdminPermissions("refund:view")
  refunds(@Query() query: Record<string, unknown>) {
    return this.financeService.listRefunds(query);
  }

  @Post("refunds")
  @RequireAdminPermissions("refund:write")
  createRefund(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.createRefund(body, request.currentAdmin!);
  }

  @Post("refunds/:id/approve")
  @RequireAdminPermissions("refund:write")
  approveRefund(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.approveRefund(id, request.currentAdmin!);
  }

  @Post("refunds/:id/reject")
  @RequireAdminPermissions("refund:write")
  rejectRefund(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.rejectRefund(id, body, request.currentAdmin!);
  }

  @Post("refunds/:id/query")
  @RequireAdminPermissions("refund:view")
  queryRefund(@Param("id") id: string) {
    return this.financeService.queryRefund(id);
  }

  @Get("invoices")
  @RequireAdminPermissions("invoice:view")
  invoices(@Query() query: Record<string, unknown>) {
    return this.financeService.listInvoices(query);
  }

  @Post("invoices/:id/approve")
  @RequireAdminPermissions("invoice:write")
  approveInvoice(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.approveInvoice(id, request.currentAdmin!);
  }

  @Post("invoices/:id/reject")
  @RequireAdminPermissions("invoice:write")
  rejectInvoice(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.rejectInvoice(id, body, request.currentAdmin!);
  }

  @Post("invoices/:id/mark-issued")
  @RequireAdminPermissions("invoice:write")
  markInvoiceIssued(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.markInvoiceIssued(id, body, request.currentAdmin!);
  }

  @Post("wechat-bills")
  @RequireAdminPermissions("wechat-bill:write")
  createWechatBill(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.createWechatBill(body, request.currentAdmin!);
  }

  @Get("wechat-bills")
  @RequireAdminPermissions("wechat-bill:view")
  wechatBills(@Query() query: Record<string, unknown>) {
    return this.financeService.listWechatBills(query);
  }

  @Post("wechat-bills/import")
  @RequireAdminPermissions("wechat-bill:write")
  importWechatBill(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.importWechatBill(body, request.currentAdmin!);
  }

  @Post("wechat-bills/:id/download")
  @RequireAdminPermissions("wechat-bill:write")
  downloadWechatBill(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.downloadWechatBill(id, request.currentAdmin!);
  }

  @Post("wechat-bills/:id/reconcile")
  @RequireAdminPermissions("reconciliation:write")
  reconcileWechatBill(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.reconcileWechatBill(id, request.currentAdmin!, body);
  }

  @Get("reconciliation-results")
  @RequireAdminPermissions("reconciliation:view")
  reconciliationResults(@Query() query: Record<string, unknown>) {
    return this.financeService.listReconciliationResults(query);
  }

  @Post("reconciliation-results/:id/mark-reviewed")
  @RequireAdminPermissions("reconciliation:write")
  markReconciliationReviewed(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.financeService.markReconciliationReviewed(id, body, request.currentAdmin!);
  }
}

@Controller("admin/payments")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminPaymentsController {
  constructor(private readonly financeService: AdminFinanceService) {}

  @Get()
  @RequireAdminPermissions("payment:view")
  payments(@Query() query: Record<string, unknown>) {
    return this.financeService.listPayments(query);
  }
}
