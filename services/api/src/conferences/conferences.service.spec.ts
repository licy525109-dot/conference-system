import "reflect-metadata";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { NotFoundException } from "@nestjs/common";
import { ConferenceStatus, FormFieldType, Prisma, RegistrationSkuStatus } from "@prisma/client";
import { ConferencesService } from "./conferences.service";
import { PrismaService } from "../prisma.service";

const baseDate = new Date("2026-08-01T09:00:00.000Z");
const laterDate = new Date("2026-08-03T18:00:00.000Z");

const conferences = [
  {
    id: "published-conf",
    title: "Published Conference",
    slug: "published-conference",
    coverImageUrl: null,
    summary: "Visible conference",
    location: "Shanghai",
    startsAt: baseDate,
    endsAt: laterDate,
    registrationStartsAt: new Date("2026-06-01T00:00:00.000Z"),
    registrationEndsAt: new Date("2026-07-20T23:59:59.000Z"),
    status: ConferenceStatus.PUBLISHED,
    sortOrder: 1,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    page: {
      contentJson: {
        blocks: [{ type: "heading", text: "Published Conference" }]
      }
    },
    skus: [
      {
        id: "active-sku",
        name: "Active SKU",
        description: "Available",
        priceCent: 70000,
        stock: 100,
        soldCount: 0,
        status: RegistrationSkuStatus.ACTIVE,
        sortOrder: 2,
        createdAt: new Date("2026-05-02T00:00:00.000Z")
      },
      {
        id: "inactive-sku",
        name: "Inactive SKU",
        description: "Hidden",
        priceCent: 100000,
        stock: 100,
        soldCount: 0,
        status: RegistrationSkuStatus.INACTIVE,
        sortOrder: 1,
        createdAt: new Date("2026-05-01T00:00:00.000Z")
      }
    ]
  },
  {
    id: "draft-conf",
    title: "Draft Conference",
    slug: "draft-conference",
    coverImageUrl: null,
    summary: null,
    location: null,
    startsAt: baseDate,
    endsAt: laterDate,
    registrationStartsAt: null,
    registrationEndsAt: null,
    status: ConferenceStatus.DRAFT,
    sortOrder: 2,
    createdAt: new Date("2026-05-03T00:00:00.000Z"),
    page: null,
    skus: []
  },
  {
    id: "closed-conf",
    title: "Closed Conference",
    slug: "closed-conference",
    coverImageUrl: null,
    summary: null,
    location: null,
    startsAt: baseDate,
    endsAt: laterDate,
    registrationStartsAt: null,
    registrationEndsAt: null,
    status: ConferenceStatus.CLOSED,
    sortOrder: 3,
    createdAt: new Date("2026-05-04T00:00:00.000Z"),
    page: null,
    skus: []
  },
  {
    id: "archived-conf",
    title: "Archived Conference",
    slug: "archived-conference",
    coverImageUrl: null,
    summary: null,
    location: null,
    startsAt: baseDate,
    endsAt: laterDate,
    registrationStartsAt: null,
    registrationEndsAt: null,
    status: ConferenceStatus.ARCHIVED,
    sortOrder: 4,
    createdAt: new Date("2026-05-05T00:00:00.000Z"),
    page: null,
    skus: []
  }
];

