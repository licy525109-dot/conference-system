import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AuditAction,
  CheckInStatus,
  ConferenceStatus,
  CouponType,
  DiscountType,
  FormFieldType,
  OrderStatus,
  PaymentStatus,
  Prisma,
  RegistrationSkuStatus,
  RegistrationStatus
} from "@prisma/client";
import { PrismaService } from "../prisma.service";
import { CurrentAdmin } from "./current-admin";
import { detectPaymentExceptions } from "./admin-payment-exceptions.service";

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
        groupRegistrationEnabled: request.groupRegistrationEnabled ?? true,
        maxTicketsPerOrder: request.maxTicketsPerOrder,
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
        ...(typeof request.groupRegistrationEnabled !== "undefined"
          ? { groupRegistrationEnabled: request.groupRegistrationEnabled }
          : {}),
        ...(typeof request.maxTicketsPerOrder !== "undefined" ? { maxTicketsPerOrder: request.maxTicketsPerOrder } : {}),
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

  async updateConferenceCheckInConfig(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    if (typeof body.checkInEnabled !== "boolean") {
      throw new BadRequestException("checkInEnabled must be a boolean");
    }

    const conference = await this.prisma.conference.update({
      where: { id },
      data: { checkInEnabled: body.checkInEnabled },
      select: conferenceDetailSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "Conference", conference.id, "Update check-in config", {
      checkInEnabled: conference.checkInEnabled
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

    const exceptionReviewLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: "PaymentException",
        entityId: order.id
      },
      orderBy: [{ createdAt: "desc" }],
      take: 10,
      select: {
        id: true,
        summary: true,
        metadataJson: true,
        createdAt: true,
        adminUser: {
          select: {
            username: true,
            displayName: true
          }
        }
      }
    });

    return ok(formatOrderDetail(order, exceptionReviewLogs));
  }

  async deleteOrder(orderNo: string, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const order = await this.prisma.order.findUnique({
      where: { orderNo },
      select: orderDeleteSelect
    });
    if (!order) {
      throw new NotFoundException("Order not found");
    }
    const blockReason = orderDeleteBlockReason(order);
    if (blockReason) {
      throw new ConflictException(blockReason);
    }

    await this.prisma.order.delete({ where: { id: order.id } });
    await this.writeAudit(admin, AuditAction.DELETE, "Order", order.id, "Delete unpaid order", {
      orderNo: order.orderNo
    });
    return ok({ orderNo: order.orderNo, deleted: 1, skipped: 0 });
  }

  async deleteOrdersByFilter(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const body = readObject(input);
    const where = parseOrderWhere(body);
    const onlyExceptions = readOptionalBoolean(body, "onlyExceptions");
    const orders = await this.prisma.order.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      take: 1000,
      select: orderDeleteSelect
    });
    const candidates = onlyExceptions ? orders.filter((order) => detectPaymentExceptions(order).length > 0) : orders;
    const deletable = candidates.filter((order) => !orderDeleteBlockReason(order));
    if (deletable.length > 0) {
      await this.prisma.order.deleteMany({ where: { id: { in: deletable.map((order) => order.id) } } });
    }
    await this.writeAudit(admin, AuditAction.DELETE, "Order", null, "Bulk delete unpaid orders by filter", {
      filters: sanitizeDeleteFilters(body),
      matchedCount: candidates.length,
      deletedCount: deletable.length,
      skippedCount: candidates.length - deletable.length
    });
    return ok({
      deleted: deletable.length,
      skipped: candidates.length - deletable.length,
      matched: candidates.length
    });
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

  async getRegistrationDetail(id: string): Promise<ApiResponse<unknown>> {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
      select: registrationDetailSelect
    });

    if (!registration) {
      throw new NotFoundException("Registration not found");
    }

    const auditLogs = await this.getRegistrationAuditRows(registration);
    return ok({
      ...formatRegistrationDetail(registration),
      credential: {
        registrationNo: registration.registrationNo,
        credentialCode: registration.registrationNo,
        qrPayload: `CONF_REG:${registration.id}:${registration.registrationNo}`,
        checkInProgress: summarizeCheckIn(registration.attendees)
      },
      auditLogs: auditLogs.map(formatAuditTimelineItem),
      timeline: buildRegistrationTimeline(registration, auditLogs)
    });
  }

  async getRegistrationAuditLogs(id: string): Promise<ApiResponse<unknown>> {
    const registration = await this.prisma.registration.findUnique({
      where: { id },
      select: registrationDetailSelect
    });

    if (!registration) {
      throw new NotFoundException("Registration not found");
    }

    const auditLogs = await this.getRegistrationAuditRows(registration);
    return ok({ items: auditLogs.map(formatAuditTimelineItem) });
  }

  async updateRegistrationRemark(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const adminRemark = readRegistrationRemark(input);
    const registration = await this.prisma.registration.update({
      where: { id },
      data: {
        adminRemark,
        remarkUpdatedAt: new Date(),
        remarkUpdatedBy: admin.id
      },
      select: registrationDetailSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "Registration", registration.id, "Update registration remark", {
      registrationNo: registration.registrationNo
    });

    return ok(formatRegistrationDetail(registration));
  }

  async checkInRegistrationAttendee(id: string, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const attendee = await this.prisma.registrationAttendee.findUnique({
      where: { id },
      select: {
        id: true,
        checkInStatus: true,
        registration: {
          select: {
            id: true,
            registrationNo: true,
            status: true,
            order: {
              select: {
                status: true
              }
            }
          }
        }
      }
    });

    if (!attendee) {
      throw new NotFoundException("Registration attendee not found");
    }

    if (attendee.registration.status !== RegistrationStatus.CONFIRMED || attendee.registration.order.status !== OrderStatus.PAID) {
      throw new ConflictException("只能核销已支付确认的参会人");
    }

    if (attendee.checkInStatus === CheckInStatus.CHECKED_IN) {
      throw new ConflictException("该参会人已核销");
    }

    if (attendee.checkInStatus !== CheckInStatus.PENDING) {
      throw new ConflictException("当前参会人不可核销");
    }

    const updated = await this.prisma.registrationAttendee.update({
      where: { id },
      data: {
        checkInStatus: CheckInStatus.CHECKED_IN,
        checkedInAt: new Date(),
        checkedInBy: admin.id
      },
      select: attendeeSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "RegistrationAttendee", updated.id, "Check in attendee", {
      registrationNo: attendee.registration.registrationNo
    });

    return ok(formatAttendee(updated));
  }

  async listCoupons(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const pagination = parsePagination(query);
    const conferenceId = readOptionalString(query, "conferenceId");
    const enabled = readOptionalBoolean(query, "enabled");
    const keyword = readOptionalString(query, "keyword");
    const where: Prisma.CouponWhereInput = {
      ...(conferenceId ? { conferenceId } : {}),
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(keyword
        ? {
            OR: [
              { code: { contains: keyword, mode: "insensitive" } },
              { name: { contains: keyword, mode: "insensitive" } }
            ]
          }
        : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: couponSelect
      }),
      this.prisma.coupon.count({ where })
    ]);

    return ok({
      items: items.map(formatCoupon),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }

  async createCoupon(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const request = parseCouponInput(input, false);
    const code = ensureDefined(request.code, "code").toUpperCase();
    const name = ensureDefined(request.name, "name");
    const type = ensureDefined(request.type, "type");
    validateCouponDiscountInput(type, request);

    const data: Prisma.CouponUncheckedCreateInput = {
      code,
      name,
      type,
      discountAmountCent: request.discountAmountCent,
      discountPercent: request.discountPercent,
      maxDiscountCent: request.maxDiscountCent,
      minAmountCent: request.minAmountCent,
      minQuantity: request.minQuantity,
      totalLimit: request.totalLimit,
      perUserLimit: request.perUserLimit,
      enabled: request.enabled ?? true,
      startAt: request.startAt,
      endAt: request.endAt,
      stackableWithPromotion: request.stackableWithPromotion ?? false,
      conferenceId: request.conferenceId,
      allowedSkuIds: toNullableJsonInput(request.allowedSkuIds)
    };

    const coupon = await catchUniqueConstraint(
      this.prisma.coupon.create({
        data,
        select: couponSelect
      }),
      "coupon code already exists"
    );

    await this.writeAudit(admin, AuditAction.CREATE, "Coupon", coupon.id, "Create coupon", {
      code: coupon.code
    });

    return ok(formatCoupon(coupon));
  }

  async updateCoupon(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const existing = await this.prisma.coupon.findUnique({
      where: { id },
      select: { id: true, type: true }
    });
    if (!existing) {
      throw new NotFoundException("Coupon not found");
    }

    const request = parseCouponInput(input, true);
    const nextType = request.type ?? existing.type;
    validateCouponDiscountInput(nextType, request, true);
    const data: Prisma.CouponUncheckedUpdateInput = {
      ...(typeof request.code !== "undefined" ? { code: request.code.toUpperCase() } : {}),
      ...(typeof request.name !== "undefined" ? { name: request.name } : {}),
      ...(typeof request.type !== "undefined" ? { type: request.type } : {}),
      ...(typeof request.discountAmountCent !== "undefined" ? { discountAmountCent: request.discountAmountCent } : {}),
      ...(typeof request.discountPercent !== "undefined" ? { discountPercent: request.discountPercent } : {}),
      ...(typeof request.maxDiscountCent !== "undefined" ? { maxDiscountCent: request.maxDiscountCent } : {}),
      ...(typeof request.minAmountCent !== "undefined" ? { minAmountCent: request.minAmountCent } : {}),
      ...(typeof request.minQuantity !== "undefined" ? { minQuantity: request.minQuantity } : {}),
      ...(typeof request.totalLimit !== "undefined" ? { totalLimit: request.totalLimit } : {}),
      ...(typeof request.perUserLimit !== "undefined" ? { perUserLimit: request.perUserLimit } : {}),
      ...(typeof request.enabled !== "undefined" ? { enabled: request.enabled } : {}),
      ...(typeof request.startAt !== "undefined" ? { startAt: request.startAt } : {}),
      ...(typeof request.endAt !== "undefined" ? { endAt: request.endAt } : {}),
      ...(typeof request.stackableWithPromotion !== "undefined"
        ? { stackableWithPromotion: request.stackableWithPromotion }
        : {}),
      ...(typeof request.conferenceId !== "undefined" ? { conferenceId: request.conferenceId } : {}),
      ...(typeof request.allowedSkuIds !== "undefined" ? { allowedSkuIds: toNullableJsonInput(request.allowedSkuIds) } : {})
    };

    const coupon = await catchUniqueConstraint(
      this.prisma.coupon.update({
        where: { id },
        data,
        select: couponSelect
      }),
      "coupon code already exists"
    );

    await this.writeAudit(admin, AuditAction.UPDATE, "Coupon", coupon.id, "Update coupon", {
      code: coupon.code
    });

    return ok(formatCoupon(coupon));
  }

  async listPromotionRules(query: Record<string, unknown>): Promise<ApiResponse<unknown>> {
    const pagination = parsePagination(query);
    const conferenceId = readOptionalString(query, "conferenceId");
    const enabled = readOptionalBoolean(query, "enabled");
    const keyword = readOptionalString(query, "keyword");
    const where: Prisma.PromotionRuleWhereInput = {
      ...(conferenceId ? { conferenceId } : {}),
      ...(typeof enabled === "boolean" ? { enabled } : {}),
      ...(keyword ? { name: { contains: keyword, mode: "insensitive" } } : {})
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.promotionRule.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        skip: pagination.skip,
        take: pagination.pageSize,
        select: promotionRuleSelect
      }),
      this.prisma.promotionRule.count({ where })
    ]);

    return ok({
      items: items.map(formatPromotionRule),
      total,
      page: pagination.page,
      pageSize: pagination.pageSize
    });
  }

  async createPromotionRule(input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const request = parsePromotionRuleInput(input, false);
    validatePromotionRuleInput(request);
    const name = ensureDefined(request.name, "name");
    const discountAmountCent = ensureDefined(request.discountAmountCent, "discountAmountCent");

    const data: Prisma.PromotionRuleUncheckedCreateInput = {
      name,
      type: DiscountType.FULL_REDUCTION,
      conferenceId: request.conferenceId,
      allowedSkuIds: toNullableJsonInput(request.allowedSkuIds),
      minAmountCent: request.minAmountCent,
      minQuantity: request.minQuantity,
      discountAmountCent,
      enabled: request.enabled ?? true,
      startAt: request.startAt,
      endAt: request.endAt,
      stackableWithCoupon: request.stackableWithCoupon ?? false
    };

    const rule = await this.prisma.promotionRule.create({
      data,
      select: promotionRuleSelect
    });

    await this.writeAudit(admin, AuditAction.CREATE, "PromotionRule", rule.id, "Create promotion rule", {
      name: rule.name
    });

    return ok(formatPromotionRule(rule));
  }

  async updatePromotionRule(id: string, input: unknown, admin: CurrentAdmin): Promise<ApiResponse<unknown>> {
    const existing = await this.prisma.promotionRule.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) {
      throw new NotFoundException("Promotion rule not found");
    }

    const request = parsePromotionRuleInput(input, true);
    validatePromotionRuleInput(request);
    const data: Prisma.PromotionRuleUncheckedUpdateInput = {
      ...(typeof request.name !== "undefined" ? { name: request.name } : {}),
      ...(typeof request.conferenceId !== "undefined" ? { conferenceId: request.conferenceId } : {}),
      ...(typeof request.allowedSkuIds !== "undefined" ? { allowedSkuIds: toNullableJsonInput(request.allowedSkuIds) } : {}),
      ...(typeof request.minAmountCent !== "undefined" ? { minAmountCent: request.minAmountCent } : {}),
      ...(typeof request.minQuantity !== "undefined" ? { minQuantity: request.minQuantity } : {}),
      ...(typeof request.discountAmountCent !== "undefined" ? { discountAmountCent: request.discountAmountCent } : {}),
      ...(typeof request.enabled !== "undefined" ? { enabled: request.enabled } : {}),
      ...(typeof request.startAt !== "undefined" ? { startAt: request.startAt } : {}),
      ...(typeof request.endAt !== "undefined" ? { endAt: request.endAt } : {}),
      ...(typeof request.stackableWithCoupon !== "undefined" ? { stackableWithCoupon: request.stackableWithCoupon } : {})
    };

    const rule = await this.prisma.promotionRule.update({
      where: { id },
      data,
      select: promotionRuleSelect
    });

    await this.writeAudit(admin, AuditAction.UPDATE, "PromotionRule", rule.id, "Update promotion rule", {
      name: rule.name
    });

    return ok(formatPromotionRule(rule));
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
    entityId: string | null,
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

  private async getRegistrationAuditRows(registration: Prisma.RegistrationGetPayload<{ select: typeof registrationDetailSelect }>) {
    const entityIds = [registration.id, registration.order.id, ...registration.attendees.map((attendee) => attendee.id)];
    return this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: "Registration", entityId: registration.id },
          { entityType: "Order", entityId: registration.order.id },
          { entityType: "RegistrationAttendee", entityId: { in: entityIds } }
        ]
      },
      orderBy: [{ createdAt: "asc" }],
      take: 50,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        summary: true,
        metadataJson: true,
        createdAt: true,
        adminUser: {
          select: {
            username: true,
            displayName: true
          }
        }
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
  checkInEnabled: true,
  groupRegistrationEnabled: true,
  maxTicketsPerOrder: true,
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

