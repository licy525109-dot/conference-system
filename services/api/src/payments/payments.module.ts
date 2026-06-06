import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { PrismaService } from "../prisma.service";
import { OrdersController } from "./orders.controller";
import { PaymentsController } from "./payments.controller";
import { PaymentsService } from "./payments.service";

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, OrdersController],
  providers: [PaymentsService, PrismaService]
})
export class PaymentsModule {}
