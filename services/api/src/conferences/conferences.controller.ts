import { Controller, Get, Param, Query } from "@nestjs/common";
import { ConferencesService } from "./conferences.service";

@Controller("conferences")
export class ConferencesController {
  constructor(private readonly conferencesService: ConferencesService) {}

  @Get()
  list(@Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    return this.conferencesService.list({ page, pageSize });
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
