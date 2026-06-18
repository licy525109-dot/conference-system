import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PaymentSuccessService } from "../payments/payment-success.service";
import { WechatPayNotifyVerifier } from "../payments/wechat-pay.notify-verifier";
import { WechatPayService } from "../payments/wechat-pay.service";
import { WechatPaySigner } from "../payments/wechat-pay.signer";
import { PrismaService } from "../prisma.service";
import { MallController } from "./mall.controller";
import { MallPaymentSuccessService } from "./mall-payment-success.service";
import { MallPaymentService } from "./mall-payment.service";
import { MallService } from "./mall.service";

@Module({
  imports: [AuthModule],
  controllers: [MallController],
  providers: [MallService, MallPaymentService, MallPaymentSuccessService, WechatPayService, WechatPaySigner, WechatPayNotifyVerifier, PaymentSuccessService, PrismaService]
})
export class MallModule {}
