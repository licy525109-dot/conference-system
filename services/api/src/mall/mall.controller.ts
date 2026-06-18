import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MallPaymentService } from "./mall-payment.service";
import { MallService } from "./mall.service";

@Controller("mall")
export class MallController {
  constructor(
    private readonly mallService: MallService,
    private readonly mallPaymentService: MallPaymentService
  ) {}

  @Get("categories")
  categories() {
    return this.mallService.categories();
  }

  @Get("products")
  products(@Query() query: { page?: string; pageSize?: string; categoryId?: string; keyword?: string }) {
    return this.mallService.products(query);
  }

  @Get("products/:id")
  detail(@Param("id") id: string) {
    return this.mallService.detail(id);
  }

  @Post("orders")
  @UseGuards(JwtAuthGuard)
  createOrder(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.mallService.createOrder(body, request.currentUser);
  }

  @Get("my/orders")
  @UseGuards(JwtAuthGuard)
  myOrders(@Req() request: RequestWithCurrentUser) {
    return this.mallService.myOrders(request.currentUser);
  }

  @Get("my/orders/:id")
  @UseGuards(JwtAuthGuard)
  myOrder(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.mallService.myOrder(id, request.currentUser);
  }

  @Post("orders/:id/payments/wechat/prepay")
  @UseGuards(JwtAuthGuard)
  async prepayWechat(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return ok(await this.mallPaymentService.prepayWechat(id, request.currentUser));
  }

  @Post("orders/:id/payments/mock-pay")
  @UseGuards(JwtAuthGuard)
  async mockPay(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return ok(await this.mallPaymentService.confirmMockPayment(id, request.currentUser));
  }

  @Get("orders/:id/payment-status")
  @UseGuards(JwtAuthGuard)
  async paymentStatus(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return ok(await this.mallPaymentService.paymentStatus(id, request.currentUser));
  }

  @Post("payments/wechat/notify")
  @HttpCode(200)
  notifyWechat(
    @Body() body: unknown,
    @Req() request: RequestWithRawBody,
    @Headers("wechatpay-timestamp") timestamp: string | undefined,
    @Headers("wechatpay-nonce") nonce: string | undefined,
    @Headers("wechatpay-signature") signature: string | undefined,
    @Headers("wechatpay-serial") serial: string | undefined
  ) {
    return this.mallPaymentService.handleWechatNotify({
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

function ok<T>(data: T) {
  return { code: "OK" as const, message: "ok" as const, data };
}

interface RequestWithRawBody {
  rawBody?: Buffer;
}
