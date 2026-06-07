import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma, RegistrationStatus } from "@prisma/client";
import { PrismaService } from "../prisma.service";

export interface ProcessPaymentSuccessInput {
  provider: PaymentProvider;
  orderNo: string;
  outTradeNo: string;
  transactionId?: string | null;
  paidAmountCent: number;
  paidAt: Date;
  rawSummary?: Prisma.InputJsonObject;
}

export interface ProcessPaymentSuccessResult {
  orderNo: string;
  orderStatus: "PAID";
  paymentStatus: "SUCCESS";
  registrationId: string;
}

@Injectable()
export class PaymentSuccessService {
  constructor(private readonly prisma: PrismaService) {}

  async processPaymentSuccess(input: ProcessPaymentSuccessInput): Promise<ProcessPaymentSuccessResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNo: input.orderNo },
        select: {
          id: true,
          orderNo: true,
          userId: true,
          conferenceId: true,
          skuId: true,
          payableAmountCent: true,
          status: true,
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
        const registrationId = await ensurePaidOrderRegistration(order);
        await tx.payment.upsert({
          where: { outTradeNo: input.outTradeNo },
          update: {
            provider: input.provider,
            status: PaymentStatus.SUCCESS,
            transactionId: input.transactionId ?? undefined,
            amountCent: order.payableAmountCent,
            paidAt: order.paidAt ?? input.paidAt,
            failedReason: null,
            notifyRawId: input.rawSummary ? readNotifyRawId(input.rawSummary) : undefined
          },
          create: {
            orderId: order.id,
            provider: input.provider,
            status: PaymentStatus.SUCCESS,
            outTradeNo: input.outTradeNo,
            transactionId: input.transactionId ?? undefined,
            amountCent: order.payableAmountCent,
            paidAt: order.paidAt ?? input.paidAt,
            notifyRawId: input.rawSummary ? readNotifyRawId(input.rawSummary) : undefined
          }
        });

        return { registrationId };
      }

      if (order.status !== OrderStatus.PENDING) {
        throw new ConflictException("Only pending orders can be paid");
      }

      if (input.paidAmountCent !== order.payableAmountCent) {
        throw new ConflictException("Payment amount does not match order payable amount");
      }

      const snapshot = parseRegistrationSnapshot(order.registrationSnapshotJson);

      await tx.payment.upsert({
        where: { outTradeNo: input.outTradeNo },
        update: {
          provider: input.provider,
          status: PaymentStatus.SUCCESS,
          transactionId: input.transactionId ?? undefined,
          amountCent: order.payableAmountCent,
          paidAt: input.paidAt,
          failedReason: null,
          notifyRawId: input.rawSummary ? readNotifyRawId(input.rawSummary) : undefined
        },
        create: {
          orderId: order.id,
          provider: input.provider,
          status: PaymentStatus.SUCCESS,
          outTradeNo: input.outTradeNo,
          transactionId: input.transactionId ?? undefined,
          amountCent: order.payableAmountCent,
          paidAt: input.paidAt,
          notifyRawId: input.rawSummary ? readNotifyRawId(input.rawSummary) : undefined
        }
      });

      await tx.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.PAID,
          paidAmountCent: order.payableAmountCent,
          paidAt: input.paidAt
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

      const registration = await createRegistration(tx, {
        order,
        snapshot,
        paidAt: input.paidAt
      });

      if (registration.created) {
        await tx.registrationSku.update({
          where: { id: order.skuId },
          data: {
            soldCount: {
              increment: 1
            }
          }
        });
      }

      return {
        registrationId: registration.id
      };
    });

    return {
      orderNo: input.orderNo,
      orderStatus: "PAID",
      paymentStatus: "SUCCESS",
      registrationId: result.registrationId
    };
  }
}

async function createRegistration(
  tx: Prisma.TransactionClient,
  input: {
    order: {
      id: string;
      orderNo: string;
      userId: string | null;
      conferenceId: string;
      skuId: string;
      payableAmountCent: number;
    };
    snapshot: RegistrationSnapshot;
    paidAt: Date;
  }
) {
  try {
    const registration = await tx.registration.create({
      data: {
        registrationNo: `R${input.order.orderNo}`,
        userId: input.order.userId,
        conferenceId: input.snapshot.conferenceId,
        skuId: input.snapshot.skuId,
        orderId: input.order.id,
        attendeeName: input.snapshot.attendeeName,
        phone: input.snapshot.phone,
        formDataJson: input.snapshot.formData,
        paidAmountCent: input.order.payableAmountCent,
        status: RegistrationStatus.CONFIRMED,
        confirmedAt: input.paidAt
      },
      select: { id: true }
    });
    return {
      id: registration.id,
      created: true
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const existingRegistration = await tx.registration.findUnique({
      where: { orderId: input.order.id },
      select: { id: true }
    });
    if (!existingRegistration) {
      throw error;
    }

    return {
      id: existingRegistration.id,
      created: false
    };
  }
}

async function ensurePaidOrderRegistration(order: {
  registration: { id: string } | null;
}): Promise<string> {
  if (!order.registration) {
    throw new ConflictException("Paid order registration is missing");
  }

  return order.registration.id;
}

export function parseRegistrationSnapshot(value: Prisma.JsonValue | null): RegistrationSnapshot {
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

function readNotifyRawId(rawSummary: Prisma.InputJsonObject): string | undefined {
  const value = rawSummary.id;
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUniqueConstraintError(error: unknown): boolean {
  return isRecord(error) && error.code === "P2002";
}

interface RegistrationSnapshot {
  conferenceId: string;
  skuId: string;
  attendeeName: string;
  phone: string;
  formData: Prisma.InputJsonObject;
}
