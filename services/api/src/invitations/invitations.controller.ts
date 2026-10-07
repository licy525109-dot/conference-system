import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminMaterialsService } from "../admin/admin-materials.service";
import { invitationOrigin } from "./invitation-policy";
import { AdminJwtAuthGuard } from "../admin/admin-jwt-auth.guard";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { RequireAdminPermissions } from "../admin/require-permissions.decorator";
import type { RequestWithCurrentAdmin } from "../admin/current-admin";
import { InvitationsService } from "./invitations.service";
import { InvitationWechatService } from "./invitation-wechat.service";
import { InvitationAssetsService } from "./invitation-assets.service";
import type { UploadedMaterialFile } from "../admin/admin-materials.service";

@Controller("admin/invitations")
@UseGuards(AdminJwtAuthGuard, AdminPermissionGuard)
@RequireAdminPermissions("invitation:view")
export class AdminInvitationsController {
  constructor(
    private readonly service: InvitationsService,
    private readonly materials: AdminMaterialsService,
    private readonly assets: InvitationAssetsService,
  ) {}
  @Get("campaigns/:id/assets")
  @RequireAdminPermissions("invitation:view", "invitation:content")
  async listAssets(
    @Param("id") id: string,
    @Query() query: Record<string, string>,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    await this.service.campaign(id, req.currentAdmin!);
    return this.assets.list(id, query, req.currentAdmin!);
  }
  @Post("campaigns/:id/assets")
  @RequireAdminPermissions("invitation:view", "invitation:content")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  async uploadAsset(
    @Param("id") id: string,
    @UploadedFile() file: UploadedMaterialFile | undefined,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    await this.service.campaign(id, req.currentAdmin!);
    return this.assets.upload(id, file, req.currentAdmin!);
  }
  @Post("campaigns/:id/image")
  @RequireAdminPermissions("invitation:view", "invitation:content")
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 2 * 1024 * 1024 } }),
  )
  async image(
    @Param("id") id: string,
    @UploadedFile()
    file:
      | {
          buffer: Buffer;
          originalname?: string;
          mimetype?: string;
          size: number;
        }
      | undefined,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    await this.service.campaign(id, req.currentAdmin!);
    if (
      !file ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.mimetype || "")
    )
      throw new BadRequestException("请选择 JPG、PNG 或 WebP 图片");
    const bytes = file.buffer;
    const valid =
      file.mimetype === "image/png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : file.mimetype === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.subarray(0, 4).toString() === "RIFF" &&
            bytes.subarray(8, 12).toString() === "WEBP";
    if (!valid) throw new BadRequestException("图片内容与所选格式不一致");
    const result = await this.materials.createAsset(
      { usage: `conference_invitation:${id}` },
      file,
      invitationOrigin(),
      req.currentAdmin!,
    );
    return { ...result, data: { url: new URL(result.data.url).pathname } };
  }
  @Get("campaigns") list(@Req() req: RequestWithCurrentAdmin) {
    return this.service.listCampaigns(req.currentAdmin!);
  }
  @Get("options")
  @RequireAdminPermissions("invitation:view", "invitation:access")
  options() {
    return this.service.options();
  }
  @Get("registration-options")
  @RequireAdminPermissions("invitation:view", "invitation:content")
  async registrationOptions() {
    return this.service.registrationOptions();
  }
  @Post("campaigns")
  @RequireAdminPermissions(
    "invitation:view",
    "invitation:content",
    "invitation:access",
  )
  create(@Body() body: unknown, @Req() req: RequestWithCurrentAdmin) {
    return this.service.createCampaign(body, req.currentAdmin!);
  }
  @Get("campaigns/:id") campaign(
    @Param("id") id: string,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.campaign(id, req.currentAdmin!);
  }
  @Patch("campaigns/:id")
  @RequireAdminPermissions("invitation:view", "invitation:content")
  save(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.save(id, body, req.currentAdmin!);
  }
  @Post("campaigns/:id/publish")
  @RequireAdminPermissions("invitation:view", "invitation:publish")
  publish(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.publish(id, body, req.currentAdmin!);
  }
  @Get("campaigns/:id/members")
  @RequireAdminPermissions("invitation:view", "invitation:access")
  members(@Param("id") id: string, @Req() req: RequestWithCurrentAdmin) {
    return this.service.members(id, req.currentAdmin!);
  }
  @Patch("campaigns/:id/members")
  @RequireAdminPermissions("invitation:view", "invitation:access")
  setMembers(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.setMembers(id, body, req.currentAdmin!);
  }
  @Get("campaigns/:id/recipients") recipients(
    @Param("id") id: string,
    @Query() query: { keyword?: string; page?: string; pageSize?: string },
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.list(id, req.currentAdmin!, query);
  }
  @Post("campaigns/:id/recipients")
  @RequireAdminPermissions("invitation:view", "invitation:write")
  invite(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.create(id, body, req.currentAdmin!);
  }
  @Post("campaigns/:id/recipients/batch")
  @RequireAdminPermissions("invitation:view", "invitation:write")
  inviteBatch(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.createBatch(id, body, req.currentAdmin!);
  }
  @Patch("recipients/:id")
  @RequireAdminPermissions("invitation:view", "invitation:write")
  update(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: RequestWithCurrentAdmin,
  ) {
    return this.service.update(id, body, req.currentAdmin!);
  }
}

@Controller("invitations")
export class PublicInvitationsController {
  constructor(
    private readonly service: InvitationsService,
    private readonly wechat: InvitationWechatService,
  ) {}
  @Get(":token")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  get(@Param("token") token: string) {
    return this.service.publicInvitation(token);
  }
  @Get(":token/wechat")
  @Header("Cache-Control", "private, no-store")
  async config(@Param("token") token: string, @Query("url") url: string) {
    await this.service.publicInvitation(token);
    return {
      code: "OK",
      message: "ok",
      data: await this.wechat.config(token, url),
    };
  }
  @Get(":token/qrcode")
  @Header("Cache-Control", "private, no-store")
  async code(
    @Param("token") token: string,
    @Res() response: { type(type: string): { send(data: Buffer): void } },
  ) {
    const invitation = await this.service.publicInvitation(token);
    if (
      invitation.data.registrationMode !== "miniapp" ||
      !invitation.data.registrationOpen ||
      !invitation.data.registrationPath
    )
      throw new BadRequestException("当前邀请函未开放小程序报名");
    const bytes = await this.wechat.registrationCode(
      invitation.data.registrationPath,
    );
    response.type(bytes[0] === 137 ? "image/png" : "image/jpeg").send(bytes);
  }
}