const adminUserProfileSelect = {
  id: true,
  openid: true,
  wechatNickname: true,
  wechatAvatarUrl: true,
  createdAt: true,
  lastActiveAt: true
} satisfies Prisma.UserSelect;

const orderListSelect = {
  id: true,
  orderNo: true,
  conferenceId: true,
  skuId: true,
  originAmountCent: true,
  discountAmountCent: true,
  payableAmountCent: true,
  paidAmountCent: true,
  status: true,
  attendeeName: true,
  phone: true,
  expiredAt: true,
  paidAt: true,
  createdAt: true,
  user: { select: adminUserProfileSelect },
  conference: { select: { title: true } },
  sku: { select: { name: true } },
  payments: {
    orderBy: [{ createdAt: "desc" }],
    take: 5,
    select: {
      id: true,
      provider: true,
      status: true,
      outTradeNo: true,
      transactionId: true,
      amountCent: true,
      failedReason: true,
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
  discounts: {
    orderBy: [{ createdAt: "asc" }],
    select: {
      id: true,
      type: true,
      title: true,
      amountCent: true,
      couponId: true,
      promotionRuleId: true,
      snapshotJson: true,
      createdAt: true
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
      failedReason: true,
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

const orderDeleteSelect = {
  id: true,
  orderNo: true,
  status: true,
  payableAmountCent: true,
  paidAmountCent: true,
  expiredAt: true,
  paidAt: true,
  createdAt: true,
  registration: {
    select: {
      id: true,
      registrationNo: true,
      status: true
    }
  },
  payments: {
    orderBy: [{ createdAt: "desc" }],
    select: {
      id: true,
      status: true,
      amountCent: true,
      failedReason: true,
      createdAt: true,
      paidAt: true
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
  adminRemark: true,
  remarkUpdatedAt: true,
  remarkUpdatedBy: true,
  createdAt: true,
  attendees: {
    select: {
      checkInStatus: true
    }
  },
  user: { select: adminUserProfileSelect },
  conference: { select: { title: true } },
  sku: { select: { name: true } },
  order: { select: { orderNo: true } }
} satisfies Prisma.RegistrationSelect;

const attendeeSelect = {
  id: true,
  skuId: true,
  name: true,
  phone: true,
  company: true,
  title: true,
  formDataJson: true,
  checkInStatus: true,
  checkedInAt: true,
  checkedInBy: true,
  adminRemark: true,
  createdAt: true,
  sku: { select: { name: true } }
} satisfies Prisma.RegistrationAttendeeSelect;

const couponSelect = {
  id: true,
  code: true,
  name: true,
  type: true,
  discountAmountCent: true,
  discountPercent: true,
  maxDiscountCent: true,
  minAmountCent: true,
  minQuantity: true,
  totalLimit: true,
  perUserLimit: true,
  enabled: true,
  startAt: true,
  endAt: true,
  stackableWithPromotion: true,
  conferenceId: true,
  allowedSkuIds: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.CouponSelect;

const promotionRuleSelect = {
  id: true,
  name: true,
  type: true,
  conferenceId: true,
  allowedSkuIds: true,
  minAmountCent: true,
  minQuantity: true,
  discountAmountCent: true,
  enabled: true,
  startAt: true,
  endAt: true,
  stackableWithCoupon: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.PromotionRuleSelect;

const registrationDetailSelect = {
  ...registrationListSelect,
  formDataJson: true,
  attendees: {
    orderBy: [{ createdAt: "asc" }],
    select: attendeeSelect
  },
  order: {
    select: {
      id: true,
      orderNo: true,
      status: true,
      originAmountCent: true,
      discountAmountCent: true,
      payableAmountCent: true,
      paidAmountCent: true,
      submittedFormJson: true,
      registrationSnapshotJson: true,
      createdAt: true,
      paidAt: true,
      items: {
        select: {
          id: true,
          skuName: true,
          unitPriceCent: true,
          quantity: true,
          totalAmountCent: true
        }
      },
      discounts: {
        orderBy: [{ createdAt: "asc" }],
        select: {
          id: true,
          type: true,
          title: true,
          amountCent: true,
          couponId: true,
          promotionRuleId: true,
          snapshotJson: true,
          createdAt: true
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
      }
    }
  }
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
  checkInEnabled?: boolean;
  groupRegistrationEnabled?: boolean;
  maxTicketsPerOrder?: number | null;
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
    checkInEnabled: conference.checkInEnabled ?? false,
    groupRegistrationEnabled: conference.groupRegistrationEnabled ?? true,
    maxTicketsPerOrder: conference.maxTicketsPerOrder ?? null,
    contentJson: conference.page?.contentJson ?? {},
    styleJson: conference.page?.styleJson ?? null
  };
}

function formatOrderListItem(order: Prisma.OrderGetPayload<{ select: typeof orderListSelect }>) {
  const latestPayment = order.payments[0] ?? null;
  return {
    id: order.id,
    orderNo: order.orderNo,
    conferenceId: order.conferenceId,
    conferenceTitle: order.conference.title,
    skuId: order.skuId,
    skuName: order.sku.name,
    originAmountCent: order.originAmountCent,
    discountAmountCent: order.discountAmountCent,
    payableAmountCent: order.payableAmountCent,
    paidAmountCent: order.paidAmountCent,
    status: order.status,
    paymentStatus: latestPayment?.status ?? null,
    paymentProvider: latestPayment?.provider ?? null,
    outTradeNo: latestPayment?.outTradeNo ?? null,
    transactionId: latestPayment?.transactionId ?? null,
    paymentExceptions: detectPaymentExceptions(order),
    user: formatUserProfile(order.user),
    attendeeName: order.attendeeName,
    phone: order.phone,
    expiredAt: order.expiredAt?.toISOString() ?? null,
    paidAt: order.paidAt?.toISOString() ?? null,
    createdAt: order.createdAt.toISOString()
  };
}

function formatOrderDetail(
  order: Prisma.OrderGetPayload<{ select: typeof orderDetailSelect }>,
  exceptionReviewLogs: Array<{
    id: string;
    summary: string | null;
    metadataJson: Prisma.JsonValue;
    createdAt: Date;
    adminUser: { username: string; displayName: string | null } | null;
  }>
) {
  return {
    ...formatOrderListItem(order),
    submittedFormJson: order.submittedFormJson,
    registrationSnapshotJson: order.registrationSnapshotJson,
    items: order.items,
    discounts: order.discounts.map((discount) => ({
      ...discount,
      createdAt: discount.createdAt.toISOString()
    })),
    payments: order.payments.map((payment) => ({
      ...payment,
      paidAt: payment.paidAt?.toISOString() ?? null,
      createdAt: payment.createdAt.toISOString()
    })),
    registration: order.registration,
    exceptionReviewLogs: exceptionReviewLogs.map((log) => ({
      id: log.id,
      summary: log.summary,
      metadataJson: log.metadataJson,
      adminName: log.adminUser?.displayName ?? log.adminUser?.username ?? "系统",
      createdAt: log.createdAt.toISOString()
    }))
  };
}

function formatRegistrationListItem(registration: Prisma.RegistrationGetPayload<{ select: typeof registrationListSelect }>) {
  const checkInProgress = summarizeCheckIn(registration.attendees);
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
    user: formatUserProfile(registration.user),
    orderNo: registration.order.orderNo,
    confirmedAt: registration.confirmedAt.toISOString(),
    adminRemark: registration.adminRemark,
    remarkUpdatedAt: registration.remarkUpdatedAt?.toISOString() ?? null,
    remarkUpdatedBy: registration.remarkUpdatedBy,
    attendeeCount: registration.attendees.length || 1,
    checkInProgress,
    createdAt: registration.createdAt.toISOString()
  };
}

function formatRegistrationDetail(
  registration: Prisma.RegistrationGetPayload<{ select: typeof registrationDetailSelect }>
) {
  return {
    ...formatRegistrationListItem(registration),
    formDataJson: registration.formDataJson,
    attendees: registration.attendees.map(formatAttendee),
    order: {
      ...registration.order,
      createdAt: registration.order.createdAt?.toISOString?.() ?? registration.createdAt.toISOString(),
      paidAt: registration.order.paidAt?.toISOString() ?? null,
      discounts: (registration.order.discounts ?? []).map((discount) => ({
        ...discount,
        createdAt: discount.createdAt?.toISOString?.() ?? registration.createdAt.toISOString()
      })),
      payments: (registration.order.payments ?? []).map((payment) => ({
        ...payment,
        paidAt: payment.paidAt?.toISOString() ?? null,
        createdAt: payment.createdAt.toISOString()
      }))
    }
  };
}

type RegistrationAuditRow = {
  id: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  metadataJson: Prisma.JsonValue;
  createdAt: Date;
  adminUser: { username: string; displayName: string | null } | null;
};

function formatAuditTimelineItem(row: RegistrationAuditRow) {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    metadataJson: row.metadataJson,
    adminName: row.adminUser?.displayName ?? row.adminUser?.username ?? "系统",
    createdAt: row.createdAt.toISOString()
  };
}

function buildRegistrationTimeline(
  registration: Prisma.RegistrationGetPayload<{ select: typeof registrationDetailSelect }>,
  auditLogs: RegistrationAuditRow[]
) {
  const items = [
    {
      type: "ORDER_CREATED",
      title: "创建订单",
      description: registration.order.orderNo,
      createdAt: registration.order.createdAt.toISOString()
    },
    ...registration.order.payments.map((payment) => ({
      type: `PAYMENT_${payment.status}`,
      title: payment.status === PaymentStatus.SUCCESS ? "支付成功" : "支付记录",
      description: `${payment.provider} ${payment.outTradeNo}`,
      createdAt: (payment.paidAt ?? payment.createdAt).toISOString()
    })),
    {
      type: "REGISTRATION_CONFIRMED",
      title: "生成报名",
      description: registration.registrationNo,
      createdAt: registration.confirmedAt.toISOString()
    },
    ...registration.attendees
      .filter((attendee) => attendee.checkedInAt)
      .map((attendee) => ({
        type: "CHECKED_IN",
        title: "签到核销",
        description: attendee.name,
        createdAt: attendee.checkedInAt!.toISOString()
      })),
    ...auditLogs.map((log) => ({
      type: `AUDIT_${log.action}`,
      title: log.summary ?? log.entityType,
      description: log.adminUser?.displayName ?? log.adminUser?.username ?? "系统",
      createdAt: log.createdAt.toISOString()
    }))
  ];

  return items.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function formatAttendee(attendee: Prisma.RegistrationAttendeeGetPayload<{ select: typeof attendeeSelect }>) {
  return {
    id: attendee.id,
    skuId: attendee.skuId,
    skuName: attendee.sku.name,
    name: attendee.name,
    phone: attendee.phone,
    company: attendee.company,
    title: attendee.title,
    formDataJson: attendee.formDataJson,
    checkInStatus: attendee.checkInStatus,
    checkedInAt: attendee.checkedInAt?.toISOString() ?? null,
    checkedInBy: attendee.checkedInBy,
    adminRemark: attendee.adminRemark,
    createdAt: attendee.createdAt.toISOString()
  };
}

function formatCoupon(coupon: Prisma.CouponGetPayload<{ select: typeof couponSelect }>) {
  return {
    ...coupon,
    allowedSkuIds: readAllowedStringArray(coupon.allowedSkuIds),
    startAt: coupon.startAt?.toISOString() ?? null,
    endAt: coupon.endAt?.toISOString() ?? null,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
    redemptionCount: 0
  };
}

function formatPromotionRule(rule: Prisma.PromotionRuleGetPayload<{ select: typeof promotionRuleSelect }>) {
  return {
    ...rule,
    allowedSkuIds: readAllowedStringArray(rule.allowedSkuIds),
    startAt: rule.startAt?.toISOString() ?? null,
    endAt: rule.endAt?.toISOString() ?? null,
    createdAt: rule.createdAt.toISOString(),
    updatedAt: rule.updatedAt.toISOString()
  };
}

function summarizeCheckIn(attendees: Array<{ checkInStatus: CheckInStatus }>) {
  return {
    total: attendees.length,
    checkedIn: attendees.filter((item) => item.checkInStatus === CheckInStatus.CHECKED_IN).length,
    pending: attendees.filter((item) => item.checkInStatus === CheckInStatus.PENDING).length,
    notRequired: attendees.filter((item) => item.checkInStatus === CheckInStatus.NOT_REQUIRED).length
  };
}

function formatUserProfile(user: Prisma.UserGetPayload<{ select: typeof adminUserProfileSelect }> | null) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    openid: user.openid,
    wechatNickname: user.wechatNickname,
    wechatAvatarUrl: user.wechatAvatarUrl,
    registeredAt: user.createdAt.toISOString(),
    lastActiveAt: user.lastActiveAt?.toISOString() ?? null
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
    groupRegistrationEnabled: readOptionalBoolean(body, "groupRegistrationEnabled"),
    maxTicketsPerOrder: readOptionalNullableNonNegativeInt(body, "maxTicketsPerOrder"),
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
  const paymentStatus = readOptionalEnum(query, "paymentStatus", PaymentStatus);
  const keyword = readOptionalString(query, "keyword");
  return {
    ...(conferenceId ? { conferenceId } : {}),
    ...(status ? { status } : {}),
    ...(paymentStatus ? { payments: { some: { status: paymentStatus } } } : {}),
    ...(keyword
      ? {
          OR: [
            { orderNo: { contains: keyword, mode: "insensitive" } },
            { attendeeName: { contains: keyword, mode: "insensitive" } },
            { phone: { contains: keyword, mode: "insensitive" } },
            { payments: { some: { outTradeNo: { contains: keyword, mode: "insensitive" } } } },
            { payments: { some: { transactionId: { contains: keyword, mode: "insensitive" } } } }
          ]
        }
      : {})
  };
}

function orderDeleteBlockReason(order: Prisma.OrderGetPayload<{ select: typeof orderDeleteSelect }>): string | null {
  if (order.status === OrderStatus.PAID || order.registration) {
    return "已支付或已生成报名记录的订单不能删除";
  }
  if (order.payments.some((payment) => payment.status === PaymentStatus.SUCCESS)) {
    return "存在成功支付流水的订单不能删除";
  }
  return null;
}

function sanitizeDeleteFilters(query: Record<string, unknown>): Prisma.InputJsonObject {
  const allowed = ["keyword", "conferenceId", "status", "paymentStatus", "onlyExceptions"];
  return Object.fromEntries(allowed.map((key) => [key, typeof query[key] === "string" || typeof query[key] === "boolean" ? query[key] : null]));
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

function readRegistrationRemark(input: unknown): string | null {
  const body = readObject(input);
  const value = body.adminRemark;
  if (value === null || typeof value === "undefined") {
    return null;
  }

  if (typeof value !== "string") {
    throw new BadRequestException("adminRemark must be a string");
  }

  const trimmed = value.trim();
  if (trimmed.length > 2000) {
    throw new BadRequestException("adminRemark is too long");
  }

  return trimmed.length > 0 ? trimmed : null;
}

function parseCouponInput(input: unknown, partial: boolean) {
  const body = readObject(input);
  return {
    code: partial ? readOptionalString(body, "code") : readRequiredString(body, "code"),
    name: partial ? readOptionalString(body, "name") : readRequiredString(body, "name"),
    type: partial ? readOptionalEnum(body, "type", CouponType) : readRequiredEnum(body, "type", CouponType),
    discountAmountCent: readOptionalNullableNonNegativeInt(body, "discountAmountCent"),
    discountPercent: readOptionalNullableBasisPoints(body, "discountPercent"),
    maxDiscountCent: readOptionalNullableNonNegativeInt(body, "maxDiscountCent"),
    minAmountCent: readOptionalNullableNonNegativeInt(body, "minAmountCent"),
    minQuantity: readOptionalNullableNonNegativeInt(body, "minQuantity"),
    totalLimit: readOptionalNullableNonNegativeInt(body, "totalLimit"),
    perUserLimit: readOptionalNullableNonNegativeInt(body, "perUserLimit"),
    enabled: readOptionalBoolean(body, "enabled"),
    startAt: readOptionalNullableDate(body, "startAt"),
    endAt: readOptionalNullableDate(body, "endAt"),
    stackableWithPromotion: readOptionalBoolean(body, "stackableWithPromotion"),
    conferenceId: readOptionalNullableString(body, "conferenceId"),
    allowedSkuIds: readOptionalNullableStringArray(body, "allowedSkuIds")
  };
}

function parsePromotionRuleInput(input: unknown, partial: boolean) {
  const body = readObject(input);
  return {
    name: partial ? readOptionalString(body, "name") : readRequiredString(body, "name"),
    conferenceId: readOptionalNullableString(body, "conferenceId"),
    allowedSkuIds: readOptionalNullableStringArray(body, "allowedSkuIds"),
    minAmountCent: readOptionalNullableNonNegativeInt(body, "minAmountCent"),
    minQuantity: readOptionalNullableNonNegativeInt(body, "minQuantity"),
    discountAmountCent: partial
      ? readOptionalNonNegativeInt(body, "discountAmountCent")
      : readRequiredNonNegativeInt(body, "discountAmountCent"),
    enabled: readOptionalBoolean(body, "enabled"),
    startAt: readOptionalNullableDate(body, "startAt"),
    endAt: readOptionalNullableDate(body, "endAt"),
    stackableWithCoupon: readOptionalBoolean(body, "stackableWithCoupon")
  };
}

function validateCouponDiscountInput(
  type: CouponType,
  request: ReturnType<typeof parseCouponInput>,
  partial = false
): void {
  if (type === CouponType.AMOUNT && !partial && typeof request.discountAmountCent !== "number") {
    throw new BadRequestException("discountAmountCent is required for amount coupon");
  }
  if (type === CouponType.PERCENT && !partial && typeof request.discountPercent !== "number") {
    throw new BadRequestException("discountPercent is required for percent coupon");
  }
  if (typeof request.startAt !== "undefined" && typeof request.endAt !== "undefined" && request.startAt && request.endAt) {
    ensureDateRange(request.startAt, request.endAt);
  }
}

function validatePromotionRuleInput(request: ReturnType<typeof parsePromotionRuleInput>): void {
  if (typeof request.startAt !== "undefined" && typeof request.endAt !== "undefined" && request.startAt && request.endAt) {
    ensureDateRange(request.startAt, request.endAt);
  }
}

function ensureDateRange(startAt: Date, endAt: Date): void {
  if (startAt > endAt) {
    throw new BadRequestException("startAt must be before endAt");
  }
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

function readOptionalNullableString(input: Record<string, unknown>, field: string): string | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  if (input[field] === null || input[field] === "") {
    return null;
  }
  return readOptionalString(input, field);
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

function readOptionalNullableNonNegativeInt(input: Record<string, unknown>, field: string): number | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  if (input[field] === null || input[field] === "") {
    return null;
  }
  return readOptionalNonNegativeInt(input, field);
}

function readOptionalNullableBasisPoints(input: Record<string, unknown>, field: string): number | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  if (input[field] === null || input[field] === "") {
    return null;
  }
  const value = input[field];
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10000) {
    throw new BadRequestException(`${field} must be an integer between 1 and 10000`);
  }
  return value;
}

function readOptionalNullableStringArray(input: Record<string, unknown>, field: string): Prisma.InputJsonArray | null | undefined {
  if (!Object.hasOwn(input, field)) {
    return undefined;
  }
  const value = input[field];
  if (value === null || value === "") {
    return null;
  }
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    throw new BadRequestException(`${field} must be an array of strings`);
  }
  return value;
}

function readAllowedStringArray(value: Prisma.JsonValue | null): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function toNullableJsonInput(value: Prisma.InputJsonArray | null | undefined) {
  if (typeof value === "undefined") {
    return undefined;
  }
  return value === null ? Prisma.DbNull : value;
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
