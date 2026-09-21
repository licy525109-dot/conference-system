import type { MyAttendance } from "../services/guest-profiles";
import type { ConferenceListItem } from "../services/conference";

export function nextAttendance(items: MyAttendance[], now = Date.now()): MyAttendance | null {
  return items.filter(item => item.registration.status === "CONFIRMED"
    && Number.isFinite(Date.parse(item.registration.conference.startsAt))
    && Date.parse(item.registration.conference.endsAt) >= now)
    .sort((a, b) => Date.parse(a.registration.conference.startsAt) - Date.parse(b.registration.conference.startsAt))[0] ?? null;
}

export function nextPublicConference(items: ConferenceListItem[], now = Date.now()): ConferenceListItem | null {
  return items.filter(item => Number.isFinite(Date.parse(item.startsAt)) && Date.parse(item.endsAt) >= now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))[0] ?? null;
}
