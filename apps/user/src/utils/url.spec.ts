import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isHttpsUrl } from "./url";

describe("isHttpsUrl", () => {
  it("accepts production HTTPS API URLs without browser URL globals", () => {
    assert.equal(isHttpsUrl("https://guanchaohuiji.com/api"), true);
    assert.equal(isHttpsUrl(" HTTPS://guanchaohuiji.com/api "), true);
  });

  it("rejects insecure, malformed, and whitespace-containing values", () => {
    assert.equal(isHttpsUrl("http://guanchaohuiji.com/api"), false);
    assert.equal(isHttpsUrl("https://"), false);
    assert.equal(isHttpsUrl("https://guanchaohuiji.com/api path"), false);
    assert.equal(isHttpsUrl("not-a-url"), false);
  });
});
