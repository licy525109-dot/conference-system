import assert from "node:assert/strict";
import test from "node:test";
import { isUntouchedSeedDraft } from "./admin-cms.service";

test("recognizes the original system seed draft", () => {
  assert.equal(isUntouchedSeedDraft([{ versionNo: 1, status: "DRAFT", createdBy: null }]), true);
});

test("does not auto-publish an operator-edited or versioned draft", () => {
  assert.equal(isUntouchedSeedDraft([{ versionNo: 1, status: "DRAFT", createdBy: "admin-1" }]), false);
  assert.equal(isUntouchedSeedDraft([
    { versionNo: 1, status: "DRAFT", createdBy: null },
    { versionNo: 2, status: "DRAFT", createdBy: null }
  ]), false);
  assert.equal(isUntouchedSeedDraft([{ versionNo: 1, status: "PUBLISHED", createdBy: null }]), false);
});
