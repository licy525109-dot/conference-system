import { Body, Controller, Headers, HttpCode, HttpException, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { PaymentsService } from "./payments.service";
import { WechatPayService } from "./wechat-pay.service";

interface RequestWithRawBody {
  rawBody?: Buffer;
}

@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly wechatPayService: WechatPayService
  ) {}

  @Post("mock/confirm")
  @UseGuards(JwtAuthGuard)
  confirmMockPayment(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.paymentsService.confirmMockPayment(body, request.currentUser);
  }

  @Post("wechat/prepay")
  @UseGuards(JwtAuthGuard)
  async prepayWechat(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    try {
      return {
        code: "OK",
        message: "ok",
        data: await this.wechatPayService.prepay(body, request.currentUser)
      };
    } catch (error) {
      throw normalizeWechatPrepayException(error);
    }
  }

  @Post("wechat/notify")
  @HttpCode(200)
  notifyWechat(
    @Body() body: unknown,
    @Req() request: RequestWithRawBody,
    @Headers("wechatpay-timestamp") timestamp: string | undefined,
    @Headers("wechatpay-nonce") nonce: string | undefined,
    @Headers("wechatpay-signature") signature: string | undefined,
    @Headers("wechatpay-serial") serial: string | undefined
  ) {
    return this.wechatPayService.handleNotify({
      body,
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(body), "utf8"),
      headers: {
        timestamp: timestamp ?? "",
        nonce: nonce ?? "",
        signature: signature ?? "",
        serial: serial ?? ""
      }
    });
  }

  @Post("wechat/refund-notify")
  @HttpCode(200)
  refundNotifyWechat(
    @Body() body: unknown,
    @Req() request: RequestWithRawBody,
    @Headers("wechatpay-timestamp") timestamp: string | undefined,
    @Headers("wechatpay-nonce") nonce: string | undefined,
    @Headers("wechatpay-signature") signature: string | undefined,
    @Headers("wechatpay-serial") serial: string | undefined
  ) {
    return this.paymentsService.handleRefundNotify({
      body,
      rawBody: request.rawBody ?? Buffer.from(JSON.stringify(body), "utf8"),
      headers: {
        timestamp: timestamp ?? "",
        nonce: nonce ?? "",
        signature: signature ?? "",
        serial: serial ?? ""
      }
    });
  }
}

function normalizeWechatPrepayException(error: unknown): HttpException {
  if (error instanceof HttpException) {
    const statusCode = error.getStatus();
    const response = error.getResponse();
    if (isRecord(response)) {
      const message = readResponseMessage(response) ?? error.message;
      return new HttpException(
        {
          code: typeof response.code === "string" ? response.code : buildErrorCode(statusCode),
          message,
          statusCode,
          detail: response.detail ?? message
        },
        statusCode
      );
    }

    return new HttpException(
      {
        code: buildErrorCode(statusCode),
        message: typeof response === "string" ? response : error.message,
        statusCode,
        detail: typeof response === "string" ? response : error.message
      },
      statusCode
    );
  }

  return new HttpException(
    {
      code: "WECHAT_PAY_PREPAY_ERROR",
      message: "WeChat Pay prepay request failed",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      detail: error instanceof Error ? error.message : "WeChat Pay prepay request failed"
    },
    HttpStatus.INTERNAL_SERVER_ERROR
  );
}

function readResponseMessage(response: Record<string, unknown>): string | undefined {
  if (typeof response.message === "string") {
    return response.message;
  }

  if (Array.isArray(response.message)) {
    return response.message.join("; ");
  }

  return undefined;
}

function buildErrorCode(statusCode: number): string {
  return `WECHAT_PAY_PREPAY_${statusCode}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
