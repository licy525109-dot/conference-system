import {
  Controller,
  Get,
  Header,
  HttpException,
  Param,
  Res,
} from "@nestjs/common";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { InvitationsService } from "./invitations.service";
import { invitationShare } from "@conference/shared";

export function invitationProjectRoot(): string {
  return process.cwd().endsWith("/services/api")
    ? resolve(process.cwd(), "../..")
    : process.cwd();
}
export function escapeInvitationHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function invitationShareMetadata(
  share: ReturnType<typeof invitationShare>,
): string {
  const pageUrl = new URL(share.url);
  const parsedImage = share.imageUrl
    ? new URL(share.imageUrl, pageUrl)
    : undefined;
  const validImage =
    parsedImage &&
    ["http:", "https:"].includes(parsedImage.protocol) &&
    !parsedImage.username &&
    !parsedImage.password
      ? parsedImage.href
      : "";
  const title = escapeInvitationHtml(share.title);
  const description = escapeInvitationHtml(share.description);
  const image = validImage ? escapeInvitationHtml(validImage) : "";
  const secureImage = parsedImage?.protocol === "https:" ? image : "";
  const url = escapeInvitationHtml(pageUrl.href);
  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="观潮会集">',
    '<meta property="og:locale" content="zh_CN">',
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    ...(image
      ? [
          `<meta property="og:image" content="${image}">`,
          `<meta property="og:image:alt" content="${title}">`,
          ...(secureImage
            ? [`<meta property="og:image:secure_url" content="${secureImage}">`]
            : []),
        ]
      : []),
    `<meta property="og:url" content="${url}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${title}">`,
    `<meta name="twitter:description" content="${description}">`,
    ...(image ? [`<meta name="twitter:image" content="${image}">`] : []),
    '<meta name="robots" content="noindex,nofollow">',
  ].join("");
}
@Controller("i")
export class InvitationPageController {
  constructor(private readonly service: InvitationsService) {}
  @Get(":token")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Robots-Tag", "noindex, nofollow")
  async page(
    @Param("token") token: string,
    @Res()
    response: {
      status(code: number): void;
      type(type: string): { send(html: string): void };
    },
  ) {
    let meta = "";
    try {
      const { data } = await this.service.publicInvitation(token);
      const share = invitationShare(data);
      meta = invitationShareMetadata(share);
    } catch (error) {
      const unavailable =
        error instanceof HttpException &&
        [400, 404, 410].includes(error.getStatus());
      response.status(unavailable ? 410 : 503);
      response
        .type("html")
        .send(
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邀请函暂不可用</title><body style="font-family:system-ui;padding:64px 24px;color:#283c35;background:#f5f7f3"><h1>邀请函暂不可用</h1><p>请联系邀请您的工作人员。</p></body></html>',
        );
      return;
    }
    try {
      const html = await readFile(
        resolve(invitationProjectRoot(), "apps/admin/dist/invitation.html"),
        "utf8",
      );
      response
        .type("html")
        .send(
          html
            .replace(/<title>[^<]*<\/title>/, meta)
            .replaceAll('"/assets/', '"/invitation-assets/'),
        );
    } catch {
      response.status(503);
      response
        .type("html")
        .send(
          '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>邀请函正在更新</title><p>邀请函正在更新，请稍后重试。</p></html>',
        );
    }
  }
}
