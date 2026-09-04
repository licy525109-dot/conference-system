import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { OrderStatus, PaymentProvider } from "@prisma/client";
import { MallPaymentCompletionService } from "../mall/mall-payment-completion.service";
import { PaymentSuccessService } from "../payments/payment-success.service";
import { isWechatPayEnabled } from "../payments/wechat-pay.config";
import { WechatPayTransactionClient, WechatPayTransactionResult } from "../payments/wechat-pay.transaction-client";
import { PrismaService } from "../prisma.service";
import { closePendingMallOrder, closePendingRegistrationOrder } from "./order-reservations";

const DEFAULT_SCAN_INTERVAL_MS = 30_000;
const BATCH_SIZE = 100;
const DEFAULT_PAYMENT_CALLBACK_GRACE_MS = 10 * 60_000;

@Injectable()
export class OrderLifecycleService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private scanning = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly wechatPayClient: WechatPayTransactionClient,
    private readonly paymentSuccessService: PaymentSuccessService,
    private readonly mallPaymentCompletionService: MallPaymentCompletionService
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === "test" || process.env.ORDER_EXPIRY_WORKER_ENABLED === "false") return;
    const intervalMs = readScanIntervalMs(process.env.ORDER_EXPIRY_SCAN_INTERVAL_MS);
    this.timer = setInterval(() => void this.closeExpiredOrders(), intervalMs);
    this.timer.unref?.();
    void this.closeExpiredOrders();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async closeExpiredOrders(now = new Date()): Promise<{ registration: number; mall: number }> {
    if (this.scanning) return { registration: 0, mall: 0 };
    this.scanning = true;
    try {
      const [registration, mall] = await Promise.all([
        this.closeExpiredRegistrationOrders(now),
        this.closeExpiredMallOrders(now)
      ]);
      return { registration, mall };
    } catch (error) {
      console.error(JSON.stringify({
        event: "ORDER_EXPIRY_SCAN_FAILED",
        message: error instanceof Error ? error.message : "unknown error"
      }));
      return { registration: 0, mall: 0 };
    } finally {
      this.scanning = false;
    }
  }

  private async closeExpiredRegistrationOrders(now: Date): Promise<number> {
    const closeBefore = new Date(now.getTime() - readPaymentCallbackGraceMs(process.env.ORDER_PAYMENT_CALLBACK_GRACE_MS));
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING, expiredAt: { lte: closeBefore } },
      orderBy: { expiredAt: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        orderNo: true,
        inventoryReservedAt: true,
        items: { select: { skuId: true, quantity: true } },
        payments: {
          where: { provider: PaymentProvider.WECHAT },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { outTradeNo: true }
        }
      }
    });
    let closed = 0;
    for (const order of orders) {
      const providerResult = await this.reconcileRegistrationWechatPayment(order, now);
      if (providerResult === "SETTLED" || providerResult === "RETRY") continue;
      const didClose = await this.prisma.$transaction((tx) =>
        closePendingRegistrationOrder(tx, order, now, "待支付订单超时自动关闭")
      );
      if (didClose) closed += 1;
    }
    return closed;
  }

  private async closeExpiredMallOrders(now: Date): Promise<number> {
    const closeBefore = new Date(now.getTime() - readPaymentCallbackGraceMs(process.env.ORDER_PAYMENT_CALLBACK_GRACE_MS));
    const orders = await this.prisma.mallOrder.findMany({
      where: { status: "PENDING_PAYMENT", expiredAt: { lte: closeBefore } },
      orderBy: { expiredAt: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        orderNo: true,
        items: { select: { skuId: true, quantity: true } },
        payments: {
          where: { provider: PaymentProvider.WECHAT },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { outTradeNo: true }
        }
      }
    });
    let closed = 0;
    for (const order of orders) {
      const providerResult = await this.reconcileMallWechatPayment(order, now);
      if (providerResult === "SETTLED" || providerResult === "RETRY") continue;
      const didClose = await this.prisma.$transaction((tx) =>
        closePendingMallOrder(tx, order, now, "商城待支付订单超时自动关闭", "ORDER_EXPIRED")
      );
      if (didClose) closed += 1;
    }
    return closed;
  }

  private async reconcileRegistrationWechatPayment(
    order: RegistrationOrderForExpiry,
    now: Date
  ): Promise<ProviderReconciliationResult> {
    const outTradeNo = order.payments[0]?.outTradeNo;
    if (!outTradeNo) return "SAFE_TO_CLOSE";
    if (!isWechatPayEnabled()) return "RETRY";
    try {
      const transaction = await this.wechatPayClient.queryByOutTradeNo(outTradeNo);
      if (transaction.tradeState === "SUCCESS") {
        await this.paymentSuccessService.processPaymentSuccess({
          provider: PaymentProvider.WECHAT,
          orderNo: order.orderNo,
          outTradeNo,
          transactionId: requireTransactionId(transaction),
          paidAmountCent: requireAmountTotal(transaction),
          paidAt: transaction.successTime ?? now,
          rawSummary: { source: "ORDER_EXPIRY_QUERY" }
        });
        return "SETTLED";
      }
      return await this.closeProviderOrderIfSafe(outTradeNo, transaction);
    } catch (error) {
      logReconciliationFailure("REGISTRATION", order.orderNo, outTradeNo, error);
      return "RETRY";
    }
  }

  private async reconcileMallWechatPayment(
    order: MallOrderForExpiry,
    now: Date
  ): Promise<ProviderReconciliationResult> {
    const outTradeNo = order.payments[0]?.outTradeNo;
    if (!outTradeNo) return "SAFE_TO_CLOSE";
    if (!isWechatPayEnabled()) return "RETRY";
    try {
      const transaction = await this.wechatPayClient.queryByOutTradeNo(outTradeNo);
      if (transaction.tradeState === "SUCCESS") {
        await this.mallPaymentCompletionService.completePayment({
          provider: PaymentProvider.WECHAT,
          outTradeNo,
          transactionId: requireTransactionId(transaction),
          paidAmountCent: requireAmountTotal(transaction),
          paidAt: transaction.successTime ?? now,
          rawSummary: { source: "ORDER_EXPIRY_QUERY" }
        });
        return "SETTLED";
      }
      return await this.closeProviderOrderIfSafe(outTradeNo, transaction);
    } catch (error) {
      logReconciliationFailure("MALL", order.orderNo, outTradeNo, error);
      return "RETRY";
    }
  }

  private async closeProviderOrderIfSafe(
    outTradeNo: string,
    transaction: WechatPayTransactionResult
  ): Promise<ProviderReconciliationResult> {
    if (["NOT_EXIST", "CLOSED", "REVOKED", "PAYERROR"].includes(transaction.tradeState)) {
      return "SAFE_TO_CLOSE";
    }
    if (["NOTPAY", "USERPAYING"].includes(transaction.tradeState)) {
      await this.wechatPayClient.closeByOutTradeNo(outTradeNo);
      return "SAFE_TO_CLOSE";
    }
    return "RETRY";
  }
}

