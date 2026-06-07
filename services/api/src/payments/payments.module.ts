import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { OrdersController } from "./orders.controller";
import { PaymentSuccessService } from "./payment-success.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPayService } from "./wechat-pay.service";
import { WechatPaySigner } from "./wechat-pay.signer";

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, OrdersController],
  providers: [PaymentsService, WechatPayService, WechatPaySigner, WechatPayNotifyVerifier, PaymentSuccessService, PrismaService]
})
export class PaymentsModule {}
