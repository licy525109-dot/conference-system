import { Global, Module } from "@nestjs/common";
import { PaymentMerchantService } from "./payment-merchant.service";

@Global()
@Module({ providers: [PaymentMerchantService], exports: [PaymentMerchantService] })
export class PaymentMerchantsModule {}
