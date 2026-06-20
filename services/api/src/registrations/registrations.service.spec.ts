import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UnauthorizedException } from "@nestjs/common";
import { CheckInStatus, OrderStatus, PaymentProvider, PaymentStatus, RegistrationStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { RegistrationsService } from "./registrations.service";

const currentUser: CurrentUser = {
  id: "user-1",
  openid: "mock_user_1",
  nickname: "测试用户"
};

process.env.JWT_SECRET = "test_registration_credential_jwt_secret";

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

  it("returns complete credential conference user payment and form summary data", async () => {
    const service = new RegistrationsService(createPrismaMock());

    const response = await service.getCredentialByRegistrationId("registration-new", currentUser);
    const data = response.data as any;

    assert.equal(data.conference.name, "示例会议");
    assert.equal(data.registrationNo, "REGNO-NEW");
    assert.equal(data.user.nickname, "微信用户");
    assert.equal(data.user.avatarUrl, "https://example.com/avatar.png");
    assert.equal(data.attendee.name, "李四");
    assert.equal(data.attendee.mobile, "13900000000");
    assert.equal(data.payment.status, PaymentStatus.SUCCESS);
    assert.equal(data.payment.provider, PaymentProvider.WECHAT);
    assert.equal(data.payment.paidAmountCent, 1);
    assert.equal(data.ticket.name, "仅参会");
    assert.ok(data.formSummary.some((item: { label: string; value: string }) => item.label === "company" && item.value === "观潮科技"));
    assert.match(data.qrPayload, /^CONF_REG:/);
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
      },
      findFirst: async (args: any) => {
        if (args.where?.userId !== "user-1") return null;
        return createCredentialRegistration();
      }
    }
  };

  return mock as typeof mock & PrismaService;
}

function createCredentialRegistration() {
  return {
    id: "registration-new",
    registrationNo: "REGNO-NEW",
    attendeeName: "李四",
    phone: "13900000000",
    formDataJson: { company: "观潮科技", name: "李四", phone: "13900000000" },
    paidAmountCent: 1,
    status: RegistrationStatus.CONFIRMED,
    confirmedAt: new Date("2026-06-07T10:00:00.000Z"),
    createdAt: new Date("2026-06-07T10:00:00.000Z"),
    user: {
      id: "user-1",
      nickname: "测试用户",
      wechatNickname: "微信用户",
      wechatAvatarUrl: "https://example.com/avatar.png",
      phone: "13900000000"
    },
    conference: {
      id: "conference-1",
      title: "示例会议",
      startsAt: new Date("2026-08-01T09:00:00.000Z"),
      endsAt: new Date("2026-08-03T18:00:00.000Z"),
      location: "上海会展中心",
      page: { contentJson: { agendaUrl: "/pages/custom/agenda" } }
    },
    sku: {
      id: "sku-2",
      name: "仅参会",
      priceCent: 1
    },
    order: {
      orderNo: "ORDER-NEW",
      status: OrderStatus.PAID,
      paidAt: new Date("2026-06-07T10:01:00.000Z"),
      paidAmountCent: 1,
      payableAmountCent: 1,
      payments: [
        {
          provider: PaymentProvider.WECHAT,
          status: PaymentStatus.SUCCESS,
          paidAt: new Date("2026-06-07T10:01:00.000Z"),
          amountCent: 1
        }
      ]
    },
    attendees: [
      {
        name: "李四",
        phone: "13900000000",
        company: "观潮科技",
        title: "运营经理",
        formDataJson: { role: "运营经理" },
        checkInStatus: CheckInStatus.PENDING,
        checkedInAt: null
      }
    ]
  };
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
