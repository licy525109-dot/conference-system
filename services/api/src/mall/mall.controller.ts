import { Controller, Get, Param, Query } from "@nestjs/common";
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
}
