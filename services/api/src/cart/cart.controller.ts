import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CartService } from "./cart.service";

@Controller("cart")
@UseGuards(JwtAuthGuard)
export class CartController {
  constructor(private readonly cartService: CartService) {}

  @Get()
  list(@Req() request: RequestWithCurrentUser) {
    return this.cartService.list(request.currentUser!);
  }

  @Post("registration-items")
  addRegistrationItem(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.addRegistrationItem(body, request.currentUser!);
  }

  @Patch("registration-items/:id")
  updateRegistrationItem(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.updateRegistrationItem(id, body, request.currentUser!);
  }

  @Delete("registration-items/:id")
  removeRegistrationItem(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.cartService.removeRegistrationItem(id, request.currentUser!);
  }

  @Post("product-items")
  addProductItem(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.addProductItem(body, request.currentUser!);
  }

  @Patch("product-items/:id")
  updateProductItem(@Param("id") id: string, @Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.updateProductItem(id, body, request.currentUser!);
  }

  @Delete("product-items/:id")
  removeProductItem(@Param("id") id: string, @Req() request: RequestWithCurrentUser) {
    return this.cartService.removeProductItem(id, request.currentUser!);
  }

  @Post("checkout/registration")
  checkoutRegistration(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.checkoutRegistration(body, request.currentUser!);
  }

  @Post("checkout/products")
  checkoutProducts(@Body() body: unknown, @Req() request: RequestWithCurrentUser) {
    return this.cartService.checkoutProducts(body, request.currentUser!);
  }
}
