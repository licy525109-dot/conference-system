import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ConferenceStatus, RegistrationSkuStatus } from "@prisma/client";
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

const FORBIDDEN_AMOUNT_FIELDS = ["originAmountCent", "discountAmountCent", "payableAmountCent"] as const;

@Injectable()
export class RegistrationService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(input: unknown): Promise<ApiResponse<RegistrationQuoteResponse>> {
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

    const quantity = 1;
    const originAmountCent = sku.priceCent * quantity;
    const discountAmountCent = 0;

    return ok({
      conferenceId,
      skuId: sku.id,
      skuName: sku.name,
      quantity,
      originAmountCent,
      discountAmountCent,
      payableAmountCent: originAmountCent
    });
  }

  protected getCurrentTime(): Date {
    return new Date();
  }
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
