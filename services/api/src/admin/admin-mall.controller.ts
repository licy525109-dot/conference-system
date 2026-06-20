import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminMallService } from "./admin-mall.service";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin/mall")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminMallController {
  constructor(private readonly mallService: AdminMallService) {}

  @Get("payment-config")
  @RequireAdminPermissions("mall:view")
  getPaymentConfig() {
    return this.mallService.getPaymentConfig();
  }

  @Patch("payment-config")
  @RequireAdminPermissions("mall:write")
  updatePaymentConfig(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updatePaymentConfig(body, request.currentAdmin!);
  }

  @Get("categories")
  @RequireAdminPermissions("mall:view")
  listCategories(@Query() query: Record<string, unknown>) {
    return this.mallService.listCategories(query);
  }

  @Get("categories/options")
  @RequireAdminPermissions("mall:view")
  categoryOptions(@Query() query: Record<string, unknown>) {
    return this.mallService.categoryOptions(query);
  }

  @Post("categories")
  @RequireAdminPermissions("mall:write")
  createCategory(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createCategory(body, request.currentAdmin!);
  }

  @Patch("categories/:id")
  @RequireAdminPermissions("mall:write")
  updateCategory(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updateCategory(id, body, request.currentAdmin!);
  }

  @Get("products")
  @RequireAdminPermissions("mall:view")
  listProducts(@Query() query: Record<string, unknown>) {
    return this.mallService.listProducts(query);
  }

  @Get("products/options")
  @RequireAdminPermissions("mall:view")
  productOptions(@Query() query: Record<string, unknown>) {
    return this.mallService.productOptions(query);
  }

  @Get("products/:id")
  @RequireAdminPermissions("mall:view")
  getProduct(@Param("id") id: string) {
    return this.mallService.getProduct(id);
  }

  @Post("products")
  @RequireAdminPermissions("mall:write")
  createProduct(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createProduct(body, request.currentAdmin!);
  }

  @Patch("products/:id")
  @RequireAdminPermissions("mall:write")
  updateProduct(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updateProduct(id, body, request.currentAdmin!);
  }

  @Post("products/:id/skus")
  @RequireAdminPermissions("mall:write")
  createSku(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createSku(id, body, request.currentAdmin!);
  }

  @Post("skus")
  @RequireAdminPermissions("mall:write")
  createSkuFromBody(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createSkuFromBody(body, request.currentAdmin!);
  }

  @Get("skus")
  @RequireAdminPermissions("mall:view")
  listSkus(@Query() query: Record<string, unknown>) {
    return this.mallService.listSkus(query);
  }

  @Patch("skus/:id")
  @RequireAdminPermissions("mall:write")
  updateSku(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updateSku(id, body, request.currentAdmin!);
  }

  @Get("inventory-logs")
  @RequireAdminPermissions("mall:view")
  inventoryLogs(@Query() query: Record<string, unknown>) {
    return this.mallService.inventoryLogs(query);
  }

  @Get("orders")
  @RequireAdminPermissions("mall:order")
  listOrders(@Query() query: Record<string, unknown>) {
    return this.mallService.listOrders(query);
  }

  @Get("orders/options")
  @RequireAdminPermissions("mall:order")
  orderOptions(@Query() query: Record<string, unknown>) {
    return this.mallService.orderOptions(query);
  }

  @Get("orders/:id")
  @RequireAdminPermissions("mall:order")
  getOrder(@Param("id") id: string) {
    return this.mallService.getOrder(id);
  }

  @Patch("orders/:id/close")
  @RequireAdminPermissions("mall:order")
  closeOrder(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.closeOrder(id, request.currentAdmin!);
  }

  @Post("orders/:id/ship")
  @RequireAdminPermissions("mall:shipment")
  shipOrder(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.shipOrder(id, body, request.currentAdmin!);
  }

  @Post("orders/:id/verify")
  @RequireAdminPermissions("mall:shipment")
  verifyOrder(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.verifyOrder(id, request.currentAdmin!);
  }

  @Get("shipments")
  @RequireAdminPermissions("mall:shipment")
  listShipments(@Query() query: Record<string, unknown>) {
    return this.mallService.listShipments(query);
  }

  @Post("shipments")
  @RequireAdminPermissions("mall:shipment")
  createShipment(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createShipment(body, request.currentAdmin!);
  }

  @Patch("shipments/:id")
  @RequireAdminPermissions("mall:shipment")
  updateShipment(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updateShipment(id, body, request.currentAdmin!);
  }

  @Get("aftersales")
  @RequireAdminPermissions("mall:aftersale")
  listAfterSales(@Query() query: Record<string, unknown>) {
    return this.mallService.listAfterSales(query);
  }

  @Post("aftersales")
  @RequireAdminPermissions("mall:aftersale")
  createAfterSale(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createAfterSale(body, request.currentAdmin!);
  }

  @Patch("aftersales/:id")
  @RequireAdminPermissions("mall:aftersale")
  updateAfterSale(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.updateAfterSale(id, body, request.currentAdmin!);
  }

  @Post("aftersales/:id/process-refund")
  @RequireAdminPermissions("mall:aftersale")
  processAfterSaleRefund(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.processAfterSaleRefund(id, request.currentAdmin!);
  }

  @Get("orders-export")
  @RequireAdminPermissions("mall:order")
  exportOrders() {
    return this.mallService.exportOrders();
  }
}
