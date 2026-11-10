import type { ExternalCheckinField, ExternalCheckinValues, ExternalCheckinImportPlan } from "@conference/shared";
import { API_BASE_URL } from "../config";
import { apiRequest, toQuery } from "./api";
export interface ExternalCheckinEvent {
  id: string; title: string; description: string; fields: ExternalCheckinField[]; enabled: boolean;
  startsAt: string | null; endsAt: string | null; revision: number; publicPath: string;
  statistics: { total: number; checkedIn: number; pending: number }; _count?: { attendees: number };
}
export interface ExternalCheckinAttendee { id: string; values: ExternalCheckinValues; submittedValues: ExternalCheckinValues | null; checkedInAt: string | null }
export interface ImportPlan extends ExternalCheckinImportPlan { digest: string; revision: number }
const base = "/admin/external-checkins";
const mutate = <T>(path: string, body: unknown, method = "POST") => apiRequest<T>(path, { method, body: JSON.stringify(body) });
export const externalCheckins = {
  list: (page: number) => apiRequest<{ items: ExternalCheckinEvent[]; total: number }>(`${base}${toQuery({ page })}`),
  detail: (id: string) => apiRequest<ExternalCheckinEvent>(`${base}/${id}`),
  create: (body: unknown) => mutate<ExternalCheckinEvent>(base, body),
  save: (id: string, body: unknown) => mutate<ExternalCheckinEvent>(`${base}/${id}`, body, "PATCH"),
  preview: (id: string, body: unknown) => mutate<ImportPlan>(`${base}/${id}/import/preview`, body),
  import: (id: string, body: unknown) => mutate<ExternalCheckinEvent>(`${base}/${id}/import`, body),
  attendees: (id: string, query: { page: number; keyword: string; status: string }) => apiRequest<{ items: ExternalCheckinAttendee[]; total: number }>(`${base}/${id}/attendees${toQuery(query)}`),
  export: (id: string) => apiRequest<{ items: ExternalCheckinAttendee[] }>(`${base}/${id}/export`),
  publicUrl: (event: ExternalCheckinEvent) => `${API_BASE_URL.replace(/\/api\/?$/, "")}${event.publicPath}`
};
