import {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  Prisma,
  RegistrationStatus
} from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";

export interface ApiResponse<TData> {
  code: "OK";
  message: "ok";
  data: TData;
}

export interface MockPaymentConfirmResponse {
  orderNo: string;
  orderStatus: "PAID";
  paymentStatus: "SUCCESS";
  registrationId: string;
}

export interface PaymentStatusResponse {
  orderNo: string;
  status: OrderStatus;
  paidAt: string | null;
  registrationId: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async confirmMockPayment(input: unknown, currentUser: CurrentUser | undefined): Promise<ApiResponse<MockPaymentConfirmResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    if (!isMockPaymentEnabled()) {
      throw new ForbiddenException("Mock payment is disabled");
    }

    const orderNo = readOrderNo(input);
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          orderNo,
          userId: currentUser.id
        },
        select: {
          id: true,
          orderNo: true,
          userId: true,
          conferenceId: true,
          skuId: true,
          payableAmountCent: true,
          status: true,
          expiredAt: true,
          registrationSnapshotJson: true,
          paidAt: true,
          registration: {
            select: {
              id: true
            }
          }
        }
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (order.status === OrderStatus.PAID) {
        if (!order.registration) {
          throw new ConflictException("Paid order registration is missing");
        }

        await tx.payment.upsert({
          where: { outTradeNo: toMockOutTradeNo(order.orderNo) },
          update: {
            status: PaymentStatus.SUCCESS,
            amountCent: order.payableAmountCent,
            paidAt: order.paidAt ?? this.getCurrentTime(),
            failedReason: null
          },
          create: {
            orderId: order.id,
            provider: PaymentProvider.MOCK,
            status: PaymentStatus.SUCCESS,
            outTradeNo: toMockOutTradeNo(order.orderNo),
            amountCent: order.payableAmountCent,
            paidAt: order.paidAt ?? this.getCurrentTime()
          }
        });

        return {
          registrationId: order.registration.id
        };
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException("Only pending orders can be paid");
      }

      const currentTime = this.getCurrentTime();
      if (order.expiredAt && order.expiredAt < currentTime) {
        throw new ConflictException("Order has expired");
      }

      const snapshot = parseRegistrationSnapshot(order.registrationSnapshotJson);

      await tx.payment.upsert({
        where: { outTradeNo: toMockOutTradeNo(order.orderNo) },
        update: {
          status: PaymentStatus.SUCCESS,
          amountCent: order.payableAmountCent,
          paidAt: currentTime,
          failedReason: null
        },
        create: {
          orderId: order.id,
          provider: PaymentProvider.MOCK,
          status: PaymentStatus.SUCCESS,
          outTradeNo: toMockOutTradeNo(order.orderNo),
          amountCent: order.payableAmountCent,
          paidAt: currentTime
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paidAmountCent: order.payableAmountCent,
          paidAt: currentTime
        }
      });

      const existingRegistration = await tx.registration.findUnique({
        where: { orderId: order.id },
        select: { id: true }
      });

      if (existingRegistration) {
        return {
          registrationId: existingRegistration.id
        };
      }

      const registration = await tx.registration.create({
        data: {
          registrationNo: `R${order.orderNo}`,
          userId: currentUser.id,
          conferenceId: snapshot.conferenceId,
          skuId: snapshot.skuId,
          orderId: order.id,
          attendeeName: snapshot.attendeeName,
          phone: snapshot.phone,
          formDataJson: snapshot.formData,
          paidAmountCent: order.payableAmountCent,
          status: RegistrationStatus.CONFIRMED,
          confirmedAt: currentTime
        },
        select: { id: true }
      });

      await tx.registrationSku.update({
        where: { id: order.skuId },
        data: {
          soldCount: {
            increment: 1
          }
        }
      });

      return {
        registrationId: registration.id
      };
    });

    return ok({
      orderNo,
      orderStatus: "PAID",
      paymentStatus: "SUCCESS",
      registrationId: result.registrationId
    });
  }

  async getPaymentStatus(orderNo: string, currentUser: CurrentUser | undefined): Promise<ApiResponse<PaymentStatusResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    const order = await this.prisma.order.findFirst({
      where: {
        orderNo,
        userId: currentUser.id
      },
      select: {
        orderNo: true,
        status: true,
        paidAt: true,
        registration: {
          select: {
            id: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return ok({
      orderNo: order.orderNo,
      status: order.status,
      paidAt: order.paidAt?.toISOString() ?? null,
      registrationId: order.registration?.id ?? null
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

function isMockPaymentEnabled(): boolean {
  return process.env.PAYMENT_MODE === "mock" || process.env.WECHAT_PAY_MOCK === "true";
}

function readOrderNo(input: unknown): string {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  const orderNo = input.orderNo;
  if (typeof orderNo !== "string" || orderNo.trim().length === 0) {
    throw new BadRequestException("orderNo is required");
  }

  return orderNo;
}

function toMockOutTradeNo(orderNo: string): string {
  return `MOCK_${orderNo}`;
}

function parseRegistrationSnapshot(value: Prisma.JsonValue | null): RegistrationSnapshot {
  if (!isRecord(value)) {
    throw new ConflictException("Order registration snapshot is missing");
  }

  const { conferenceId, skuId, attendeeName, phone, formData } = value;
  if (
    typeof conferenceId !== "string" ||
    typeof skuId !== "string" ||
    typeof attendeeName !== "string" ||
    typeof phone !== "string" ||
    !isRecord(formData)
  ) {
    throw new ConflictException("Order registration snapshot is invalid");
  }

  return {
    conferenceId,
    skuId,
    attendeeName,
    phone,
    formData: formData as Prisma.InputJsonObject
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface RegistrationSnapshot {
  conferenceId: string;
  skuId: string;
  attendeeName: string;
  phone: string;
  formData: Prisma.InputJsonObject;
}
