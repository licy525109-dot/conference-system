import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { WechatPayNotifyVerifier } from "../payments/wechat-pay.notify-verifier";
import { WechatPayPrepayClient } from "../payments/wechat-pay.prepay-client";
import { WechatPaySigner } from "../payments/wechat-pay.signer";
import { PrismaService } from "../prisma.service";
import { MallController } from "./mall.controller";
import { MallPaymentCompletionService } from "./mall-payment-completion.service";
import { MallPaymentService } from "./mall-payment.service";
import { MallService } from "./mall.service";

@Module({
  imports: [AuthModule],
  controllers: [MallController],
  providers: [MallService, MallPaymentService, MallPaymentCompletionService, WechatPayPrepayClient, WechatPaySigner, WechatPayNotifyVerifier, PrismaService]
})
export class MallModule {}