const formDefinitions = [
  {
    id: "form-published",
    conferenceId: "published-conf",
    title: "Registration Form",
    description: "Visible fields only",
    conferenceStatus: ConferenceStatus.PUBLISHED,
    fields: [
      {
        id: "company-field",
        label: "Company",
        fieldKey: "company",
        type: FormFieldType.TEXT,
        required: false,
        placeholder: "Company",
        optionsJson: [],
        validationJson: null,
        sortOrder: 3,
        enabled: true,
        createdAt: new Date("2026-05-03T00:00:00.000Z")
      },
      {
        id: "disabled-field",
        label: "Hidden Field",
        fieldKey: "hidden",
        type: FormFieldType.TEXT,
        required: false,
        placeholder: null,
        optionsJson: [],
        validationJson: null,
        sortOrder: 2,
        enabled: false,
        createdAt: new Date("2026-05-02T00:00:00.000Z")
      },
      {
        id: "name-field",
        label: "Name",
        fieldKey: "name",
        type: FormFieldType.TEXT,
        required: true,
        placeholder: "Name",
        optionsJson: [],
        validationJson: null,
        sortOrder: 1,
        enabled: true,
        createdAt: new Date("2026-05-01T00:00:00.000Z")
      },
      {
        id: "phone-field",
        label: "Phone",
        fieldKey: "phone",
        type: FormFieldType.PHONE,
        required: true,
        placeholder: "Phone",
        optionsJson: [],
        validationJson: { pattern: "^1[3-9]\\d{9}$" },
        sortOrder: 2,
        enabled: true,
        createdAt: new Date("2026-05-02T12:00:00.000Z")
      }
    ]
  },
  {
    id: "form-draft",
    conferenceId: "draft-conf",
    title: "Draft Form",
    description: null,
    conferenceStatus: ConferenceStatus.DRAFT,
    fields: []
  }
];

describe("ConferencesService", () => {
  it("lists only published conferences", async () => {
    const prisma = createPrismaMock();
    const service = new ConferencesService(prisma);

    const response = await service.list({});

    assert.equal(response.data.total, 1);
    assert.deepEqual(
      response.data.items.map((item) => item.id),
      ["published-conf"]
    );
    assert.equal(prisma.lastConferenceFindManyArgs?.where.status, ConferenceStatus.PUBLISHED);
    assert.equal(prisma.lastConferenceCountArgs?.where.status, ConferenceStatus.PUBLISHED);
  });

  it("filters published conferences by keyword", async () => {
    const service = new ConferencesService(createPrismaMock());

    const matched = await service.list({ keyword: "Shanghai" });
    const missing = await service.list({ keyword: "not-found" });

    assert.deepEqual(matched.data.items.map((item) => item.id), ["published-conf"]);
    assert.equal(missing.data.total, 0);
  });

  it("allows detail access only for published conferences", async () => {
    const service = new ConferencesService(createPrismaMock());

    const response = await service.detail("published-conf");

    assert.equal(response.data.id, "published-conf");
    assert.deepEqual(response.data.contentJson, {
      blocks: [{ type: "heading", text: "Published Conference" }]
    });
    await assert.rejects(() => service.detail("draft-conf"), NotFoundException);
    await assert.rejects(() => service.detail("closed-conf"), NotFoundException);
    await assert.rejects(() => service.detail("archived-conf"), NotFoundException);
  });

  it("returns only active registration SKUs in conference detail", async () => {
    const service = new ConferencesService(createPrismaMock());

    const response = await service.detail("published-conf");

    assert.deepEqual(
      response.data.skus.map((sku) => sku.id),
      ["active-sku"]
    );
    assert.equal(response.data.skus[0]?.priceCent, 70000);
  });

  it("returns form fields by sortOrder and hides disabled fields", async () => {
    const service = new ConferencesService(createPrismaMock());

    const response = await service.form("published-conf");

    assert.deepEqual(
      response.data.fields.map((field) => field.key),
      ["name", "phone", "company"]
    );
    assert.equal(response.data.fields.some((field) => field.key === "hidden"), false);
    assert.deepEqual(
      response.data.fields.map((field) => field.sortOrder),
      [1, 2, 3]
    );
  });

  it("returns 404 for missing and non-published conference forms", async () => {
    const service = new ConferencesService(createPrismaMock());

    await assert.rejects(() => service.form("missing-conf"), NotFoundException);
    await assert.rejects(() => service.form("draft-conf"), NotFoundException);
  });

  it("returns 404 for missing conference detail", async () => {
    const service = new ConferencesService(createPrismaMock());

    await assert.rejects(() => service.detail("missing-conf"), NotFoundException);
  });
});

