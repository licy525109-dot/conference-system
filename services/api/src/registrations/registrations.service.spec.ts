import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import { RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { RegistrationsService } from "./registrations.service";

const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_user_1",
  nickname: "测试用户"
};

describe("RegistrationsService listMine", () => {
  it("requires login", async () => {
    const service = new RegistrationsService(createPrismaMock());

    await assert.rejects(() => service.listMine(undefined), UnauthorizedException);
  });

  it("returns only current user's registrations ordered by createdAt desc", async () => {
    const prisma = createPrismaMock();
    const service = new RegistrationsService(prisma);

    const response = await service.listMine(currentUser);

    assert.equal(prisma.lastFindManyArgs?.where.userId, "user-1");
    assert.deepEqual(
      response.data.items.map((item) => item.registrationNo),
      ["REGNO-NEW", "REGNO-OLD"]
    );
    assert.deepEqual(response.data.items[0], {
      id: "registration-new",
      registrationNo: "REGNO-NEW",
      status: RegistrationStatus.CONFIRMED,
      attendeeName: "李四",
      phone: "13900000000",
      paidAmountCent: 70000,
      confirmedAt: "2026-06-07T10:00:00.000Z",
      createdAt: "2026-06-07T10:00:00.000Z",
      conference: {
        id: "conference-1",
        title: "示例会议",
        slug: "demo-conf",
        startsAt: "2026-08-01T09:00:00.000Z",
        endsAt: "2026-08-03T18:00:00.000Z"
      },
      sku: {
        id: "sku-2",
        name: "仅参会"
      },
      order: {
        orderNo: "ORDER-NEW"
      }
    });
  });

  it("returns an empty list when current user has no registrations", async () => {
    const service = new RegistrationsService(createPrismaMock());

    const response = await service.listMine({
      id: "user-empty",
      openid: "mock_empty",
      nickname: null
    });

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        items: []
      }
    });
  });
});

function createPrismaMock() {
  const registrations = [
    createRegistration("registration-old", "REGNO-OLD", "ORDER-OLD", "user-1", "sku-1", "住宿+参会", 100000, new Date("2026-06-06T10:00:00.000Z"), "张三", "13800000000"),
    createRegistration("registration-new", "REGNO-NEW", "ORDER-NEW", "user-1", "sku-2", "仅参会", 70000, new Date("2026-06-07T10:00:00.000Z"), "李四", "13900000000"),
    createRegistration("registration-other", "REGNO-OTHER", "ORDER-OTHER", "user-2", "sku-1", "住宿+参会", 100000, new Date("2026-06-08T10:00:00.000Z"), "王五", "13700000000")
  ];

  const mock = {
    lastFindManyArgs: undefined as RegistrationFindManyArgs | undefined,
    registration: {
      findMany: async (args: RegistrationFindManyArgs) => {
        mock.lastFindManyArgs = args;
        return registrations
          .filter((registration) => registration.userId === args.where.userId)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
      }
    }
  };

  return mock as typeof mock & PrismaService;
}

function createRegistration(
  id: string,
  registrationNo: string,
  orderNo: string,
  userId: string,
  skuId: string,
  skuName: string,
  paidAmountCent: number,
  createdAt: Date,
  attendeeName: string,
  phone: string
) {
  return {
    id,
    registrationNo,
    userId,
    status: RegistrationStatus.CONFIRMED,
    attendeeName,
    phone,
    paidAmountCent,
    confirmedAt: createdAt,
    createdAt,
    conference: {
      id: "conference-1",
      title: "示例会议",
      slug: "demo-conf",
      startsAt: new Date("2026-08-01T09:00:00.000Z"),
      endsAt: new Date("2026-08-03T18:00:00.000Z")
    },
    sku: {
      id: skuId,
      name: skuName
    },
    order: {
      orderNo
    }
  };
}

interface RegistrationFindManyArgs {
  where: {
    userId: string;
  };
}
