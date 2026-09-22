import "reflect-metadata";
import assert from "node:assert/strict";
import { test } from "node:test";
import { GuestClaimLinkController } from "./guest-claim-link.controller";
import { hashGuestClaim } from "./guest-identity.service";
import { REQUIRED_ADMIN_PERMISSIONS } from "../admin/require-permissions.decorator";

const token = "a".repeat(43);
const attendee = () => ({ checkInStatus: "PENDING", registration: { status: "CONFIRMED", order: { refunds: [] as { status: string }[] } } });
function setup() {
  const claim = { consumedAt: null as Date | null, expiresAt: new Date(Date.now() + 3600_000), guestProfile: { userId: null as string | null, attendees: [attendee()] } };
  let calls = 0; let queries = 0;
  const controller = new GuestClaimLinkController({ guestClaim: { findUnique: async (input: any) => { queries++; assert.equal(input.where.tokenHash, hashGuestClaim(token)); return claim; } } } as any,
    { generateGuestClaimLink: async (actual: string, expiry: Date) => { calls++; assert.equal(actual, token); assert.equal(expiry, claim.expiresAt); return "https://wxaurl.cn/local-test-only"; } } as any);
  return { claim, controller, get calls() { return calls; }, get queries() { return queries; } };
}
test("invitation link endpoint requires admin authentication and both write permissions", () => {
  assert.equal(Reflect.getMetadata("__guards__", GuestClaimLinkController).length, 2);
  assert.deepEqual(Reflect.getMetadata(REQUIRED_ADMIN_PERMISSIONS, GuestClaimLinkController.prototype.create), ["registration:write", "member:write"]);
});
test("link creation retries only read the existing invitation; no guest records are mutated", async () => {
  const state = setup();
  const result = await state.controller.create({ token });
  assert.equal(result.data.url, "https://wxaurl.cn/local-test-only");
  assert.equal(result.data.expiresAt, state.claim.expiresAt.toISOString());
  await state.controller.create({ token });
  assert.equal(state.calls, 2);
});
test("missing and malformed tokens are rejected before any database or WeChat call", async () => {
  const state = setup();
  for (const value of [null, undefined, "bad", "a".repeat(44), "/".repeat(43)]) await assert.rejects(state.controller.create({ token: value }));
  assert.equal(state.calls, 0); assert.equal(state.queries, 0);
});
test("expired, consumed, reassigned, refunded and checked-in invitations cannot generate links", async () => {
  const changes = [
    (s: ReturnType<typeof setup>) => { s.claim.expiresAt = new Date(Date.now() + 30_000); },
    (s: ReturnType<typeof setup>) => { s.claim.consumedAt = new Date(); },
    (s: ReturnType<typeof setup>) => { s.claim.guestProfile.userId = "already-bound"; },
    (s: ReturnType<typeof setup>) => { s.claim.guestProfile.attendees = []; },
    (s: ReturnType<typeof setup>) => { s.claim.guestProfile.attendees[0].checkInStatus = "CHECKED_IN"; },
    (s: ReturnType<typeof setup>) => { s.claim.guestProfile.attendees[0].registration.status = "REFUNDED"; },
    (s: ReturnType<typeof setup>) => { s.claim.guestProfile.attendees[0].registration.order.refunds = [{ status: "PROCESSING" }]; }
  ];
  for (const change of changes) { const state = setup(); change(state); await assert.rejects(state.controller.create({ token })); assert.equal(state.calls, 0); }
});
