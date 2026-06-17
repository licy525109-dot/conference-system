import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MallService } from "./mall.service";

@Controller("mall")
export class MallController {
  constructor(private readonly mallService: MallService) {}

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
}
