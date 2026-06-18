import { request } from "./request";

export type CheckinMethod = "QR_SCAN" | "SELF_PHONE_NAME" | "SELF_CUSTOM_FIELDS" | "ADMIN_MANUAL";

export interface CheckinField {
  id: string;
  label: string;
  fieldKey: string;
  type: string;
  required: boolean;
}

export interface CheckinConfig {
  conferenceId: string;
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  methods: CheckinMethod[];
  fieldBindings: {
    phoneFieldKey?: string | null;
    nameFieldKey?: string | null;
    customFieldKeys: string[];
  };
  fields: CheckinField[];
  availability: {
    status: "DISABLED" | "NOT_STARTED" | "ENDED" | "OPEN";
    message: string;
  };
}

export interface CheckinResult {
  status: string;
  message: string;
  registrationId: string;
  registrationNo: string;
  attendeeId: string;
  attendeeName: string;
  checkedInAt: string | null;
}

export function getCheckinConfig(conferenceId: string) {
  return request<CheckinConfig>(`/checkin/config?conferenceId=${encodeURIComponent(conferenceId)}`);
}

export function getMyCheckinStatus(registrationId: string) {
  return request<CheckinResult>(`/checkin/my-status?registrationId=${encodeURIComponent(registrationId)}`);
}

export function selfCheckin(input: { conferenceId: string; registrationId?: string; method: "SELF_PHONE_NAME" | "SELF_CUSTOM_FIELDS"; values: Record<string, string> }) {
  return request<CheckinResult>("/checkin/self", {
    method: "POST",
    data: input
  });
}
