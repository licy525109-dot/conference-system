import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { ConferenceStatus, FormFieldType, OrderStatus, Prisma, RegistrationSkuStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface RegistrationQuoteResponse {
  conferenceId: string;
  skuId: string;
  skuName: string;
  quantity: 1;
  originAmountCent: number;
  discountAmountCent: 0;
  payableAmountCent: number;
}

export interface RegistrationOrderResponse extends RegistrationQuoteResponse {
  orderNo: string;
  status: "PENDING";
  expiredAt: string;
}

type RegistrationFormData = Record<string, Prisma.InputJsonValue>;

const FORBIDDEN_AMOUNT_FIELDS = [
  "originAmountCent",
  "discountAmountCent",
  "payableAmountCent",
  "totalAmountCent",
  "paidAmountCent"
] as const;
const ORDER_EXPIRES_IN_MS = 15 * 60 * 1000;
const MAX_ORDER_NO_ATTEMPTS = 5;

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: unknown): Promise<ApiResponse<RegistrationQuoteResponse>> {
    const request = parseBaseRegistrationRequest(input);
    const sku = await this.getQuotableSku(request.conferenceId, request.skuId);
    const amount = calculateAmount(sku.priceCent, request.quantity);

    return ok({
      conferenceId: request.conferenceId,
      skuId: sku.id,
      skuName: sku.name,
      quantity: request.quantity,
      ...amount
    });
  }

  async createOrder(input: unknown, currentUser: CurrentUser | undefined): Promise<ApiResponse<RegistrationOrderResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    const request = parseBaseRegistrationRequest(input);
    const formData = readFormData(input);
    await this.ensurePublishedConference(request.conferenceId);
    const sku = await this.getOrderableSku(request.conferenceId, request.skuId);
    const fields = await this.getEnabledFormFields(request.conferenceId);
    const validatedFormData = validateFormData(fields, formData);
    const attendeeName = readOptionalFormString(validatedFormData, "name") ?? currentUser.nickname ?? "未填写";
    const phone = readOptionalFormString(validatedFormData, "phone") ?? "";
    const amount = calculateAmount(sku.priceCent, request.quantity);
    const expiredAt = new Date(this.getCurrentTime().getTime() + ORDER_EXPIRES_IN_MS);
    const snapshot = {
      conferenceId: request.conferenceId,
      skuId: sku.id,
      skuName: sku.name,
      attendeeName,
      phone,
      formData: validatedFormData
    } satisfies Prisma.InputJsonObject;

    const order = await this.createPendingOrderWithRetry({
      userId: currentUser.id,
      conferenceId: request.conferenceId,
      skuId: sku.id,
      skuName: sku.name,
      quantity: request.quantity,
      attendeeName,
      phone,
      expiredAt,
      submittedFormJson: validatedFormData,
      registrationSnapshotJson: snapshot,
      originAmountCent: amount.originAmountCent,
      payableAmountCent: amount.payableAmountCent
    });

    return ok({
      orderNo: order.orderNo,
      status: "PENDING",
      conferenceId: request.conferenceId,
      skuId: sku.id,
      skuName: sku.name,
      quantity: request.quantity,
      ...amount,
      expiredAt: order.expiredAt.toISOString()
    });
  }

  protected getCurrentTime(): Date {
    return new Date();
  }

  protected generateOrderNo(): string {
    const date = this.getCurrentTime().toISOString().slice(0, 10).replaceAll("-", "");
    const randomPart = Math.random().toString(36).slice(2, 10).toUpperCase().padEnd(8, "0");
    return `REG${date}${randomPart}`;
  }

  private async ensurePublishedConference(conferenceId: string): Promise<void> {
    const conference = await this.prisma.conference.findFirst({
      where: {
        id: conferenceId,
        status: ConferenceStatus.PUBLISHED
      },
      select: {
        id: true
      }
    });

    if (!conference) {
      throw new NotFoundException("Conference not found");
    }
  }

  private async getQuotableSku(conferenceId: string, skuId: string) {
    await this.ensurePublishedConference(conferenceId);
    return this.getOrderableSku(conferenceId, skuId);
  }

  private async getOrderableSku(conferenceId: string, skuId: string) {
    const sku = await this.prisma.registrationSku.findFirst({
      where: {
        id: skuId,
        conferenceId
      },
      select: {
        id: true,
        name: true,
        priceCent: true,
        stock: true,
        soldCount: true,
        status: true,
        saleStartAt: true,
        saleEndAt: true
      }
    });

    if (!sku) {
      throw new NotFoundException("Registration SKU not found");
    }

    if (sku.status !== RegistrationSkuStatus.ACTIVE) {
      throw new ConflictException("Registration SKU is not active");
    }

    if (sku.stock - sku.soldCount <= 0) {
      throw new ConflictException("Registration SKU is out of stock");
    }

    const currentTime = this.getCurrentTime();
    if (sku.saleStartAt && sku.saleStartAt > currentTime) {
      throw new ConflictException("Registration SKU sale has not started");
    }

    if (sku.saleEndAt && sku.saleEndAt < currentTime) {
      throw new ConflictException("Registration SKU sale has ended");
    }

    return sku;
  }

  private async getEnabledFormFields(conferenceId: string): Promise<FormFieldConfig[]> {
    const formDefinition = await this.prisma.formDefinition.findFirst({
      where: {
        conferenceId,
        conference: {
          status: ConferenceStatus.PUBLISHED
        }
      },
      select: {
        fields: {
          where: { enabled: true },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            label: true,
            fieldKey: true,
            type: true,
            required: true,
            optionsJson: true
          }
        }
      }
    });

    if (!formDefinition) {
      throw new BadRequestException("Registration form is not configured");
    }

    return formDefinition.fields;
  }

  private async createPendingOrderWithRetry(input: CreatePendingOrderInput) {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_ORDER_NO_ATTEMPTS; attempt += 1) {
      try {
        const orderNo = this.generateOrderNo();
        return await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNo,
              userId: input.userId,
              conferenceId: input.conferenceId,
              skuId: input.skuId,
              originAmountCent: input.originAmountCent,
              payableAmountCent: input.payableAmountCent,
              status: OrderStatus.PENDING,
              submittedFormJson: input.submittedFormJson,
              registrationSnapshotJson: input.registrationSnapshotJson,
              attendeeName: input.attendeeName,
              phone: input.phone,
              expiredAt: input.expiredAt
            },
            select: {
              id: true,
              orderNo: true,
              expiredAt: true
            }
          });

          await tx.orderItem.create({
            data: {
              orderId: order.id,
              skuId: input.skuId,
              skuName: input.skuName,
              unitPriceCent: input.originAmountCent,
              quantity: input.quantity,
              totalAmountCent: input.originAmountCent
            }
          });

          return {
            orderNo: order.orderNo,
            expiredAt: order.expiredAt ?? input.expiredAt
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        lastError = error;
      }
    }

    throw new ConflictException("Unable to generate unique order number", { cause: lastError });
  }
}

