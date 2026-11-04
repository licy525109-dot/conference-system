import type { CertificateConfig, CertificatePerson } from "@conference/shared";
import { API_BASE_URL } from "../config";
import { apiRequest, getAdminToken, toQuery } from "./api";
export interface CertificateSummary {
  id: string; publicId: string; publicUrl: string; name: string; conferenceId: string | null;
  draftRevision: number; publishedRevision: number | null; paused: boolean; archived: boolean;
  _count: { recipients: number; issues: number };
}
export interface CertificateDetail {
  id: string; publicId: string; publicUrl: string; conferenceId: string | null;
  draft: CertificateConfig; draftRevision: number; publishedRevision: number | null; paused: boolean; archived: boolean;
  versions: { revision: number; createdAt: string; _count: { recipients: number } }[];
}
export interface CertificateRecipient extends CertificatePerson { id: string; templateId: string; eligible: boolean; hasClaimCode: boolean }
export interface CertificateAsset { id: string; name: string; kind: string; mime: string; width: number | null; height: number | null }
export interface CertificateIssue { id: string; name: string; certificateNo: string; createdAt: string; revokedAt: string | null; downloadCount: number; version: { revision: number } }
export interface CertificateImportPlan { digest: string; added: number; updated: number; removed: number; errors: { row: number; message: string }[]; draftRevision: number }
const base = "/admin/certificates";
const mutate = <T>(path: string, body: unknown, method = "POST") => apiRequest<T>(path, { method, body: JSON.stringify(body) });
async function blob(path: string, body?: unknown) {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${getAdminToken()}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: "no-store" });
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(Array.isArray(payload.message) ? payload.message.join("；") : payload.message || "图片加载失败"); }
  return response.blob();
}
export const certificates = {
  list: () => apiRequest<{ items: CertificateSummary[] }>(base),
  options: () => apiRequest<{ conferences: { id: string; title: string }[] }>(`${base}/options`),
  create: (body: unknown) => mutate<CertificateDetail>(base, body),
  detail: (id: string) => apiRequest<CertificateDetail>(`${base}/${id}`),
  save: (id: string, config: CertificateConfig, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}`, { config, draftRevision }, "PATCH"),
  recipients: (id: string, page = 1, keyword = "") => apiRequest<{ items: CertificateRecipient[]; total: number }>(`${base}/${id}/recipients${toQuery({ page, keyword, pageSize: 50 })}`),
  add: (id: string, record: unknown, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}/recipients`, { record, draftRevision }),
  update: (id: string, recipientId: string, record: unknown, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}/recipients/${recipientId}`, { record, draftRevision }, "PATCH"),
  remove: (id: string, recipientId: string, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}/recipients/${recipientId}/remove`, { draftRevision }),
  previewImport: (id: string, body: unknown) => mutate<CertificateImportPlan>(`${base}/${id}/import/preview`, body),
  registrationSource: (id: string, body: unknown) => mutate<{ rows: Array<CertificatePerson & { externalId: string; claimCode: string; eligible: boolean }>; page: number; total: number }>(`${base}/${id}/registration-source`, body),
  import: (id: string, body: unknown) => mutate<CertificateDetail>(`${base}/${id}/import`, body),
  publish: (id: string, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}/publish`, { draftRevision }),
  state: (id: string, body: unknown) => mutate<CertificateDetail>(`${base}/${id}/state`, body, "PATCH"),
  restore: (id: string, version: number, draftRevision: number) => mutate<CertificateDetail>(`${base}/${id}/restore`, { version, draftRevision }),
  preview: (id: string, body: unknown) => blob(`${base}/${id}/preview`, body),
  assets: (id: string) => apiRequest<{ items: CertificateAsset[] }>(`${base}/${id}/assets`),
  asset: (id: string, assetId: string) => blob(`${base}/${id}/assets/${assetId}`),
  upload: (id: string, file: File) => { const body = new FormData(); body.append("file", file); return apiRequest<CertificateAsset>(`${base}/${id}/assets`, { method: "POST", body }); },
  export: (id: string) => apiRequest<{ items: CertificateRecipient[] }>(`${base}/${id}/export`),
  issues: (id: string) => apiRequest<{ items: CertificateIssue[] }>(`${base}/${id}/issues`),
  revoke: (id: string, issueId: string, revoked: boolean) => mutate<{ items: CertificateIssue[] }>(`${base}/${id}/issues/${issueId}`, { revoked }, "PATCH"),
};
