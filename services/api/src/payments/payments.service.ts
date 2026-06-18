import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentSuccessService } from "./payment-success.service";
import { readWechatPayConfig } from "./wechat-pay.config";
import { WechatPayEncryptedResource, WechatPayHeaders, WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";

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
  paymentProvider: PaymentProvider | null;
  paymentStatus: PaymentStatus | null;
  registrationId: string | null;
}

export interface WechatRefundNotifySuccessResponse {
  code: "SUCCESS";
  message: "OK";
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentSuccessService: PaymentSuccessService = new PaymentSuccessService(prisma),
    private readonly refundNotifyVerifier: WechatPayNotifyVerifier = new WechatPayNotifyVerifier()
  ) {}

  async confirmMockPayment(input: unknown, currentUser: CurrentUser | undefined): Promise<ApiResponse<MockPaymentConfirmResponse>> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    if (!isMockPaymentEnabled()) {
      throw new ForbiddenException("Mock payment is disabled");
    }

    const orderNo = readOrderNo(input);
    const order = await this.prisma.order.findFirst({
      where: {
        orderNo,
        userId: currentUser.id
      },
      select: {
        orderNo: true,
        payableAmountCent: true,
        status: true,
        expiredAt: true
      }
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== OrderStatus.PENDING && order.status !== OrderStatus.PAID) {
      throw new ConflictException("Only pending or paid orders can be confirmed");
    }

    if (order.status === OrderStatus.PENDING && order.expiredAt && order.expiredAt < this.getCurrentTime()) {
      throw new ConflictException("Order has expired");
    }

    const result = await this.paymentSuccessService.processPaymentSuccess({
      provider: PaymentProvider.MOCK,
      orderNo,
      outTradeNo: toMockOutTradeNo(orderNo),
      paidAmountCent: order.payableAmountCent,
      paidAt: this.getCurrentTime()
    });

    return ok(result);
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
        payments: {
          orderBy: [{ createdAt: "desc" }],
          take: 1,
          select: {
            provider: true,
            status: true
          }
        },
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

    const latestPayment = order.payments[0] ?? null;
    return ok({
      orderNo: order.orderNo,
      status: order.status,
      paidAt: order.paidAt?.toISOString() ?? null,
      paymentProvider: latestPayment?.provider ?? null,
      paymentStatus: latestPayment?.status ?? null,
      registrationId: order.registration?.id ?? null
    });
  }

  async handleRefundNotify(input: { body: unknown; rawBody: Buffer; headers: WechatPayHeaders }): Promise<WechatRefundNotifySuccessResponse> {
    const config = readWechatPayConfig();
    this.refundNotifyVerifier.verifySignature({ headers: input.headers, rawBody: input.rawBody });
    const body = readRefundNotifyBody(input.body);
    const decrypted = this.refundNotifyVerifier.decryptResource(body.resource, config.apiV3Key);
    const refund = parseRefundNotifyResource(decrypted);
    await this.applyRefundNotify(refund);
    return { code: "SUCCESS", message: "OK" };
  }

  protected getCurrentTime(): Date {
    return new Date();
  }

  private async applyRefundNotify(input: ParsedRefundNotify) {
    const resultStatus = input.status === "SUCCESS" ? "SUCCESS" : "FAILED";
    const registrationRefund = await this.prisma.refund.findFirst({
      where: { OR: [{ outRefundNo: input.outRefundNo }, { refundNo: input.outRefundNo }] },
      include: { order: true }
    });
    if (registrationRefund) {
      if (registrationRefund.amountCent !== input.amountCent) throw new ConflictException("WeChat refund amount does not match registration refund amount");
      if (registrationRefund.status === resultStatus) return;
      await this.prisma.$transaction(async (tx) => {
        await tx.refund.update({
          where: { id: registrationRefund.id },
          data: {
            provider: PaymentProvider.WECHAT,
            providerRefundId: input.providerRefundId,
            status: resultStatus,
            processedAt: input.successTime ?? new Date(),
            failedReason: resultStatus === "FAILED" ? input.status : null
          }
        });
        if (resultStatus === "SUCCESS" && registrationRefund.order && registrationRefund.amountCent >= (registrationRefund.order.paidAmountCent ?? registrationRefund.order.payableAmountCent)) {
          await tx.order.update({ where: { id: registrationRefund.order.id }, data: { status: OrderStatus.REFUNDED } });
          await tx.registration.updateMany({ where: { orderId: registrationRefund.order.id }, data: { status: "REFUNDED" } });
        }
      });
      return;
    }

    const mallRefund = await this.prisma.mallRefund.findFirst({
      where: { OR: [{ outRefundNo: input.outRefundNo }, { refundNo: input.outRefundNo }] },
      include: { order: true }
    });
    if (!mallRefund) throw new NotFoundException("Refund out_refund_no not found");
    if (mallRefund.amountCent !== input.amountCent) throw new ConflictException("WeChat refund amount does not match mall refund amount");
    if (mallRefund.status === resultStatus) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.mallRefund.update({
        where: { id: mallRefund.id },
        data: {
          provider: PaymentProvider.WECHAT,
          providerRefundId: input.providerRefundId,
          status: resultStatus,
          processedAt: input.successTime ?? new Date(),
          failedReason: resultStatus === "FAILED" ? input.status : null
        }
      });
      if (resultStatus === "SUCCESS" && mallRefund.amountCent >= (mallRefund.order.paidAmountCent ?? mallRefund.order.payableAmountCent)) {
        await tx.mallOrder.update({ where: { id: mallRefund.mallOrderId }, data: { status: "REFUNDED" } });
        if (mallRefund.afterSaleId) await tx.mallAfterSale.update({ where: { id: mallRefund.afterSaleId }, data: { status: "COMPLETED", handledAt: input.successTime ?? new Date() } });
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

function isMockPaymentEnabled(): boolean {
  return process.env.PAYMENT_MODE === "mock" || process.env.WECHAT_PAY_MOCK === "true" || process.env.WECHAT_PAY_MODE === "mock";
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

interface RefundNotifyBody {
  id?: string;
  eventType?: string;
  resourceType?: string;
  resource: WechatPayEncryptedResource;
}

interface ParsedRefundNotify {
  outRefundNo: string;
  providerRefundId: string;
  status: string;
  amountCent: number;
  successTime: Date | null;
}

function readRefundNotifyBody(input: unknown): RefundNotifyBody {
  if (!isRecord(input)) throw new BadRequestException("Refund notify body must be a JSON object");
  const resource = input.resource;
  if (!isRecord(resource)) throw new BadRequestException("Refund notify resource is required");
  return {
    id: typeof input.id === "string" ? input.id : undefined,
    eventType: typeof input.event_type === "string" ? input.event_type : undefined,
    resourceType: typeof input.resource_type === "string" ? input.resource_type : undefined,
    resource: {
      algorithm: readRequiredString(resource, "algorithm"),
      ciphertext: readRequiredString(resource, "ciphertext"),
      nonce: readRequiredString(resource, "nonce"),
      associated_data: typeof resource.associated_data === "string" ? resource.associated_data : undefined
    }
  };
}

function parseRefundNotifyResource(input: Record<string, unknown>): ParsedRefundNotify {
  const amount = input.amount;
  if (!isRecord(amount) || !Number.isInteger(amount.refund)) throw new BadRequestException("WeChat refund notify amount.refund is required");
  const refundAmountCent = amount.refund as number;
  const successTime = typeof input.success_time === "string" ? new Date(input.success_time) : null;
  return {
    outRefundNo: readRequiredString(input, "out_refund_no"),
    providerRefundId: readRequiredString(input, "refund_id"),
    status: readRequiredString(input, "refund_status"),
    amountCent: refundAmountCent,
    successTime: successTime && !Number.isNaN(successTime.getTime()) ? successTime : null
  };
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) throw new BadRequestException(`${field} is required`);
  return value.trim();
}

function toMockOutTradeNo(orderNo: string): string {
  return `MOCK_${orderNo}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