function parseBaseRegistrationRequest(input: unknown): BaseRegistrationRequest {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  const forbiddenAmountField = FORBIDDEN_AMOUNT_FIELDS.find((field) => Object.hasOwn(input, field));
  if (forbiddenAmountField) {
    throw new BadRequestException(`Request must not include ${forbiddenAmountField}`);
  }

  const conferenceId = readRequiredString(input, "conferenceId");
  const skuId = readRequiredString(input, "skuId");

  if (input.quantity !== 1) {
    throw new BadRequestException("quantity must be 1");
  }

  return {
    conferenceId,
    skuId,
    quantity: 1
  };
}

function calculateAmount(priceCent: number, quantity: 1) {
  const originAmountCent = priceCent * quantity;
  const discountAmountCent = 0;
  return {
    originAmountCent,
    discountAmountCent,
    payableAmountCent: originAmountCent
  } as const;
}

function readFormData(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  const formData = input.formData;
  if (!isRecord(formData)) {
    throw new BadRequestException("formData must be a JSON object");
  }

  return formData;
}

function validateFormData(fields: FormFieldConfig[], formData: Record<string, unknown>): RegistrationFormData {
  const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
  const unknownField = Object.keys(formData).find((key) => !fieldByKey.has(key));
  if (unknownField) {
    throw new BadRequestException(`Unknown form field: ${unknownField}`);
  }

  const validatedFormData: RegistrationFormData = {};
  for (const field of fields) {
    const value = formData[field.fieldKey];
    if (field.required && isEmptyValue(value)) {
      throw new BadRequestException(`${field.label} is required`);
    }

    if (isEmptyValue(value)) {
      continue;
    }

    validatedFormData[field.fieldKey] = validateFieldValue(field, value);
  }

  return validatedFormData;
}

