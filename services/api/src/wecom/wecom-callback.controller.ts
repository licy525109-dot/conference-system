import { Controller, Get, Post, Query, Req } from "@nestjs/common";
import { WecomCallbackService } from "./services/wecom-callback.service";

interface RawBodyRequest {
  rawBody?: Buffer;
  body?: unknown;
}

@Controller("wecom")
export class WecomCallbackController {
  constructor(private readonly service: WecomCallbackService) {}

  @Get("customer-contact/callback")
  verifyCustomerContact(@Query() query: Record<string, unknown>) {
    return this.service.verify("customer_contact", query);
  }

  @Post("customer-contact/callback")
  receiveCustomerContact(@Query() query: Record<string, unknown>, @Req() request: RawBodyRequest) {
    return this.service.receive("customer_contact", query, rawBodyText(request));
  }

  @Get("app/callback")
  verifyApp(@Query() query: Record<string, unknown>) {
    return this.service.verify("app", query);
  }

  @Post("app/callback")
  receiveApp(@Query() query: Record<string, unknown>, @Req() request: RawBodyRequest) {
    return this.service.receive("app", query, rawBodyText(request));
  }
}

function rawBodyText(request: RawBodyRequest): string {
  if (request.rawBody) return request.rawBody.toString("utf8");
  if (typeof request.body === "string") return request.body;
  if (request.body) return JSON.stringify(request.body);
  return "";
}
