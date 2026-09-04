import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { RegistrationService } from "../registration/registration.service";
import { CartController } from "./cart.controller";
import { CartService } from "./cart.service";

@Module({
  imports: [AuthModule],
  controllers: [CartController],
  providers: [CartService, RegistrationService]
})
export class CartModule {}
