import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { RequestWithCurrentUser } from "./current-user";
import { JwtAuthGuard } from "./jwt-auth.guard";

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
    const me = controller.me(request);

    assert.equal(allowed, true);
    assert.deepEqual(me, {
      code: "OK",
      message: "ok",
      data: {
        user: {
          id: login.data.user.id,
          openid: "mock_dev-user-001",
          nickname: "测试用户"
        }
      }
    });
  });

  it("returns 401 when bearer token is missing", async () => {
    withAuthEnv();
    const guard = new JwtAuthGuard(new AuthService(createPrismaMock()));

    await assert.rejects(() => guard.canActivate(createExecutionContext({ headers: {} })), UnauthorizedException);
  });
});

function withAuthEnv(): void {
  process.env.WECHAT_LOGIN_MODE = "mock";
  process.env.JWT_SECRET = "test_jwt_secret";
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
          existing.nickname = args.update.nickname;
          return selectUser(existing);
        }

        const user: UserRecord = {
          id: `user-${nextUserNumber++}`,
          openid: args.create.openid,
          nickname: args.create.nickname
        };
        users.push(user);
        return selectUser(user);
      },
      findUnique: async (args: UserFindUniqueArgs) => {
        const user = users.find((item) => item.id === args.where.id);
        return user ? selectUser(user) : null;
      }
    }
  };

  return mock as typeof mock & PrismaService;
}

function selectUser(user: UserRecord) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname
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
  nickname: string | null;
}

interface UserUpsertArgs {
  where: {
    openid: string;
  };
  update: {
    nickname: string | null;
  };
  create: {
    openid: string;
    nickname: string | null;
  };
}

interface UserFindUniqueArgs {
  where: {
    id: string;
  };
}
