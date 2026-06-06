import { apiRequest, setAdminToken, toQuery } from "./api";
import type { AdminOrder, AdminRegistration, AdminUser, ApiList, Conference, FormField, Sku } from "./types";

export async function loginAdmin(username: string, password: string): Promise<AdminUser> {
  const data = await apiRequest<{ token: string; admin: AdminUser }>("/admin/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password })
  });
  setAdminToken(data.token);
  return data.admin;
}

export function getAdminMe(): Promise<{ admin: AdminUser }> {
  return apiRequest<{ admin: AdminUser }>("/admin/auth/me");
}

export function listConferences(params: { page?: number; pageSize?: number; keyword?: string; status?: string }) {
  return apiRequest<ApiList<Conference>>(`/admin/conferences${toQuery(params)}`);
}

export function createConference(input: Record<string, unknown>) {
  return apiRequest<Conference>("/admin/conferences", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateConference(id: string, input: Record<string, unknown>) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function updateConferenceStatus(id: string, status: string) {
  return apiRequest<Conference>(`/admin/conferences/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function listSkus(conferenceId: string) {
  return apiRequest<{ items: Sku[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/skus`);
}

export function createSku(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<Sku>(`/admin/conferences/${encodeURIComponent(conferenceId)}/skus`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateSku(id: string, input: Record<string, unknown>) {
  return apiRequest<Sku>(`/admin/skus/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function listFormFields(conferenceId: string) {
  return apiRequest<{ formId: string; items: FormField[] }>(`/admin/conferences/${encodeURIComponent(conferenceId)}/form-fields`);
}

export function createFormField(conferenceId: string, input: Record<string, unknown>) {
  return apiRequest<FormField>(`/admin/conferences/${encodeURIComponent(conferenceId)}/form-fields`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateFormField(id: string, input: Record<string, unknown>) {
  return apiRequest<FormField>(`/admin/form-fields/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

export function disableFormField(id: string) {
  return apiRequest<FormField>(`/admin/form-fields/${encodeURIComponent(id)}`, {
    method: "DELETE"
  });
}

export function listOrders(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string; status?: string }) {
  return apiRequest<ApiList<AdminOrder>>(`/admin/orders${toQuery(params)}`);
}

export function listRegistrations(params: { page?: number; pageSize?: number; keyword?: string; conferenceId?: string; status?: string }) {
  return apiRequest<ApiList<AdminRegistration>>(`/admin/registrations${toQuery(params)}`);
}
