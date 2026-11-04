import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { AllowConferenceScopedAdmin } from "../admin/conference-scope";
import type { RequestWithCurrentAdmin } from "../admin/current-admin";
import { CertificatesService, certificateOk } from "./certificates.service";

interface BinaryResponse { setHeader(name: string, value: string): void; send(bytes: Buffer | string): void; status(code: number): BinaryResponse }
function binary(response: BinaryResponse, bytes: Buffer | Uint8Array, mime: string) { response.setHeader("Cache-Control", "private, no-store"); response.setHeader("Content-Type", mime); response.setHeader("X-Content-Type-Options", "nosniff"); response.send(Buffer.from(bytes)); }

@Controller("admin/certificates")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@AllowConferenceScopedAdmin()
@RequireAdminPermissions("certificate:view")
export class AdminCertificatesController {
  constructor(private readonly service: CertificatesService) {}
  @Get() async list(@Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.list(r.currentAdmin!)); }
  @Get("options") async options(@Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.options(r.currentAdmin!)); }
  @Post() @RequireAdminPermissions("certificate:view", "certificate:write")
  async create(@Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.create(body, r.currentAdmin!)); }
  @Get(":id") async detail(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.detail(id, r.currentAdmin!)); }
  @Patch(":id") @RequireAdminPermissions("certificate:view", "certificate:write")
  async save(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.save(id, body, r.currentAdmin!)); }
  @Get(":id/recipients") async recipients(@Param("id") id: string, @Query() q: Record<string, string>, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.recipients(id, r.currentAdmin!, q)); }
  @Post(":id/recipients") @RequireAdminPermissions("certificate:view", "certificate:write")
  async addRecipient(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.addRecipient(id, body, r.currentAdmin!)); }
  @Post(":id/import/preview") @RequireAdminPermissions("certificate:view", "certificate:import")
  async previewImport(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.previewImport(id, body, r.currentAdmin!)); }
  @Post(":id/registration-source") @RequireAdminPermissions("certificate:view", "certificate:import", "registration:view")
  async registrationSource(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.registrationSource(id, body, r.currentAdmin!)); }
  @Post(":id/import") @RequireAdminPermissions("certificate:view", "certificate:import")
  async commitImport(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.commitImport(id, body, r.currentAdmin!)); }
  @Patch(":id/recipients/:recipientId") @RequireAdminPermissions("certificate:view", "certificate:write")
  async updateRecipient(@Param("id") id: string, @Param("recipientId") recipientId: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.updateRecipient(id, recipientId, body, r.currentAdmin!)); }
  @Post(":id/recipients/:recipientId/remove") @RequireAdminPermissions("certificate:view", "certificate:write")
  async removeRecipient(@Param("id") id: string, @Param("recipientId") recipientId: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.removeRecipient(id, recipientId, body, r.currentAdmin!)); }
  @Post(":id/publish") @RequireAdminPermissions("certificate:view", "certificate:publish")
  async publish(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.publish(id, body, r.currentAdmin!)); }
  @Patch(":id/state") @RequireAdminPermissions("certificate:view", "certificate:publish")
  async state(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.state(id, body, r.currentAdmin!)); }
  @Post(":id/restore") @RequireAdminPermissions("certificate:view", "certificate:write", "certificate:import")
  async restore(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.restoreVersion(id, body, r.currentAdmin!)); }
  @Post(":id/preview") async preview(@Param("id") id: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin, @Res() res: BinaryResponse) { binary(res, await this.service.preview(id, body, r.currentAdmin!), "image/png"); }
  @Get(":id/assets") async assets(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.assets(id, r.currentAdmin!)); }
  @Post(":id/assets") @RequireAdminPermissions("certificate:view", "certificate:write")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024, files: 1 } }))
  async upload(@Param("id") id: string, @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.upload(id, file, r.currentAdmin!)); }
  @Get(":id/assets/:assetId") async asset(@Param("id") id: string, @Param("assetId") assetId: string, @Req() r: RequestWithCurrentAdmin, @Res() res: BinaryResponse) { const a = await this.service.asset(id, assetId, r.currentAdmin!); binary(res, a.bytes, a.mime); }
  @Get(":id/export") @RequireAdminPermissions("certificate:view", "certificate:export")
  async export(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.export(id, r.currentAdmin!)); }
  @Get(":id/issues") async issues(@Param("id") id: string, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.issues(id, r.currentAdmin!)); }
  @Patch(":id/issues/:issueId") @RequireAdminPermissions("certificate:view", "certificate:publish")
  async revoke(@Param("id") id: string, @Param("issueId") issueId: string, @Body() body: unknown, @Req() r: RequestWithCurrentAdmin) { return certificateOk(await this.service.revoke(id, issueId, body, r.currentAdmin!)); }
}

@Controller("certificates")
export class PublicCertificatesController {
  constructor(private readonly service: CertificatesService) {}
  @Get(":publicId") @Header("Cache-Control", "no-store") async meta(@Param("publicId") id: string) { return certificateOk(await this.service.publicMeta(id)); }
  @Get(":publicId/background") async background(@Param("publicId") id: string, @Res() res: BinaryResponse) { const a = await this.service.publicBackground(id); binary(res, a.bytes, a.mime); }
  @Post(":publicId/search") @Header("Cache-Control", "no-store") async search(@Param("publicId") id: string, @Body() body: unknown) { return certificateOk(await this.service.search(id, body)); }
  @Post(":publicId/image") async image(@Param("publicId") id: string, @Body() body: unknown, @Res() res: BinaryResponse) { const image = await this.service.image(id, body); res.setHeader("Content-Disposition", `inline; filename="certificate.png"; filename*=UTF-8''${encodeURIComponent(image.certificateNo + ".png")}`); binary(res, image.bytes, "image/png"); }
}

@Controller()
export class CertificatePageController {
  @Get("c/:publicId") @Header("Cache-Control", "no-store")
  async page(@Res() res: BinaryResponse) {
    const cwd = process.cwd(), root = cwd.endsWith("/services/api") ? resolve(cwd, "../..") : cwd;
    try { const html = await readFile(resolve(root, "apps/admin/dist/certificate.html"), "utf8"); res.setHeader("Content-Type", "text/html; charset=utf-8"); res.send(html.replaceAll('"/assets/', '"/certificate-assets/')); }
    catch { res.status(503).send("证书查询页面暂不可用，请稍后重试"); }
  }
}
