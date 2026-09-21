import assert from "node:assert/strict";
import test from "node:test";
import { nextAttendance, nextPublicConference } from "./home-conference";
import type { MyAttendance } from "../services/guest-profiles";
import type { ConferenceListItem } from "../services/conference";

const now = Date.parse("2026-09-21T00:00:00Z");
function attendance(id: string, status: string, startsAt: string, endsAt: string): MyAttendance {
  return { id, registration: { status, conference: { id, startsAt, endsAt } } } as MyAttendance;
}
test("home only promotes confirmed unexpired attendance, not cancelled or refunded records", () => {
  const items = [
    attendance("refund", "REFUNDED", "2026-09-20", "2026-09-23"),
    attendance("cancel", "CANCELLED", "2026-09-20", "2026-09-23"),
    attendance("past", "CONFIRMED", "2026-09-01", "2026-09-02"),
    attendance("invalid", "CONFIRMED", "bad-date", "bad-date"),
    attendance("future", "CONFIRMED", "2026-10-20", "2026-10-22"),
    attendance("current", "CONFIRMED", "2026-09-20", "2026-09-23")
  ];
  assert.equal(nextAttendance(items, now)?.id, "current");
  assert.equal(items[0].id, "refund");
  assert.equal(nextAttendance(items.slice(0, 4), now), null);
  assert.equal(nextAttendance([], now), null);
});
test("public featured conference follows nearest valid date without implying attendance", () => {
  const items = [
    { id: "later", startsAt: "2026-11-01", endsAt: "2026-11-02" },
    { id: "past", startsAt: "2026-08-01", endsAt: "2026-08-02" },
    { id: "next", startsAt: "2026-10-20", endsAt: "2026-10-22" }
  ] as ConferenceListItem[];
  assert.equal(nextPublicConference(items, now)?.id, "next");
  assert.equal(items[0].id, "later");
  assert.equal(nextPublicConference([], now), null);
  assert.equal(nextPublicConference([{ startsAt: "bad-date", endsAt: "2026-10-22" }] as ConferenceListItem[], now), null);
  assert.equal(nextAttendance([attendance("invalid-start", "CONFIRMED", "bad-date", "2026-10-22")], now), null);
});
