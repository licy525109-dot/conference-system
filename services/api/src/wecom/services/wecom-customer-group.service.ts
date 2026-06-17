import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../../admin/current-admin";
import { PrismaService } from "../../prisma.service";
import { WecomClientAdapter } from "../adapters/wecom-client.adapter";
import { ok, readObject, readNullableString } from "./wecom-config.service";
import { WecomConfigService } from "./wecom-config.service";
import { WecomTokenService } from "./wecom-token.service";

@Injectable()
export class WecomCustomerGroupService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: WecomConfigService,
    private readonly tokenService: WecomTokenService,
    private readonly client: WecomClientAdapter
  ) {}

  async list(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const keyword = typeof query.keyword === "string" ? query.keyword.trim() : "";
    const where: Prisma.WecomCustomerGroupWhereInput = keyword ? { name: { contains: keyword, mode: "insensitive" } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.wecomCustomerGroup.findMany({ where, orderBy: { updatedAt: "desc" }, skip, take: pageSize, include: { conference: { select: { title: true } } } }),
      this.prisma.wecomCustomerGroup.count({ where })
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), conferenceTitle: item.conference?.title ?? null })), total, page, pageSize });
  }

  async sync(admin: CurrentAdmin) {
    const integration = await this.config.ensureDefaultIntegration();
    if (!integration.enabled) return ok({ synced: 0, skippedReason: "请先启用企微客户群能力" });
    const token = await this.tokenService.getAccessToken(integration, "customer_contact", true);
    const groups = await this.client.listCustomerGroups(token.accessToken);
    let synced = 0;
    for (const group of groups) {
      const chatId = firstString(group, ["chat_id", "chatId"]);
      if (!chatId) continue;
      const owner = group.owner as Record<string, unknown> | undefined;
      await this.prisma.wecomCustomerGroup.upsert({
        where: { chatId },
        update: {
          name: firstString(group, ["name"]) || chatId,
          ownerUserId: firstString(group, ["owner", "owner_userid"]) || firstString(owner, ["userid"]),
          ownerName: firstString(owner, ["name"]),
          status: normalizeGroupStatus(group.status),
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          rawPayload: group as Prisma.InputJsonValue
        },
        create: {
          integrationId: integration.id,
          chatId,
          name: firstString(group, ["name"]) || chatId,
          ownerUserId: firstString(group, ["owner", "owner_userid"]) || firstString(owner, ["userid"]),
          ownerName: firstString(owner, ["name"]),
          status: normalizeGroupStatus(group.status),
          syncStatus: "SYNCED",
          lastSyncedAt: new Date(),
          rawPayload: group as Prisma.InputJsonValue
        }
      });
      synced += 1;
    }
    await this.prisma.wecomIntegration.update({ where: { id: integration.id }, data: { lastGroupSyncedAt: new Date() } });
    await this.writeAudit(admin, AuditAction.SYSTEM, "WecomCustomerGroup", null, "Sync WeCom customer groups", { synced });
    return ok({ synced });
  }

  async bindConference(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const conferenceId = readNullableString(body.conferenceId);
    if (conferenceId) {
      const conference = await this.prisma.conference.findUnique({ where: { id: conferenceId }, select: { id: true } });
      if (!conference) throw new BadRequestException("会议不存在");
    }
    const group = await this.prisma.wecomCustomerGroup.update({
      where: { id },
      data: {
        conferenceId,
        ...(typeof body.groupQrUrl !== "undefined" ? { groupQrUrl: readNullableString(body.groupQrUrl) } : {}),
        ...(typeof body.joinLink !== "undefined" ? { joinLink: readNullableString(body.joinLink) } : {})
      }
    }).catch(() => null);
    if (!group) throw new NotFoundException("客户群不存在");
    await this.writeAudit(admin, AuditAction.UPDATE, "WecomCustomerGroup", id, "Bind WeCom customer group to conference", { conferenceId });
    return ok(formatDateFields(group));
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadata?: unknown) {
    await this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson: (metadata ?? {}) as Prisma.InputJsonValue }
    });
  }
}

export function readPage(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20) || 20));
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function formatDateFields<T extends Record<string, unknown>>(item: T): T {
  return Object.fromEntries(Object.entries(item).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value])) as T;
}

function firstString(record: Record<string, unknown> | undefined, keys: string[]): string {
  if (!record) return "";
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function normalizeGroupStatus(status: unknown): string {
  if (status === 0 || status === "0" || status === "ACTIVE") return "ACTIVE";
  if (status === 1 || status === "1" || status === "DISMISSED") return "DISMISSED";
  return "UNKNOWN";
}