type ProviderReconciliationResult = "SAFE_TO_CLOSE" | "SETTLED" | "RETRY";

interface RegistrationOrderForExpiry {
  id: string;
  orderNo: string;
  inventoryReservedAt: Date | null;
  items: Array<{ skuId: string; quantity: number }>;
  payments: Array<{ outTradeNo: string }>;
}

interface MallOrderForExpiry {
  id: string;
  orderNo: string;
  items: Array<{ skuId: string; quantity: number }>;
  payments: Array<{ outTradeNo: string }>;
}

function requireAmountTotal(transaction: WechatPayTransactionResult): number {
  if (!Number.isInteger(transaction.amountTotal) || (transaction.amountTotal ?? -1) < 0) {
    throw new Error("WeChat Pay query did not return a valid paid amount");
  }
  return transaction.amountTotal!;
}

function requireTransactionId(transaction: WechatPayTransactionResult): string {
  if (!transaction.transactionId) throw new Error("WeChat Pay query did not return transaction_id");
  return transaction.transactionId;
}

function logReconciliationFailure(source: "REGISTRATION" | "MALL", orderNo: string, outTradeNo: string, error: unknown): void {
  console.error(JSON.stringify({
    event: "WECHAT_PAY_ORDER_RECONCILIATION_FAILED",
    source,
    orderNo,
    outTradeNo,
    message: error instanceof Error ? error.message : "unknown error"
  }));
}

function readScanIntervalMs(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 5_000 && parsed <= 300_000
    ? parsed
    : DEFAULT_SCAN_INTERVAL_MS;
}

function readPaymentCallbackGraceMs(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 60_000 && parsed <= 30 * 60_000
    ? parsed
    : DEFAULT_PAYMENT_CALLBACK_GRACE_MS;
}
