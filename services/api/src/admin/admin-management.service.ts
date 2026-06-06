import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  ConferenceStatus,
  FormFieldType,
  OrderStatus,
  Prisma,
  RegistrationSkuStatus,
  RegistrationStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

@Injectable()
export class AdminManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listConferences(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const pagination = parsePagination(query);
    const status = readOptionalEnum(query, "status", ConferenceStatus);
    const keyword = readOptionalString(query, "keyword");
    const where: Prisma.ConferenceWhereInput = {
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword, mode: "insensitive" } },
              { summary: { contains: keyword, mode: "insensitive" } },
              { location: { contains: keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.conference.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: conferenceListSelect
      }),
      this.prisma.conference.count({ where })
    ]);

    return ok({
      items: items.map(formatConferenceListItem),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }

  async createConference(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const request = parseConferenceInput(input, false);
    const title = ensureDefined(request.title, "title");
    const startAt = ensureDefined(request.startAt, "startAt");
    const endAt = ensureDefined(request.endAt, "endAt");
    const conference = await this.prisma.conference.create({
      data: {
        title,
        slug: request.slug ?? await this.generateConferenceSlug(title),
        summary: request.subtitle,
        coverImageUrl: request.coverImage,
        startsAt: startAt,
        endsAt: endAt,
        location: request.location,
        status: request.status ?? ConferenceStatus.DRAFT,
        sortOrder: request.sortOrder ?? 0,
        page: {
          create: {
            contentJson: request.contentJson ?? {},
            styleJson: request.styleJson
          }
        },
        formDefinition: {
          create: {
            title: "报名信息",
            description: null
          }
        }
      },
      select: conferenceDetailSelect
    });

    await this.writeAudit(admin, AuditAction.CREATE, "Conference", conference.id, "Create conference", {
      title: conference.title
    });

    return ok(formatConferenceDetail(conference));
  }

  async getConference(id: string): Promise<ApiResponse<unknown>> {
    const conference = await this.prisma.conference.findUnique({
      where: { id },
      select: conferenceDetailSelect
    });

    if (!conference) {
      throw new NotFoundException("Conference not found");
    }

    return ok(formatConferenceDetail(conference));
  }

  async updateConference(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    await this.ensureConference(id);
    const request = parseConferenceInput(input, true);
    const conference = await this.prisma.conference.update({
      where: { id },
      data: {
        ...(typeof request.title !== "undefined" ? { title: request.title } : {}),
        ...(typeof request.subtitle !== "undefined" ? { summary: request.subtitle } : {}),
        ...(typeof request.coverImage !== "undefined" ? { coverImageUrl: request.coverImage } : {}),
        ...(typeof request.startAt !== "undefined" ? { startsAt: request.startAt } : {}),
        ...(typeof request.endAt !== "undefined" ? { endsAt: request.endAt } : {}),
        ...(typeof request.location !== "undefined" ? { location: request.location } : {}),
        ...(typeof request.status !== "undefined" ? { status: request.status } : {}),
        ...(typeof request.sortOrder !== "undefined" ? { sortOrder: request.sortOrder } : {}),
        ...(typeof request.contentJson !== "undefined" || typeof request.styleJson !== "undefined"
          ? {
              page: {
                upsert: {
                  create: {
                    contentJson: request.contentJson ?? {},
                    styleJson: request.styleJson
                  },
                  update: {
                    ...(typeof request.contentJson !== "undefined" ? { contentJson: request.contentJson } : {}),
                    ...(typeof request.styleJson !== "undefined" ? { styleJson: request.styleJson } : {})
                  }
                }
              }
            }
          : {})
      },
      select: conferenceDetailSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "Conference", conference.id, "Update conference", {
      title: conference.title
    });

    return ok(formatConferenceDetail(conference));
  }

  async updateConferenceStatus(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const status = readRequiredEnum(readObject(input), "status", ConferenceStatus);
    if (status === ConferenceStatus.PUBLISHED) {
      const activeSkuCount = await this.prisma.registrationSku.count({
        where: {
          conferenceId: id,
          status: RegistrationSkuStatus.ACTIVE
        }
      });

      if (activeSkuCount === 0) {
        throw new ConflictException("At least one active SKU is required before publishing");
      }
    }

    const conference = await this.prisma.conference.update({
      where: { id },
      data: { status },
      select: conferenceDetailSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "Conference", conference.id, "Update conference status", {
      status
    });

    return ok(formatConferenceDetail(conference));
  }

  async listSkus(conferenceId: string): Promise<ApiResponse<unknown>> {
    await this.ensureConference(conferenceId);
    const items = await this.prisma.registrationSku.findMany({
      where: { conferenceId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: skuSelect
    });

    return ok({ items });
  }

  async createSku(conferenceId: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    await this.ensureConference(conferenceId);
    const request = parseSkuInput(input, false);
    const name = ensureDefined(request.name, "name");
    const priceCent = ensureDefined(request.priceCent, "priceCent");
    const stock = ensureDefined(request.stock, "stock");
    const sku = await this.prisma.registrationSku.create({
      data: {
        conferenceId,
        name,
        description: request.description,
        priceCent,
        stock,
        status: request.status ?? RegistrationSkuStatus.ACTIVE,
        saleStartAt: request.saleStartAt,
        saleEndAt: request.saleEndAt,
        sortOrder: request.sortOrder ?? 0
      },
      select: skuSelect
    });

    await this.writeAudit(admin, AuditAction.CREATE, "RegistrationSku", sku.id, "Create registration SKU", {
      conferenceId,
      priceCent: sku.priceCent
    });

    return ok(sku);
  }

  async updateSku(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const existing = await this.prisma.registrationSku.findUnique({
      where: { id },
      select: { id: true, soldCount: true }
    });
    if (!existing) {
      throw new NotFoundException("Registration SKU not found");
    }

    const request = parseSkuInput(input, true, existing.soldCount);
    const sku = await this.prisma.registrationSku.update({
      where: { id },
      data: {
        ...(typeof request.name !== "undefined" ? { name: request.name } : {}),
        ...(typeof request.description !== "undefined" ? { description: request.description } : {}),
        ...(typeof request.priceCent !== "undefined" ? { priceCent: request.priceCent } : {}),
        ...(typeof request.stock !== "undefined" ? { stock: request.stock } : {}),
        ...(typeof request.status !== "undefined" ? { status: request.status } : {}),
        ...(typeof request.saleStartAt !== "undefined" ? { saleStartAt: request.saleStartAt } : {}),
        ...(typeof request.saleEndAt !== "undefined" ? { saleEndAt: request.saleEndAt } : {}),
        ...(typeof request.sortOrder !== "undefined" ? { sortOrder: request.sortOrder } : {})
      },
      select: skuSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "RegistrationSku", sku.id, "Update registration SKU", {
      priceCent: sku.priceCent
    });

    return ok(sku);
  }

  async listFormFields(conferenceId: string): Promise<ApiResponse<unknown>> {
    const form = await this.ensureFormDefinition(conferenceId);
    const items = await this.prisma.formField.findMany({
      where: { formDefinitionId: form.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: formFieldSelect
    });

    return ok({ formId: form.id, items });
  }

  async createFormField(conferenceId: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const form = await this.ensureFormDefinition(conferenceId);
    const request = parseFormFieldInput(input, false);
    const label = ensureDefined(request.label, "label");
    const fieldKey = ensureDefined(request.fieldKey, "fieldKey");
    const type = ensureDefined(request.type, "type");
    const field = await catchUniqueConstraint(
      this.prisma.formField.create({
        data: {
          formDefinitionId: form.id,
          label,
          fieldKey,
          type,
          required: request.required ?? false,
          placeholder: request.placeholder,
          optionsJson: request.optionsJson,
          validationJson: request.validationJson,
          sortOrder: request.sortOrder ?? 0,
          enabled: request.enabled ?? true
        },
        select: formFieldSelect
      }),
      "fieldKey already exists in this form"
    );

    await this.writeAudit(admin, AuditAction.CREATE, "FormField", field.id, "Create form field", {
      conferenceId,
      fieldKey: field.fieldKey
    });

    return ok(field);
  }

  async updateFormField(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const existing = await this.prisma.formField.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) {
      throw new NotFoundException("Form field not found");
    }

    const request = parseFormFieldInput(input, true);
    const field = await catchUniqueConstraint(
      this.prisma.formField.update({
        where: { id },
        data: {
          ...(typeof request.label !== "undefined" ? { label: request.label } : {}),
          ...(typeof request.fieldKey !== "undefined" ? { fieldKey: request.fieldKey } : {}),
          ...(typeof request.type !== "undefined" ? { type: request.type } : {}),
          ...(typeof request.required !== "undefined" ? { required: request.required } : {}),
          ...(typeof request.placeholder !== "undefined" ? { placeholder: request.placeholder } : {}),
          ...(typeof request.optionsJson !== "undefined" ? { optionsJson: request.optionsJson } : {}),
          ...(typeof request.validationJson !== "undefined" ? { validationJson: request.validationJson } : {}),
          ...(typeof request.sortOrder !== "undefined" ? { sortOrder: request.sortOrder } : {}),
          ...(typeof request.enabled !== "undefined" ? { enabled: request.enabled } : {})
        },
        select: formFieldSelect
      }),
      "fieldKey already exists in this form"
    );

    await this.writeAudit(admin, AuditAction.UPDATE, "FormField", field.id, "Update form field", {
      fieldKey: field.fieldKey
    });

    return ok(field);
  }

  async disableFormField(id: string, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const field = await this.prisma.formField.update({
      where: { id },
      data: { enabled: false },
      select: formFieldSelect
    });

    await this.writeAudit(admin, AuditAction.DELETE, "FormField", field.id, "Disable form field", {
      fieldKey: field.fieldKey
    });

    return ok(field);
  }

  async listOrders(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const pagination = parsePagination(query);
    const where = parseOrderWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: orderListSelect
      }),
      this.prisma.order.count({ where })
    ]);

    return ok({
      items: items.map(formatOrderListItem),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }

  async getOrder(orderNo: string): Promise<ApiResponse<unknown>> {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      select: orderDetailSelect
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return ok(formatOrderDetail(order));
  }

  async listRegistrations(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const pagination = parsePagination(query);
    const where = parseRegistrationWhere(query);
    const [items, total] = await this.prisma.$transaction([
      this.prisma.registration.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: registrationListSelect
      }),
      this.prisma.registration.count({ where })
    ]);

    return ok({
      items: items.map(formatRegistrationListItem),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }

  async getRegistration(id: string): Promise<ApiResponse<unknown>> {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
      select: registrationDetailSelect
    });

    if (!registration) {
      throw new NotFoundException("Registration not found");
    }

    return ok(formatRegistrationDetail(registration));
  }

  private async generateConferenceSlug(title: string): Promise<string> {
    const base = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "conference";
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${base}-${suffix}`;
  }

  private async ensureConference(id: string): Promise<void> {
    const conference = await this.prisma.conference.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!conference) {
      throw new NotFoundException("Conference not found");
    }
  }

  private async ensureFormDefinition(conferenceId: string): Promise<{ id: string }> {
    await this.ensureConference(conferenceId);
    return this.prisma.formDefinition.upsert({
      where: { conferenceId },
      update: {},
      create: {
        conferenceId,
        title: "报名信息",
        description: null
      },
      select: { id: true }
    });
  }

  private async writeAudit(
    admin: CurrentAdmin,
    action: AuditAction,
    entityType: string,
    entityId: string,
    summary: string,
    metadataJson?: Prisma.InputJsonObject
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        adminUserId: admin.id,
        action,
        entityType,
        entityId,
        summary,
        metadataJson
      }
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

const conferenceListSelect = {
  id: true,
  title: true,
  slug: true,
  coverImageUrl: true,
  summary: true,
  location: true,
  startsAt: true,
  endsAt: true,
  status: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      skus: true,
      orders: true,
      registrations: true
    }
  }
} satisfies Prisma.ConferenceSelect;

const conferenceDetailSelect = {
  ...conferenceListSelect,
  registrationStartsAt: true,
  registrationEndsAt: true,
  page: {
    select: {
      contentJson: true,
      styleJson: true
    }
  }
} satisfies Prisma.ConferenceSelect;

const skuSelect = {
  id: true,
  conferenceId: true,
  name: true,
  description: true,
  priceCent: true,
  stock: true,
  soldCount: true,
  status: true,
  saleStartAt: true,
  saleEndAt: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.RegistrationSkuSelect;

const formFieldSelect = {
  id: true,
  formDefinitionId: true,
  label: true,
  fieldKey: true,
  type: true,
  required: true,
  placeholder: true,
  optionsJson: true,
  validationJson: true,
  sortOrder: true,
  enabled: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.FormFieldSelect;

const orderListSelect = {
  id: true,
  orderNo: true,
  conferenceId: true,
  skuId: true,
  originAmountCent: true,
  payableAmountCent: true,
  paidAmountCent: true,
  status: true,
  attendeeName: true,
  phone: true,
  expiredAt: true,
  paidAt: true,
  createdAt: true,
  conference: { select: { title: true } },
  sku: { select: { name: true } }
} satisfies Prisma.OrderSelect;

const orderDetailSelect = {
  ...orderListSelect,
  submittedFormJson: true,
  registrationSnapshotJson: true,
  items: {
    select: {
      id: true,
      skuName: true,
      unitPriceCent: true,
      quantity: true,
      totalAmountCent: true
    }
  },
  payments: {
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      provider: true,
      status: true,
      outTradeNo: true,
      transactionId: true,
      amountCent: true,
      paidAt: true,
      createdAt: true
    }
  },
  registration: {
    select: {
      id: true,
      registrationNo: true,
      status: true
    }
  }
} satisfies Prisma.OrderSelect;

const registrationListSelect = {
  id: true,
  registrationNo: true,
  conferenceId: true,
  skuId: true,
  attendeeName: true,
  phone: true,
  paidAmountCent: true,
  status: true,
  confirmedAt: true,
  createdAt: true,
  conference: { select: { title: true } },
  sku: { select: { name: true } },
  order: { select: { orderNo: true } }
} satisfies Prisma.RegistrationSelect;

const registrationDetailSelect = {
  ...registrationListSelect,
  formDataJson: true
} satisfies Prisma.RegistrationSelect;

interface ConferenceListShape {
  id: string;
  title: string;
  slug: string;
  coverImageUrl: string | null;
  summary: string | null;
  location: string | null;
  startsAt: Date;
  endsAt: Date;
  status: ConferenceStatus;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count?: {
    skus: number;
    orders: number;
    registrations: number;
  };
}

interface ConferenceDetailShape extends ConferenceListShape {
  registrationStartsAt?: Date | null;
  registrationEndsAt?: Date | null;
  page?: {
    contentJson: Prisma.JsonValue;
    styleJson: Prisma.JsonValue | null;
  } | null;
}

function formatConferenceListItem(conference: ConferenceListShape) {
  return {
    id: conference.id,
    title: conference.title,
    subtitle: conference.summary,
    slug: conference.slug,
    coverImage: conference.coverImageUrl,
    location: conference.location,
    startAt: conference.startsAt.toISOString(),
    endAt: conference.endsAt.toISOString(),
    status: conference.status,
    sortOrder: conference.sortOrder,
    createdAt: conference.createdAt.toISOString(),
    updatedAt: conference.updatedAt.toISOString(),
    counts: conference._count ?? { skus: 0, orders: 0, registrations: 0 }
  };
}

function formatConferenceDetail(conference: ConferenceDetailShape) {
  return {
    ...formatConferenceListItem(conference),
    registrationStartsAt: conference.registrationStartsAt?.toISOString() ?? null,
    registrationEndsAt: conference.registrationEndsAt?.toISOString() ?? null,
    contentJson: conference.page?.contentJson ?? {},
    styleJson: conference.page?.styleJson ?? null
  };
}

function formatOrderListItem(order: Prisma.OrderGetPayload<{ select: typeof orderListSelect }>) {
  return {
    id: order.id,
    orderNo: order.orderNo,
    conferenceId: order.conferenceId,
    conferenceTitle: order.conference.title,
    skuId: order.skuId,
    skuName: order.sku.name,
    originAmountCent: order.originAmountCent,
    payableAmountCent: order.payableAmountCent,
    paidAmountCent: order.paidAmountCent,
    status: order.status,
    attendeeName: order.attendeeName,
    phone: order.phone,
    expiredAt: order.expiredAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

function formatOrderDetail(order: Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>) {
  return {
    ...formatOrderListItem(order),
    submittedFormJson: order.submittedFormJson,
    registrationSnapshotJson: order.registrationSnapshotJson,
    items: order.items,
    payments: order.payments.map((payment) => ({
      ...payment,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString()
    })),
    registration: order.registration
  };
}

function formatRegistrationListItem(registration: Prisma.RegistrationGetPayload<{ select: typeof registrationListSelect }>) {
  return {
    id: registration.id,
    registrationNo: registration.registrationNo,
    conferenceId: registration.conferenceId,
    conferenceTitle: registration.conference.title,
    skuId: registration.skuId,
    skuName: registration.sku.name,
    attendeeName: registration.attendeeName,
    phone: registration.phone,
    paidAmountCent: registration.paidAmountCent,
    status: registration.status,
    orderNo: registration.order.orderNo,
    confirmedAt: registration.confirmedAt.toISOString(),
    createdAt: registration.createdAt.toISOString()
  };
}

function formatRegistrationDetail(
  registration: Prisma.RegistrationGetPayload<{ select: typeof registrationDetailSelect }>
) {
  return {
    ...formatRegistrationListItem(registration),
    formDataJson: registration.formDataJson
  };
}

function parseConferenceInput(input: unknown, partial: boolean) {
  const body = readObject(input);
  const title = partial ? readOptionalString(body, "title") : readRequiredString(body, "title");
  const startAt = partial ? readOptionalDate(body, "startAt") : readRequiredDate(body, "startAt");
  const endAt = partial ? readOptionalDate(body, "endAt") : readRequiredDate(body, "endAt");

  return {
    title,
    slug: readOptionalString(body, "slug"),
    subtitle: readOptionalString(body, "subtitle"),
    coverImage: readOptionalString(body, "coverImage"),
    startAt,
    endAt,
    location: readOptionalString(body, "location"),
    status: readOptionalEnum(body, "status", ConferenceStatus),
    sortOrder: readOptionalNonNegativeInt(body, "sortOrder"),
    contentJson: readOptionalJsonObject(body, "contentJson"),
    styleJson: readOptionalJsonObject(body, "styleJson")
  };
}

function parseSkuInput(input: unknown, partial: boolean, soldCount = 0) {
  const body = readObject(input);
  const stock = partial ? readOptionalNonNegativeInt(body, "stock") : readRequiredNonNegativeInt(body, "stock");
  if (typeof stock === "number" && stock < soldCount) {
    throw new BadRequestException("stock cannot be less than soldCount");
  }

  return {
    name: partial ? readOptionalString(body, "name") : readRequiredString(body, "name"),
    description: readOptionalString(body, "description"),
    priceCent: partial ? readOptionalNonNegativeInt(body, "priceCent") : readRequiredNonNegativeInt(body, "priceCent"),
    stock,
    status: readOptionalEnum(body, "status", RegistrationSkuStatus),
    saleStartAt: readOptionalNullableDate(body, "saleStartAt"),
    saleEndAt: readOptionalNullableDate(body, "saleEndAt"),
    sortOrder: readOptionalNonNegativeInt(body, "sortOrder")
  };
}

function parseFormFieldInput(input: unknown, partial: boolean) {
  const body = readObject(input);
  const optionsJson = readOptionalJsonArray(body, "optionsJson");
  const type = partial ? readOptionalEnum(body, "type", FormFieldType) : readRequiredEnum(body, "type", FormFieldType);
  const optionTypes: FormFieldType[] = [FormFieldType.SELECT, FormFieldType.RADIO, FormFieldType.CHECKBOX];
  if (type && optionTypes.includes(type) && optionsJson && !Array.isArray(optionsJson)) {
    throw new BadRequestException("optionsJson must be an array");
  }

  return {
    label: partial ? readOptionalString(body, "label") : readRequiredString(body, "label"),
    fieldKey: partial ? readOptionalString(body, "fieldKey") : readRequiredString(body, "fieldKey"),
    type,
    required: readOptionalBoolean(body, "required"),
    placeholder: readOptionalString(body, "placeholder"),
    optionsJson,
    validationJson: readOptionalJsonObject(body, "validationJson"),
    sortOrder: readOptionalNonNegativeInt(body, "sortOrder"),
    enabled: readOptionalBoolean(body, "enabled")
  };
}

function parseOrderWhere(query: Record<string, unknown>): Prisma.OrderWhereInput {
  const conferenceId = readOptionalString(query, "conferenceId");
  const status = readOptionalEnum(query, "status", OrderStatus);
  const keyword = readOptionalString(query, "keyword");
  return {
    ...(conferenceId ? { conferenceId } : {}),
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [
            { orderNo: { contains: keyword, mode: "insensitive" } },
            { attendeeName: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } }
          ]
        }
      : {})
  };
}

function parseRegistrationWhere(query: Record<string, unknown>): Prisma.RegistrationWhereInput {
  const conferenceId = readOptionalString(query, "conferenceId");
  const status = readOptionalEnum(query, "status", RegistrationStatus);
  const keyword = readOptionalString(query, "keyword");
  return {
    ...(conferenceId ? { conferenceId } : {}),
    ...(status ? { status } : {}),
    ...(keyword
      ? {
          OR: [
            { registrationNo: { contains: keyword, mode: "insensitive" } },
            { attendeeName: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } },
            { order: { orderNo: { contains: keyword, mode: "insensitive" } } }
          ]
        }
      : {})
  };
}

function parsePagination(query: Record<string, unknown>) {
  const page = parsePositiveInt(query.page, DEFAULT_PAGE);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readObject(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }
  return input as Record<string, unknown>;
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }
  return value.trim();
}

function readOptionalString(input: Record<string, unknown>, field: string): string | undefined {
  if (!Object.hasOwn(input, field) || input[field] === null) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "string") {
    throw new BadRequestException(`${field} must be a string`);
  }
  return value.trim();
}

function readRequiredDate(input: Record<string, unknown>, field: string): Date {
  const value = readOptionalDate(input, field);
  if (!value) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function readOptionalDate(input: Record<string, unknown>, field: string): Date | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} must be an ISO date string`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${field} must be an ISO date string`);
  }
  return date;
}

function readOptionalNullableDate(input: Record<string, unknown>, field: string): Date | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  if (input[field] === null || input[field] === "") {
    return null;
  }
  return readOptionalDate(input, field);
}

function readRequiredNonNegativeInt(input: Record<string, unknown>, field: string): number {
  const value = readOptionalNonNegativeInt(input, field);
  if (typeof value !== "number") {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function readOptionalNonNegativeInt(input: Record<string, unknown>, field: string): number | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new BadRequestException(`${field} must be a non-negative integer`);
  }
  return value;
}

function ensureDefined<T>(value: T | undefined, field: string): T {
  if (typeof value === "undefined") {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

async function catchUniqueConstraint<T>(promise: Promise<T>, message: string): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (isRecord(error) && error.code === "P2002") {
      throw new ConflictException(message);
    }
    throw error;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOptionalBoolean(input: Record<string, unknown>, field: string): boolean | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "boolean") {
    throw new BadRequestException(`${field} must be a boolean`);
  }
  return value;
}

function readRequiredEnum<T extends Record<string, string>>(input: Record<string, unknown>, field: string, enumObject: T): T[keyof T] {
  const value = readOptionalEnum(input, field, enumObject);
  if (!value) {
    throw new BadRequestException(`${field} is required`);
  }
  return value;
}

function readOptionalEnum<T extends Record<string, string>>(
  input: Record<string, unknown>,
  field: string,
  enumObject: T
): T[keyof T] | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "string" || !Object.values(enumObject).includes(value)) {
    throw new BadRequestException(`${field} is invalid`);
  }
  return value as T[keyof T];
}

function readOptionalJsonObject(input: Record<string, unknown>, field: string): Prisma.InputJsonObject | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BadRequestException(`${field} must be a JSON object`);
  }
  return value as Prisma.InputJsonObject;
}

function readOptionalJsonArray(input: Record<string, unknown>, field: string): Prisma.InputJsonArray | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (!Array.isArray(value)) {
    throw new BadRequestException(`${field} must be an array`);
  }
  return value as Prisma.InputJsonArray;
}
