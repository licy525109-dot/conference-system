import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { OrderStatus, PaymentProvider, PaymentStatus, Prisma } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { PaymentSuccessService } from "./payment-success.service";
import { isWechatPayEnabled, readWechatPayConfig, WechatPayConfig } from "./wechat-pay.config";
import { WechatPayNotifyVerifier, WechatPayEncryptedResource, WechatPayHeaders } from "./wechat-pay.notify-verifier";
import { WechatPaySigner } from "./wechat-pay.signer";

export interface WechatPrepayResponse {
  orderNo: string;
  outTradeNo: string;
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: "RSA";
  paySign: string;
}

export interface WechatNotifySuccessResponse {
  code: "SUCCESS";
  message: "OK";
}

const JSAPI_PREPAY_URL = "https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi";
const WECHAT_PAY_HTTP_TIMEOUT_MS = 5000;

@Injectable()
export class WechatPayService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentSuccessService: PaymentSuccessService,
    private readonly signer: WechatPaySigner,
    private readonly notifyVerifier: WechatPayNotifyVerifier
  ) {}

  async prepay(input: unknown, currentUser: CurrentUser | undefined): Promise<WechatPrepayResponse> {
    if (!currentUser) {
      throw new UnauthorizedException("Bearer token is required");
    }

    if (!isWechatPayEnabled()) {
      throw new ForbiddenException("Real WeChat Pay is disabled. Use /api/payments/mock/confirm in local development.");
    }

    const orderNo = readOrderNo(input);
    const order = await this.prisma.order.findFirst({
      where: {
        orderNo,
        userId: currentUser.id
      },
      select: {
        id: true,
        orderNo: true,
        payableAmountCent: true,
        status: true,
        expiredAt: true,
        conference: {
          select: {
            title: true
          }
        },
        user: {
          select: {
            openid: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== OrderStatus.PENDING) {
      throw new ConflictException("Only pending orders can be prepaid");
    }

    if (order.expiredAt && order.expiredAt < this.getCurrentTime()) {
      throw new ConflictException("Order has expired");
    }

    if (order.payableAmountCent <= 0) {
      throw new ConflictException("Order payable amount must be greater than 0");
    }

    const openid = order.user?.openid;
    if (!openid || openid.startsWith("mock_")) {
      throw new ConflictException("A real WeChat openid is required for WeChat Pay");
    }

    const config = readWechatPayConfig();
    const outTradeNo = toWechatOutTradeNo(order.orderNo);

    await this.prisma.payment.upsert({
      where: { outTradeNo },
      update: {
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        amountCent: order.payableAmountCent,
        failedReason: null
      },
      create: {
        orderId: order.id,
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        outTradeNo,
        amountCent: order.payableAmountCent
      }
    });

    const prepayId = await this.createJsapiPrepay({
      config,
      body: {
        appid: config.appId,
        mchid: config.mchId,
        description: buildDescription(order.conference.title, order.orderNo),
        out_trade_no: outTradeNo,
        notify_url: config.notifyUrl,
        amount: {
          total: order.payableAmountCent,
          currency: "CNY"
        },
        payer: {
          openid
        }
      }
    });

    return {
      orderNo: order.orderNo,
      outTradeNo,
      ...this.signer.createRequestPaymentParams({
        appId: config.appId,
        prepayId,
        privateKeyPem: config.privateKeyPem
      })
    };
  }

  async handleNotify(input: {
    body: unknown;
    rawBody: Buffer;
    headers: WechatPayHeaders;
  }): Promise<WechatNotifySuccessResponse> {
    if (!isWechatPayEnabled()) {
      throw new ForbiddenException("Real WeChat Pay notify is disabled");
    }

    const config = readWechatPayConfig();
    this.notifyVerifier.verifySignature({
      headers: input.headers,
      rawBody: input.rawBody
    });

    const body = readNotifyBody(input.body);
    const decrypted = this.notifyVerifier.decryptResource(body.resource, config.apiV3Key);
    const transaction = parseTransaction(decrypted);

    if (transaction.tradeState !== "SUCCESS") {
      throw new BadRequestException("WeChat Pay notify trade_state is not SUCCESS");
    }

    const payment = await this.prisma.payment.findUnique({
      where: { outTradeNo: transaction.outTradeNo },
      select: {
        outTradeNo: true,
        order: {
          select: {
            orderNo: true,
            payableAmountCent: true
          }
        }
      }
    });

    if (!payment) {
      throw new NotFoundException("Payment out_trade_no not found");
    }

    if (transaction.amountTotal !== payment.order.payableAmountCent) {
      throw new ConflictException("WeChat Pay amount does not match order payable amount");
    }

    await this.paymentSuccessService.processPaymentSuccess({
      provider: PaymentProvider.WECHAT,
      orderNo: payment.order.orderNo,
      outTradeNo: transaction.outTradeNo,
      transactionId: transaction.transactionId,
      paidAmountCent: transaction.amountTotal,
      paidAt: transaction.successTime ?? this.getCurrentTime(),
      rawSummary: {
        id: body.id,
        event_type: body.eventType,
        resource_type: body.resourceType
      }
    });

    return {
      code: "SUCCESS",
      message: "OK"
    };
  }

  protected getCurrentTime(): Date {
    return new Date();
  }

  protected async createJsapiPrepay(input: {
    config: WechatPayConfig;
    body: Record<string, unknown>;
  }): Promise<string> {
    const body = JSON.stringify(input.body);
    const authorization = this.signer.createAuthorization({
      method: "POST",
      urlPathWithQuery: "/v3/pay/transactions/jsapi",
      body,
      config: input.config
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WECHAT_PAY_HTTP_TIMEOUT_MS);

    try {
      const response = await fetch(JSAPI_PREPAY_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          authorization
        },
        body,
        signal: controller.signal
      });

      const payload = (await response.json().catch(() => ({}))) as unknown;
      if (!response.ok) {
        throw new BadGatewayException("WeChat Pay prepay request failed");
      }

      if (!isRecord(payload) || typeof payload.prepay_id !== "string" || payload.prepay_id.length === 0) {
        throw new BadGatewayException("WeChat Pay prepay response is invalid");
      }

      return payload.prepay_id;
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error;
      }
      if (isAbortError(error)) {
        throw new GatewayTimeoutException("WeChat Pay prepay request timed out");
      }
      throw new BadGatewayException("WeChat Pay prepay request failed");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function readOrderNo(input: unknown): string {
  if (!isRecord(input)) {
    throw new BadRequestException("Request body must be a JSON object");
  }

  const orderNo = input.orderNo;
  if (typeof orderNo !== "string" || orderNo.trim().length === 0) {
    throw new BadRequestException("orderNo is required");
  }

  return orderNo.trim();
}

function readNotifyBody(input: unknown): NotifyBody {
  if (!isRecord(input)) {
    throw new BadRequestException("Notify body must be a JSON object");
  }

  const resource = input.resource;
  if (!isRecord(resource)) {
    throw new BadRequestException("Notify resource is required");
  }

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

function parseTransaction(input: Record<string, unknown>) {
  const outTradeNo = readRequiredString(input, "out_trade_no");
  const transactionId = readRequiredString(input, "transaction_id");
  const tradeState = readRequiredString(input, "trade_state");
  const amount = input.amount;
  if (!isRecord(amount) || !Number.isInteger(amount.total)) {
    throw new BadRequestException("WeChat Pay notify amount.total is required");
  }

  const successTimeValue = input.success_time;
  return {
    outTradeNo,
    transactionId,
    tradeState,
    amountTotal: amount.total,
    successTime: typeof successTimeValue === "string" ? new Date(successTimeValue) : null
  };
}

function readRequiredString(input: Record<string, unknown>, field: string): string {
  const value = input[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new BadRequestException(`${field} is required`);
  }

  return value;
}

function buildDescription(conferenceTitle: string, orderNo: string): string {
  return `会议报名-${conferenceTitle}-${orderNo}`.slice(0, 127);
}

export function toWechatOutTradeNo(orderNo: string): string {
  return `WECHAT_${orderNo}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

interface NotifyBody {
  id: string | undefined;
  eventType: string | undefined;
  resourceType: string | undefined;
  resource: WechatPayEncryptedResource;
}
