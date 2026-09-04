import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { remainingRegistrationStock } from "./registration-stock";

describe("remainingRegistrationStock", () => {
  it("treats a missing legacy locked-stock field as zero", () => {
    assert.equal(remainingRegistrationStock({ stock: 100, soldCount: 18 }), 82);
  });

  it("subtracts both paid and temporarily locked inventory", () => {
    assert.equal(remainingRegistrationStock({ stock: 100, soldCount: 18, lockedStock: 7 }), 75);
  });

  it("never returns negative or non-finite availability", () => {
    assert.equal(remainingRegistrationStock({ stock: 10, soldCount: 20, lockedStock: 1 }), 0);
    assert.equal(remainingRegistrationStock({ stock: Number.NaN, soldCount: 1 }), 0);
  });
});
