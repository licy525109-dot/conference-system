import { Module } from "@nestjs/common";
import { MallModule } from "../mall/mall.module";
import { PaymentsModule } from "../payments/payments.module";
import { OrderLifecycleService } from "./order-lifecycle.service";

@Module({
  imports: [PaymentsModule, MallModule],
  providers: [OrderLifecycleService],
  exports: [OrderLifecycleService]
})
export class OrderLifecycleModule {}
