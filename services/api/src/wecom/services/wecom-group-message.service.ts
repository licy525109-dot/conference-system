import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AuditAction, CustomerGroupMessageStatus, Prisma } from "@prisma/client";
import { CurrentAdmin } from "../../admin/current-admin";
import { PrismaService } from "../../prisma.service";
import { formatDateFields, readPage } from "./wecom-customer-group.service";
import { jsonObject, requiredString } from "./wecom-welcome-template.service";
import { ok, readObject } from "./wecom-config.service";

@Injectable()
export class WecomGroupMessageService {
  constructor(private readonly prisma: PrismaService) {}

  async listTasks(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroupMessageTask.findMany({ orderBy: { updatedAt: "desc" }, skip, take: pageSize, include: { logs: true, conference: { select: { title: true } } } }),
      this.prisma.customerGroupMessageTask.count()
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), conferenceTitle: item.conference?.title ?? null, logCount: item.logs.length })), total, page, pageSize });
  }

  async createTask(input: unknown, admin: CurrentAdmin) {
    const body = readObject(input);
    const item = await this.prisma.customerGroupMessageTask.create({
      data: {
        name: requiredString(body.name, "任务名称"),
        conferenceId: nullableString(body.conferenceId),
        contentJson: jsonObject(body.contentJson),
        targetGroupIds: Array.isArray(body.targetGroupIds) ? (body.targetGroupIds as Prisma.InputJsonArray) : Prisma.JsonNull,
        status: CustomerGroupMessageStatus.DRAFT,
        needConfirm: true,
        createdById: admin.id
      }
    });
    await this.writeAudit(admin, AuditAction.CREATE, "CustomerGroupMessageTask", item.id, "Create WeCom group message task");
    return ok(formatDateFields(item));
  }

  async createWecomTask(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id } });
    if (!task) throw new NotFoundException("群发任务不存在");
    const targetGroupIds = Array.isArray(task.targetGroupIds) ? task.targetGroupIds.map(String) : [];
    const groups = await this.prisma.wecomCustomerGroup.findMany({
      where: targetGroupIds.length ? { id: { in: targetGroupIds } } : { enabled: true },
      take: 100
    });
    if (groups.length === 0) throw new BadRequestException("请先选择或同步客户群");
    const updated = await this.prisma.customerGroupMessageTask.update({
      where: { id },
      data: {
        status: CustomerGroupMessageStatus.WAITING_CONFIRM,
        wecomTaskId: `pending_member_confirm_${id}`,
        logs: {
          create: groups.map((group) => ({
            ownerUserId: group.ownerUserId,
            status: "WAITING_MEMBER_CONFIRM",
            resultJson: { chatId: group.chatId, groupName: group.name, rule: "企业微信群发任务需群主或成员在企业微信中确认后发送" }
          }))
        }
      }
    });
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Create official WeCom group message task placeholder", { groupCount: groups.length });
    return ok({
      task: formatDateFields(updated),
      result: { created: true, status: "WAITING_CONFIRM", message: "已创建群发任务记录，请群主或成员在企业微信中确认后发送。", groupCount: groups.length }
    });
  }

  async refreshResult(id: string, admin: CurrentAdmin) {
    const task = await this.prisma.customerGroupMessageTask.findUnique({ where: { id }, include: { logs: true } });
    if (!task) throw new NotFoundException("群发任务不存在");
    await this.writeAudit(admin, AuditAction.SYSTEM, "CustomerGroupMessageTask", id, "Refresh WeCom group message result");
    return ok({ task: formatDateFields(task), logs: task.logs.map(formatDateFields), message: "第一版保留结果刷新入口，需接入企业微信 msgid 后查询成员确认和发送结果。" });
  }

  async logs(query: Record<string, unknown>) {
    const { page, pageSize, skip } = readPage(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.customerGroupMessageLog.findMany({ orderBy: { createdAt: "desc" }, skip, take: pageSize, include: { task: { select: { name: true, status: true } } } }),
      this.prisma.customerGroupMessageLog.count()
    ]);
    return ok({ items: items.map((item) => ({ ...formatDateFields(item), taskName: item.task.name, taskStatus: item.task.status })), total, page, pageSize });
  }

  private async writeAudit(admin: CurrentAdmin, action: AuditAction, entityType: string, entityId: string | null, summary: string, metadata?: unknown) {
    await this.prisma.auditLog.create({
      data: { adminUserId: admin.id, action, entityType, entityId, summary, metadataJson: (metadata ?? {}) as Prisma.InputJsonValue }
    });
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
