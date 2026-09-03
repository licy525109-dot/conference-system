import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  GuestScheduleSource,
  GuestScheduleType,
  RegistrationStatus
} from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { GuestScheduleService, hashDraft } from "./guest-schedule.service";

const admin: CurrentAdmin = {
  id: "admin-1",
  username: "admin",
  displayName: "管理员",
  permissions: ["guest-schedule:view", "guest-schedule:write", "guest-schedule:publish"]
};

const currentUser: CurrentUser = {
  id: "user-1",
  openid: "openid-1",
  nickname: "测试嘉宾"
};

describe("GuestScheduleService", () => {
  it("publishes an immutable snapshot and creates an in-app notification without external delivery", async () => {
    const prisma = createPrismaMock();
    const notifications = createNotificationsMock();
    const service = new GuestScheduleService(prisma, notifications as never);

    const response = await service.publish({ ids: ["schedule-1"], notify: false }, admin);

    assert.equal(response.data.publishedCount, 1);
    assert.equal(response.data.notification.status, "NOT_REQUESTED");
    assert.equal(prisma.assignment.hasUnpublishedChanges, false);
    assert.equal(prisma.assignment.publishedHash, prisma.assignment.draftHash);
    assert.equal(
      (prisma.assignment.publishedSnapshotJson as Record<string, unknown>).name,
      "人工智能工作坊"
    );
    assert.equal(notifications.createTaskCalls, 0);
    assert.equal(prisma.userNotifications.length, 1);
    assert.equal(prisma.userNotifications[0]?.userId, "user-1");
    assert.equal(prisma.userNotifications[0]?.type, "GUEST_SCHEDULE_PUBLISHED");
    assert.equal(prisma.userNotifications[0]?.route, "/pages/registrations/schedule?conferenceId=conference-1");
    assert.equal(prisma.auditLogs.length, 1);
  });

  it("serves the last published snapshot after the draft changes", async () => {
    const prisma = createPrismaMock();
    const service = new GuestScheduleService(prisma, createNotificationsMock() as never);
    await service.publish({ ids: ["schedule-1"], notify: false }, admin);

    prisma.assignment.name = "尚未发布的新工作坊名称";
    prisma.assignment.location = "尚未发布的新地点";
    prisma.assignment.hasUnpublishedChanges = true;
    prisma.assignment.updatedAt = new Date("2026-09-02T11:00:00.000Z");

    const response = await service.listMine(currentUser, {});

    assert.equal(response.data.total, 1);
    assert.equal(response.data.items[0]?.name, "人工智能工作坊");
    assert.equal(response.data.items[0]?.location, "三楼 A 厅");
    assert.equal(response.data.items[0]?.updatedAt, prisma.assignment.publishedAt?.toISOString());
    assert.notEqual(response.data.items[0]?.name, prisma.assignment.name);
  });

  it("does not expose draft-only assignments to the mini program", async () => {
    const prisma = createPrismaMock();
    prisma.assignment.publishedSnapshotJson = null;
    const service = new GuestScheduleService(prisma, createNotificationsMock() as never);

    const response = await service.listMine(currentUser, {});

    assert.equal(response.data.total, 0);
    assert.deepEqual(response.data.items, []);
  });

  it("requires SmartSheet-sourced assignments to be edited in SmartSheet", async () => {
    const prisma = createPrismaMock();
    const service = new GuestScheduleService(prisma, createNotificationsMock() as never);

    await assert.rejects(
      () => service.update("schedule-1", {}, admin),
      /企微智能表同步的事项请在智能表中修改/
    );
  });

  it("does not advertise subscription messages until the active template can really send", async () => {
    const prisma = createPrismaMock();
    const notifications = {
      ...createNotificationsMock(),
      async getChannelRuntime() {
        return {
          canSend: false,
          templateKey: "wechat-template-1",
          unavailableReason: "微信订阅消息通道尚未启用"
        };
      }
    };
    const service = new GuestScheduleService(prisma, notifications as never);

    const response = await service.getSubscriptionConfig();

    assert.equal(response.data.enabled, false);
    assert.equal(response.data.templateId, "wechat-template-1");
    assert.equal(response.data.message, "微信订阅消息通道尚未启用");
  });

  it("creates isolated external notification tasks for each user and conference", async () => {
    const prisma = createPrismaMock();
    const secondAssignment = {
      ...prisma.assignment,
      id: "schedule-2",
      conferenceId: "conference-2",
      attendeeId: "attendee-2",
      name: "嘉宾晚宴",
      draftHash: hashDraft({
        type: prisma.assignment.type,
        name: "嘉宾晚宴",
        startsAt: prisma.assignment.startsAt,
        endsAt: prisma.assignment.endsAt,
        location: prisma.assignment.location,
        role: prisma.assignment.role,
        tableNo: prisma.assignment.tableNo,
        isTableLeader: prisma.assignment.isTableLeader,
        shareTopic: prisma.assignment.shareTopic,
        notes: prisma.assignment.notes
      }),
      conference: {
        ...prisma.assignment.conference,
        id: "conference-2",
        title: "另一场会议"
      },
      attendee: {
        ...prisma.assignment.attendee,
        id: "attendee-2",
        name: "李嘉宾",
        registration: {
          ...prisma.assignment.attendee.registration,
          id: "registration-2",
          registrationNo: "REG-002",
          userId: "user-2"
        }
      }
    };
    prisma.assignments.push(secondAssignment);
    const notifications = createNotificationsMock();
    const service = new GuestScheduleService(prisma, notifications as never);

    const response = await service.publish({ ids: ["schedule-1", "schedule-2"], notify: true }, admin);

    assert.equal(response.data.notification.status, "SENT");
    assert.equal(notifications.createTaskCalls, 2);
    assert.equal(notifications.createTaskInputs.length, 2);
    const tasksByUser = new Map(notifications.createTaskInputs.map((input) => [input.userIds[0], input]));
    const firstTask = tasksByUser.get("user-1");
    const secondTask = tasksByUser.get("user-2");
    assert.deepEqual(firstTask?.userIds, ["user-1"]);
    assert.equal(firstTask?.payloadJson.variables["会议名称"], "观潮会集");
    assert.equal(firstTask?.payloadJson.variables["安排名称"], "人工智能工作坊");
    assert.doesNotMatch(firstTask?.payloadJson.variables["安排名称"] ?? "", /嘉宾晚宴/);
    assert.deepEqual(secondTask?.userIds, ["user-2"]);
    assert.equal(secondTask?.payloadJson.variables["会议名称"], "另一场会议");
    assert.equal(secondTask?.payloadJson.variables["安排名称"], "嘉宾晚宴");
    assert.doesNotMatch(secondTask?.payloadJson.variables["安排名称"] ?? "", /人工智能工作坊/);
  });
});

