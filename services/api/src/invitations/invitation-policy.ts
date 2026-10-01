import {
  BadRequestException,
  ForbiddenException,
  GoneException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CurrentAdmin } from "../admin/current-admin";

export function hasInvitationPermission(
  admin: CurrentAdmin,
  code: string,
): boolean {
  return Boolean(
    admin.permissions?.includes("*") || admin.permissions?.includes(code),
  );
}
export function invitationCampaignScope(
  admin: CurrentAdmin,
): Prisma.InvitationCampaignWhereInput {
  return hasInvitationPermission(admin, "invitation:access")
    ? {}
    : { members: { some: { adminId: admin.id } } };
}
export function assertInvitationOwner(
  admin: CurrentAdmin,
  createdBy: string,
): void {
  if (
    createdBy !== admin.id &&
    !hasInvitationPermission(admin, "invitation:all")
  )
    throw new ForbiddenException("无权操作其他工作人员的邀请函");
}
export function invitationOrigin(): string {
  const url = new URL(
    process.env.INVITATION_PUBLIC_ORIGIN || "https://guanchaohuiji.com",
  );
  const local =
    process.env.NODE_ENV !== "production" &&
    ["localhost", "127.0.0.1"].includes(url.hostname);
  const brand =
    url.protocol === "https:" &&
    (url.hostname === "guanchaohuiji.com" ||
      url.hostname.endsWith(".guanchaohuiji.com"));
  if (
    (!local && !brand) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!local && url.port)
  )
    throw new Error(
      "INVITATION_PUBLIC_ORIGIN must be a guanchaohuiji.com HTTPS origin",
    );
  return url.origin;
}
export function invitationUrl(token: string): string {
  return `${invitationOrigin()}/i/${token}`;
}
export function readInvitationToken(input: unknown): string | undefined {
  if (input === undefined || input === null || input === "") return undefined;
  if (typeof input !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input))
    throw new BadRequestException("邀请标识无效");
  return input;
}
export async function resolveOrderInvitation(
  tx: Prisma.TransactionClient,
  token: string | undefined,
  conferenceId: string,
): Promise<string | undefined> {
  if (!token) return undefined;
  const invitation = await tx.conferenceInvitation.findUnique({
    where: { token },
    select: {
      id: true,
      enabled: true,
      campaign: { select: { conferenceId: true, publishedRevision: true } },
    },
  });
  if (!invitation?.enabled || !invitation.campaign.publishedRevision)
    throw new GoneException("邀请函已停用或尚未发布，请联系会务");
  if (invitation.campaign.conferenceId !== conferenceId)
    throw new BadRequestException("邀请函与报名会议不匹配");
  return invitation.id;
}
