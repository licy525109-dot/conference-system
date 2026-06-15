import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminMaterialsService } from "./admin-materials.service";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminMaterialsController {
  constructor(private readonly materialsService: AdminMaterialsService) {}

  @Get("material-categories")
  @RequireAdminPermissions("material:view")
  listCategories() {
    return this.materialsService.listCategories();
  }

  @Post("material-categories")
  @RequireAdminPermissions("material:write")
  createCategory(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.materialsService.createCategory(body, request.currentAdmin!);
  }

  @Get("materials")
  @RequireAdminPermissions("material:view")
  listAssets(@Query() query: Record<string, unknown>) {
    return this.materialsService.listAssets(query);
  }

  @Post("materials")
  @RequireAdminPermissions("material:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 }
    })
  )
  createAsset(
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string; size: number } | undefined,
    @Req() request: RequestWithCurrentAdmin & { headers?: Record<string, string | string[] | undefined> }
  ) {
    return this.materialsService.createAsset(body, file, getPublicOrigin(request), request.currentAdmin!);
  }

  @Patch("materials/:id")
  @RequireAdminPermissions("material:write")
  updateAsset(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.materialsService.updateAsset(id, body, request.currentAdmin!);
  }

  @Delete("materials/:id")
  @RequireAdminPermissions("material:write")
  disableAsset(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.materialsService.disableAsset(id, request.currentAdmin!);
  }
}

function getPublicOrigin(request: { headers?: Record<string, string | string[] | undefined> }): string {
  const forwardedProto = readFirstHeader(request.headers?.["x-forwarded-proto"]);
  const forwardedHost = readFirstHeader(request.headers?.["x-forwarded-host"]);
  const host = forwardedHost || readFirstHeader(request.headers?.host) || "localhost:3000";
  const proto = forwardedProto || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

function readFirstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
