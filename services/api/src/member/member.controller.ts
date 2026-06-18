import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { RequestWithCurrentUser } from "../auth/current-user";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { MemberService } from "./member.service";

@Controller("member")
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get("levels")
  levels() {
    return this.memberService.levels();
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  mine(@Req() request: RequestWithCurrentUser) {
    return this.memberService.mine(request.currentUser);
  }

  @Get("center")
  @UseGuards(JwtAuthGuard)
  center(@Req() request: RequestWithCurrentUser) {
    return this.memberService.center(request.currentUser);
  }

  @Get("benefits")
  @UseGuards(JwtAuthGuard)
  benefits(@Req() request: RequestWithCurrentUser) {
    return this.memberService.benefits(request.currentUser);
  }
}