function validateFieldValue(field: FormFieldConfig, value: unknown): Prisma.InputJsonValue {
  switch (field.type) {
    case FormFieldType.PHONE:
      return validateStringField(field, value, /^1[3-9]\d{9}$/, "phone format is invalid");
    case FormFieldType.EMAIL:
      return validateStringField(field, value, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "email format is invalid");
    case FormFieldType.SELECT:
    case FormFieldType.RADIO: {
      const text = validateStringField(field, value);
      ensureValueInOptions(field, text);
      return text;
    }
    case FormFieldType.CHECKBOX: {
      if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
        throw new BadRequestException(`${field.label} must be an array of strings`);
      }

      for (const item of value) {
        ensureValueInOptions(field, item);
      }

      return value;
    }
    case FormFieldType.TEXT:
    case FormFieldType.TEXTAREA:
    case FormFieldType.DATE:
      return validateStringField(field, value);
    default:
      throw new BadRequestException(`${field.label} type is not supported`);
  }
}

function validateStringField(field: FormFieldConfig, value: unknown, pattern?: RegExp, message?: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field.label} must be a non-empty string`);
  }

  if (pattern && !pattern.test(value)) {
    throw new BadRequestException(`${field.label} ${message ?? "format is invalid"}`);
  }

  return value;
}

function ensureValueInOptions(field: FormFieldConfig, value: string): void {
  const allowedValues = getOptionValues(field.optionsJson);
  if (allowedValues.length > 0 && !allowedValues.includes(value)) {
    throw new BadRequestException(`${field.label} value is not allowed`);
  }
}

function getOptionValues(value: Prisma.JsonValue | null): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((option) => {
    if (typeof option === "string") {
      return [option];
    }

    if (isRecord(option) && typeof option.value === "string") {
      return [option.value];
    }

    return [];
  });
}

function readOptionalFormString(formData: RegistrationFormData, field: "name" | "phone"): string | null {
  const value = formData[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  return value;
}

function ok<TData>(data: TData): ApiResponse<TData> {
  return {
    code: "OK",
    message: "ok",
    data
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredString(input: Record<string, unknown>, field: "conferenceId" | "skuId"): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value;
}

function isEmptyValue(value: unknown): boolean {
  return (
    typeof value === "undefined" ||
    value === null ||
    (typeof value === "string" && value.trim().length === 0) ||
    (Array.isArray(value) && value.length === 0)
  );
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === "P2002";
}

interface BaseRegistrationRequest {
  conferenceId: string;
  skuId: string;
  quantity: 1;
}

interface FormFieldConfig {
  label: string;
  fieldKey: string;
  type: FormFieldType;
  required: boolean;
  optionsJson: Prisma.JsonValue | null;
}

interface CreatePendingOrderInput {
  userId: string;
  conferenceId: string;
  skuId: string;
  skuName: string;
  quantity: 1;
  attendeeName: string;
  phone: string;
  expiredAt: Date;
  submittedFormJson: Prisma.InputJsonObject;
  registrationSnapshotJson: Prisma.InputJsonObject;
  originAmountCent: number;
  payableAmountCent: number;
}
