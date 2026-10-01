import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";

test("local admin login returns readable CORS errors when rate limited", {
  skip: !process.env.ADMIN_LOGIN_TEST_API_ORIGIN,
}, async () => {
  const apiOrigin = process.env.ADMIN_LOGIN_TEST_API_ORIGIN!;
  assert.ok(["localhost", "127.0.0.1"].includes(new URL(apiOrigin).hostname));
  const browserOrigin = "http://localhost:5174";
  // A documentation-only test IP keeps this opt-in check out of the operator's quota.
  const headers = {
    Origin: browserOrigin,
    "Content-Type": "application/json",
    "X-Forwarded-For": `2001:db8::${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}`,
  };
  const url = `${apiOrigin}/api/admin/auth/login`;

  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        ...headers,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), browserOrigin);
  }

  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ username: "", password: "" }),
    });
    const body = await response.json();
    assert.equal(response.status, attempt < 10 ? 400 : 429);
    assert.equal(response.headers.get("access-control-allow-origin"), browserOrigin);
    assert.equal(response.headers.get("ratelimit-limit"), "10");
    if (attempt === 10) {
      assert.equal(body.code, "TOO_MANY_REQUESTS");
      assert.equal(body.message, "请求过于频繁，请稍后再试");
      assert.ok(Number(response.headers.get("retry-after")) > 0);
    }
  }
});
