import { Body, Controller, HttpCode, Param, Post } from "@nestjs/common";
import { GuestScheduleSyncService } from "./guest-schedule-sync.service";

@Controller("guest-schedules/smart-sheet")
export class GuestScheduleAutomationController {
  constructor(private readonly sync: GuestScheduleSyncService) {}

  @Post("automation/:token")
  @HttpCode(200)
  receive(@Param("token") token: string, @Body() body: unknown) {
    return this.sync.receiveAutomation(token, body);
  }
}
