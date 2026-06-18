import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AdminCmsService } from "./admin-cms.service";
import { AdminJwtAuthGuard } from "./admin-jwt-auth.guard";
import { AdminPermissionGuard } from "./admin-permission.guard";
import { RequestWithCurrentAdmin } from "./current-admin";
import { RequireAdminPermissions } from "./require-permissions.decorator";

@Controller("admin")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
export class AdminCmsController {
  constructor(private readonly cmsService: AdminCmsService) {}

  @Get("pages")
  @RequireAdminPermissions("page:view")
  listPages() {
    return this.cmsService.listPages();
  }

  @Post("pages")
  @RequireAdminPermissions("page:write")
  createPage(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.createPage(body, request.currentAdmin!);
  }

  @Get("page-library-templates")
  @RequireAdminPermissions("page:view")
  listPageLibraryTemplates() {
    return this.cmsService.listPageLibraryTemplates();
  }

  @Post("page-library-templates")
  @RequireAdminPermissions("page:write")
  createPageLibraryTemplate(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.createPageLibraryTemplate(body, request.currentAdmin!);
  }

  @Patch("pages/:id")
  @RequireAdminPermissions("page:write")
  updatePage(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.updatePage(id, body, request.currentAdmin!);
  }

  @Post("pages/:id/rollback")
  @RequireAdminPermissions("page:write")
  rollbackPage(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.rollbackPage(id, body, request.currentAdmin!);
  }

  @Get("page-versions/:id")
  @RequireAdminPermissions("page:view")
  getPageVersion(@Param("id") id: string) {
    return this.cmsService.getPageVersion(id);
  }

  @Patch("page-versions/:id")
  @RequireAdminPermissions("page:write")
  updatePageVersion(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.updatePageVersion(id, body, request.currentAdmin!);
  }

  @Post("page-versions/:id/publish")
  @RequireAdminPermissions("page:write")
  publishPageVersion(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.publishPageVersion(id, body, request.currentAdmin!);
  }

  @Get("component-presets")
  @RequireAdminPermissions("page:view")
  listComponentPresets() {
    return this.cmsService.listComponentPresets();
  }

  @Get("theme")
  @RequireAdminPermissions("theme:view")
  getTheme() {
    return this.cmsService.getTheme();
  }

  @Patch("theme")
  @RequireAdminPermissions("theme:write")
  updateTheme(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.updateTheme(body, request.currentAdmin!);
  }

  @Get("theme-presets")
  @RequireAdminPermissions("theme:view")
  listThemePresets() {
    return this.cmsService.listThemePresets();
  }

  @Post("theme-presets")
  @RequireAdminPermissions("theme:write")
  createThemePreset(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.createThemePreset(body, request.currentAdmin!);
  }

  @Patch("theme-presets/:id")
  @RequireAdminPermissions("theme:write")
  updateThemePreset(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.updateThemePreset(id, body, request.currentAdmin!);
  }

  @Get("tabbar")
  @RequireAdminPermissions("tabbar:view")
  getTabbar() {
    return this.cmsService.getTabbar();
  }

  @Patch("tabbar")
  @RequireAdminPermissions("tabbar:write")
  updateTabbar(@Body() body: unknown, @Req() request: RequestWithCurrentAdmin) {
    return this.cmsService.updateTabbar(body, request.currentAdmin!);
  }
}
