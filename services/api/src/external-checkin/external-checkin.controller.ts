import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import type { RequestWithCurrentAdmin } from "../admin/current-admin";
import { ExternalCheckinService, externalCheckinOk as ok } from "./external-checkin.service";

interface ImageResponse { setHeader(name: string, value: string): void; send(bytes: Buffer): void }
function sendImage(response: ImageResponse, asset: { bytes: Uint8Array; mime: string }) {
  response.setHeader("Content-Type", asset.mime);
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.send(Buffer.from(asset.bytes));
}

@Controller("admin/external-checkins")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermissions("external-checkin:view")
export class AdminExternalCheckinController {
  constructor(private readonly service: ExternalCheckinService) {}
  @Get() async list(@Query() q: Record<string, unknown>, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.list(q, r.currentAdmin!)); }
  @Get(":id") async detail(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.detail(id, r.currentAdmin!)); }
  @Post() @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async create(@Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.create(body, r.currentAdmin!)); }
  @Patch(":id") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async save(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.save(id, body, r.currentAdmin!)); }
  @Patch(":id/appearance") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async appearance(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.saveAppearance(id, body, r.currentAdmin!)); }
  @Post(":id/images") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async uploadImage(@Param("id") id: string, @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string } | undefined, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.uploadImage(id, file, r.currentAdmin!)); }
  @Get(":id/images/:assetId")
  async image(@Param("id") id: string, @Param("assetId") assetId: string, @Req() r: RequestWithCurrentAdmin, @Res() res: ImageResponse) { sendImage(res, await this.service.adminImage(id, assetId, r.currentAdmin!)); }
  @Post(":id/import/preview") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async preview(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.import(id, body, r.currentAdmin!, false)); }
  @Post(":id/import") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async import(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.import(id, body, r.currentAdmin!, true)); }
  @Get(":id/attendees") async attendees(@Param("id") id: string, @Query() q: Record<string, unknown>, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.attendees(id, q, r.currentAdmin!)); }
  @Post(":id/attendees/:attendeeId/checkin") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async helpCheckin(@Param("id") id: string, @Param("attendeeId") attendeeId: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.helpCheckin(id, attendeeId, body, r.currentAdmin!)); }
  @Delete(":id/attendees/:attendeeId") @RequireAdminPermissions("external-checkin:view", "external-checkin:write")
  async deleteAttendee(@Param("id") id: string, @Param("attendeeId") attendeeId: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.deleteAttendee(id, attendeeId, body, r.currentAdmin!)); }
  @Get(":id/export") async export(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return ok(await this.service.attendees(id, {}, r.currentAdmin!, true)); }
}

@Controller("external-checkins")
export class PublicExternalCheckinController {
  constructor(private readonly service: ExternalCheckinService) {}
  @Get(":token") @Header("Cache-Control", "no-store") async meta(@Param("token") token: string) { return ok(await this.service.publicMeta(token)); }
  @Post(":token/submit") @Header("Cache-Control", "no-store") async submit(@Param("token") token: string, @Body() body: unknown) { return ok(await this.service.submit(token, body)); }
  @Get(":token/images/:assetId")
  async image(@Param("token") token: string, @Param("assetId") assetId: string, @Res() res: ImageResponse) { sendImage(res, await this.service.publicImage(token, assetId)); }
  @Get(":token/page") @Header("Cache-Control", "no-store")
  async page(@Res() res: { setHeader(name: string, value: string): void; send(body: string): void; status(code: number): { send(body: string): void } }) {
    const cwd = process.cwd(), root = cwd.endsWith("/services/api") ? resolve(cwd, "../..") : cwd;
    try {
      const html = await readFile(resolve(root, "apps/admin/dist/external-checkin.html"), "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(html.replaceAll('"/assets/', '"/api/external-checkin-assets/'));
    } catch { res.status(503).send("签到页面暂不可用，请联系现场工作人员"); }
  }
}
