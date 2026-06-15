import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ExecutionContext, InternalServerErrorException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { WechatAuthService } from "./wechat-auth.service";

describe("AuthService mock WeChat login", () => {
  it("creates a user and returns a token", async () => {
    withAuthEnv();
    const prisma = createPrismaMock();
    const service = new AuthService(prisma);

    const response = await service.wechatLogin({
      code: "dev-user-001",
      nickname: "测试用户"
    });

    assert.equal(response.code, "OK");
    assert.equal(response.data.user.openid, "mock_dev-user-001");
    assert.equal(response.data.user.nickname, "测试用户");
    assert.equal(typeof response.data.token, "string");
    assert.equal(response.data.token.split(".").length, 3);
    assert.equal(prisma.users.length, 1);
  });

  it("reuses the same user for repeated login with the same code", async () => {
    withAuthEnv();
    const prisma = createPrismaMock();
    const service = new AuthService(prisma);

    const first = await service.wechatLogin({
      code: "dev-user-001",
      nickname: "测试用户"
    });
    const second = await service.wechatLogin({
      code: "dev-user-001",
      nickname: "测试用户 2"
    });

    assert.equal(first.data.user.id, second.data.user.id);
    assert.equal(second.data.user.nickname, "测试用户 2");
    assert.equal(prisma.users.length, 1);
  });

  it("returns 400 when code is missing", async () => {
    withAuthEnv();
    const service = new AuthService(createPrismaMock());

    await assert.rejects(() => service.wechatLogin({ nickname: "测试用户" }), BadRequestException);
  });

  it("allows a valid bearer token to access current user", async () => {
    withAuthEnv();
    const prisma = createPrismaMock();
    const service = new AuthService(prisma);
    const guard = new JwtAuthGuard(service);
    const controller = new AuthController(service);
    const login = await service.wechatLogin({
      code: "dev-user-001",
      nickname: "测试用户"
    });
    const request: RequestWithCurrentUser & { headers: { authorization: string } } = {
      headers: {
        authorization: `Bearer ${login.data.token}`
      }
    };

    const allowed = await guard.canActivate(createExecutionContext(request));
    const me = await controller.me(request);

    assert.equal(allowed, true);
    assert.equal(me.code, "OK");
    assert.equal(me.data.user.id, login.data.user.id);
    assert.equal(me.data.user.openid, "mock_dev-user-001");
    assert.equal(me.data.user.nickname, "测试用户");
    assert.equal(me.data.user.wechatNickname, null);
    assert.equal(me.data.user.wechatAvatarUrl, null);
    assert.equal(typeof me.data.user.registeredAt, "string");
    assert.equal(typeof me.data.user.lastActiveAt, "string");
  });

  it("updates the current user's WeChat profile", async () => {
    withAuthEnv();
    const prisma = createPrismaMock();
    const service = new AuthService(prisma);
    const login = await service.wechatLogin({
      code: "dev-user-001",
      nickname: "测试用户"
    });

    const response = await service.updateWechatProfile(login.data.user, {
      wechatNickname: "微信昵称",
      wechatAvatarUrl: "https://guanchaohuiji.com/uploads/wechat-avatars/avatar.webp"
    });

    assert.equal(response.data.user.wechatNickname, "微信昵称");
    assert.equal(response.data.user.wechatAvatarUrl, "https://guanchaohuiji.com/uploads/wechat-avatars/avatar.webp");
    assert.equal(prisma.users[0]?.profileUpdatedAt instanceof Date, true);
  });

  it("rejects invalid WeChat profile values", async () => {
    withAuthEnv();
    const service = new AuthService(createPrismaMock());

    await assert.rejects(
      () =>
        service.updateWechatProfile(
          {
            id: "user-1",
            openid: "mock_dev-user-001",
            nickname: "测试用户"
          },
          {
            wechatNickname: "a".repeat(33),
            wechatAvatarUrl: "javascript:alert(1)"
          }
        ),
      BadRequestException
    );
  });

  it("rejects non-image avatar uploads", async () => {
    withAuthEnv();
    const service = new AuthService(createPrismaMock());

    await assert.rejects(
      () =>
        service.saveWechatAvatar(
          {
            id: "user-1",
            openid: "mock_dev-user-001",
            nickname: "测试用户"
          },
          {
            buffer: Buffer.from("not-image"),
            originalname: "avatar.txt",
            mimetype: "text/plain",
            size: 9
          },
          "https://guanchaohuiji.com"
        ),
      BadRequestException
    );
  });

  it("returns 401 when bearer token is missing", async () => {
    withAuthEnv();
    const guard = new JwtAuthGuard(new AuthService(createPrismaMock()));

    await assert.rejects(() => guard.canActivate(createExecutionContext({ headers: {} })), UnauthorizedException);
  });

  it("real mode returns a configuration error when AppID or AppSecret is missing", async () => {
    withRealAuthEnvWithoutCredentials();
    const service = new AuthService(createPrismaMock());

    await assert.rejects(
      () =>
        service.wechatLogin({
          code: "wx-code"
        }),
      InternalServerErrorException
    );
  });

  it("real mode upserts user from code2Session and never returns session_key", async () => {
    withRealAuthEnv();
    const prisma = createPrismaMock();
    const service = new AuthService(prisma, createWechatAuthMock({
      openid: "real-openid-001",
      sessionKey: "SESSION_KEY_SHOULD_NOT_LEAK",
      unionid: "union-001"
    }));

    const response = await service.wechatLogin({
      code: "wx-code-001"
    });

    assert.equal(response.code, "OK");
    assert.equal(response.data.user.openid, "real-openid-001");
    assert.equal(prisma.users.length, 1);
    assert.equal(prisma.users[0]?.unionid, "union-001");
    assert.equal(JSON.stringify(response).includes("SESSION_KEY_SHOULD_NOT_LEAK"), false);
    assert.equal(JSON.stringify(response).includes("session_key"), false);
  });

  it("code2Session errcode fails login", async () => {
    withRealAuthEnv();
    class ErrcodeWechatAuthService extends WechatAuthService {
      protected override async fetchCode2Session(): Promise<Record<string, unknown>> {
        return {
          errcode: 40029,
          errmsg: "invalid code"
        };
      }
    }

    const service = new AuthService(createPrismaMock(), new ErrcodeWechatAuthService());

    await assert.rejects(
      () =>
        service.wechatLogin({
          code: "bad-code"
        }),
      BadRequestException
    );
  });
});

