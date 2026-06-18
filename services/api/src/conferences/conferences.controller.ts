import { Controller, Get, Param, Query } from "@nestjs/common";
import { ConferencesService } from "./conferences.service";

@Controller("conferences")
export class ConferencesController {
  constructor(private readonly conferencesService: ConferencesService) {}

  @Get()
  list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("keyword") keyword?: string,
    @Query("tag") tag?: string,
    @Query("location") location?: string,
    @Query("category") category?: string
  ) {
    return this.conferencesService.list({ page, pageSize, keyword, tag, location, category });
  }

  @Get(":id")
  detail(@Param("id") id: string) {
    return this.conferencesService.detail(id);
  }

  @Get(":id/form")
  form(@Param("id") id: string) {
    return this.conferencesService.form(id);
  }
}
