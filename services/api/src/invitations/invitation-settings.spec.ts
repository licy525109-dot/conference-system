import "reflect-metadata";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Reflector } from "@nestjs/core";
import { InvitationSettingsService } from "./invitation-settings.service";
import { InvitationSettingsController } from "./invitation-settings.controller";
import { InvitationWechatService } from "./invitation-wechat.service";
import { AdminPermissionGuard } from "../admin/admin-permission.guard";
import { decryptSecret } from "../wecom/wecom.crypto";
import type { InvitationWechatConfig } from "@prisma/client";

const admin = {
  id: "admin",
  username: "operator",
  displayName: null,
  permissions: ["invitation:view"],
};
const appId = "wx" + "a".repeat(16);
function fixture() {
  let record: InvitationWechatConfig | null = null;
  const audits: unknown[] = [];
  const config = {
    findUnique: async () => record,
    create: async ({ data }: { data: Partial<InvitationWechatConfig> }) => {
      record = {
        id: "official",
        revision: 1,
        updatedAt: new Date(),
        ...data,
      } as InvitationWechatConfig;
      return record;
    },
    updateMany: async ({
      where,
      data,
    }: {
      where: { revision: number };
      data: Omit<Partial<InvitationWechatConfig>, "revision">;
    }) => {
      if (!record || record.revision !== where.revision) return { count: 0 };
      record = { ...record, ...data, revision: record.revision + 1 };
      return { count: 1 };
    },
  };
  const tx = {
    invitationWechatConfig: config,
    auditLog: {
      create: async (value: unknown) => {
        audits.push(value);
      },
    },
  };
  const service = new InvitationSettingsService({
    ...tx,
    $transaction: async (run: (arg: unknown) => unknown) => run(tx),
  } as never);
  return { service, config, audits, record: () => record };
}
test("official account credentials are encrypted, never returned or audited, blank preserves them", async () => {
  const f = fixture(),
    secret = randomBytes(16).toString("hex");
  const first = await f.service.save(
    { revision: 0, enabled: true, appId, appSecret: secret },
    admin,
  );
  assert.equal(first.secretConfigured, true);
  assert.equal(first.revision, 1);
  assert.ok(f.record()!.appSecretEnc?.startsWith("v1:"));
  assert.equal(decryptSecret(f.record()!.appSecretEnc), secret);
  assert.equal(JSON.stringify(first).includes(secret), false);
  assert.equal(JSON.stringify(f.audits).includes(secret), false);
  const encrypted = f.record()!.appSecretEnc;
  await f.service.save(
    { revision: 1, enabled: true, appId, appSecret: "" },
    admin,
  );
  assert.equal(f.record()!.appSecretEnc, encrypted);
  assert.deepEqual(await f.service.credentials(), { appId, secret });
});
test("configuration revision and AppID replacement cannot reuse another account's secret", async () => {
  const f = fixture();
  await f.service.save(
    {
      revision: 0,
      enabled: true,
      appId,
      appSecret: randomBytes(16).toString("hex"),
    },
    admin,
  );
  await assert.rejects(
    f.service.save({ revision: 0, enabled: true, appId }, admin),
    /已更新/,
  );
  await assert.rejects(
    f.service.save(
      { revision: 1, enabled: true, appId: "wx" + "b".repeat(16) },
      admin,
    ),
    /新的 AppSecret/,
  );
  f.config.updateMany = async () => ({ count: 0 });
  await assert.rejects(
    f.service.save({ revision: 1, enabled: false, appId }, admin),
    /已更新/,
  );
  assert.equal(f.audits.length, 1);
});
test("disabled database settings override environment credentials and retain stored secret", async () => {
  const f = fixture();
  await f.service.save(
    {
      revision: 0,
      enabled: false,
      appId,
      appSecret: randomBytes(16).toString("hex"),
    },
    admin,
  );
  assert.equal(await f.service.credentials(), null);
  assert.ok(await f.service.credentials(true));
  assert.equal((await f.service.get()).enabled, false);
});
test("verification file is exact-match plain text and rejects traversal or HTML", async () => {
  const f = fixture();
  const body = {
    revision: 0,
    enabled: true,
    appId,
    appSecret: randomBytes(16).toString("hex"),
  };
  for (const verificationFile of [
    { name: "../MP_verify_test.txt", content: "verification1234" },
    { name: "MP_verify_test.txt", content: "<script>alert(1)</script>" },
    { name: "MP_verify_test.txt", content: "a".repeat(1025) },
  ])
    await assert.rejects(
      f.service.save({ ...body, verificationFile }, admin),
      /校验文件/,
    );
  await f.service.save(
    {
      ...body,
      verificationFile: {
        name: "MP_verify_test.txt",
        content: "verification1234\n",
      },
    },
    admin,
  );
  assert.equal(await f.service.verification("test"), "verification1234");
  await assert.rejects(f.service.verification("another"));
  await assert.rejects(f.service.verification("../test"));
  await f.service.save(
    { ...body, revision: 1, appSecret: "", verificationFile: null },
    admin,
  );
  await assert.rejects(f.service.verification("test"));
});
test("official settings require dedicated permission on read, write and test", () => {
  const guard = new AdminPermissionGuard(new Reflector());
  for (const method of ["get", "save", "test"] as const) {
    const context = {
      getHandler: () => InvitationSettingsController.prototype[method],
      getClass: () => InvitationSettingsController,
      switchToHttp: () => ({ getRequest: () => ({ currentAdmin: admin }) }),
    };
    assert.throws(() => guard.canActivate(context as never), /无权/);
  }
});
test("updated credentials use separate tickets and disabling takes effect without a restart", async () => {
  let credentials: { appId: string; secret: string } | null = {
    appId,
    secret: randomBytes(16).toString("hex"),
  };
  let calls = 0;
  class MockWechat extends InvitationWechatService {
    protected async fetchJson(url: string) {
      calls++;
      return url.includes("getticket")
        ? { errcode: 0, ticket: `ticket-${calls}`, expires_in: 7200 }
        : { access_token: "test-token", expires_in: 7200 };
    }
  }
  const service = new MockWechat({
    credentials: async () => credentials,
  } as never);
  const token = "a".repeat(43),
    url = `https://guanchaohuiji.com/i/${token}`;
  assert.equal((await service.config(token, url)).available, true);
  await service.config(token, url);
  assert.equal(calls, 2);
  credentials = { appId, secret: randomBytes(16).toString("hex") };
  await service.config(token, url);
  assert.equal(calls, 4);
  credentials = null;
  assert.equal((await service.config(token, url)).available, false);
  assert.equal(calls, 4);
});
test("connection errors are sanitized and identify IP whitelist failure", async () => {
  const secret = randomBytes(16).toString("hex");
  class MockWechat extends InvitationWechatService {
    protected async fetchJson() {
      return { errcode: 40164, errmsg: `private upstream detail ${secret}` };
    }
  }
  const service = new MockWechat({
    credentials: async () => ({ appId, secret }),
  } as never);
  await assert.rejects(
    service.testConnection(),
    (error) =>
      error instanceof Error &&
      error.message.includes("IP 白名单") &&
      !error.message.includes(secret),
  );
});