function createPrismaMock() {
  const draft = {
    type: GuestScheduleType.WORKSHOP,
    name: "人工智能工作坊",
    startsAt: new Date("2026-10-20T06:00:00.000Z"),
    endsAt: new Date("2026-10-20T08:00:00.000Z"),
    location: "三楼 A 厅",
    role: "参与嘉宾",
    tableNo: null,
    isTableLeader: false,
    shareTopic: null,
    notes: "请提前十五分钟到场"
  };
  const assignment = {
    id: "schedule-1",
    conferenceId: "conference-1",
    attendeeId: "attendee-1",
    connectionId: "connection-1",
    ...draft,
    draftHash: hashDraft(draft),
    source: GuestScheduleSource.WECOM_SMART_SHEET,
    hasUnpublishedChanges: true,
    publishedSnapshotJson: null as Record<string, unknown> | null,
    publishedHash: null as string | null,
    publishedAt: null as Date | null,
    publishedById: null as string | null,
    lastNotifiedAt: null as Date | null,
    remoteRecordId: "record-1",
    remoteUpdatedAt: new Date("2026-09-02T09:00:00.000Z"),
    archivedAt: null as Date | null,
    createdAt: new Date("2026-09-02T09:00:00.000Z"),
    updatedAt: new Date("2026-09-02T09:00:00.000Z"),
    conference: {
      id: "conference-1",
      title: "观潮会集",
      coverImageUrl: null,
      location: "广东江门",
      startsAt: new Date("2026-10-20T01:00:00.000Z"),
      endsAt: new Date("2026-10-22T10:00:00.000Z")
    },
    attendee: {
      id: "attendee-1",
      name: "张嘉宾",
      phone: "13800000000",
      company: "观潮科技",
      title: "负责人",
      sku: { id: "sku-1", name: "嘉宾票" },
      registration: {
        id: "registration-1",
        registrationNo: "REG-001",
        userId: "user-1",
        status: RegistrationStatus.CONFIRMED
      }
    },
    connection: null,
    publishedBy: null
  };
  const auditLogs: Array<Record<string, unknown>> = [];
  const userNotifications: Array<Record<string, unknown>> = [];
  const assignments = [assignment];
  const mock = {
    assignment,
    assignments,
    auditLogs,
    userNotifications,
    guestScheduleAssignment: {
      findUnique: async () => assignment,
      findMany: async (args: Record<string, unknown>) => {
        const where = args.where as Record<string, unknown> | undefined;
        const requestedIds = ((where?.id as { in?: string[] } | undefined)?.in) ?? null;
        return assignments.filter((item) => {
          if (requestedIds && !requestedIds.includes(item.id)) return false;
          if (where?.publishedSnapshotJson && !item.publishedSnapshotJson) return false;
          return true;
        });
      },
      update: async (args: { where?: { id?: string }; data: Record<string, unknown> }) => {
        const item = assignments.find((candidate) => candidate.id === args.where?.id) ?? assignment;
        Object.assign(item, args.data, { updatedAt: new Date("2026-09-02T10:00:00.000Z") });
        return item;
      },
      updateMany: async () => ({ count: 1 })
    },
    auditLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        auditLogs.push(args.data);
        return args.data;
      }
    },
    userNotification: {
      create: async (args: { data: Record<string, unknown> }) => {
        userNotifications.push(args.data);
        return args.data;
      }
    },
    notificationTemplate: {
      findUnique: async () => ({
        id: "template-1",
        code: "GUEST_SCHEDULE_UPDATED",
        templateKey: "wechat-template-1",
        status: "ACTIVE",
        contentJson: {
          wechatData: {
            thing1: { value: "{{会议名称}}" },
            thing2: { value: "{{安排名称}}" },
            time3: { value: "{{更新时间}}" }
          }
        }
      })
    },
    $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations)
  };
  return mock as typeof mock & PrismaService;
}

function createNotificationsMock() {
  return {
    createTaskCalls: 0,
    createTaskInputs: [] as Array<{
      userIds: string[];
      payloadJson: { userIds: string[]; variables: Record<string, string> };
    }>,
    async createTask(input: {
      userIds: string[];
      payloadJson: { userIds: string[]; variables: Record<string, string> };
    }) {
      this.createTaskCalls += 1;
      this.createTaskInputs.push(input);
      return { data: { id: `task-${this.createTaskCalls}` } };
    },
    async sendNow() {
      return { data: { result: { total: 1, successCount: 1, failedCount: 0, skippedCount: 0 } } };
    }
  };
}
