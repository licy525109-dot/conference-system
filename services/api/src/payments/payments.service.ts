import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { OrderStatus, PaymentProvider, PaymentStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentSuccessService } from "./payment-success.service";

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

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentSuccessService: PaymentSuccessService = new PaymentSuccessService(prisma)
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

function toMockOutTradeNo(orderNo: string): string {
  return `MOCK_${orderNo}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
