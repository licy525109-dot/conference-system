import assert from "node:assert/strict";
import { it } from "node:test";
import { availability } from "./external-checkin.service";
it("enforces paused and exact opening/closing boundaries", () => {
  const startsAt = new Date("2026-11-10T01:00:00Z"), endsAt = new Date("2026-11-10T10:00:00Z");
  assert.equal(availability({ enabled: false, startsAt: null, endsAt: null }).available, false);
  assert.equal(availability({ enabled: true, startsAt, endsAt }, new Date(startsAt.getTime() - 1)).available, false);
  assert.equal(availability({ enabled: true, startsAt, endsAt }, startsAt).available, true);
  assert.equal(availability({ enabled: true, startsAt, endsAt }, endsAt).available, false);
});
