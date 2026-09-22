import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSensitiveEndpointRateLimiter } from "./request-rate-limit";

describe("sensitive endpoint rate limiter", () => {
  for (const [route, limit] of [["preview", 60], ["claim", 10]] as const) {
    it(`limits private coupon ${route} attempts independently per caller`, () => {
      const limiter = createSensitiveEndpointRateLimiter();
      let nextCalls = 0;
      let statusCode = 0;
      const request = { method: "POST", path: `/api/coupon-distributions/${route}`, ip: "203.0.113.11", socket: {} };
      const response = { setHeader: () => undefined, status: (code: number) => ({ json: () => { statusCode = code; } }) };
      for (let attempt = 0; attempt <= limit; attempt++) limiter(request, response, () => { nextCalls++; });
      assert.equal(nextCalls, limit);
      assert.equal(statusCode, 429);
      limiter({ ...request, ip: "203.0.113.12" }, response, () => { nextCalls++; });
      assert.equal(nextCalls, limit + 1);
    });
  }

  it("limits repeated admin mobile binding attempts", () => {
    const limiter = createSensitiveEndpointRateLimiter();
    let nextCalls = 0;
    let statusCode = 0;
    let body: unknown;
    const request = {
      method: "POST",
      path: "/api/admin/mobile/login-and-bind",
      ip: "203.0.113.10",
      socket: {}
    };
    const response = {
      setHeader: () => undefined,
      status: (code: number) => ({
        json: (value: unknown) => {
          statusCode = code;
          body = value;
        }
      })
    };

    for (let attempt = 0; attempt < 11; attempt += 1) {
      limiter(request, response, () => {
        nextCalls += 1;
      });
    }

    assert.equal(nextCalls, 10);
    assert.equal(statusCode, 429);
    assert.deepEqual(body, { code: "TOO_MANY_REQUESTS", message: "请求过于频繁，请稍后再试" });
  });

  it("limits repeated registration order creation", () => {
    const limiter = createSensitiveEndpointRateLimiter();
    let nextCalls = 0;
    let statusCode = 0;
    const request = {
      method: "POST",
      path: "/api/registration/orders",
      ip: "203.0.113.20",
      socket: {}
    };
    const response = {
      setHeader: () => undefined,
      status: (code: number) => ({
        json: () => {
          statusCode = code;
        }
      })
    };

    for (let attempt = 0; attempt < 21; attempt += 1) {
      limiter(request, response, () => {
        nextCalls += 1;
      });
    }

    assert.equal(nextCalls, 20);
    assert.equal(statusCode, 429);
  });
});
