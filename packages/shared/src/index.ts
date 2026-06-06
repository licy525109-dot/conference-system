export enum ConferenceStatus {
  Draft = "draft",
  Published = "published",
  Archived = "archived"
}

export enum OrderStatus {
  Pending = "pending",
  Paid = "paid",
  Closed = "closed",
  Failed = "failed"
}

export enum PaymentProvider {
  Mock = "mock",
  WeChat = "wechat"
}

export enum PaymentStatus {
  Created = "created",
  Success = "success",
  Failed = "failed"
}

export enum RegistrationStatus {
  Confirmed = "confirmed",
  Canceled = "canceled"
}

export interface HealthResponse {
  status: "ok";
  service: "conference-api";
}

export interface ApiResponse<TData> {
  code: "OK";
  message: string;
  data: TData;
}

export interface ConferenceListItemDto {
  id: string;
  title: string;
  slug: string;
  summary?: string;
  location?: string;
  startsAt: string;
  endsAt: string;
}
