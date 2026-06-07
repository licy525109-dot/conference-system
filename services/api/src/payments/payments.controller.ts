import { Body, Controller, Headers, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
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
    return {
      code: "OK",
      message: "ok",
      data: await this.wechatPayService.prepay(body, request.currentUser)
    };
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
}
