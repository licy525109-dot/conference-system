import { API_BASE_URL } from "../config";
import { getAdminToken, toQuery } from "./api";
import type {
  AdminOrder, AdminOrderDetail, AdminOrderSummary, AdminRegistration,
  AdminRegistrationAttendee, AdminRegistrationDetail,
  ApiList, Conference, FormField, Sku
} from "./types";

export interface ScopedConferenceSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: Conference["status"];
  location: string | null;
}

export type ConferenceContentInput = Pick<Conference,
  "title" | "subtitle" | "coverImage" | "location" | "startAt" | "endAt"
  | "registrationStartsAt" | "registrationEndsAt" | "groupRegistrationEnabled"
  | "maxTicketsPerOrder" | "showRegistrationCount" | "showRemainingSeats">;
export type WorkspaceSkuInput = Pick<Sku,
  "name" | "description" | "priceCent" | "groupPricingJson" | "stock" | "status"
  | "saleStartAt" | "saleEndAt" | "sortOrder">;
export type WorkspaceFieldInput = Pick<FormField,
  "fieldKey" | "label" | "type" | "required" | "placeholder" | "optionsJson"
  | "validationJson" | "sortOrder" | "enabled">;
export type RegistrationFilters = { conferenceId: string; keyword: string; status: string };
export type OrderFilters = RegistrationFilters & { paymentStatus: string; skuId: string };
type Pagination = { page: number; pageSize: number };

export interface ScopedWorkspaceUser { id: string; nickname: string | null }
export type WorkspaceOrder = Omit<AdminOrder, "user" | "adminDeletedAt" | "adminDeleteReason"> & {
  user: ScopedWorkspaceUser | null;
};
export type WorkspaceOrderDetail = WorkspaceOrder & Pick<AdminOrderDetail, "discounts" | "payments" | "registration"> & {
  submittedFormJson?: Record<string, unknown>;
  registrationSnapshotJson?: Record<string, unknown> | null;
};
export type WorkspaceRegistration = Omit<AdminRegistration, "user"> & { user: ScopedWorkspaceUser | null };
export type WorkspaceRegistrationDetail = WorkspaceRegistration & Pick<AdminRegistrationDetail, "formDataJson" | "attendees"> & {
  formFields: Array<{ key: string; label: string; type?: string }>;
  order: Pick<AdminRegistrationDetail["order"], "orderNo" | "status"> & Partial<AdminRegistrationDetail["order"]>;
};
type RemarkResult = WorkspaceRegistrationDetail | Pick<AdminRegistration, "id" | "adminRemark" | "remarkUpdatedAt">;
type CheckInResult = AdminRegistrationAttendee | Pick<AdminRegistrationAttendee, "id" | "checkInStatus" | "checkedInAt">;

export class WorkspaceRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "WorkspaceRequestError";
  }
}

const base = "/admin/conference-workspace";
const idPath = (id: string) => encodeURIComponent(id);

async function responseFor(path: string, method = "GET", input?: unknown): Promise<Response> {
  const headers = new Headers({ accept: "application/json" });
  const token = getAdminToken();
  if (!token) throw new WorkspaceRequestError("登录已失效，请重新登录", 401);
  headers.set("authorization", `Bearer ${token}`);
  if (input !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(`${API_BASE_URL}${base}${path}`, {
    method, headers, body: input === undefined ? undefined : JSON.stringify(input)
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    const message = typeof body?.message === "string" ? body.message
      : response.status === 403 ? "当前账号无权访问此会议或操作"
      : response.status === 401 ? "登录已失效，请重新登录" : `请求失败 (${response.status})`;
    throw new WorkspaceRequestError(message, response.status);
  }
  return response;
}

async function request<T>(path: string, method = "GET", input?: unknown): Promise<T> {
  const response = await responseFor(path, method, input);
  const body = await response.json() as { code?: string; message?: string; data?: T };
  if (body.code !== "OK" || body.data === undefined) {
    throw new WorkspaceRequestError(body.message || "服务器返回的数据格式不正确", response.status);
  }
  return body.data;
}

export const conferenceWorkspace = {
  conferences: (query: Pagination & { keyword: string }) =>
    request<ApiList<ScopedConferenceSummary>>(`/conferences${toQuery(query)}`),
  conference: (id: string) => request<Conference>(`/conferences/${idPath(id)}`),
  saveConference: (id: string, input: ConferenceContentInput) =>
    request<Conference>(`/conferences/${idPath(id)}`, "PATCH", input),
  skus: (id: string) => request<{ items: Sku[] }>(`/conferences/${idPath(id)}/skus`),
  createSku: (id: string, input: WorkspaceSkuInput) =>
    request<Sku>(`/conferences/${idPath(id)}/skus`, "POST", input),
  saveSku: (id: string, input: WorkspaceSkuInput) => request<Sku>(`/skus/${idPath(id)}`, "PATCH", input),
  fields: (id: string) => request<{ formId: string; items: FormField[] }>(`/conferences/${idPath(id)}/form-fields`),
  createField: (id: string, input: WorkspaceFieldInput) =>
    request<FormField>(`/conferences/${idPath(id)}/form-fields`, "POST", input),
  saveField: (id: string, input: WorkspaceFieldInput) => request<FormField>(`/form-fields/${idPath(id)}`, "PATCH", input),
  registrations: (query: RegistrationFilters & Pagination) =>
    request<ApiList<WorkspaceRegistration>>(`/registrations${toQuery(query)}`),
  registration: (id: string) => request<WorkspaceRegistrationDetail>(`/registrations/${idPath(id)}`),
  saveRemark: (id: string, adminRemark: string | null) =>
    request<RemarkResult>(`/registrations/${idPath(id)}/remark`, "PATCH", { adminRemark }),
  checkIn: (id: string) => request<CheckInResult>(`/attendees/${idPath(id)}/check-in`, "POST"),
  orders: (query: OrderFilters & Pagination) =>
    request<ApiList<WorkspaceOrder> & { summary: AdminOrderSummary }>(`/orders${toQuery(query)}`),
  order: (orderNo: string) => request<WorkspaceOrderDetail>(`/orders/${idPath(orderNo)}`),
  async exportRegistrations(query: RegistrationFilters): Promise<Blob> {
    const response = await responseFor(`/exports/registrations.xls${toQuery(query)}`);
    if (!response.headers.get("content-type")?.includes("application/vnd.ms-excel")) {
      throw new WorkspaceRequestError("导出未返回 Excel 文件，请重试", response.status);
    }
    return response.blob();
  }
};
