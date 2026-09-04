import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { UserNotificationsService } from "./user-notifications.service";

const currentUser: CurrentUser = {
  id: "user-1",
  openid: "openid-1",
  nickname: "测试用户"
};

describe("UserNotificationsService", () => {
  it("lists only the current user's notifications and returns the unread count", async () => {
    const service = new UserNotificationsService(createPrismaMock());

    const response = await service.list(currentUser, {});

    assert.deepEqual(response.data.items.map((item) => item.id), ["notice-new", "notice-read"]);
    assert.equal(response.data.total, 2);
    assert.equal(response.data.unreadCount, 1);
    assert.equal(response.data.items[0]?.readAt, null);
  });

  it("does not allow a user to mark another user's notification as read", async () => {
    const service = new UserNotificationsService(createPrismaMock());

    await assert.rejects(() => service.markRead("notice-other", currentUser), NotFoundException);
  });

  it("dismisses a notification only for its owner and excludes it from counts", async () => {
    const prisma = createPrismaMock();
    const service = new UserNotificationsService(prisma);

    const response = await service.dismiss("notice-new", currentUser);
    const dismissedAt = prisma.items.find((item) => item.id === "notice-new")?.dismissedAt;
    const list = await service.list(currentUser, {});

    assert.equal(response.data.id, "notice-new");
    assert.ok(dismissedAt instanceof Date);
    assert.equal(response.data.dismissedAt, dismissedAt?.toISOString());
    assert.deepEqual(list.data.items.map((item) => item.id), ["notice-read"]);
    assert.equal(list.data.total, 1);
    assert.equal(list.data.unreadCount, 0);
  });

  it("does not allow a user to dismiss another user's notification", async () => {
    const service = new UserNotificationsService(createPrismaMock());

    await assert.rejects(() => service.dismiss("notice-other", currentUser), NotFoundException);
  });

  it("marks all unread notifications for only the current user", async () => {
    const prisma = createPrismaMock();
    const service = new UserNotificationsService(prisma);

    const response = await service.markAllRead(currentUser);

    assert.equal(response.data.count, 1);
    assert.ok(prisma.items.find((item) => item.id === "notice-new")?.readAt instanceof Date);
    assert.equal(prisma.items.find((item) => item.id === "notice-other")?.readAt, null);
  });
});

function createPrismaMock() {
  const items = [
    notification("notice-read", "user-1", new Date("2026-09-03T08:00:00.000Z"), new Date("2026-09-03T09:00:00.000Z")),
    notification("notice-new", "user-1", null, new Date("2026-09-03T10:00:00.000Z")),
    notification("notice-other", "user-2", null, new Date("2026-09-03T11:00:00.000Z"))
  ];
  const matches = (item: typeof items[number], where: { userId?: string; id?: string; readAt?: null; dismissedAt?: null }) =>
    (!where.userId || item.userId === where.userId)
      && (!where.id || item.id === where.id)
      && (!("readAt" in where) || item.readAt === where.readAt)
      && (!("dismissedAt" in where) || item.dismissedAt === where.dismissedAt);
  const mock = {
    items,
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
    userNotification: {
      findMany: async (args: { where: { userId: string; readAt?: null; dismissedAt?: null }; skip: number; take: number }) => items
        .filter((item) => matches(item, args.where))
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(args.skip, args.skip + args.take),
      count: async (args: { where: { userId: string; readAt?: null; dismissedAt?: null } }) => items.filter((item) => matches(item, args.where)).length,
      findFirst: async (args: { where: { id: string; userId: string; dismissedAt?: null } }) => items.find((item) => matches(item, args.where)) ?? null,
      update: async (args: { where: { id: string }; data: { readAt?: Date; dismissedAt?: Date } }) => {
        const item = items.find((candidate) => candidate.id === args.where.id);
        if (!item) throw new Error("missing notification");
        if (args.data.readAt) item.readAt = args.data.readAt;
        if (args.data.dismissedAt) item.dismissedAt = args.data.dismissedAt;
        item.updatedAt = args.data.readAt ?? args.data.dismissedAt ?? item.updatedAt;
        return item;
      },
      updateMany: async (args: { where: { userId: string; readAt: null; dismissedAt?: null }; data: { readAt: Date } }) => {
        const matched = items.filter((item) => matches(item, args.where));
        matched.forEach((item) => {
          item.readAt = args.data.readAt;
          item.updatedAt = args.data.readAt;
        });
        return { count: matched.length };
      }
    }
  };
  return mock as typeof mock & PrismaService;
}

function notification(id: string, userId: string, readAt: Date | null, createdAt: Date) {
  return {
    id,
    userId,
    type: "GUEST_SCHEDULE_PUBLISHED",
    title: "会务安排已更新",
    summary: "人工智能工作坊",
    route: "/pages/registrations/schedule?conferenceId=conference-1",
    payloadJson: { conferenceId: "conference-1" },
    sourceKey: `source-${id}`,
    readAt,
    dismissedAt: null as Date | null,
    createdAt,
    updatedAt: createdAt
  };
}
