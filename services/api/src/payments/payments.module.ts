import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminModule } from "../admin/admin.module";
import { OrdersController } from "./orders.controller";
import { MallRefundFinalizationService } from "./mall-refund-finalization.service";
import { PaymentSuccessService } from "./payment-success.service";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";
import { RegistrationRefundFinalizationService } from "./registration-refund-finalization.service";
import { WechatPayNotifyVerifier } from "./wechat-pay.notify-verifier";
import { WechatPayService } from "./wechat-pay.service";
import { WechatPaySigner } from "./wechat-pay.signer";
import { WechatPayTransactionClient } from "./wechat-pay.transaction-client";

@Module({
  imports: [AuthModule, AdminModule],
  controllers: [PaymentsController, OrdersController],
  providers: [PaymentsService, WechatPayService, WechatPaySigner, WechatPayNotifyVerifier, WechatPayTransactionClient, PaymentSuccessService, RegistrationRefundFinalizationService, MallRefundFinalizationService],
  exports: [PaymentSuccessService, WechatPayTransactionClient]
})
export class PaymentsModule {}
