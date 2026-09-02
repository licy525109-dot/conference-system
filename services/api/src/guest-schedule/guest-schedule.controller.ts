import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GuestScheduleService } from "./guest-schedule.service";

@Controller("guest-schedules")
@UseGuards(JwtAuthGuard)
export class GuestScheduleController {
  constructor(private readonly schedules: GuestScheduleService) {}

  @Get("my")
  my(@Req() request: RequestWithCurrentUser, @Query() query: Record<string, unknown>) {
    return this.schedules.listMine(request.currentUser!, query);
  }

  @Get("subscription-config")
  subscriptionConfig() {
    return this.schedules.getSubscriptionConfig();
  }
}
