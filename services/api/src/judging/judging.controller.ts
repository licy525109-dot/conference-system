import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminMaterialsService, type UploadedMaterialFile } from "../admin/admin-materials.service";
import { validateInvitationAsset } from "../invitations/invitation-assets.service";
import { resolvePublicOrigin } from "../security/public-origin";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import { AllowConferenceScopedAdmin } from "../admin/conference-scope";
import type { RequestWithCurrentAdmin } from "../admin/current-admin";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import type { RequestWithCurrentUser } from "../auth/current-user";
import { JudgingService } from "./judging.service";

const ok = <T>(data: T) => ({ code: "OK", message: "ok", data });
@Controller("admin/judging")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@AllowConferenceScopedAdmin()
@RequireAdminPermissions("judging:view")
export class JudgingAdminController {
  constructor(
    private readonly service: JudgingService,
    private readonly materials: AdminMaterialsService
  ) {}

  @Post(":id/design-images")
  @RequireAdminPermissions("judging:view", "judging:config")
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async designImage(
    @Param("id") id: string,
    @UploadedFile() file: UploadedMaterialFile | undefined,
    @Req() r: RequestWithCurrentAdmin
  ) {
    await this.service.requireDesignEditor(id, r.currentAdmin!);
    const image = validateInvitationAsset(file);
    if (!image.mimetype?.startsWith("image/")) throw new BadRequestException("请选择 JPG、PNG 或 WebP 图片");
    const saved = await this.materials.createAsset(
      { usage: "judging_design:" + id },
      image,
      resolvePublicOrigin({
        host: process.env.NODE_ENV === "production" ? "guanchaohuiji.com" : "localhost:3001"
      }),
      r.currentAdmin!
    );
    return ok({ url: new URL(saved.data.url).pathname });
  }
  @Get() async list(@Req() r: RequestWithCurrentAdmin) {
    return ok(await this.service.list(r.currentAdmin!));
  }
  @Post() async create(@Body() b: unknown, @Req() r: RequestWithCurrentAdmin) {
    return ok(await this.service.create(b, r.currentAdmin!));
  }
  @Get("accounts") async accounts(@Req() r: RequestWithCurrentAdmin) {
    return ok(await this.service.accounts(r.currentAdmin!));
  }
  @Get(":id/sources/conferences") async conferences(
    @Param("id") id: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.sourceConferences(id, r.currentAdmin!));
  }
  @Get(":id/sources/conferences/:cid") async registered(
    @Param("id") id: string,
    @Param("cid") cid: string,
    @Query("keyword") keyword: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.registered(id, cid, keyword || "", r.currentAdmin!));
  }
  @Get(":id") @Header("Cache-Control", "private, no-store") async detail(
    @Param("id") id: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.detail(id, r.currentAdmin!));
  }
  @Post(":id/preview-config") async preview(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.checkConfig(id, b, r.currentAdmin!));
  }
  @Post(":id/actions") async change(
    @Param("id") id: string,
    @Body() b: unknown,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.change(id, b, r.currentAdmin!));
  }
  @Get(":id/progress") @Header("Cache-Control", "private, no-store") async progress(
    @Param("id") id: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.progress(id, r.currentAdmin!));
  }
  @Get(":id/sessions/:sid/rehearsal/:judge")
  @Header("Cache-Control", "private, no-store")
  async rehearsalPage(
    @Param("id") id: string,
    @Param("sid") sid: string,
    @Param("judge") judgeKey: string,
    @Req() req: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.mobile(id, sid, { operator: req.currentAdmin!, judgeKey }));
  }
  @Post(":id/sessions/:sid/rehearsal/:judge")
  @Header("Cache-Control", "private, no-store")
  async rehearsalSubmit(
    @Param("id") id: string,
    @Param("sid") sid: string,
    @Param("judge") judgeKey: string,
    @Body() data: unknown,
    @Req() req: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.submit(id, sid, data, { operator: req.currentAdmin!, judgeKey }));
  }
  @Get(":id/results") @Header("Cache-Control", "private, no-store") async results(
    @Param("id") id: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.results(id, r.currentAdmin!));
  }
  @Post(":id/sessions/:sid/link") async link(
    @Param("id") id: string,
    @Param("sid") s: string,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(await this.service.link(id, s, r.currentAdmin!));
  }
  @Get(":id/export/:kind") @Header("Cache-Control", "private, no-store") async export(
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Query("edition") v: string,
    @Query("fields") fields: string | undefined,
    @Req() r: RequestWithCurrentAdmin
  ) {
    return ok(
      await this.service.export(
        id,
        kind,
        Number(v),
        r.currentAdmin!,
        typeof fields === "string" ? fields.split(",") : undefined
      )
    );
  }
}
@Controller("judging/:id/entry/:code")
export class JudgingEntryController {
  constructor(private readonly service: JudgingService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  async info(@Param("id") id: string, @Param("code") code: string) {
    return ok(await this.service.entryInfo(id, code));
  }
  @Post("identify")
  @Header("Cache-Control", "private, no-store")
  async identify(@Param("id") id: string, @Param("code") code: string, @Body() body: unknown) {
    return ok(await this.service.identify(id, code, body));
  }
  @Get("desk")
  @Header("Cache-Control", "private, no-store")
  async desk(
    @Param("id") id: string,
    @Param("code") code: string,
    @Headers("authorization") bearer: string | undefined,
    @Query("session") sid?: string
  ) {
    return ok(await this.service.guestDesk(id, code, guestBearer(bearer), sid));
  }
  @Post("sessions/:sid/submit")
  @Header("Cache-Control", "private, no-store")
  async submit(
    @Param("id") id: string,
    @Param("code") code: string,
    @Param("sid") sid: string,
    @Headers("authorization") bearer: string | undefined,
    @Body() body: unknown
  ) {
    return ok(await this.service.submit(id, sid, body, { entryCode: code, ticket: guestBearer(bearer) }));
  }
}
function guestBearer(value: string | undefined) {
  return value?.startsWith("Bearer ") ? value.slice(7) : "";
}

@Controller("judging")
export class JudgingMobileController {
  constructor(private readonly service: JudgingService) {}
  @Get(":id/published") @Header("Cache-Control", "no-store") async published(@Param("id") id: string) {
    return ok(await this.service.published(id));
  }
  @Get(":id/sessions/:sid")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "private, no-store")
  async page(@Param("id") id: string, @Param("sid") s: string, @Req() r: RequestWithCurrentUser) {
    return ok(await this.service.mobile(id, s, r.currentUser!));
  }
  @Post(":id/sessions/:sid/submit")
  @UseGuards(JwtAuthGuard)
  @Header("Cache-Control", "private, no-store")
  async submit(
    @Param("id") id: string,
    @Param("sid") s: string,
    @Body() b: unknown,
    @Req() r: RequestWithCurrentUser
  ) {
    return ok(await this.service.submit(id, s, b, r.currentUser!));
  }
}
