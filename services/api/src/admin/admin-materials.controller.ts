import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { AdminMaterialsService } from "./admin-materials.service";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";
import { resolvePublicOrigin } from "../security/public-origin";

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

  @Get("materials/:id/diagnose")
  @RequireAdminPermissions("material:view")
  diagnoseAsset(@Param("id") id: string) {
    return this.materialsService.diagnoseAsset(id);
  }

  @Post("materials")
  @RequireAdminPermissions("material:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 }
    })
  )
  createAsset(
    @Body() body: unknown,
    @UploadedFile() file: { buffer: Buffer; originalname?: string; mimetype?: string; size: number } | undefined,
    @Req() request: RequestWithCurrentAdmin & { headers?: Record<string, string | string[] | undefined> }
  ) {
    return this.materialsService.createAsset(body, file, resolvePublicOrigin(request.headers), request.currentAdmin!);
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

  @Delete("materials/:id/hard")
  @RequireAdminPermissions("material:write")
  hardDeleteAsset(@Param("id") id: string, @Req() request: RequestWithCurrentAdmin) {
    return this.materialsService.hardDeleteAsset(id, request.currentAdmin!);
  }
}
