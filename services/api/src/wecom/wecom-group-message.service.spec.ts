import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CustomerGroupMessageStatus } from "@prisma/client";
import { CurrentAdmin } from "../admin/current-admin";
import { PrismaService } from "../prisma.service";
import { WecomGroupMessageService } from "./services/wecom-group-message.service";

const admin: CurrentAdmin = { id: "admin-1", username: "admin", displayName: "管理员", permissions: ["*"] };

describe("WecomGroupMessageService targeted sending", () => {
  it("creates an official task only for selected groups", async () => {
    const { service, clientCalls, tasks, logs } = createService();

    const created = await service.createTask({ name: "指定群", targetScope: "SELECTED_GROUPS", targetGroupIds: ["group-1"], contentJson: { text: { content: "提醒" } } }, admin);
    const result = await service.createWecomTask(String(created.data.id), admin);

    assert.equal(result.data.result.status, "WAITING_CONFIRM");
    assert.deepEqual(clientCalls[0]?.groups.map((item) => item.chatId), ["chat-1"]);
    assert.equal(tasks[0]?.status, CustomerGroupMessageStatus.WAITING_CONFIRM);
    assert.equal(logs[0]?.wecomGroupId, "group-1");
  });

  it("marks tasks skipped when WeCom integration is disabled", async () => {
    const { service, tasks, logs } = createService({ enabled: false });

    const created = await service.createTask({ name: "未启用", targetScope: "SELECTED_GROUPS", targetGroupIds: ["group-1"], contentJson: { text: { content: "提醒" } } }, admin);
    const result = await service.createWecomTask(String(created.data.id), admin);

    assert.equal(result.data.result.status, "SKIPPED");
    assert.equal(tasks[0]?.status, CustomerGroupMessageStatus.SKIPPED);
    assert.equal(tasks[0]?.errorCode, "WECOM_DISABLED");
    assert.equal(logs[0]?.status, "SKIPPED");
  });

  it("marks tasks failed and records the provider error", async () => {
    const { service, tasks, logs } = createService({ apiResult: { ok: false, errcode: 48002, errmsg: "api forbidden", raw: { errcode: 48002, errmsg: "api forbidden" } } });

    const created = await service.createTask({ name: "失败", targetScope: "SELECTED_GROUPS", targetGroupIds: ["group-1"], contentJson: { text: { content: "提醒" } } }, admin);
    const result = await service.createWecomTask(String(created.data.id), admin);

    assert.equal(result.data.result.status, "FAILED");
    assert.equal(tasks[0]?.status, CustomerGroupMessageStatus.FAILED);
    assert.equal(tasks[0]?.errorCode, "48002");
    assert.equal(logs[0]?.errorReason, "api forbidden");
  });
});

function createService(options: { enabled?: boolean; apiResult?: { ok: boolean; errcode?: number; errmsg?: string; msgId?: string; raw: Record<string, unknown> } } = {}) {
  const now = new Date("2026-06-19T00:00:00.000Z");
  const tasks: any[] = [];
  const logs: any[] = [];
  const auditLogs: any[] = [];
  const groups = [
    { id: "group-1", chatId: "chat-1", name: "客户群一", ownerUserId: "owner-1", ownerName: "群主一", enabled: true, status: "ACTIVE" },
    { id: "group-2", chatId: "chat-2", name: "客户群二", ownerUserId: "owner-2", ownerName: "群主二", enabled: true, status: "ACTIVE" }
  ];
  const prisma: any = {
    customerGroupMessageTask: {
      create: async ({ data }: { data: any }) => {
        const task = { id: `task-${tasks.length + 1}`, createdAt: now, updatedAt: now, sentAt: null, wecomTaskId: null, wecomMsgId: null, externalResultJson: null, errorCode: null, errorMessage: null, providerSource: null, ...data };
        tasks.push(task);
        return task;
      },
      findUnique: async ({ where }: { where: { id: string } }) => tasks.find((item) => item.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: any }) => {
        const task = tasks.find((item) => item.id === where.id);
        if (!task) throw new Error("missing task");
        const nestedLogs = data.logs?.create ?? [];
        delete data.logs;
        Object.assign(task, data, { updatedAt: now });
        for (const log of nestedLogs) logs.push({ id: `log-${logs.length + 1}`, taskId: task.id, createdAt: now, updatedAt: now, ...log });
        return task;
      }
    },
    wecomCustomerGroup: {
      findMany: async ({ where }: { where?: any }) => {
        if (where?.id?.in) return groups.filter((item) => where.id.in.includes(item.id));
        return groups;
      }
    },
    auditLog: {
      create: async ({ data }: { data: any }) => {
        auditLogs.push(data);
        return data;
      }
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops)
  };
  const config = { ensureDefaultIntegration: async () => ({ id: "integration-1", enabled: options.enabled ?? true }) };
  const token = { getConfiguredAccessToken: async () => ({ accessToken: "token" }) };
  const clientCalls: Array<{ groups: Array<{ chatId: string }> }> = [];
  const client = {
    createCustomerGroupMessageTask: async (_accessToken: string, input: { groups: Array<{ chatId: string }> }) => {
      clientCalls.push(input);
      return options.apiResult ?? { ok: true, msgId: "msg-1", raw: { errcode: 0, msgid: "msg-1" } };
    }
  };
  return {
    service: new WecomGroupMessageService(prisma as PrismaService, config as any, token as any, client as any),
    tasks,
    logs,
    auditLogs,
    clientCalls
  };
}