function createPrismaMock() {
  const mock = {
    lastConferenceFindManyArgs: undefined as FindManyArgs | undefined,
    lastConferenceCountArgs: undefined as CountArgs | undefined,
    conference: {
      findMany: async (args: FindManyArgs) => {
        mock.lastConferenceFindManyArgs = args;
        return conferences
          .filter((conference) => matchesConferenceWhere(conference, args.where))
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(({ page, skus, status, sortOrder, createdAt, registrationStartsAt, registrationEndsAt, ...conference }) => ({
            ...conference
          }));
      },
      count: async (args: CountArgs) => {
        mock.lastConferenceCountArgs = args;
        return conferences.filter((conference) => matchesConferenceWhere(conference, args.where)).length;
      },
      findFirst: async (args: DetailArgs) => {
        const conference = conferences.find(
          (item) => item.id === args.where.id && item.status === args.where.status
        );

        if (!conference) {
          return null;
        }

        const skus = conference.skus
          .filter((sku) => sku.status === args.select.skus.where.status)
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map(({ status, sortOrder, createdAt, ...sku }) => sku);

        return {
          id: conference.id,
          title: conference.title,
          slug: conference.slug,
          coverImageUrl: conference.coverImageUrl,
          summary: conference.summary,
          location: conference.location,
          startsAt: conference.startsAt,
          endsAt: conference.endsAt,
          registrationStartsAt: conference.registrationStartsAt,
          registrationEndsAt: conference.registrationEndsAt,
          page: conference.page,
          skus
        };
      }
    },
    formDefinition: {
      findFirst: async (args: FormArgs) => {
        const form = formDefinitions.find(
          (item) =>
            item.conferenceId === args.where.conferenceId &&
            item.conferenceStatus === args.where.conference.status
        );

        if (!form) {
          return null;
        }

        return {
          id: form.id,
          title: form.title,
          description: form.description,
          fields: form.fields
            .filter((field) => field.enabled === args.select.fields.where.enabled)
            .sort((left, right) => left.sortOrder - right.sortOrder || left.createdAt.getTime() - right.createdAt.getTime())
            .map(({ enabled, createdAt, ...field }) => field)
        };
      }
    },
    $transaction: async (queries: Array<Promise<unknown>>) => Promise.all(queries)
  };

  return mock as typeof mock & PrismaService;
}

interface MockConference {
  title: string;
  summary: string | null;
  location: string | null;
  status: ConferenceStatus;
}

interface FindManyArgs {
  where: Prisma.ConferenceWhereInput;
}

interface CountArgs {
  where: Prisma.ConferenceWhereInput;
}

interface DetailArgs {
  where: {
    id: string;
    status: ConferenceStatus;
  };
  select: {
    skus: {
      where: { status: RegistrationSkuStatus };
    };
  };
}

function matchesConferenceWhere(conference: MockConference, where: Prisma.ConferenceWhereInput): boolean {
  const record = where as Record<string, unknown>;
  if (record.status && conference.status !== record.status) {
    return false;
  }

  const and = Array.isArray(record.AND) ? record.AND : [];
  if (and.length > 0 && !and.every((item) => matchesConferenceWhere(conference, item as Prisma.ConferenceWhereInput))) {
    return false;
  }

  const or = Array.isArray(record.OR) ? record.OR : [];
  if (or.length > 0 && !or.some((item) => matchesConferenceWhere(conference, item as Prisma.ConferenceWhereInput))) {
    return false;
  }

  return (
    matchesTextFilter(conference.title, record.title) &&
    matchesTextFilter(conference.summary, record.summary) &&
    matchesTextFilter(conference.location, record.location)
  );
}

function matchesTextFilter(value: string | null, filter: unknown): boolean {
  if (!filter) {
    return true;
  }
  const text = value ?? "";
  if (typeof filter === "string") {
    return text === filter;
  }
  if (typeof filter === "object" && filter !== null && "contains" in filter) {
    const contains = String((filter as { contains?: unknown }).contains ?? "");
    return text.toLowerCase().includes(contains.toLowerCase());
  }
  return true;
}

interface FormArgs {
  where: {
    conferenceId: string;
    conference: {
      status: ConferenceStatus;
    };
  };
  select: {
    fields: {
      where: {
        enabled: boolean;
      };
    };
  };
}
