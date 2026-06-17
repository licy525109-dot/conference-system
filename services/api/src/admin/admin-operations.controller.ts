import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminOperationsService } from "./admin-operations.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminOperationsController {
  constructor(private readonly operations: AdminOperationsService) {}

  @Get("conferences/:id/inventory-alert-rule")
  @RequireAdminPermissions("inventory-alert:view")
  getInventoryRule(@Param("id") id: string) {
    return this.operations.getInventoryAlertRule(id);
  }

  @Patch("conferences/:id/inventory-alert-rule")
  @RequireAdminPermissions("inventory-alert:write")
  updateInventoryRule(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateInventoryAlertRule(id, body, request.currentAdmin!);
  }

  @Post("inventory-alerts/scan")
  @RequireAdminPermissions("inventory-alert:write")
  scanInventory(@Req() request: RequestWithCurrentAdmin) {
    return this.operations.scanInventoryAlerts(request.currentAdmin!);
  }

  @Get("inventory-alert-logs")
  @RequireAdminPermissions("inventory-alert:view")
  inventoryLogs(@Query() query: Record<string, unknown>) {
    return this.operations.listInventoryAlertLogs(query);
  }

  @Get("customer-groups")
  @RequireAdminPermissions("customer-group:view")
  customerGroups(@Query() query: Record<string, unknown>) {
    return this.operations.listCustomerGroups(query);
  }

  @Post("customer-groups")
  @RequireAdminPermissions("customer-group:write")
  createCustomerGroup(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createCustomerGroup(body, request.currentAdmin!);
  }

  @Patch("customer-groups/:id")
  @RequireAdminPermissions("customer-group:write")
  updateCustomerGroup(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateCustomerGroup(id, body, request.currentAdmin!);
  }

  @Post("customer-groups/sync-wecom")
  @RequireAdminPermissions("customer-group:write")
  syncCustomerGroups(@Req() request: RequestWithCurrentAdmin) {
    return this.operations.syncCustomerGroupsFromWecom(request.currentAdmin!);
  }

  @Get("group-welcome-templates")
  @RequireAdminPermissions("customer-group:view")
  welcomeTemplates() {
    return this.operations.listGroupWelcomeTemplates();
  }

  @Post("group-welcome-templates")
  @RequireAdminPermissions("customer-group:write")
  createWelcomeTemplate(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createGroupWelcomeTemplate(body, request.currentAdmin!);
  }

  @Patch("group-welcome-templates/:id")
  @RequireAdminPermissions("customer-group:write")
  updateWelcomeTemplate(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateGroupWelcomeTemplate(id, body, request.currentAdmin!);
  }

  @Get("customer-group-message-tasks")
  @RequireAdminPermissions("customer-group:view")
  groupMessageTasks(@Query() query: Record<string, unknown>) {
    return this.operations.listCustomerGroupMessageTasks(query);
  }

  @Post("customer-group-message-tasks")
  @RequireAdminPermissions("customer-group:write")
  createGroupMessageTask(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createCustomerGroupMessageTask(body, request.currentAdmin!);
  }

  @Post("customer-group-message-tasks/:id/create-wecom-task")
  @RequireAdminPermissions("customer-group:send")
  createWecomTask(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createWecomCustomerGroupTask(id, request.currentAdmin!);
  }

  @Post("customer-group-message-tasks/:id/cancel")
  @RequireAdminPermissions("customer-group:send")
  cancelGroupMessageTask(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.cancelCustomerGroupMessageTask(id, request.currentAdmin!);
  }

  @Get("customer-group-message-tasks/:id/result")
  @RequireAdminPermissions("customer-group:view")
  groupMessageTaskResult(@Param("id") id: string) {
    return this.operations.getCustomerGroupMessageTaskResult(id);
  }

  @Get("conferences/:id/knowledge-base")
  @RequireAdminPermissions("ai-kb:view")
  knowledgeBase(@Param("id") id: string) {
    return this.operations.getKnowledgeBase(id);
  }

  @Post("conferences/:id/knowledge-documents")
  @RequireAdminPermissions("ai-kb:write")
  createKnowledgeDocument(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createKnowledgeDocument(id, body, request.currentAdmin!);
  }

  @Patch("knowledge-documents/:id")
  @RequireAdminPermissions("ai-kb:write")
  updateKnowledgeDocument(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateKnowledgeDocument(id, body, request.currentAdmin!);
  }

  @Post("knowledge-documents/:id/reindex")
  @RequireAdminPermissions("ai-kb:write")
  reindexKnowledgeDocument(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.reindexKnowledgeDocument(id, request.currentAdmin!);
  }

  @Post("knowledge-documents/:id/delete")
  @RequireAdminPermissions("ai-kb:write")
  deleteKnowledgeDocument(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.deleteKnowledgeDocument(id, request.currentAdmin!);
  }

  @Delete("knowledge-documents/:id")
  @RequireAdminPermissions("ai-kb:write")
  deleteKnowledgeDocumentByDelete(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.deleteKnowledgeDocument(id, request.currentAdmin!);
  }

  @Get("conferences/:id/ai-question-logs")
  @RequireAdminPermissions("ai-kb:view")
  aiQuestionLogs(@Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.operations.listAiQuestionLogs(id, query);
  }

  @Get("auto-reply-rules")
  @RequireAdminPermissions("ai-kb:view")
  autoReplyRules() {
    return this.operations.listAutoReplyRules();
  }

  @Post("auto-reply-rules")
  @RequireAdminPermissions("ai-kb:write")
  createAutoReplyRule(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createAutoReplyRule(body, request.currentAdmin!);
  }

  @Patch("auto-reply-rules/:id")
  @RequireAdminPermissions("ai-kb:write")
  updateAutoReplyRule(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateAutoReplyRule(id, body, request.currentAdmin!);
  }

  @Post("coupon-campaigns")
  @RequireAdminPermissions("coupon:write")
  createCouponCampaign(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createCouponCampaign(body, request.currentAdmin!);
  }

  @Get("coupon-campaigns/:id")
  @RequireAdminPermissions("coupon:view")
  getCouponCampaign(@Param("id") id: string) {
    return this.operations.getCouponCampaign(id);
  }

  @Patch("coupon-campaigns/:id")
  @RequireAdminPermissions("coupon:write")
  updateCouponCampaign(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.updateCouponCampaign(id, body, request.currentAdmin!);
  }

  @Post("coupon-campaigns/:id/generate-qr")
  @RequireAdminPermissions("coupon:write")
  generateCouponQr(@Param("id") id: string) {
    return this.operations.generateCouponCampaignQr(id);
  }

  @Post("checkin/verify")
  @RequireAdminPermissions("registration:write")
  verifyCheckin(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.verifyCheckin(body, request.currentAdmin!);
  }

  @Post("checkin/manual")
  @RequireAdminPermissions("registration:write")
  manualCheckin(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.manualCheckin(body, request.currentAdmin!);
  }

  @Post("checkin/:id/revoke")
  @RequireAdminPermissions("registration:write")
  revokeCheckin(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.revokeCheckin(id, request.currentAdmin!);
  }

  @Get("checkin/logs")
  @RequireAdminPermissions("registration:view")
  checkinLogs(@Query() query: Record<string, unknown>) {
    return this.operations.listCheckinLogs(query);
  }

  @Get("checkin/stats")
  @RequireAdminPermissions("registration:view")
  checkinStats(@Query() query: Record<string, unknown>) {
    return this.operations.checkinStats(query);
  }

  @Post("refunds")
  @RequireAdminPermissions("refund:write")
  createRefund(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createRefund(body, request.currentAdmin!);
  }

  @Get("refunds")
  @RequireAdminPermissions("refund:view")
  refunds(@Query() query: Record<string, unknown>) {
    return this.operations.listRefunds(query);
  }

  @Post("refunds/:id/approve")
  @RequireAdminPermissions("refund:write")
  approveRefund(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.approveRefund(id, request.currentAdmin!);
  }

  @Post("refunds/:id/reject")
  @RequireAdminPermissions("refund:write")
  rejectRefund(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.rejectRefund(id, body, request.currentAdmin!);
  }

  @Post("refunds/:id/query")
  @RequireAdminPermissions("refund:view")
  queryRefund(@Param("id") id: string) {
    return this.operations.queryRefund(id);
  }

  @Get("invoices")
  @RequireAdminPermissions("invoice:view")
  invoices(@Query() query: Record<string, unknown>) {
    return this.operations.listInvoices(query);
  }

  @Post("invoices/:id/approve")
  @RequireAdminPermissions("invoice:write")
  approveInvoice(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.approveInvoice(id, request.currentAdmin!);
  }

  @Post("invoices/:id/reject")
  @RequireAdminPermissions("invoice:write")
  rejectInvoice(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.rejectInvoice(id, body, request.currentAdmin!);
  }

  @Post("invoices/:id/mark-issued")
  @RequireAdminPermissions("invoice:write")
  markInvoiceIssued(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.markInvoiceIssued(id, request.currentAdmin!);
  }

  @Post("finance/wechat-bills")
  @RequireAdminPermissions("finance:write")
  createWechatBill(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.createWechatBill(body, request.currentAdmin!);
  }

  @Get("finance/wechat-bills")
  @RequireAdminPermissions("finance:view")
  wechatBills() {
    return this.operations.listWechatBills();
  }

  @Post("finance/wechat-bills/:id/download")
  @RequireAdminPermissions("finance:write")
  downloadWechatBill(@Param("id") id: string) {
    return this.operations.downloadWechatBill(id);
  }

  @Post("finance/wechat-bills/:id/reconcile")
  @RequireAdminPermissions("finance:write")
  reconcileWechatBill(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.operations.reconcileWechatBill(id, request.currentAdmin!);
  }

  @Get("finance/reconciliation-results")
  @RequireAdminPermissions("finance:view")
  reconciliationResults(@Query() query: Record<string, unknown>) {
    return this.operations.listReconciliationResults(query);
  }
}
