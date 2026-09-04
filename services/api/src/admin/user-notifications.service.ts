import { Injectable, NotFoundException } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

@Injectable()
export class UserNotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(currentUser: CurrentUser, query: Record<string, unknown>) {
    const page = readPositiveInt(query.page, 1);
    const pageSize = Math.min(readPositiveInt(query.pageSize, 20), 50);
    const unreadOnly = query.unreadOnly === "true" || query.unreadOnly === true;
    const where = {
      userId: currentUser.id,
      dismissedAt: null,
      ...(unreadOnly ? { readAt: null } : {})
    };
    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.userNotification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      }),
      this.prisma.userNotification.count({ where }),
      this.prisma.userNotification.count({ where: { userId: currentUser.id, readAt: null, dismissedAt: null } })
    ]);

    return ok({
      items: items.map((item) => ({
        ...item,
        readAt: item.readAt?.toISOString() ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      })),
      total,
      unreadCount,
      page,
      pageSize
    });
  }

  async unreadCount(currentUser: CurrentUser) {
    const count = await this.prisma.userNotification.count({
      where: { userId: currentUser.id, readAt: null, dismissedAt: null }
    });
    return ok({ count });
  }

  async markRead(id: string, currentUser: CurrentUser) {
    const notification = await this.prisma.userNotification.findFirst({
      where: { id, userId: currentUser.id, dismissedAt: null },
      select: { id: true, readAt: true }
    });
    if (!notification) throw new NotFoundException("消息不存在");
    const readAt = notification.readAt ?? new Date();
    await this.prisma.userNotification.update({ where: { id }, data: { readAt } });
    return ok({ id, readAt: readAt.toISOString() });
  }

  async markAllRead(currentUser: CurrentUser) {
    const readAt = new Date();
    const result = await this.prisma.userNotification.updateMany({
      where: { userId: currentUser.id, readAt: null, dismissedAt: null },
      data: { readAt }
    });
    return ok({ count: result.count, readAt: readAt.toISOString() });
  }

  async dismiss(id: string, currentUser: CurrentUser) {
    const notification = await this.prisma.userNotification.findFirst({
      where: { id, userId: currentUser.id },
      select: { id: true, dismissedAt: true }
    });
    if (!notification) throw new NotFoundException("消息不存在");
    const dismissedAt = notification.dismissedAt ?? new Date();
    if (!notification.dismissedAt) {
      await this.prisma.userNotification.update({ where: { id }, data: { dismissedAt } });
    }
    return ok({ id, dismissedAt: dismissedAt.toISOString() });
  }
}

function readPositiveInt(value: unknown, fallback: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok", data };
}
