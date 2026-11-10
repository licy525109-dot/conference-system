import type { ExternalCheckinField, ExternalCheckinValues, ExternalCheckinImportPlan, ExternalCheckinAppearance } from "@conference/shared";
import { API_BASE_URL } from "../config";
import { apiRequest, getAdminToken, toQuery } from "./api";
export interface ExternalCheckinEvent {
  id: string; title: string; description: string; fields: ExternalCheckinField[]; enabled: boolean;
  startsAt: string | null; endsAt: string | null; revision: number; publicPath: string;
  appearance: ExternalCheckinAppearance;
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
  saveAppearance: (id: string, appearance: ExternalCheckinAppearance, revision: number) => mutate<ExternalCheckinEvent>(`${base}/${id}/appearance`, { appearance, revision }, "PATCH"),
  uploadImage: (id: string, file: File) => { const body = new FormData(); body.append("file", file); return apiRequest<{ id: string; name: string }>(`${base}/${id}/images`, { method: "POST", body }); },
  image: async (id: string, assetId: string) => {
    const response = await fetch(`${API_BASE_URL}${base}/${id}/images/${assetId}`, { headers: { Authorization: `Bearer ${getAdminToken()}` }, cache: "no-store" });
    if (!response.ok) throw new Error("图片加载失败，请重试");
    return response.blob();
  },
  preview: (id: string, body: unknown) => mutate<ImportPlan>(`${base}/${id}/import/preview`, body),
  import: (id: string, body: unknown) => mutate<ExternalCheckinEvent>(`${base}/${id}/import`, body),
  attendees: (id: string, query: { page: number; keyword: string; status: string }) => apiRequest<{ items: ExternalCheckinAttendee[]; total: number }>(`${base}/${id}/attendees${toQuery(query)}`),
  helpCheckin: (id: string, attendeeId: string, revision: number) => mutate<{ event: ExternalCheckinEvent; alreadyCheckedIn: boolean }>(`${base}/${id}/attendees/${attendeeId}/checkin`, { revision }),
  deleteAttendee: (id: string, attendeeId: string, revision: number, checkedInAt: string | null) => mutate<ExternalCheckinEvent>(`${base}/${id}/attendees/${attendeeId}`, { revision, checkedInAt }, "DELETE"),
  export: (id: string) => apiRequest<{ items: ExternalCheckinAttendee[] }>(`${base}/${id}/export`),
  publicUrl: (event: ExternalCheckinEvent) => `${API_BASE_URL.replace(/\/api\/?$/, "")}${event.publicPath}`
};
