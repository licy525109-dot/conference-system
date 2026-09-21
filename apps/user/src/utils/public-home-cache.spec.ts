import assert from "node:assert/strict";
import test from "node:test";
import { readFreshPublicCache } from "./public-home-cache";
test("public cache accepts only the supported version and a recent nonfuture timestamp", () => {
  assert.deepEqual(readFreshPublicCache({ version: 1, savedAt: 100, value: [] }, 101), []);
  for (const raw of [null, "bad", { version: 2, savedAt: 100, value: [] }, { version: 1, savedAt: 102, value: [] }, { version: 1, savedAt: 100, value: [] }]) {
    assert.equal(readFreshPublicCache(raw, raw && typeof raw === 'object' && raw.savedAt === 102 ? 101 : 86400101), null);
  }
});
