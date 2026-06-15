import { Controller, Get, Param } from "@nestjs/common";
import { CmsService } from "./cms.service";

@Controller()
export class CmsController {
  constructor(private readonly cmsService: CmsService) {}

  @Get("pages/:pageKey/published")
  getPublishedPage(@Param("pageKey") pageKey: string) {
    return this.cmsService.getPublishedPage(pageKey);
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
