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

  @Get("categories")
  @RequireAdminPermissions("mall:view")
  listCategories() {
    return this.mallService.listCategories();
  }

  @Post("categories")
  @RequireAdminPermissions("mall:write")
  createCategory(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.mallService.createCategory(body, request.currentAdmin!);
  }

  @Get("products")
  @RequireAdminPermissions("mall:view")
  listProducts(@Query() query: Record<string, unknown>) {
    return this.mallService.listProducts(query);
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

  @Get("orders")
  @RequireAdminPermissions("mall:view")
  listOrders(@Query() query: Record<string, unknown>) {
    return this.mallService.listOrders(query);
  }
}