function withAuthEnv(): void {
  process.env.WECHAT_LOGIN_MODE = "mock";
  process.env.JWT_SECRET = "test_jwt_secret";
}

function withRealAuthEnv(): void {
  process.env.WECHAT_LOGIN_MODE = "real";
  process.env.JWT_SECRET = "test_jwt_secret";
  process.env.WECHAT_APP_ID = "test_app_id";
  process.env.WECHAT_APP_SECRET = "test_app_secret";
}

function withRealAuthEnvWithoutCredentials(): void {
  process.env.WECHAT_LOGIN_MODE = "real";
  process.env.JWT_SECRET = "test_jwt_secret";
  delete process.env.WECHAT_APP_ID;
  delete process.env.WECHAT_APP_SECRET;
}

function createWechatAuthMock(session: { openid: string; sessionKey: string; unionid: string | null }): WechatAuthService {
  return {
    code2Session: async (code: string) => {
      assert.equal(code, "wx-code-001");
      return session;
    }
  } as WechatAuthService;
}

function createPrismaMock() {
  const users: UserRecord[] = [];
  let nextUserNumber = 1;

  const mock = {
    users,
    user: {
      upsert: async (args: UserUpsertArgs) => {
        const existing = users.find((user) => user.openid === args.where.openid);
        if (existing) {
          if ("nickname" in args.update) {
            existing.nickname = args.update.nickname ?? null;
          }
          if (typeof args.update.unionid === "string") {
            existing.unionid = args.update.unionid;
          }
          if (args.update.lastActiveAt instanceof Date) {
            existing.lastActiveAt = args.update.lastActiveAt;
          }
          return selectUser(existing);
        }

        const now = new Date("2026-06-08T09:00:00.000Z");
        const user: UserRecord = {
          id: `user-${nextUserNumber++}`,
          openid: args.create.openid,
          unionid: args.create.unionid ?? null,
          nickname: args.create.nickname,
          wechatNickname: null,
          wechatAvatarUrl: null,
          profileUpdatedAt: null,
          createdAt: now,
          lastActiveAt: args.create.lastActiveAt ?? null
        };
        users.push(user);
        return selectUser(user);
      },
      findUnique: async (args: UserFindUniqueArgs) => {
        const user = users.find((item) => item.id === args.where.id);
        return user ? selectUser(user) : null;
      },
      update: async (args: UserUpdateArgs) => {
        const user = users.find((item) => item.id === args.where.id);
        if (!user) {
          throw new Error("missing user");
        }
        if ("wechatNickname" in args.data) {
          user.wechatNickname = args.data.wechatNickname ?? null;
        }
        if ("wechatAvatarUrl" in args.data) {
          user.wechatAvatarUrl = args.data.wechatAvatarUrl ?? null;
        }
        if (args.data.profileUpdatedAt instanceof Date) {
          user.profileUpdatedAt = args.data.profileUpdatedAt;
        }
        if (args.data.lastActiveAt instanceof Date) {
          user.lastActiveAt = args.data.lastActiveAt;
        }
        return selectUser(user);
      }
    }
  };

  return mock as typeof mock & PrismaService;
}

function selectUser(user: UserRecord) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
    createdAt: user.createdAt,
    lastActiveAt: user.lastActiveAt
  };
}

function createExecutionContext(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request
    })
  } as ExecutionContext;
}

interface UserRecord {
  id: string;
  openid: string;
  unionid: string | null;
  nickname: string | null;
  wechatNickname: string | null;
  wechatAvatarUrl: string | null;
  profileUpdatedAt: Date | null;
  createdAt: Date;
  lastActiveAt: Date | null;
}

interface UserUpsertArgs {
  where: {
    openid: string;
  };
  update: {
    nickname?: string | null;
    unionid?: string;
    lastActiveAt?: Date;
  };
  create: {
    openid: string;
    unionid?: string | null;
    nickname: string | null;
    lastActiveAt?: Date;
  };
}

interface UserFindUniqueArgs {
  where: {
    id: string;
  };
}

interface UserUpdateArgs {
  where: {
    id: string;
  };
  data: {
    wechatNickname?: string | null;
    wechatAvatarUrl?: string | null;
    profileUpdatedAt?: Date;
    lastActiveAt?: Date;
  };
}
