import { Injectable, NotFoundException } from "@nestjs/common";
import { ConferenceStatus, FormFieldType, Prisma, RegistrationSkuStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

interface ConferenceListQuery {
  page?: string;
  pageSize?: string;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class ConferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ConferenceListQuery): Promise<ApiResponse<ConferenceListResponse>> {
    const page = parsePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conference.findMany({
        where: { status: ConferenceStatus.PUBLISHED },
        orderBy: [{ sortOrder: "asc" }, { startsAt: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          slug: true,
          coverImageUrl: true,
          summary: true,
          location: true,
          startsAt: true,
          endsAt: true
        }
      }),
      this.prisma.conference.count({
        where: { status: ConferenceStatus.PUBLISHED }
      })
    ]);

    return ok({
      items: items.map((conference) => ({
        ...conference,
        startsAt: conference.startsAt.toISOString(),
        endsAt: conference.endsAt.toISOString()
      })),
      total,
      page,
      pageSize
    });
  }

  async detail(id: string): Promise<ApiResponse<ConferenceDetailResponse>> {
    const conference = await this.prisma.conference.findFirst({
      where: {
        id,
        status: ConferenceStatus.PUBLISHED
      },
      select: {
        id: true,
        title: true,
        slug: true,
        coverImageUrl: true,
        summary: true,
        location: true,
        startsAt: true,
        endsAt: true,
        registrationStartsAt: true,
        registrationEndsAt: true,
        page: {
          select: {
            contentJson: true
          }
        },
        skus: {
          where: { status: RegistrationSkuStatus.ACTIVE },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            priceCent: true,
            stock: true,
            soldCount: true
          }
        }
      }
    });

    if (!conference) {
      throw new NotFoundException("Conference not found");
    }

    return ok({
      id: conference.id,
      title: conference.title,
      slug: conference.slug,
      coverImageUrl: conference.coverImageUrl,
      summary: conference.summary,
      location: conference.location,
      startsAt: conference.startsAt.toISOString(),
      endsAt: conference.endsAt.toISOString(),
      registrationStartsAt: conference.registrationStartsAt?.toISOString() ?? null,
      registrationEndsAt: conference.registrationEndsAt?.toISOString() ?? null,
      contentJson: conference.page?.contentJson ?? null,
      skus: conference.skus
    });
  }

  async form(id: string): Promise<ApiResponse<ConferenceFormResponse>> {
    const formDefinition = await this.prisma.formDefinition.findFirst({
      where: {
        conferenceId: id,
        conference: {
          status: ConferenceStatus.PUBLISHED
        }
      },
      select: {
        id: true,
        title: true,
        description: true,
        fields: {
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            label: true,
            fieldKey: true,
            type: true,
            required: true,
            placeholder: true,
            optionsJson: true,
            validationJson: true,
            sortOrder: true
          }
        }
      }
    });

    if (!formDefinition) {
      throw new NotFoundException("Conference form not found");
    }

    return ok({
      formId: formDefinition.id,
      title: formDefinition.title,
      description: formDefinition.description,
      fields: formDefinition.fields.map((field) => ({
        id: field.id,
        key: field.fieldKey,
        label: field.label,
        type: toApiFieldType(field.type),
        required: field.required,
        placeholder: field.placeholder,
        options: toJsonArray(field.optionsJson),
        validationJson: field.validationJson,
        sortOrder: field.sortOrder
      }))
    });
  }
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toApiFieldType(type: FormFieldType): string {
  return type.toLowerCase();
}

function toJsonArray(value: Prisma.JsonValue | null): Prisma.JsonArray {
  return Array.isArray(value) ? value : [];
}

export interface ConferenceListResponse {
  items: Array<{
    id: string;
    title: string;
    slug: string;
    coverImageUrl: string | null;
    summary: string | null;
    location: string | null;
    startsAt: string;
    endsAt: string;
  }>;
  total: number;
  page: number;
  pageSize: number;
}

export interface ConferenceDetailResponse {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  summary: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string;
  registrationStartsAt: string | null;
  registrationEndsAt: string | null;
  contentJson: Prisma.JsonValue | null;
  skus: Array<{
    id: string;
    name: string;
    description: string | null;
    priceCent: number;
    stock: number;
    soldCount: number;
  }>;
}

export interface ConferenceFormResponse {
  formId: string;
  title: string | null;
  description: string | null;
  fields: Array<{
    id: string;
    key: string;
    label: string;
    type: string;
    required: boolean;
    placeholder: string | null;
    options: Prisma.JsonArray;
    validationJson: Prisma.JsonValue | null;
    sortOrder: number;
  }>;
}
