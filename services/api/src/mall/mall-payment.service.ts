import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { PaymentProvider, PaymentStatus } from "@prisma/client";
import { CurrentUser } from "../auth/current-user";
import { PrismaService } from "../prisma.service";
import { readWechatPayConfig } from "../payments/wechat-pay.config";
import { WechatPayEncryptedResource, WechatPayHeaders, WechatPayNotifyVerifier } from "../payments/wechat-pay.notify-verifier";
import { WechatPayPrepayClient } from "../payments/wechat-pay.prepay-client";
import { WechatNotifySuccessResponse, WechatPrepayResponse } from "../payments/wechat-pay.service";
import { WechatPaySigner } from "../payments/wechat-pay.signer";
import { isMallMockPaymentEnabled, isMallWechatPaymentEnabled, readMallWechatNotifyUrl } from "./mall-payment.config";
import { MallPaymentCompletionService } from "./mall-payment-completion.service";

@Injectable()
export class MallPaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentCompletionService: MallPaymentCompletionService,
    private readonly prepayClient: WechatPayPrepayClient,
    private readonly signer: WechatPaySigner,
    private readonly notifyVerifier: WechatPayNotifyVerifier
  ) {}

  async prepayWechat(orderId: string, currentUser: CurrentUser | undefined): Promise<WechatPrepayResponse> {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    if (!isMallWechatPaymentEnabled()) throw new ForbiddenException("Mall WeChat Pay is disabled");

    const order = await this.prisma.mallOrder.findFirst({
      where: { id: orderId, userId: currentUser.id },
      include: { user: true, items: { take: 1 } }
    });
    if (!order) throw new NotFoundException("商城订单不存在");
    assertMallOrderPayable(order.status, order.payableAmountCent);

    const openid = order.user?.openid ?? currentUser.openid;
    if (!openid || openid.startsWith("mock_")) throw new ConflictException("当前商城订单未绑定有效微信身份，请重新登录后支付。");

    const config = readWechatPayConfig();
    const outTradeNo = toMallWechatOutTradeNo(order.orderNo);

    await this.prisma.mallPayment.upsert({
      where: { outTradeNo },
      update: {
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        amountCent: order.payableAmountCent,
        failedReason: null
      },
      create: {
        mallOrderId: order.id,
        provider: PaymentProvider.WECHAT,
        status: PaymentStatus.PENDING,
        outTradeNo,
        amountCent: order.payableAmountCent
      }
    });

    const prepayId = await this.prepayClient.createJsapiPrepay({
      config,
      body: {
        appid: config.appId,
        mchid: config.mchId,
        description: buildMallDescription(order.items[0]?.productTitle, order.orderNo),
        out_trade_no: outTradeNo,
        notify_url: readMallWechatNotifyUrl(),
        amount: {
          total: order.payableAmountCent,
          currency: "CNY"
        },
        payer: { openid }
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

  async confirmMockPayment(orderId: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    if (!isMallMockPaymentEnabled()) throw new ForbiddenException("Mall mock payment is disabled");

    const order = await this.prisma.mallOrder.findFirst({ where: { id: orderId, userId: currentUser.id } });
    if (!order) throw new NotFoundException("商城订单不存在");
    assertMallOrderPayable(order.status, order.payableAmountCent);

    const outTradeNo = toMallMockOutTradeNo(order.orderNo);
    await this.prisma.mallPayment.upsert({
      where: { outTradeNo },
      update: {
        provider: PaymentProvider.MOCK,
        status: PaymentStatus.PENDING,
        amountCent: order.payableAmountCent,
        failedReason: null
      },
      create: {
        mallOrderId: order.id,
        provider: PaymentProvider.MOCK,
        status: PaymentStatus.PENDING,
        outTradeNo,
        amountCent: order.payableAmountCent
      }
    });

    return this.paymentCompletionService.completePayment({
      provider: PaymentProvider.MOCK,
      outTradeNo,
      transactionId: `mock-${order.orderNo}`,
      paidAmountCent: order.payableAmountCent,
      paidAt: new Date(),
      rawSummary: { id: `mock-${order.orderNo}` }
    });
  }

  async paymentStatus(orderId: string, currentUser: CurrentUser | undefined) {
    if (!currentUser) throw new UnauthorizedException("Bearer token is required");
    const order = await this.prisma.mallOrder.findFirst({
      where: { id: orderId, userId: currentUser.id },
      include: {
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        refunds: { orderBy: { createdAt: "desc" }, take: 1 },
        afterSales: { orderBy: { createdAt: "desc" }, take: 1 }
      }
    });
    if (!order) throw new NotFoundException("商城订单不存在");
    const payment = order.payments[0] ?? null;
    const refund = order.refunds[0] ?? null;
    const afterSale = order.afterSales[0] ?? null;
    return {
      orderNo: order.orderNo,
      status: order.status,
      paidAt: order.paidAt?.toISOString() ?? null,
      paidAmountCent: order.paidAmountCent,
      paymentProvider: payment?.provider ?? null,
      paymentStatus: payment?.status ?? null,
      outTradeNo: payment?.outTradeNo ?? null,
      transactionId: payment?.transactionId ?? null,
      refundStatus: refund?.status ?? null,
      afterSaleStatus: afterSale?.status ?? null
    };
  }

  async handleWechatNotify(input: {
    body: unknown;
    rawBody: Buffer;
    headers: WechatPayHeaders;
  }): Promise<WechatNotifySuccessResponse> {
    if (!isMallWechatPaymentEnabled()) throw new ForbiddenException("Mall WeChat Pay notify is disabled");

    const notifyContext: WechatNotifyLogContext = { headerSerialSuffix: input.headers.serial.slice(-6) };
    try {
      const config = readWechatPayConfig();
      this.notifyVerifier.verifySignature({ headers: input.headers, rawBody: input.rawBody });

      const body = readNotifyBody(input.body);
      notifyContext.notifyId = body.id;
      notifyContext.eventType = body.eventType;
      notifyContext.resourceType = body.resourceType;

      const decrypted = this.notifyVerifier.decryptResource(body.resource, config.apiV3Key);
      const transaction = parseTransaction(decrypted);
      notifyContext.outTradeNo = transaction.outTradeNo;
      notifyContext.transactionId = transaction.transactionId;
      notifyContext.tradeState = transaction.tradeState;

      if (transaction.tradeState !== "SUCCESS") throw new BadRequestException("WeChat Pay mall notify trade_state is not SUCCESS");
      if (!transaction.outTradeNo.startsWith("MALL_")) throw new BadRequestException("WeChat Pay mall notify out_trade_no is not a mall payment");

      const payment = await this.prisma.mallPayment.findUnique({
        where: { outTradeNo: transaction.outTradeNo },
        include: { order: { select: { payableAmountCent: true } } }
      });
      if (!payment) throw new NotFoundException("Mall payment out_trade_no not found");
      if (transaction.amountTotal !== payment.order.payableAmountCent) throw new ConflictException("WeChat Pay amount does not match mall order payable amount");

      await this.paymentCompletionService.completePayment({
        provider: PaymentProvider.WECHAT,
        outTradeNo: transaction.outTradeNo,
        transactionId: transaction.transactionId,
        paidAmountCent: transaction.amountTotal,
        paidAt: transaction.successTime ?? new Date(),
        rawSummary: {
          id: body.id,
          event_type: body.eventType,
          resource_type: body.resourceType
        }
      });
    } catch (error) {
      logMallWechatNotifyError(error, notifyContext);
      throw error;
    }

    return { code: "SUCCESS", message: "OK" };
  }
}

export function toMallWechatOutTradeNo(orderNo: string): string {
  return `MALL_${orderNo}`;
}

export function toMallMockOutTradeNo(orderNo: string): string {
  return `MALL_MOCK_${orderNo}`;
}

function assertMallOrderPayable(status: string, amountCent: number): void {
  if (status !== "PENDING_PAYMENT") throw new ConflictException("Only pending mall orders can be paid");
  if (amountCent <= 0) throw new ConflictException("Mall order payable amount must be greater than 0");
}

function buildMallDescription(productTitle: string | undefined, orderNo: string): string {
  return `商城-${productTitle || "商品"}-${orderNo}`.slice(0, 127);
}

function readNotifyBody(input: unknown): NotifyBody {
  if (!isRecord(input)) throw new BadRequestException("Notify body must be a JSON object");
  const resource = input.resource;
  if (!isRecord(resource)) throw new BadRequestException("Notify resource is required");
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
  if (!isRecord(amount) || !Number.isInteger(amount.total)) throw new BadRequestException("WeChat Pay notify amount.total is required");
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
  if (typeof value !== "string" || value.trim().length === 0) throw new BadRequestException(`${field} is required`);
  return value.trim();
}

function logMallWechatNotifyError(error: unknown, context: WechatNotifyLogContext): void {
  const record = isRecord(error) ? error : {};
  console.error(
    JSON.stringify({
      event: "MALL_WECHAT_PAY_NOTIFY_ERROR",
      notifyId: context.notifyId ?? null,
      eventType: context.eventType ?? null,
      resourceType: context.resourceType ?? null,
      outTradeNo: context.outTradeNo ?? null,
      transactionId: context.transactionId ?? null,
      tradeState: context.tradeState ?? null,
      headerSerialSuffix: context.headerSerialSuffix || null,
      "error.name": readUnknownString(record.name),
      "error.message": readUnknownString(record.message),
      "error.code": readUnknownString(record.code),
      "error.status": readUnknownNumber(record.status)
    })
  );
}

function readUnknownString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readUnknownNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface NotifyBody {
  id: string | undefined;
  eventType: string | undefined;
  resourceType: string | undefined;
  resource: WechatPayEncryptedResource;
}

interface WechatNotifyLogContext {
  notifyId?: string;
  eventType?: string;
  resourceType?: string;
  outTradeNo?: string;
  transactionId?: string;
  tradeState?: string;
  headerSerialSuffix: string;
}
