import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { ConferenceStatus, RegistrationSkuStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { RegistrationService } from "./registration.service";

const now = new Date("2026-06-06T12:00:00.000Z");

describe("RegistrationService quote", () => {
  it("returns a quote from server-side SKU price", async () => {
    const prisma = createPrismaMock();
    const service = createService(prisma);

    const response = await service.quote({
      conferenceId: "published-conf",
      skuId: "active-sku",
      quantity: 1
    });

    assert.deepEqual(response, {
      code: "OK",
      message: "ok",
      data: {
        conferenceId: "published-conf",
        skuId: "active-sku",
        skuName: "Active SKU",
        quantity: 1,
        originAmountCent: 100000,
        discountAmountCent: 0,
        payableAmountCent: 100000
      }
    });
    assert.equal(prisma.lastConferenceFindFirstArgs?.where.status, ConferenceStatus.PUBLISHED);
    assert.equal(prisma.lastSkuFindFirstArgs?.where.conferenceId, "published-conf");
  });

  it("rejects non-published conferences", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "draft-conf", skuId: "active-sku", quantity: 1 }),
      NotFoundException
    );
  });

  it("rejects inactive SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "inactive-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects SKUs that do not belong to the conference", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "other-conf-sku", quantity: 1 }),
      NotFoundException
    );
  });

  it("rejects out-of-stock SKUs", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "sold-out-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects quantity values other than 1", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "active-sku", quantity: 2 }),
      BadRequestException
    );
  });

  it("rejects client-supplied amount fields", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () =>
        service.quote({
          conferenceId: "published-conf",
          skuId: "active-sku",
          quantity: 1,
          payableAmountCent: 1
        }),
      BadRequestException
    );
  });

  it("rejects SKUs before saleStartAt", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "future-sale-sku", quantity: 1 }),
      ConflictException
    );
  });

  it("rejects SKUs after saleEndAt", async () => {
    const service = createService(createPrismaMock());

    await assert.rejects(
      () => service.quote({ conferenceId: "published-conf", skuId: "ended-sale-sku", quantity: 1 }),
      ConflictException
    );
  });
});

function createService(prisma: PrismaService): RegistrationService {
  class TestRegistrationService extends RegistrationService {
    protected override getCurrentTime(): Date {
      return now;
    }
  }

  return new TestRegistrationService(prisma);
}

function createPrismaMock() {
  const mock = {
    lastConferenceFindFirstArgs: undefined as ConferenceFindFirstArgs | undefined,
    lastSkuFindFirstArgs: undefined as SkuFindFirstArgs | undefined,
    conference: {
      findFirst: async (args: ConferenceFindFirstArgs) => {
        mock.lastConferenceFindFirstArgs = args;
        const conference = conferences.find(
          (item) => item.id === args.where.id && item.status === args.where.status
        );

        return conference ? { id: conference.id } : null;
      }
    },
    registrationSku: {
      findFirst: async (args: SkuFindFirstArgs) => {
        mock.lastSkuFindFirstArgs = args;
        const sku = skus.find(
          (item) => item.id === args.where.id && item.conferenceId === args.where.conferenceId
        );

        if (!sku) {
          return null;
        }

        const { conferenceId, ...response } = sku;
        return response;
      }
    }
  };

  return mock as typeof mock & PrismaService;
}

const conferences = [
  {
    id: "published-conf",
    status: ConferenceStatus.PUBLISHED
  },
  {
    id: "draft-conf",
    status: ConferenceStatus.DRAFT
  }
];

const skus = [
  {
    id: "active-sku",
    conferenceId: "published-conf",
    name: "Active SKU",
    priceCent: 100000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "inactive-sku",
    conferenceId: "published-conf",
    name: "Inactive SKU",
    priceCent: 100000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.INACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "other-conf-sku",
    conferenceId: "other-conf",
    name: "Other Conference SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "sold-out-sku",
    conferenceId: "published-conf",
    name: "Sold Out SKU",
    priceCent: 70000,
    stock: 10,
    soldCount: 10,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: null
  },
  {
    id: "future-sale-sku",
    conferenceId: "published-conf",
    name: "Future Sale SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: new Date("2026-06-07T00:00:00.000Z"),
    saleEndAt: null
  },
  {
    id: "ended-sale-sku",
    conferenceId: "published-conf",
    name: "Ended Sale SKU",
    priceCent: 70000,
    stock: 100,
    soldCount: 0,
    status: RegistrationSkuStatus.ACTIVE,
    saleStartAt: null,
    saleEndAt: new Date("2026-06-05T23:59:59.000Z")
  }
];

interface ConferenceFindFirstArgs {
  where: {
    id: string;
    status: ConferenceStatus;
  };
}

interface SkuFindFirstArgs {
  where: {
    id: string;
    conferenceId: string;
  };
}
