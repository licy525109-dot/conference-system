import type {
  InvitationCampaignSummary,
  InvitationContent,
  InvitationRecord,
} from "@conference/shared";
import { apiRequest, toQuery } from "./api";
export interface InvitationCampaignDetail {
  id: string;
  conferenceId: string;
  draft: InvitationContent;
  published: InvitationContent | null;
  draftRevision: number;
  publishedRevision: number;
  publishedAt: string | null;
  hasChanges: boolean;
}
export interface InvitationOptions {
  conferences: Array<{ id: string; title: string }>;
  admins: Array<{ id: string; username: string; displayName: string | null }>;
}
const base = "/admin/invitations";
export const listInvitationCampaigns = () =>
  apiRequest<{ items: InvitationCampaignSummary[] }>(`${base}/campaigns`);
export const invitationOptions = () =>
  apiRequest<InvitationOptions>(`${base}/options`);
export const createInvitationCampaign = (conferenceId: string) =>
  apiRequest<{ id: string }>(`${base}/campaigns`, {
    method: "POST",
    body: JSON.stringify({ conferenceId }),
  });
export const getInvitationCampaign = (id: string) =>
  apiRequest<InvitationCampaignDetail>(
    `${base}/campaigns/${encodeURIComponent(id)}`,
  );
export const saveInvitationCampaign = (
  id: string,
  content: InvitationContent,
  draftRevision: number,
) =>
  apiRequest<InvitationCampaignDetail>(
    `${base}/campaigns/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ content, draftRevision }) },
  );
export const publishInvitationCampaign = (id: string, draftRevision: number) =>
  apiRequest<InvitationCampaignDetail>(
    `${base}/campaigns/${encodeURIComponent(id)}/publish`,
    { method: "POST", body: JSON.stringify({ draftRevision }) },
  );
export const listInvitationRecipients = (
  id: string,
  query: { keyword: string; page: number; pageSize: number },
) =>
  apiRequest<{ items: InvitationRecord[]; total: number }>(
    `${base}/campaigns/${encodeURIComponent(id)}/recipients${toQuery(query)}`,
  );
export const createInvitationRecipient = (
  id: string,
  name: string,
  salutation: string,
  publicInviteeId?: string,
) =>
  apiRequest<{ id: string; shareUrl: string }>(
    `${base}/campaigns/${encodeURIComponent(id)}/recipients`,
    {
      method: "POST",
      body: JSON.stringify({ name, salutation, publicInviteeId }),
    },
  );
export const updateInvitationRecipient = (
  id: string,
  body: {
    name?: string;
    salutation?: string;
    enabled?: boolean;
    publicInviteeId?: string | null;
  },
) =>
  apiRequest(`${base}/recipients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
export const getInvitationMembers = (id: string) =>
  apiRequest<{ adminIds: string[] }>(
    `${base}/campaigns/${encodeURIComponent(id)}/members`,
  );
export const saveInvitationMembers = (id: string, adminIds: string[]) =>
  apiRequest(`${base}/campaigns/${encodeURIComponent(id)}/members`, {
    method: "PATCH",
    body: JSON.stringify({ adminIds }),
  });
export const uploadInvitationImage = (id: string, file: File) => {
  const data = new FormData();
  data.append("file", file);
  return apiRequest<{ url: string }>(
    `${base}/campaigns/${encodeURIComponent(id)}/image`,
    { method: "POST", body: data },
  );
};
export interface InvitationAsset {
  id: string;
  name: string;
  url: string;
  fileType: string;
  sizeBytes: number | null;
  width?: number | null;
  height?: number | null;
}
export const getInvitationAssets = (
  id: string,
  kind: string,
  keyword = "",
  page = 1,
) =>
  apiRequest<{ items: InvitationAsset[]; total: number }>(
    `${base}/campaigns/${encodeURIComponent(id)}/assets?${new URLSearchParams({ kind, keyword, page: String(page) })}`,
  );
export const uploadInvitationAsset = (id: string, file: File) => {
  const data = new FormData();
  data.append("file", file);
  return apiRequest<InvitationAsset>(
    `${base}/campaigns/${encodeURIComponent(id)}/assets`,
    { method: "POST", body: data },
  );
};
