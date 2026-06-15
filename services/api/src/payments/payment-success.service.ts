import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { CheckInStatus, OrderStatus, PaymentProvider, PaymentStatus, Prisma, RegistrationStatus } from "@prisma/client";
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
          conference: {
            select: {
              checkInEnabled: true
            }
          },
          registration: {
            select: {
              id: true,
              skuId: true,
              attendeeName: true,
              phone: true,
              formDataJson: true,
              attendees: {
                take: 1,
                select: {
                  id: true
                }
              }
            }
          }
        }
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (order.status === OrderStatus.PAID) {
        const registrationId = await ensurePaidOrderRegistration(tx, order);
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

      const txWithCouponRedemption = tx as Prisma.TransactionClient & {
        couponRedemption?: {
          updateMany(args: {
            where: { orderId: string; status: "PENDING" };
            data: { status: "USED"; usedAt: Date };
          }): Promise<unknown>;
        };
      };
      await txWithCouponRedemption.couponRedemption?.updateMany({
        where: {
          orderId: order.id,
          status: "PENDING"
        },
        data: {
          status: "USED",
          usedAt: input.paidAt
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
        await createRegistrationAttendees(tx, {
          registrationId: registration.id,
          fallbackSkuId: order.skuId,
          checkInEnabled: order.conference.checkInEnabled,
          attendees: buildAttendeesFromSnapshot(snapshot)
        });

        for (const item of snapshot.items) {
          await tx.registrationSku.update({
            where: { id: item.skuId },
            data: {
              soldCount: {
                increment: item.quantity
              }
            }
          });
        }
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
      conference: {
        checkInEnabled: boolean;
      };
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
      logPaymentIdempotencyError(error, {
        orderNo: input.order.orderNo,
        orderId: input.order.id,
        reason: "unique_constraint_without_existing_registration"
      });
      throw error;
    }

    return {
      id: existingRegistration.id,
      created: false
    };
  }
}

async function ensurePaidOrderRegistration(
  tx: Prisma.TransactionClient,
  order: {
  id: string;
  orderNo: string;
  conference: {
    checkInEnabled: boolean;
  };
  registration: {
    id: string;
    skuId: string;
    attendeeName: string;
    phone: string;
    formDataJson: Prisma.JsonValue;
    attendees: { id: string }[];
  } | null;
}
): Promise<string> {
  if (!order.registration) {
    logPaymentIdempotencyError(new ConflictException("Paid order registration is missing"), {
      orderNo: order.orderNo,
      orderId: order.id,
      reason: "paid_order_missing_registration"
    });
    throw new ConflictException("Paid order registration is missing");
  }

  if (order.registration.attendees.length === 0) {
    await createRegistrationAttendees(tx, {
      registrationId: order.registration.id,
      fallbackSkuId: order.registration.skuId,
      checkInEnabled: order.conference.checkInEnabled,
      attendees: [
        {
          skuId: order.registration.skuId,
          name: order.registration.attendeeName,
          phone: order.registration.phone,
          formData: isRecord(order.registration.formDataJson)
            ? (order.registration.formDataJson as Prisma.InputJsonObject)
            : {}
        }
      ]
    });
  }

  return order.registration.id;
}

async function createRegistrationAttendees(
  tx: Prisma.TransactionClient,
  input: {
    registrationId: string;
    fallbackSkuId: string;
    checkInEnabled: boolean;
    attendees: AttendeeSnapshot[];
  }
): Promise<void> {
  const checkInStatus = input.checkInEnabled ? CheckInStatus.PENDING : CheckInStatus.NOT_REQUIRED;
  for (const attendee of input.attendees.length > 0 ? input.attendees : []) {
    await tx.registrationAttendee.create({
      data: {
        registrationId: input.registrationId,
        skuId: attendee.skuId || input.fallbackSkuId,
        name: attendee.name,
        phone: attendee.phone,
        company: attendee.company,
        title: attendee.title,
        formDataJson: attendee.formData,
        checkInStatus
      }
    });
  }
}

function buildAttendeesFromSnapshot(snapshot: RegistrationSnapshot): AttendeeSnapshot[] {
  if (snapshot.attendees.length > 0) {
    return snapshot.attendees;
  }

  return [
    {
      skuId: snapshot.skuId,
      name: snapshot.attendeeName,
      phone: snapshot.phone,
      company: readOptionalSnapshotString(snapshot.formData, "company"),
      title: readOptionalSnapshotString(snapshot.formData, "title") ?? readOptionalSnapshotString(snapshot.formData, "position"),
      formData: snapshot.formData
    }
  ];
}

function readOptionalSnapshotString(formData: Prisma.InputJsonObject, field: string): string | undefined {
  const value = formData[field];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function logPaymentIdempotencyError(
  error: unknown,
  context: {
    orderNo: string;
    orderId: string;
    reason: string;
  }
): void {
  const record = isRecord(error) ? error : {};
  console.error(
    JSON.stringify({
      event: "PAYMENT_IDEMPOTENCY_ERROR",
      orderNo: context.orderNo,
      orderId: context.orderId,
      reason: context.reason,
      "error.name": readErrorName(error),
      "error.message": readErrorMessage(error),
      "error.code": typeof record.code === "string" ? record.code : undefined
    })
  );
}

function readErrorName(error: unknown): string | undefined {
  return isRecord(error) && typeof error.name === "string" ? error.name : undefined;
}

function readErrorMessage(error: unknown): string | undefined {
  return isRecord(error) && typeof error.message === "string" ? error.message : undefined;
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

  const fallback = {
    skuId,
    name: attendeeName,
    phone,
    company: readOptionalSnapshotString(formData as Prisma.InputJsonObject, "company"),
    title:
      readOptionalSnapshotString(formData as Prisma.InputJsonObject, "title") ??
      readOptionalSnapshotString(formData as Prisma.InputJsonObject, "position"),
    formData: formData as Prisma.InputJsonObject
  };

  return {
    conferenceId,
    skuId,
    attendeeName,
    phone,
    formData: formData as Prisma.InputJsonObject,
    items: parseSnapshotItems(value, fallback.skuId),
    attendees: parseSnapshotAttendees(value, fallback)
  };
}

function parseSnapshotItems(value: Record<string, unknown>, fallbackSkuId: string): RegistrationSnapshotItem[] {
  if (!Array.isArray(value.items)) {
    return [{ skuId: fallbackSkuId, quantity: 1 }];
  }

  return value.items.map((item) => {
    if (!isRecord(item) || typeof item.skuId !== "string" || !Number.isInteger(item.quantity) || Number(item.quantity) <= 0) {
      throw new ConflictException("Order registration snapshot items are invalid");
    }

    return {
      skuId: item.skuId,
      quantity: Number(item.quantity)
    };
  });
}

function parseSnapshotAttendees(value: Record<string, unknown>, fallback: AttendeeSnapshot): AttendeeSnapshot[] {
  if (!Array.isArray(value.attendees)) {
    return [fallback];
  }

  return value.attendees.map((attendee) => {
    if (!isRecord(attendee) || typeof attendee.skuId !== "string" || !isRecord(attendee.formData)) {
      throw new ConflictException("Order registration snapshot attendees are invalid");
    }

    return {
      skuId: attendee.skuId,
      name: typeof attendee.name === "string" ? attendee.name : fallback.name,
      phone: typeof attendee.phone === "string" ? attendee.phone : "",
      company: typeof attendee.company === "string" ? attendee.company : undefined,
      title: typeof attendee.title === "string" ? attendee.title : undefined,
      formData: attendee.formData as Prisma.InputJsonObject
    };
  });
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
  items: RegistrationSnapshotItem[];
  attendees: AttendeeSnapshot[];
}

interface RegistrationSnapshotItem {
  skuId: string;
  quantity: number;
}

interface AttendeeSnapshot {
  skuId: string;
  name: string;
  phone: string;
  company?: string;
  title?: string;
  formData: Prisma.InputJsonObject;
}
