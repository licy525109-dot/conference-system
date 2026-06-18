import { Controller, Get, Param, Query } from "@nestjs/common";
import { CmsService } from "./cms.service";

@Controller()
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get("pages/:pageKey/published")
  getPublishedPage(@Param("pageKey") pageKey: string, @Query("conferenceId") conferenceId?: string, @Query("productId") productId?: string) {
    return this.cmsService.getPublishedPage(pageKey, { conferenceId, productId });
  }

  @Get("app/theme")
  getTheme() {
    return this.cmsService.getTheme();
  }

  @Get("app/tabbar")
  getTabbar() {
    return this.cmsService.getTabbar();
  }
}
