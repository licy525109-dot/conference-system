import { Body, Controller, Get, Header, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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
  constructor(private readonly service: JudgingService) {}
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
