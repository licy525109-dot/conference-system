import assert from "node:assert/strict";
import test from "node:test";
import { attendeeMatchesSelf, preserveQuantities, registrationProfileReady, reuseAttendeeAnswers } from "./registration-identity";

const profile = { realName: "本人", phone: "13800138000", phoneVerifiedAt: "2026-09-21", registrationReady: true };
test("registration readiness requires verified identity, not avatar or a cached ready flag alone", () => {
  assert.equal(registrationProfileReady(profile), true);
  assert.equal(registrationProfileReady({ registrationReady: true }), false);
  assert.equal(registrationProfileReady({ ...profile, phoneVerifiedAt: null }), false);
  assert.equal(registrationProfileReady({ ...profile, registrationReady: false }), false);
});
test("self-declaration matches canonical name and verified phone, never nickname or arbitrary fields", () => {
  assert.equal(attendeeMatchesSelf({ name: "本人", phone: "13800138000" }, profile), true);
  assert.equal(attendeeMatchesSelf({ name: "代填人", phone: "13800138000" }, profile), false);
  assert.equal(attendeeMatchesSelf({ name: "本人", phone: "13900139000" }, profile), false);
  assert.equal(attendeeMatchesSelf({ attendeeName: "本人", mobile: "13800138000" }, profile), false);
  assert.equal(attendeeMatchesSelf({ name: "本人", phone: "13800138000" }, { ...profile, phoneVerifiedAt: null }), false);
});
test("profile return preserves quantities including an intentionally deselected ticket", () => {
  const skus = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(preserveQuantities(skus, "a", {}, false), { a: 1, b: 0 });
  assert.deepEqual(preserveQuantities(skus, "a", { a: 0, b: 3, removed: 1 }, true), { a: 0, b: 3 });
});
test("cross-meeting reuse copies common fields only and clears previous attendee answers", () => {
  const fields = ["name", "phone", "company", "diet", "other"].map(key => ({ key, type: "text" }));
  const result = reuseAttendeeAnswers(fields, "next", {
    name: "代填人", phone: "13900139000", company: "机构", registration: { conferenceId: "old" },
    formDataJson: { name: "旧姓名", diet: "上场会议偏好", unconfigured: "不可带入", isSelf: true }
  });
  assert.deepEqual(result, { name: "代填人", phone: "13900139000", company: "机构", diet: "", other: "" });
  assert.equal("isSelf" in result, false);
});
test("same-meeting reuse clones configured answers, preserving immutable history", () => {
  const original = { options: ["a"], privateKey: "not configured" };
  const result = reuseAttendeeAnswers([{ key: "options", type: "checkbox" }, { key: "missing", type: "checkbox" }], "c", {
    name: "嘉宾", phone: "13900139000", registration: { conferenceId: "c" }, formDataJson: original
  });
  assert.deepEqual(result, { options: ["a"], missing: [] });
  (result.options as string[]).push("b");
  assert.deepEqual(original.options, ["a"]);
});
