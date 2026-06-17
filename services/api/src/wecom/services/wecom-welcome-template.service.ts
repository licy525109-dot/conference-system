import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../../admin/current-admin";
import { PrismaService } from "../../prisma.service";
import { formatDateFields } from "./wecom-customer-group.service";
import { ok, readObject } from "./wecom-config.service";

@Injectable()
export class WecomWelcomeTemplateService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const items = await this.prisma.groupWelcomeTemplate.findMany({ orderBy: { updatedAt: "desc" } });
    return ok({ items: items.map(formatDateFields), syncNotice: "当前仅支持在会务系统维护欢迎语素材，请复制内容到企业微信后台配置。" });
  }

  async create(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.groupWelcomeTemplate.create({
      data: {
        name: requiredString(body.name, "模板名称"),
        contentJson: jsonObject(body.contentJson),
        enabled: typeof body.enabled === "boolean" ? body.enabled : true
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "GroupWelcomeTemplate", item.id, "Create WeCom welcome template");
    return ok(formatDateFields(item));
  }

  async update(id: string, input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.groupWelcomeTemplate.update({
      where: { id },
      data: {
        ...(typeof body.name !== "undefined" ? { name: requiredString(body.name, "模板名称") } : {}),
        ...(typeof body.contentJson !== "undefined" ? { contentJson: jsonObject(body.contentJson) } : {}),
        ...(typeof body.enabled !== "undefined" ? { enabled: Boolean(body.enabled) } : {})
      }
    }).catch(() => null);
    if (!item) throw new NotFoundException("欢迎语模板不存在");
    await this.writeAudit(admin, AuditAction.UPDATE, "GroupWelcomeTemplate", id, "Update WeCom welcome template");
    return ok(formatDateFields(item));
  }

  async delete(id: string, admin: CurrentAdmin) {
    const item = await this.prisma.groupWelcomeTemplate.delete({ where: { id } }).catch(() => null);
    if (!item) throw new NotFoundException("欢迎语模板不存在");
    await this.writeAudit(admin, AuditAction.DELETE, "GroupWelcomeTemplate", id, "Delete WeCom welcome template");
    return ok(formatDateFields(item));
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string) {
    await this.prisma.auditLog.create({ data: { adminUserId: admin.id, action, entityType, entityId, summary } });
  }
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${label}不能为空`);
  return value.trim();
}

export function jsonObject(value: unknown): Prisma.InputJsonObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Prisma.InputJsonObject;
  return {};
}
