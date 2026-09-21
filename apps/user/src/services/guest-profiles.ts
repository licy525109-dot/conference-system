import { request } from "./request";
export interface ReusableGuest {
  id: string; name: string; phone: string; company: string | null; title: string | null;
  formDataJson: Record<string, unknown> | null;
  registration: { conferenceId: string; conference: { title: string } };
}
export function getReusableProfiles() {
  return request<{ user: { realName: string | null; phone: string | null }; attendees: ReusableGuest[] }>("/guest-identities/profiles", { auth: true });
}

export interface MyAttendance {
  id: string;
  name: string;
  phone: string;
  company: string | null;
  title: string | null;
  formDataJson: Record<string, unknown> | null;
  checkInStatus: string;
  registration: {
    id: string; registrationNo: string; status: string;
    conference: { id: string; title: string; startsAt: string; endsAt: string; location: string | null };
  };
  qrPayload: string | null;
}

export function getMyAttendance() {
  return request<{ items: MyAttendance[] }>("/guest-identities/mine", { auth: true });
}

export function claimGuestIdentity(token: string) {
  return request<{ claimed: boolean }>("/guest-identities/claim", { method: "POST", auth: true, data: { token } });
}
